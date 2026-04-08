import { NextRequest, NextResponse } from "next/server";
import { getApiKey } from "@/lib/getApiKey";
import { ContentSpec } from "@/types/ct";

const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

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

  const prompt = `현대카드 앱 메인피드 콘텐츠 카드 제작 도우미.
유저가 브랜드/제휴사 혜택·프로모션 소개 카드(이미지+문구)를 만들려고 한다.

## 현재까지 확정된 정보
${JSON.stringify(currentSpec, null, 2)}
${hasExistingContent ? "(카드가 이미 생성된 상태 — 수정 요청일 가능성 높음)" : "(아직 카드 없음 — 첫 생성 요청)"}

## 유저 발화
"${message}"

## 너의 역할: 필드 추출 + 실행 판단

### 1단계: 필드 추출
유저 발화에서 아래 필드에 해당하는 정보를 추출해. 추출된 필드만 반환.

- brand: 브랜드명/주제 (예: "대한항공", "스타벅스", "자동차대출")
- content: 구체적 콘텐츠 소재 (예: "마일리지 적립", "음료 할인")
- imageSource: "ai" / "upload" / "combine"
- imageStyle: 이미지 스타일/톤 변경 요청 (예: "초록톤", "밝게", "3D")
- textTone: 문구 톤 (예: "감성적", "정보전달")
- textDraft: 유저가 직접 제공한 문구 초안

### 2단계: 실행 판단 (action)
추출 결과와 currentSpec을 종합해서, 다음 중 하나를 결정:

- **"generate"**: 카드를 새로 생성할 수 있는 충분한 정보가 있음 (brand 또는 content 중 하나 이상). "알아서 만들어줘" 같은 위임도 포함.
- **"edit_image"**: 이미지 수정 요청 (톤/색감/스타일 변경, "밝게", "어둡게", "초록색으로" 등)
- **"edit_copy"**: 문구(상단 텍스트) 수정 요청 ("제목 바꿔", "문구 짧게", "라벨 변경")
- **"edit_sub"**: 하단 텍스트 수정 요청 ("하단 바꿔", "서브라인 수정")
- **"need_info"**: 정보가 부족해서 질문이 필요 (brand도 content도 없고 유추도 불가)

### 3단계: 질문 생성 (action이 "need_info"일 때만)
유저에게 할 자연스러운 한 줄 질문을 생성해. 예: "어떤 브랜드의 카드를 만들까요?"

## 규칙
- brand와 content를 혼동하지 마: brand는 회사/서비스명, content는 구체적 혜택/소재
- "알아서 해줘", "아무거나", "테스트용", "그냥 만들어", "ㄱㄱ", "고고" → action:"generate" (AI가 결정)
- brand만 있고 content가 없어도 action:"generate"
- brand도 content도 없지만 유저가 위임하는 느낌이면 action:"generate"
- need_info는 정말로 아무 단서도 없을 때만
- 발화에 없는 정보는 절대 추측하지 마
- 이미 currentSpec에 있는 값과 동일하면 추출하지 마
- 이미지 첨부가 있으면 이미지 관련 action 우선

JSON만 반환:
{"extracted":{"brand":"...", ...}, "action":"generate", "question":null}
추출된 필드만 포함. 없으면 빈 객체. question은 need_info일 때만.`;

  try {
    const res = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });

    if (!res.ok) {
      console.error("[extract-spec] Gemini error:", res.status);
      return NextResponse.json({ extracted: {} });
    }

    const data = await res.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const parsed = JSON.parse(rawText);

    // null 값 필드 제거 (추출된 것만 남기기)
    const extracted: Record<string, unknown> = {};
    if (parsed.extracted) {
      for (const [key, val] of Object.entries(parsed.extracted)) {
        if (val !== null && val !== undefined && val !== "") {
          extracted[key] = val;
        }
      }
    }

    return NextResponse.json({
      extracted,
      action: parsed.action || "generate",
      question: parsed.question || null,
    });
  } catch (e) {
    console.error("[extract-spec] error:", e);
    return NextResponse.json({ extracted: {} });
  }
}
