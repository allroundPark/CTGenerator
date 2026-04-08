import { NextRequest, NextResponse } from "next/server";
import { getApiKey } from "@/lib/getApiKey";

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

/**
 * 이미지에서 카드 텍스트를 추출하는 OCR API
 * 카드 캡쳐본에서 label, title, subtitle을 추출
 */
export async function POST(req: NextRequest) {
  const apiKey = getApiKey(req);
  if (!apiKey) {
    return NextResponse.json({ error: "API key not configured" }, { status: 500 });
  }

  const { image } = await req.json();
  if (!image?.data) {
    return NextResponse.json({ extracted: null });
  }

  try {
    const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: `이 카드 이미지에서 텍스트를 추출해줘.

카드 구조:
- 좌상단: 라벨 (작은 텍스트, 브랜드/카테고리)
- 좌상단 아래: 타이틀 (큰 텍스트, 1~2줄)
- 좌하단: 서브라인 (작은 텍스트, 0~2줄, 없을 수 있음)

JSON으로만 응답:
{"label": "라벨 텍스트", "titleLine1": "타이틀 1줄", "titleLine2": "타이틀 2줄 또는 null", "subLine1": "서브 1줄 또는 null", "subLine2": "서브 2줄 또는 null"}

텍스트가 없으면 해당 필드를 null로.` },
            { inline_data: { mime_type: image.mimeType || "image/jpeg", data: image.data } },
          ],
        }],
        generationConfig: {
          responseMimeType: "application/json",
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });

    if (!res.ok) {
      console.error("[extract-text] Gemini error:", res.status);
      return NextResponse.json({ extracted: null });
    }

    const data = await res.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const parsed = JSON.parse(rawText);

    // null 필드 정리
    const extracted: Record<string, string | null> = {};
    for (const key of ["label", "titleLine1", "titleLine2", "subLine1", "subLine2"]) {
      extracted[key] = parsed[key] || null;
    }

    return NextResponse.json({ extracted });
  } catch (e) {
    console.error("[extract-text] error:", e);
    return NextResponse.json({ extracted: null });
  }
}
