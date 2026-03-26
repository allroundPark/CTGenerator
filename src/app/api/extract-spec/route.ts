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

  const prompt = `현대카드 앱 메인피드 콘텐츠 카드 제작 도우미.
유저가 브랜드/제휴사 혜택·프로모션 소개 카드(이미지+문구)를 만들려고 한다.

## 현재까지 확정된 정보
${JSON.stringify(currentSpec, null, 2)}

## 유저 발화
"${message}"

## 너의 역할: 필드 추출만 (판단하지 마)
유저 발화에서 아래 필드에 해당하는 정보를 추출해. 추출된 필드만 반환.

- brand: 브랜드명/주제 (예: "대한항공", "스타벅스", "자동차대출")
- content: 구체적 콘텐츠 소재 (예: "마일리지 적립", "음료 할인")
- imageSource: "ai"(AI 생성) / "upload"(이미지 첨부) / "combine"(여러 이미지 조합)
- imageStyle: "실사" / "3D 일러스트" / "미니멀" 등
- textTone: "감성적" / "정보전달" / "행동유도" 등
- textDraft: 유저가 직접 제공한 문구 초안

## 규칙
- "AI가 알아서", "알아서 만들어" 같은 표현 → 해당 없는 필드는 추출하지 마 (null)
- 이미 currentSpec에 있는 값과 동일하면 추출하지 마
- 발화에 없는 정보는 절대 추측하지 마
- brand와 content를 혼동하지 마: brand는 회사/서비스명, content는 그 brand의 구체적 혜택/소재

## 수정 요청 시 (currentSpec에 값이 있는 상태에서 추가 요청)
- "밝게 해줘", "어둡게", "톤 바꿔" → imageStyle 추출 (예: "밝은 톤", "어두운 톤")
- "분위기 바꿔", "배경 바꿔" → imageStyle 추출
- "3D로 바꿔", "실사로" → imageStyle 추출
- "더 감성적으로", "정보전달 위주로" → textTone 추출
- 수정 요청에서도 변경하려는 필드만 추출. 나머지는 추출하지 마.

JSON만 반환:
{"extracted":{"brand":"...", ...}}
추출된 필드만 포함. 없으면 빈 객체: {"extracted":{}}`;

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

    return NextResponse.json({ extracted });
  } catch (e) {
    console.error("[extract-spec] error:", e);
    return NextResponse.json({ extracted: {} });
  }
}
