import { NextRequest, NextResponse } from "next/server";
import { getApiKey } from "@/lib/getApiKey";
import { ContentSpec } from "@/types/ct";
import { buildRequestBody, parseGeminiResponse } from "@/lib/gemini";
import { getKnownBrandContext } from "@/lib/imagePrompt";

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

/**
 * 통합 orchestrate API — extract-spec + search-brand + generate를 1개 HTTP 연결로 처리
 * 브라우저→서버 연결 1개만 사용하여 Chrome 6연결 제한 이슈 해결
 */
export async function POST(req: NextRequest) {
  const apiKey = getApiKey(req);
  if (!apiKey) {
    return NextResponse.json({ error: "API key not configured" }, { status: 500 });
  }

  const { message, currentSpec } = (await req.json()) as {
    message: string;
    currentSpec: ContentSpec;
  };

  const hasExistingContent = !!(currentSpec.brand || currentSpec.content);

  // ── Step 1: Extract spec + action (의도 파악) ──
  const extractPrompt = `현대카드 앱 메인피드 콘텐츠 카드 제작 도우미.
유저가 브랜드/제휴사 혜택·프로모션 소개 카드(이미지+문구)를 만들려고 한다.

## 현재까지 확정된 정보
${JSON.stringify(currentSpec, null, 2)}
${hasExistingContent ? "(카드가 이미 생성된 상태 — 수정 요청일 가능성 높음)" : "(아직 카드 없음 — 첫 생성 요청)"}

## 유저 발화
"${message}"

## 너의 역할: 필드 추출 + 실행 판단

### 1단계: 필드 추출
- brand: 브랜드명/주제
- content: 구체적 콘텐츠 소재
- imageSource: "ai" / "upload" / "combine"
- imageStyle: 이미지 스타일/톤 변경 요청
- textTone: 문구 톤
- textDraft: 유저가 직접 제공한 문구 초안

### 2단계: 실행 판단 (action)
- "generate": 카드를 새로 생성할 수 있는 충분한 정보가 있음 (brand 또는 content 중 하나 이상). "알아서 만들어줘" 같은 위임도 포함.
- "edit_image": 이미지 수정 요청 (톤/색감/스타일 변경)
- "edit_copy": 문구(상단 텍스트) 수정 요청
- "edit_sub": 하단 텍스트 수정 요청
- "need_info": 정보가 부족해서 질문이 필요

### 3단계: 질문 생성 (need_info일 때만)
유저에게 할 자연스러운 한 줄 질문.

## 규칙
- brand와 content 혼동하지 마
- "알아서 해줘", "테스트용", "아무거나", "그냥 만들어", "ㄱㄱ", "고고" → action:"generate" (AI가 알아서 결정)
- brand만 있고 content 없어도 action:"generate"
- brand도 content도 없지만 유저가 위임하는 느낌이면 action:"generate" (AI가 적절한 브랜드/소재 선택)
- need_info는 정말로 아무 단서도 없을 때만 (예: "카드" 한 글자만 입력)
- 발화에 없는 정보는 추측하지 마

JSON만 반환:
{"extracted":{"brand":"...", ...}, "action":"generate", "question":null}`;

  try {
    const extractRes = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: extractPrompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });

    if (!extractRes.ok) {
      console.error("[orchestrate] extract error:", extractRes.status);
      return NextResponse.json({ extracted: {}, action: "generate", question: null });
    }

    const extractData = await extractRes.json();
    const rawExtract = extractData.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const parsed = JSON.parse(rawExtract);

    // null 값 필드 제거
    const extracted: Record<string, unknown> = {};
    if (parsed.extracted) {
      for (const [key, val] of Object.entries(parsed.extracted)) {
        if (val !== null && val !== undefined && val !== "") {
          extracted[key] = val;
        }
      }
    }

    const action = parsed.action || "generate";
    const question = parsed.question || null;

    // generate가 아니면 여기서 바로 반환 (브랜드 검색/문구 생성 불필요)
    if (action !== "generate") {
      return NextResponse.json({ extracted, action, question });
    }

    // ── Step 2: Brand search (generate일 때만) ──
    const mergedSpec = { ...currentSpec, ...extracted };
    const brandQuery = (mergedSpec.brand || mergedSpec.content || message).toString();
    const knownBrand = getKnownBrandContext(brandQuery);

    let brandContext = knownBrand
      ? { ...knownBrand, found: true, mascotName: null, mascotDescription: null, mascotImage: null }
      : null;

    if (!knownBrand && brandQuery) {
      // 미등록 브랜드 → Google Search Grounding
      const sanitized = brandQuery.replace(/["\\\n\r\t{}[\]]/g, " ").trim().slice(0, 200);
      try {
        const brandRes = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{
              role: "user",
              parts: [{ text: `아래 텍스트에서 서비스/브랜드명을 찾아 웹 검색으로 조사해줘.
브랜드를 특정할 수 없으면 {"found": false}만 반환해.

텍스트: "${sanitized}"

JSON 형식:
{"found": true, "brandName": "정식 브랜드명", "description": "한 줄 설명", "category": "업종", "targetAudience": "타겟층", "serviceCharacteristics": "핵심 특성", "primaryColor": "#hex", "secondaryColor": "#hex 또는 null"}
JSON만 응답해.` }],
            }],
            tools: [{ google_search: {} }],
            generationConfig: { responseMimeType: "application/json" },
          }),
        });

        if (brandRes.ok) {
          const brandData = await brandRes.json();
          const brandText = brandData.candidates?.[0]?.content?.parts?.find(
            (p: Record<string, unknown>) => typeof p.text === "string"
          )?.text || "";
          try {
            const brandParsed = JSON.parse(brandText);
            if (brandParsed.found) {
              brandContext = brandParsed;
            }
          } catch { /* ignore parse error */ }
        }
      } catch { /* ignore brand search error */ }
    }

    // ── Step 3: Generate text variants ──
    const textPrompt = [mergedSpec.brand, mergedSpec.content].filter(Boolean).join(" ") || message;

    const genRes = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildRequestBody(textPrompt, undefined, brandContext ?? undefined)),
    });

    if (!genRes.ok) {
      console.error("[orchestrate] generate error:", genRes.status);
      return NextResponse.json({ extracted, action, question, brandContext });
    }

    const genData = await genRes.json();
    const genText = genData.candidates?.[0]?.content?.parts?.[0]?.text;
    const variants = genText ? parseGeminiResponse(genText) : [];

    return NextResponse.json({
      extracted,
      action,
      question,
      brandContext,
      variants,
    });
  } catch (e) {
    console.error("[orchestrate] error:", e);
    return NextResponse.json({ extracted: {}, action: "generate", question: null });
  }
}
