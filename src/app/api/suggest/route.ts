import { NextRequest, NextResponse } from "next/server";
import { getApiKey } from "@/lib/getApiKey";
import { buildSuggestBody, parseSuggestResponse, parseGroupSuggestResponse, isGroupField } from "@/lib/gemini";

const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

export async function POST(req: NextRequest) {
  const apiKey = getApiKey(req);
  if (!apiKey) {
    return NextResponse.json({ error: "API key not configured" }, { status: 500 });
  }

  const body = await req.json();
  const { field, currentContent, hint } = body;

  if (!field || !currentContent) {
    return NextResponse.json({ error: "field and currentContent are required" }, { status: 400 });
  }

  try {
    const geminiRes = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildSuggestBody(field, currentContent, 5, hint)),
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error("Gemini suggest error:", geminiRes.status, errText);
      return NextResponse.json({ error: `Gemini API error: ${geminiRes.status}` }, { status: 502 });
    }

    const data = await geminiRes.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      return NextResponse.json({ error: "Empty response from Gemini" }, { status: 502 });
    }

    if (isGroupField(field)) {
      const suggestions = parseGroupSuggestResponse(rawText);
      return NextResponse.json({ suggestions });
    } else {
      const suggestions = parseSuggestResponse(rawText);
      return NextResponse.json({ suggestions });
    }
  } catch (e) {
    console.error("Suggest error:", e);
    return NextResponse.json({ error: "Failed to generate suggestions" }, { status: 500 });
  }
}
