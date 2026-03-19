import { NextRequest, NextResponse } from "next/server";
import { buildImagePrompt } from "@/lib/imagePrompt";

// 이미지 생성 모델 (최신 순)
const IMAGE_MODELS = [
  "gemini-2.5-flash-image",
  "gemini-3.1-flash-image-preview",
  "gemini-3-pro-image-preview",
];
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 });
  }

  const body = await req.json();
  const { prompt, referenceImages, copyContext, imageType } = body;

  if (!prompt) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }

  // Step 1: 프리셋 기반 구조화 프롬프트 빌드
  const fullPrompt = buildImagePrompt(prompt, imageType, copyContext);
  console.log(`[image-gen] imageType=${imageType || "default"}, prompt length=${fullPrompt.length}`);

  const parts: Array<Record<string, unknown>> = [{ text: fullPrompt }];

  // 참조/편집 이미지
  if (referenceImages && Array.isArray(referenceImages)) {
    for (const img of referenceImages) {
      if (img.data && img.mimeType) {
        parts.push({
          inline_data: { mime_type: img.mimeType, data: img.data },
        });
      }
    }
  }

  // 모델 순회하며 시도
  for (const model of IMAGE_MODELS) {
    const url = `${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`;
    console.log(`[image-gen] 시도: ${model}`);

    try {
      const geminiRes = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            responseModalities: ["TEXT", "IMAGE"],
            imageConfig: {
              aspectRatio: "1:1",
              imageSize: "1K",
            },
          },
        }),
      });

      if (!geminiRes.ok) {
        const errText = await geminiRes.text();
        console.error(`[image-gen] ${model} HTTP 실패:`, geminiRes.status, errText.slice(0, 300));
        continue;
      }

      const data = await geminiRes.json();
      const candidate = data.candidates?.[0]?.content?.parts;
      if (!candidate) {
        console.error(`[image-gen] ${model}: empty candidate`);
        continue;
      }

      const imagePart = candidate.find(
        (p: Record<string, unknown>) => p.inlineData || p.inline_data
      );
      const textPart = candidate.find(
        (p: Record<string, unknown>) => p.text
      );

      const imageData = (imagePart?.inlineData || imagePart?.inline_data) as
        | { data: string; mimeType?: string; mime_type?: string }
        | undefined;

      if (!imageData) {
        console.error(`[image-gen] ${model}: no image in response, text:`, textPart?.text?.slice(0, 100));
        continue;
      }

      console.log(`[image-gen] ${model}: 성공!`);
      return NextResponse.json({
        image: {
          data: imageData.data,
          mimeType: imageData.mimeType || imageData.mime_type,
        },
        text: textPart?.text || "",
      });
    } catch (e) {
      console.error(`[image-gen] ${model} 예외:`, e);
      continue;
    }
  }

  return NextResponse.json(
    { error: "모든 이미지 생성 모델이 실패했습니다. 이미지를 직접 첨부해주세요." },
    { status: 502 }
  );
}
