import { NextRequest, NextResponse } from "next/server";
import { getApiKey } from "@/lib/getApiKey";
import { buildImagePrompt, detectBrandName } from "@/lib/imagePrompt";
import { promises as fs } from "fs";
import path from "path";

// 이미지 생성 모델 (나노바나나2 → Pro 폴백)
const IMAGE_MODELS = [
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

const FLASH_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

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

/** 서버→Gemini fetch에 타임아웃 + 클라이언트 abort 전파 */
function fetchWithTimeout(
  url: string,
  init: RequestInit,
  clientSignal?: AbortSignal | null,
  timeoutMs = 45000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    console.log(`[fetchWithTimeout] ${timeoutMs}ms timeout hit, aborting`);
    controller.abort();
  }, timeoutMs);
  // 클라이언트가 끊으면 Gemini 요청도 즉시 abort
  if (clientSignal) {
    if (clientSignal.aborted) {
      controller.abort();
    } else {
      clientSignal.addEventListener("abort", () => controller.abort(), { once: true });
    }
  }
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

// body size 제한 해제 (base64 이미지 포함 요청) + 긴 실행 시간 허용
export const maxDuration = 120;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const apiKey = getApiKey(req);
  if (!apiKey) {
    return NextResponse.json({ error: "API key not configured" }, { status: 500 });
  }

  const body = await req.json();
  const { prompt, referenceImages, copyContext, imageType, brandContext, variation, enhance, edit, originalPrompt } = body;

  if (!prompt) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }

  // 클라이언트 disconnect 시 Gemini 요청도 abort하기 위한 signal
  const clientSignal = req.signal;

  let fullPrompt: string;
  let useSubjectPipeline = false; // 2단계 파이프라인 (주제부 생성 → 상단 확장)

  if (edit) {
    // variation별 크리에이티브 방향
    const variationHints = [
      "Variation: clean & faithful. Apply the color/tone change cleanly. Keep the subject exactly as-is. The background should be a smooth, even gradient. Simple and polished.",
      "Variation: premium refinement. Same composition, but elevate the quality — softer light falloff, subtle depth in shadows, slightly richer surface textures on objects. The kind of image that feels expensive. Do NOT add new objects or effects.",
      "Variation: creative atmosphere. Reinterpret the mood more boldly — different light direction, richer color depth, more contrast between subject and background. Keep the subject intact but make the overall image feel like a different time of day or a different material world. Do NOT add random objects, waveforms, or decorative elements.",
    ];
    const hint = variationHints[variation ?? 0] || variationHints[0];

    fullPrompt = `Edit this image: "${prompt}"
${originalPrompt ? `Original context: "${originalPrompt}"` : ""}

${hint}

YOU ARE GENERATING A BACKGROUND IMAGE. The output will have text overlaid on top later by the app.

⚠️ ABSOLUTE NO-TEXT CONTRACT (NON-NEGOTIABLE — VIOLATING THIS BREAKS THE PRODUCT):
- The output image MUST contain ZERO text. ZERO Korean characters. ZERO English letters. ZERO numbers. ZERO words.
- ZERO text on signs, banners, posters, screens, papers, books, billboards, t-shirts, packaging — anywhere.
- ZERO logos that contain readable text. Pure abstract icons OK; brand wordmarks NOT OK.
- Even if the input has prominent text — REMOVE IT ALL. Do NOT preserve it. Do NOT recreate it. Do NOT translate it.
- Even if the text seems decorative or important — REMOVE IT. Text is added separately on top by the app.
- If you generate ANY readable text in the output, the entire image is unusable. This is the most important rule.

STEP 1 — STRIP EVERYTHING:
- The input is likely a card screenshot. It has text, borders, rounded corners, hearts, icons overlaid.
- You MUST produce a CLEAN background with ZERO text, ZERO UI elements, ZERO borders.
- Where text was: fill with smooth background gradient continuation.
- Where borders/corners were: extend the background to fill the full square edge-to-edge.

STEP 2 — SUBJECT:
- Keep the main visual subject (illustrations, photos, 3D objects) intact and well-positioned.
- Subject should sit in the LOWER 60% of the image. Upper 40% should be clean low-contrast background (text will go there).
- Preserve logos ON objects (e.g. icons on tiles/cards in the illustration). These are part of the subject, not UI overlay.

STEP 3 — COLOR:
- Apply the requested change naturally. Shift mid-tones, keep whites/blacks.
- Maintain the original color harmony. Don't make it look like a cheap filter.

OUTPUT: exactly 1:1 square, edge-to-edge, NO borders, NO padding, NO cropping, maximum sharpness.
If input is not square, OUTPAINT (extend background) to make square. NEVER crop.

DO NOT add any new objects, decorative elements, waveforms, particles, or effects that weren't in the original.`;
    console.log(`[image-gen] edit mode, prompt length=${fullPrompt.length}`);
  } else if (enhance) {
    // 첨부 이미지 보정 모드 — variation별 살짝 다른 방향
    const enhanceVariationHints = [
      "Variation: clean faithful enhancement. Subtle quality boost — sharper edges, cleaner colors, more detail. Composition and framing UNCHANGED. Highest fidelity to input.",
      "Variation: subject focus emphasis. Same content, but slightly tighter perceptual focus on the main subject — make the focal object feel more prominent (subtly stronger shadow grounding, slightly softer/blurrier background context, more contrast separation between subject and surroundings). Do NOT crop or zoom; achieve focus via lighting and depth cues only.",
      "Variation: premium refinement. Same subject and composition, but elevate the presentation — softer light falloff, subtly richer mid-tones, slightly deeper shadows, marginally more saturated key colors. Feels expensive and polished. Do NOT add new objects.",
    ];
    const enhanceHint = enhanceVariationHints[variation ?? 0] || enhanceVariationHints[0];

    fullPrompt = `You are enhancing a user-provided image for use as a 1:1 square card background. The output will be exported at 3x resolution (1005×1044px WebP), so maximum sharpness and detail is critical.

${enhanceHint}

⚠️ ABSOLUTE NO-TEXT CONTRACT (NON-NEGOTIABLE — VIOLATING THIS BREAKS THE PRODUCT):
- The output image MUST contain ZERO text. ZERO Korean characters. ZERO English letters. ZERO numbers. ZERO words.
- ZERO text on signs, banners, posters, screens, papers, books, billboards, t-shirts, packaging — anywhere.
- If the input image contains text — REMOVE IT during enhancement. Replace with smooth background continuation.
- Even logos with readable text must be removed or replaced with pure abstract icons.
- Text is added separately on top by the app. Any text in the output makes the image unusable.

TASK:
- Enhance the attached image to high quality and extend it to fit a 1:1 square aspect ratio
- Position the main subject (focal object) so its center sits at approximately the lower 1/3 of the image (around 66% from top). The upper 2/3 is where text overlays will go
- Extend/outpaint ONLY with simple, natural continuation of the existing background (sky, blur, gradient, etc.)
- Maximize sharpness: crisp edges, fine texture detail, no softness or blur on the subject. The image must hold up at 3x pixel density without looking mushy
- Clean, natural lighting and true-to-life colors

DO NOT:
- Do NOT add any new objects, elements, or details that are not already in the original image
- Do NOT add or preserve any text, logos with text, watermarks, or UI elements (see NO-TEXT CONTRACT above)
- Do NOT change or reinterpret the subject — if something is ambiguous, leave it as-is
- Do NOT fill empty space with concrete new objects — use only simple background continuation (solid color, sky, bokeh, blur)
- Do NOT change the original mood, color palette, or atmosphere
- Do NOT apply any artificial sharpening artifacts or HDR-like over-processing

User context: ${prompt}`;
    console.log(`[image-gen] enhance mode, prompt length=${fullPrompt.length}`);
  } else {
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

    // 2단계 파이프라인: subjectOnly 모드로 주제부 생성 → 이후 상단 확장
    useSubjectPipeline = true;
    fullPrompt = buildImagePrompt(prompt, imageType, copyContext, externalBrand, variation, true);
    console.log(`[image-gen] subject pipeline Step1, imageType=${imageType || "default"}, variation=${variation ?? 0}, prompt length=${fullPrompt.length}`);
  }

  // 레퍼런스 이미지가 있을 때 — 화면을 다시 찍은 사진일 가능성 → 모아레/픽셀패턴/스캔라인/
  // JPEG 압축 artifact 제거 지시. edit/enhance/default 어느 모드든 동일하게 적용.
  const hasRefImages = referenceImages && Array.isArray(referenceImages) && referenceImages.length > 0;
  if (hasRefImages) {
    fullPrompt += `

REFERENCE IMAGE CLEANUP (CRITICAL):
The reference image may have been photographed off a screen (LCD/monitor) or be a low-quality capture.
AGGRESSIVELY remove these in the output:
- Moire patterns (interference patterns from photographing pixel grids)
- Visible pixel grids, sub-pixel RGB stripes, scan lines
- Color banding in gradients
- JPEG compression blocks / mosquito noise around edges
- Glare, reflections, or color cast from the screen
- ANY text, logos with words, watermarks, or UI elements visible in the reference (see NO-TEXT CONTRACT)
The output must look like an ORIGINAL clean high-quality image, NOT a re-photographed screen.
Restore smooth gradients, clean edges, accurate colors. Do not preserve any of these artifacts.`;
  }

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

  // 브랜드 로고/CI 참조 (마스코트 브랜드 제외)
  if (brandName && !BRAND_MASCOT_MAP[brandName]) {
    // 항상 CI 레퍼런스가 필요한 브랜드 (최신 CI 강제)
    const ALWAYS_ATTACH_CI = new Set(["대한항공"]);

    if (ALWAYS_ATTACH_CI.has(brandName)) {
      const logo = await findBrandLogo(brandName);
      if (logo) {
        parts[0] = { text: (parts[0] as { text: string }).text + `\n\nThe attached image is the CURRENT (2025) official brand CI for "${brandName}". Use this as the AUTHORITATIVE visual reference for this brand's identity, colors, and design language. Any brand elements in the generated image MUST match this new CI — do NOT use any older versions of this brand's logo or visual identity.` };
        parts.push({ inline_data: { mime_type: logo.mimeType, data: logo.data } });
        console.log(`[image-gen] 브랜드 CI 항상 참조: ${brandName}`);
      }
    } else {
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
  }

  // Step 1: 이미지 생성 (주제부 파이프라인이면 3:2, 아니면 1:1)
  const step1AspectRatio = useSubjectPipeline ? "3:2" : "1:1";

  let step1Image: { data: string; mimeType: string } | null = null;
  let step1Text = "";

  for (const model of IMAGE_MODELS) {
    const url = `${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`;
    console.log(`[image-gen] Step1 시도: ${model} (${step1AspectRatio})`);

    try {
      const geminiRes = await fetchWithTimeout(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            responseModalities: ["TEXT", "IMAGE"],
            imageConfig: {
              aspectRatio: step1AspectRatio,
              imageSize: "1K",
            },
          },
        }),
      }, clientSignal);

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

      console.log(`[image-gen] ${model}: Step1 성공!`);
      step1Image = {
        data: imageData.data,
        mimeType: (imageData.mimeType || imageData.mime_type) as string,
      };
      step1Text = textPart?.text || "";
      break;
    } catch (e) {
      console.error(`[image-gen] ${model} 예외:`, e);
      continue;
    }
  }

  if (!step1Image) {
    return NextResponse.json(
      { error: "모든 이미지 생성 모델이 실패했습니다. 이미지를 직접 첨부해주세요." },
      { status: 502 }
    );
  }

  // 주제부 파이프라인이 아니면 (edit/enhance) Step 1 결과를 바로 반환
  if (!useSubjectPipeline) {
    // edit 모드: 텍스트 응답에서 extractedText JSON 파싱 시도
    let extractedText = null;
    if (edit && step1Text) {
      try {
        const jsonMatch = step1Text.match(/\{[\s\S]*"extractedText"[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          extractedText = parsed.extractedText || null;
        }
      } catch {
        console.log("[image-gen] extractedText 파싱 실패, 무시");
      }
    }
    return NextResponse.json({
      image: step1Image,
      text: step1Text,
      ...(extractedText ? { extractedText } : {}),
    });
  }

  // Step 2: 상단 확장 — 3:2 주제부 이미지를 1:1로 아웃페인팅
  const expandPrompt = `You are extending a subject-focused image UPWARD to create a complete card background.

The attached image contains the main subject/focal area of a card. Extend this image to a 1:1 square format by adding content ABOVE.

RULES:
- The UPPER portion (newly added area, ~top 35%) must be LOW-CONTRAST and SIMPLE — this is where text will overlay
- Use natural continuation of the existing background: soft gradients, blurred colors, bokeh, atmospheric haze, or subtle texture
- The transition from existing image to extended area must be SEAMLESS — no visible seam or boundary
- Do NOT modify, crop, or recompose the existing lower portion of the image
- Do NOT add new objects, text, logos, or distinct elements in the extended area
- Maintain the same color palette, lighting direction, and mood
- Maximum sharpness and detail — the output will be displayed at 3x resolution`;

  for (const model of IMAGE_MODELS) {
    const url = `${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`;
    console.log(`[image-gen] Step2 상단확장 시도: ${model}`);

    try {
      const geminiRes = await fetchWithTimeout(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: expandPrompt },
              { inline_data: { mime_type: step1Image.mimeType, data: step1Image.data } },
            ],
          }],
          generationConfig: {
            responseModalities: ["TEXT", "IMAGE"],
            imageConfig: {
              aspectRatio: "1:1",
              imageSize: "1K",
            },
          },
        }),
      }, clientSignal);

      if (!geminiRes.ok) {
        const errText = await geminiRes.text();
        console.error(`[image-gen] Step2 ${model} HTTP 실패:`, geminiRes.status, errText.slice(0, 300));
        continue;
      }

      const data = await geminiRes.json();
      const candidate = data.candidates?.[0]?.content?.parts;
      if (!candidate) {
        console.error(`[image-gen] Step2 ${model}: empty candidate`);
        continue;
      }

      const imagePart = candidate.find(
        (p: Record<string, unknown>) => p.inlineData || p.inline_data
      );

      const imageData = (imagePart?.inlineData || imagePart?.inline_data) as
        | { data: string; mimeType?: string; mime_type?: string }
        | undefined;

      if (!imageData) {
        console.error(`[image-gen] Step2 ${model}: no image in response`);
        continue;
      }

      console.log(`[image-gen] Step2 ${model}: 성공! 2단계 파이프라인 완료`);
      return NextResponse.json({
        image: {
          data: imageData.data,
          mimeType: imageData.mimeType || imageData.mime_type,
        },
        text: step1Text,
      });
    } catch (e) {
      console.error(`[image-gen] Step2 ${model} 예외:`, e);
      continue;
    }
  }

  // Step 2 실패 시 Step 1 결과라도 반환 (3:2이지만 없는 것보다 나음)
  console.warn(`[image-gen] Step2 모두 실패, Step1 결과 fallback 반환`);
  return NextResponse.json({
    image: step1Image,
    text: step1Text,
  });
}
