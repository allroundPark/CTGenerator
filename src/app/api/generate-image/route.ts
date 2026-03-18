import { NextRequest, NextResponse } from "next/server";

const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent";

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 });
  }

  const body = await req.json();
  const { prompt, referenceImages } = body;

  if (!prompt) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }

  // 프롬프트 구성
  const systemPrompt = `Generate a background image for a mobile app card (335×348px, aspect ratio close to 1:1).
The image should work well as a background behind text overlays.
Style: clean, modern, suitable for a Korean financial app.
Do NOT include any text in the image.

User request: ${prompt}`;

  const parts: Array<Record<string, unknown>> = [{ text: systemPrompt }];

  // 참조 이미지가 있으면 추가 (합성용)
  if (referenceImages && Array.isArray(referenceImages)) {
    for (const img of referenceImages) {
      if (img.data && img.mimeType) {
        parts.push({
          inline_data: { mime_type: img.mimeType, data: img.data },
        });
      }
    }
  }

  try {
    const geminiRes = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"],
        },
      }),
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error("Nano Banana 2 error:", geminiRes.status, errText);
      return NextResponse.json(
        { error: `Image generation failed: ${geminiRes.status}` },
        { status: 502 }
      );
    }

    const data = await geminiRes.json();
    const candidate = data.candidates?.[0]?.content?.parts;
    if (!candidate) {
      return NextResponse.json({ error: "Empty response from Nano Banana 2" }, { status: 502 });
    }

    // 이미지 파트 찾기
    const imagePart = candidate.find(
      (p: Record<string, unknown>) => p.inline_data
    );
    const textPart = candidate.find(
      (p: Record<string, unknown>) => p.text
    );

    if (!imagePart?.inline_data) {
      return NextResponse.json(
        { error: "No image generated", text: textPart?.text },
        { status: 502 }
      );
    }

    return NextResponse.json({
      image: {
        data: imagePart.inline_data.data,
        mimeType: imagePart.inline_data.mime_type,
      },
      text: textPart?.text || "",
    });
  } catch (e) {
    console.error("Image generation error:", e);
    return NextResponse.json({ error: "Failed to generate image" }, { status: 500 });
  }
}
