import { NextRequest, NextResponse } from "next/server";
import { getApiKey } from "@/lib/getApiKey";

const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

const PROMPT = `이 이미지를 335×348 카드 배경으로 사용할 거야.
피사체(주요 오브젝트)의 위치를 분석해서 최적의 크롭 정렬을 추천해줘.

JSON만 반환:
{
  "alignX": "left" | "center" | "right",
  "alignY": "top" | "center" | "bottom",
  "isSmall": boolean,
  "reason": "한줄 설명"
}

- alignX/alignY: 피사체가 보이도록 하는 최적 정렬
- isSmall: 이미지가 로고/아이콘처럼 작은 오브젝트면 true (배경으로 부적합)
- reason: 왜 이 정렬을 추천하는지`;

export async function POST(req: NextRequest) {
  const apiKey = getApiKey(req);
  if (!apiKey) {
    return NextResponse.json({ error: "API key not configured" }, { status: 500 });
  }

  const formData = await req.formData();
  const file = formData.get("image") as File | null;
  if (!file) {
    return NextResponse.json({ error: "image is required" }, { status: 400 });
  }

  const bytes = await file.arrayBuffer();
  const base64 = Buffer.from(bytes).toString("base64");
  const mimeType = file.type || "image/jpeg";

  try {
    const geminiRes = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: PROMPT },
            { inline_data: { mime_type: mimeType, data: base64 } },
          ],
        }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.2,
        },
      }),
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error("Gemini analyze error:", geminiRes.status, errText);
      return NextResponse.json({ error: `Gemini API error: ${geminiRes.status}` }, { status: 502 });
    }

    const data = await geminiRes.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      return NextResponse.json({ error: "Empty response" }, { status: 502 });
    }

    const result = JSON.parse(rawText);
    return NextResponse.json(result);
  } catch (e) {
    console.error("Analyze error:", e);
    return NextResponse.json({ error: "Failed to analyze image" }, { status: 500 });
  }
}
