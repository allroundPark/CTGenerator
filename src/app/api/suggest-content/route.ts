import { NextRequest, NextResponse } from "next/server";
import { getApiKey } from "@/lib/getApiKey";

const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

export async function POST(req: NextRequest) {
  const apiKey = getApiKey(req);
  if (!apiKey) {
    return NextResponse.json({ error: "API key not configured" }, { status: 500 });
  }

  const { brand } = (await req.json()) as { brand: string };

  const prompt = `"${brand}"라는 브랜드/서비스에 대해 현대카드 앱 메인피드 콘텐츠 카드로 만들 만한 구체적 소재를 3개 추천해.

규칙:
- 각 소재는 10자 이내로 짧고 구체적이어야 함 (예: "마일리지 적립", "음료 할인", "라운지 이용")
- 절대 10자를 넘기지 마
- 추상적 분류 금지 (예: "혜택 안내" ← 이런 거 금지)
- 해당 브랜드의 실제 서비스/혜택에 기반
- JSON 배열로 반환: ["소재1", "소재2", "소재3"]`;

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
      console.error("[suggest-content] Gemini error:", res.status);
      return NextResponse.json({ suggestions: [] });
    }

    const data = await res.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const suggestions = JSON.parse(rawText);

    return NextResponse.json({
      suggestions: Array.isArray(suggestions) ? suggestions.slice(0, 3) : [],
    });
  } catch (e) {
    console.error("[suggest-content] error:", e);
    return NextResponse.json({ suggestions: [] });
  }
}
