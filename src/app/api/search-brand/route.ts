import { NextRequest, NextResponse } from "next/server";
import { getApiKey } from "@/lib/getApiKey";

const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

export async function POST(req: NextRequest) {
  const apiKey = getApiKey(req);
  if (!apiKey) {
    return NextResponse.json({ error: "API key not configured" }, { status: 500 });
  }

  const { query: rawQuery } = await req.json();
  if (!rawQuery) {
    return NextResponse.json({ found: false });
  }
  // prompt injection 방지: 특수문자 제거, 길이 제한
  const query = String(rawQuery).replace(/["\\\n\r\t{}[\]]/g, " ").trim().slice(0, 200);

  try {
    // Gemini + Google Search Grounding으로 브랜드 조사
    const res = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          role: "user",
          parts: [{ text: `아래 텍스트에서 서비스/브랜드명을 찾아 웹 검색으로 조사해줘.
브랜드를 특정할 수 없으면 {"found": false}만 반환해.

텍스트: "${query}"

아래 JSON 형식으로 응답해:
{
  "found": true,
  "brandName": "정식 브랜드명 (한글)",
  "brandNameEn": "영문 브랜드명",
  "description": "한 줄 설명 (20자 이내)",
  "category": "업종 (예: 배달앱, 커머스, 카페, 항공, 게임, 물류, 모빌리티 등)",
  "targetAudience": "주 타겟 유저층 (예: 2030 여성, 4050 자영업자, 트럭 운전자 등)",
  "serviceCharacteristics": "서비스 핵심 특성 한 줄 (예: 중고트럭 매매 플랫폼, 프리미엄 식품 새벽배송 등)",
  "primaryColor": "브랜드 대표 색상 hex (예: #2AC1BC)",
  "secondaryColor": "보조 색상 hex 또는 null",
  "mascotName": "공식 마스코트/캐릭터 이름 또는 null",
  "mascotDescription": "마스코트 외형 상세 설명 (색상, 형태, 특징 등) 또는 null"
}

JSON만 응답해.` }],
        }],
        tools: [{ google_search: {} }],
        generationConfig: {
          responseMimeType: "application/json",
        },
      }),
    });

    if (!res.ok) {
      console.error("[search-brand] Gemini error:", res.status);
      return NextResponse.json({ found: false });
    }

    const data = await res.json();
    const rawText = data.candidates?.[0]?.content?.parts?.find(
      (p: Record<string, unknown>) => typeof p.text === "string"
    )?.text || "";

    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      console.error("[search-brand] JSON parse failed:", rawText.slice(0, 200));
      return NextResponse.json({ found: false });
    }

    if (!parsed.found) {
      return NextResponse.json({ found: false });
    }

    // 마스코트 이미지 웹 검색 — 별도 grounding 호출
    let mascotImage: { data: string; mimeType: string } | null = null;

    if (parsed.mascotName) {
      mascotImage = await searchAndDownloadMascotImage(
        apiKey,
        parsed.brandName,
        parsed.mascotName,
        parsed.brandNameEn
      );
    }

    console.log(`[search-brand] Found: ${parsed.brandName} (${parsed.category}), color: ${parsed.primaryColor}, mascot: ${parsed.mascotName || "없음"}, mascotImage: ${mascotImage ? "있음" : "없음"}`);

    return NextResponse.json({
      found: true,
      brandName: parsed.brandName,
      description: parsed.description,
      category: parsed.category,
      targetAudience: parsed.targetAudience || null,
      serviceCharacteristics: parsed.serviceCharacteristics || null,
      primaryColor: parsed.primaryColor,
      secondaryColor: parsed.secondaryColor || null,
      mascotName: parsed.mascotName || null,
      mascotDescription: parsed.mascotDescription || null,
      mascotImage,
    });
  } catch (e) {
    console.error("[search-brand] error:", e);
    return NextResponse.json({ found: false });
  }
}

/** Gemini grounding으로 마스코트 이미지 URL을 찾고 서버에서 다운로드 */
async function searchAndDownloadMascotImage(
  apiKey: string,
  brandName: string,
  mascotName: string,
  brandNameEn?: string
): Promise<{ data: string; mimeType: string } | null> {
  try {
    // Step 1: grounding으로 이미지 URL 검색
    const searchQuery = brandNameEn
      ? `${brandNameEn} ${mascotName} character official image`
      : `${brandName} ${mascotName} 캐릭터 공식 이미지`;

    const res = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          role: "user",
          parts: [{ text: `"${searchQuery}"를 검색해서 이 캐릭터/마스코트의 공식 이미지 URL을 찾아줘.

PNG 또는 JPG 이미지의 직접 URL만 필요해. 웹페이지 URL이 아닌 이미지 파일 URL이어야 해.
공식 홈페이지, 위키백과, 나무위키 등에서 사용된 캐릭터 이미지를 우선으로 찾아줘.

JSON으로만 응답: {"imageUrl": "https://...png"} 또는 {"imageUrl": null}` }],
        }],
        tools: [{ google_search: {} }],
        generationConfig: {
          responseMimeType: "application/json",
        },
      }),
    });

    if (!res.ok) return null;

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.find(
      (p: Record<string, unknown>) => typeof p.text === "string"
    )?.text || "";

    const parsed = JSON.parse(text);
    if (!parsed.imageUrl) return null;

    // Step 2: 이미지 다운로드
    const imgRes = await fetch(parsed.imageUrl, {
      signal: AbortSignal.timeout(5000),
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; CTGenerator/1.0)",
      },
    });

    if (!imgRes.ok) return null;

    const contentType = imgRes.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) return null;

    const buffer = await imgRes.arrayBuffer();
    if (buffer.byteLength < 1000 || buffer.byteLength > 10_000_000) return null;

    return {
      data: Buffer.from(buffer).toString("base64"),
      mimeType: contentType.split(";")[0],
    };
  } catch {
    return null;
  }
}
