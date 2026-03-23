import { NextRequest, NextResponse } from "next/server";
import { getApiKey } from "@/lib/getApiKey";
import { buildRequestBody, parseGeminiResponse } from "@/lib/gemini";

const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

export async function POST(req: NextRequest) {
  const apiKey = getApiKey(req);
  if (!apiKey) {
    return NextResponse.json(
      { error: "API key not configured" },
      { status: 500 }
    );
  }

  const body = await req.json();
  const prompt = body.prompt?.trim();
  if (!prompt) {
    return NextResponse.json(
      { error: "prompt is required" },
      { status: 400 }
    );
  }

  try {
    const geminiRes = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildRequestBody(prompt, body.currentVariants, body.brandContext)),
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error("Gemini API error:", geminiRes.status, errText);
      return NextResponse.json(
        { error: `Gemini API error: ${geminiRes.status}` },
        { status: 502 }
      );
    }

    const data = await geminiRes.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      return NextResponse.json(
        { error: "Empty response from Gemini" },
        { status: 502 }
      );
    }

    const variants = parseGeminiResponse(rawText);
    return NextResponse.json({ variants });
  } catch (e) {
    console.error("Generate error:", e);
    return NextResponse.json(
      { error: "Failed to generate variants" },
      { status: 500 }
    );
  }
}
