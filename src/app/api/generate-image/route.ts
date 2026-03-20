import { NextRequest, NextResponse } from "next/server";
import { buildImagePrompt, detectBrandName } from "@/lib/imagePrompt";
import { promises as fs } from "fs";
import path from "path";

// 이미지 생성 모델 (최신 순)
const IMAGE_MODELS = [
  "gemini-2.5-flash-image",
  "gemini-3.1-flash-image-preview",
  "gemini-3-pro-image-preview",
];
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/** 브랜드명 → 로고 파일명 매핑 */
const BRAND_LOGO_MAP: Record<string, string> = {
  "Amex": "amex",
  "스타벅스": "starbucks",
  "마켓컬리": "kurly",
  "올리브영": "oliveyoung",
  "GS칼텍스": "gscaltex",
  "코스트코": "costco",
  "네이버": "naver",
  "무신사": "musinsa",
  "SSG.COM": "ssg",
  "G마켓": "gmarket",
  "대한항공": "koreanair",
  "쏘카": "socar",
  "도미노": "dominos",
  "파리바게뜨": "parisbaguette",
  "투썸플레이스": "twosome",
  "이마트": "emart",
  "베스킨라빈스": "baskinrobbins",
  "넥슨": "nexon",
  "롯데홈쇼핑": "lottehomeshopping",
  "현대카드": "hyundaicard",
  "현대백화점": "hyundaidept",
  "현대자동차": "hyundaimotor",
  "멜론": "melon",
  "T다이렉트샵": "tdirect",
  "고트럭": "gotruck",
  "국민비서": "gukminbiseo",
};

/** 마스코트 캐릭터가 있는 브랜드 — 해당 브랜드 요청 시 항상 레퍼런스로 포함 */
const BRAND_MASCOT_MAP: Record<string, { file: string; name: string; description: string }> = {
  "국민비서": {
    file: "gukminbiseo",
    name: "국민비서 캐릭터",
    description: "A cute teal/mint-colored rabbit character wearing a white outfit with a name tag. Round face with pink cheeks, big happy eyes, and long rabbit ears with yellow inner color. The character has a friendly, approachable appearance.",
  },
};

/** public/logos/ 에서 브랜드 로고 파일을 찾아 base64로 반환 */
async function findBrandLogo(brandName: string): Promise<{ data: string; mimeType: string } | null> {
  const logosDir = path.join(process.cwd(), "public", "logos");
  const fileName = BRAND_LOGO_MAP[brandName];
  if (!fileName) return null;

  const exts = [".png", ".webp", ".jpg", ".jpeg", ".svg"];
  const mimeMap: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml" };

  for (const ext of exts) {
    try {
      const filePath = path.join(logosDir, fileName + ext);
      const buffer = await fs.readFile(filePath);
      return { data: buffer.toString("base64"), mimeType: mimeMap[ext] || "image/png" };
    } catch {
      continue;
    }
  }
  return null;
}

const FLASH_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

/** Gemini Flash로 로고 포함 의도 판별 */
async function checkLogoIntent(apiKey: string, userPrompt: string): Promise<boolean> {
  try {
    const res = await fetch(`${FLASH_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `유저가 이미지 생성을 요청했어. 이 요청에 브랜드 로고나 CI를 이미지에 포함해달라는 의도가 있는지 판단해줘.

유저 요청: "${userPrompt}"

로고/CI 포함 요청의 예: "로고 넣어줘", "브랜드 마크 포함", "CI 넣어서", "로고 있는 버전"
로고 불필요한 예: "따뜻한 느낌으로", "미니멀하게", "3D로 만들어줘", "컬리 혜택 카드"

JSON으로만 응답: {"needsLogo": true} 또는 {"needsLogo": false}` }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    return JSON.parse(text).needsLogo === true;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 });
  }

  const body = await req.json();
  const { prompt, referenceImages, copyContext, imageType, brandContext } = body;

  if (!prompt) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }

  // 외부 브랜드 컨텍스트를 imagePrompt에 전달 (서비스 특성 포함)
  const externalBrand = brandContext ? {
    brandName: brandContext.brandName,
    primaryColor: brandContext.primaryColor,
    secondaryColor: brandContext.secondaryColor,
    mascotDescription: brandContext.mascotDescription,
    description: brandContext.description,
    targetAudience: brandContext.targetAudience,
    serviceCharacteristics: brandContext.serviceCharacteristics,
  } : undefined;

  // Step 1: 프리셋 기반 구조화 프롬프트 빌드
  const fullPrompt = buildImagePrompt(prompt, imageType, copyContext, externalBrand);
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

  // 마스코트 이미지 (웹 검색으로 찾은 것)
  if (brandContext?.mascotImage?.data) {
    parts[0] = { text: fullPrompt + `\n\nThe attached image is the official mascot/character "${brandContext.mascotName || "character"}" for "${brandContext.brandName}". Use it as a visual reference to include this character naturally in the generated image. Maintain the character's colors, proportions, and recognizable features.` };
    parts.push({
      inline_data: { mime_type: brandContext.mascotImage.mimeType, data: brandContext.mascotImage.data },
    });
    console.log(`[image-gen] 마스코트 이미지 참조: ${brandContext.brandName} - ${brandContext.mascotName}`);
  }

  // 마스코트 캐릭터 참조 — 해당 브랜드 요청 시 항상 포함
  const brandName = detectBrandName(prompt);
  if (brandName && BRAND_MASCOT_MAP[brandName]) {
    const mascot = BRAND_MASCOT_MAP[brandName];
    const mascotImage = await findBrandLogo(brandName);
    if (mascotImage) {
      parts[0] = { text: (parts[0] as { text: string }).text + `\n\nThe attached image is the official mascot character "${mascot.name}" for "${brandName}". ${mascot.description}. Include this character naturally in the generated image — it should be a recognizable element in the scene. Maintain the character's exact colors, proportions, and features.` };
      parts.push({ inline_data: { mime_type: mascotImage.mimeType, data: mascotImage.data } });
      console.log(`[image-gen] 마스코트 캐릭터 참조: ${brandName} - ${mascot.name}`);
    }
  }

  // 브랜드 로고 참조 — Gemini가 로고 필요 여부 판단 (마스코트 브랜드 제외)
  if (brandName && !BRAND_MASCOT_MAP[brandName]) {
    const needsLogo = await checkLogoIntent(apiKey, prompt);
    if (needsLogo) {
      const logo = await findBrandLogo(brandName);
      if (logo) {
        parts[0] = { text: (parts[0] as { text: string }).text + `\n\nThe attached image is the brand logo for "${brandName}". Incorporate this logo subtly in the bottom-right area of the generated image.` };
        parts.push({ inline_data: { mime_type: logo.mimeType, data: logo.data } });
        console.log(`[image-gen] 브랜드 로고 참조: ${brandName}`);
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
