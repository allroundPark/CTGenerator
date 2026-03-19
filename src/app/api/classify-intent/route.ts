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

다음 중 하나만 JSON으로 응답해:
- {"intent": "image"} — 이미지를 바꾸거나 새로 만들어달라는 요청
- {"intent": "copy"} — 상단 문구(라벨/타이틀)를 바꾸거나 새로 만들어달라는 요청
- {"intent": "sub"} — 하단 문구를 바꾸거나 새로 만들어달라는 요청
- {"intent": "new"} — 완전히 새로운 주제의 카드를 만들어달라는 요청
- {"intent": "all"} — 전체를 다시 만들어달라는 요청

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
      return NextResponse.json({ intent: "all" });
    }

    const data = await res.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const parsed = JSON.parse(rawText);
    return NextResponse.json({ intent: parsed.intent || "all" });
  } catch {
    return NextResponse.json({ intent: "all" });
  }
}
