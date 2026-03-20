import { NextRequest, NextResponse } from "next/server";

const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 });
  }

  const { message, currentContent } = await req.json();

  const prompt = `너는 CT 카드 제작 도구의 의도 분류기야.
유저가 이미 카드를 만든 상태에서 추가 요청을 보냈어. 이 요청이 무엇을 변경하려는 건지 분류해줘.

현재 카드 상태:
- 상단 라벨: ${currentContent?.label || "없음"}
- 타이틀: ${currentContent?.titleLine1 || "없음"} ${currentContent?.titleLine2 || "없음"}
- 하단: ${currentContent?.subLine1 || "없음"} ${currentContent?.subLine2 || "없음"}
- 이미지: ${currentContent?.imageUrl ? "있음" : "없음"}

유저 요청: "${message}"

## 분류 규칙 (매우 중요!)
- 현재 카드와 같은 주제/브랜드에 대한 수정 요청이면 절대 "new"로 분류하지 마.
- 이미지 관련 키워드(키워줘, 크게, 작게, 밝게, 어둡게, 톤, 색감, 캐릭터, 배경, 분위기 등)가 있으면 → "image"
- 문구/텍스트 관련 키워드(문구, 카피, 제목, 라벨, 타이틀, 짧게, 길게, 바꿔, 수정 등)가 있으면 → "copy"
- 하단/서브 관련이면 → "sub"
- "새로 만들어", "다른 주제로", "다른 브랜드로" 등 명확히 새 주제를 언급할 때만 → "new"
- "전체 다시", "처음부터" 등 전체 재생성을 명확히 요청할 때만 → "all"
- 애매하면 "image" 또는 "copy"로 분류해. "new"나 "all"은 최후의 수단이야.

다음 중 하나만 JSON으로 응답해:
- {"intent": "image"} — 이미지를 바꾸거나 수정하는 요청
- {"intent": "copy"} — 상단 문구(라벨/타이틀)를 바꾸거나 수정하는 요청
- {"intent": "sub"} — 하단 문구를 바꾸거나 수정하는 요청
- {"intent": "new"} — 완전히 다른 주제/브랜드의 카드를 새로 만드는 요청
- {"intent": "all"} — 같은 주제로 전체를 처음부터 다시 만드는 요청

JSON만 응답해.`;

  try {
    const res = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    });

    if (!res.ok) {
      // 에러 시 안전한 기본값: 이미지 수정 (풀 초기화 안 함)
      console.error("[classify-intent] Gemini error:", res.status);
      return NextResponse.json({ intent: "image" });
    }

    const data = await res.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const parsed = JSON.parse(rawText);
    const intent = parsed.intent;

    // 유효한 intent만 허용
    const validIntents = ["image", "copy", "sub", "new", "all"];
    if (!validIntents.includes(intent)) {
      return NextResponse.json({ intent: "image" });
    }

    return NextResponse.json({ intent });
  } catch (e) {
    console.error("[classify-intent] error:", e);
    // 에러 시 안전한 기본값: 이미지 수정 (풀 초기화 안 함)
    return NextResponse.json({ intent: "image" });
  }
}
