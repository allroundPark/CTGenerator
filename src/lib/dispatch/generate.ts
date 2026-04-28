// generate intent — 첫 카드 생성. inputMode에 따라 4가지 실행 경로:
//   text                  → 표준 (브랜드 검색 + 문구 + 이미지 3안)
//   attached_apply        → 첨부 이미지 보정 (OCR 시도) + 문구
//   attached_edit         → 첨부 이미지 텍스트 제거 + OCR 기반 문구 + 이미지 수정 3안
//   attached_reference    → 첨부 이미지를 스타일 참고로 새 카드 3안

import { Intent } from "@/types/intent";
import { BrandContext, CTContent } from "@/types/ct";
import { searchBrand, generateText, generateParallelImages } from "@/lib/orchestrate";
import { getKnownBrandContext } from "@/lib/imagePrompt";
import { fileToBase64, fileToResizedBase64 } from "@/lib/imageHelpers";
import { DispatchDeps, DispatchResult } from "./types";

type GenerateIntent = Extract<Intent, { type: "generate" }>;

const STYLE_MAP: Array<"realistic" | "3d" | "2d"> = ["realistic", "3d", "2d"];

export async function dispatchGenerate(
  intent: GenerateIntent,
  deps: DispatchDeps,
): Promise<DispatchResult> {
  // promptSource → contentSpec 머지 (기존 동작과 일치)
  const merged = {
    ...deps.contentSpec,
    brand: intent.promptSource.brand ?? deps.contentSpec.brand,
    content: intent.promptSource.content ?? deps.contentSpec.content,
  };
  if (intent.promptSource.brand || intent.promptSource.content) {
    deps.setContentSpec((prev) => ({
      ...prev,
      brand: intent.promptSource.brand ?? prev.brand,
      content: intent.promptSource.content ?? prev.content,
    }));
  }

  const text = intent.promptSource.freeText;
  const promptText = [merged.brand, merged.content].filter(Boolean).join(" ") || text;

  switch (intent.inputMode) {
    case "text":
      return runTextOnly(intent, deps, merged.brand, promptText);
    case "attached_apply":
      return runAttachedApply(intent, deps, promptText);
    case "attached_edit":
      return runAttachedEdit(intent, deps, promptText);
    case "attached_reference":
      return runAttachedReference(intent, deps, promptText);
  }
}

// ── text 전용 ──
async function runTextOnly(
  intent: GenerateIntent,
  deps: DispatchDeps,
  brand: string | null | undefined,
  promptText: string,
): Promise<DispatchResult> {
  const { pools, setBrandCtx, showStatus, apiFetch, log, prepared } = deps;

  // 1. 브랜드 컨텍스트 — prepared에 있으면 재사용, 없으면 fetch
  let activeBrandCtx: BrandContext | null = prepared?.brandContext ?? null;
  if (!activeBrandCtx && intent.brandSearch === "required" && brand) {
    showStatus("브랜드 검색 중...");
    const known = getKnownBrandContext(brand);
    if (known) {
      activeBrandCtx = {
        ...known,
        mascotName: null,
        mascotDescription: null,
        mascotImage: null,
      } as BrandContext;
    } else {
      activeBrandCtx = await searchBrand(brand, apiFetch);
    }
  }
  if (activeBrandCtx) {
    setBrandCtx(activeBrandCtx);
    showStatus(`"${activeBrandCtx.brandName}" 정보 확인! 문구 생성 중...`);
  } else {
    showStatus("문구 생성 중...");
  }

  // 2. 문구 — prepared에 있으면 재사용
  let variants: CTContent[] = prepared?.variants ?? [];
  if (variants.length === 0) {
    variants = await generateText(promptText, activeBrandCtx, apiFetch);
  }
  pools.appendToPool(variants);

  log({
    message: intent.promptSource.freeText,
    intent: "new",
    attached_images_count: 0,
    variants: variants.map((v) => ({
      label: v.label,
      titleLine1: v.titleLine1,
      titleLine2: v.titleLine2,
      subLine1: v.subLine1,
      subLine2: v.subLine2,
      textColor: v.textColor,
      imageType: v.imageType,
    })),
    image_type: variants[0]?.imageType || null,
    brand_context: activeBrandCtx
      ? {
          brandName: activeBrandCtx.brandName,
          category: activeBrandCtx.category,
          primaryColor: activeBrandCtx.primaryColor,
        }
      : null,
  });

  // 3. 이미지 3안 — 한 장씩 풀에 추가하여 점진적으로 표시
  showStatus("이미지 1/3 생성 중...");
  const imgErrors: string[] = [];
  let generatedCount = 0;
  await generateParallelImages(
    promptText,
    variants[0],
    activeBrandCtx,
    {
      count: 3,
      onEach: (i, total, imgUrl) => {
        if (imgUrl) {
          const variant = variants[i] || variants[0];
          pools.addImageToPool(imgUrl, variant.textColor, variant.bgTreatment, {
            generationPrompt: promptText,
            generationStyle: STYLE_MAP[i] || "realistic",
            generationVariation: i,
          });
          generatedCount++;
          if (i === 0) {
            log({
              message: intent.promptSource.freeText,
              intent: "image_generated",
              image_generated: true,
              image_type: variant.imageType || null,
            });
          }
        }
        if (i + 1 < total) {
          showStatus(`이미지 ${i + 1}/${total} 완성! ${i + 2}/${total} 생성 중...`);
        }
      },
    },
    apiFetch,
    imgErrors,
  );

  reportCompletion(deps, generatedCount, imgErrors);
  return { ok: generatedCount > 0 };
}

// ── attached_apply: 첨부 이미지 보정 + OCR ──
async function runAttachedApply(
  intent: GenerateIntent,
  deps: DispatchDeps,
  promptText: string,
): Promise<DispatchResult> {
  const { pools, chat, showStatus, apiFetch, log } = deps;
  const applyImg = intent.attachedImages?.find((i) => i.option === "apply");
  if (!applyImg) {
    chat.addMessage({ role: "assistant", content: "보정할 이미지를 찾을 수 없어요." });
    return { ok: false };
  }

  showStatus("이미지 보정 & 문구 생성 중...");
  const b64 = await fileToBase64(applyImg.file);
  const applyImageData = { data: b64, mimeType: applyImg.file.type || "image/jpeg" };
  const refData = [applyImageData];

  // 보정 이미지 3안 병렬 시작 — onEach로 한 장씩 풀에 추가
  const imgErrors: string[] = [];
  let generatedCount = 0;
  const imagePromise = (async () => {
    showStatus("첨부 이미지 1/3 보정 중...");
    return generateParallelImages(
      promptText,
      { imageType: "" } as CTContent,
      null,
      {
        count: 3,
        enhance: true,
        referenceImages: refData,
        onEach: (i, total, imgUrl) => {
          if (imgUrl) {
            pools.addImageToPool(imgUrl, undefined, undefined, {
              generationPrompt: promptText,
              generationStyle: "realistic",
              generationVariation: i,
            });
            generatedCount++;
          }
          if (i + 1 < total) {
            showStatus(`이미지 ${i + 1}/${total} 완성! ${i + 2}/${total} 보정 중...`);
          }
        },
      },
      apiFetch,
      imgErrors,
    );
  })();

  // OCR로 문구 추출 시도
  const ocrResult = await tryOcr(applyImageData, apiFetch);
  let variants: CTContent[];
  if (ocrResult?.label || ocrResult?.titleLine1) {
    const ocrVariant = ocrToVariant(ocrResult);
    const ocrContext = `${ocrResult.label || ""} ${ocrResult.titleLine1 || ""} ${ocrResult.titleLine2 || ""}`.trim();
    const more = await generateText(ocrContext, null, apiFetch).catch(() => []);
    variants = [ocrVariant, ...more];
  } else {
    const fallback = `첨부된 이미지를 분석해서 이 이미지에 어울리는 카드 문구를 만들어줘. 유저 요청: ${intent.promptSource.freeText}`;
    variants = await generateText(fallback, null, apiFetch);
  }
  pools.appendToPool(variants);

  // 이미지 3안 완료 대기 (onEach가 이미 풀에 한 장씩 푸시함)
  await imagePromise;

  log({
    message: intent.promptSource.freeText,
    intent: "new",
    attached_images_count: 1,
  });

  const enhanceFailDetail = generatedCount === 0 && imgErrors.length > 0 ? ` (${imgErrors[0]})` : "";
  showStatus(
    generatedCount > 0
      ? `이미지 ${generatedCount}장 보정 완료! 각 영역을 넘기면서 조합해보세요.`
      : `문구는 완성! 이미지 보정에 실패했어요.${enhanceFailDetail}`,
  );
  chat.addMessage({
    role: "assistant",
    content:
      generatedCount > 0
        ? "완성! 이상한 거 있으면 추가 요청해주세요."
        : "문구를 만들었어요! 이미지를 첨부하거나 요청해보세요.",
    showReport: generatedCount > 0,
  });
  return { ok: generatedCount > 0 };
}

// ── attached_edit: 텍스트 제거 + OCR 기반 문구 + 수정된 이미지 ──
async function runAttachedEdit(
  intent: GenerateIntent,
  deps: DispatchDeps,
  promptText: string,
): Promise<DispatchResult> {
  const { pools, chat, contentSpec, showStatus, apiFetch } = deps;
  const editImg =
    intent.attachedImages?.find((i) => i.option === "edit") ||
    intent.attachedImages?.find((i) => i.option === "apply") ||
    intent.attachedImages?.find((i) => i.option === "reference");
  if (!editImg) {
    chat.addMessage({ role: "assistant", content: "첨부된 이미지를 찾을 수 없어요" });
    return { ok: false };
  }

  try {
    showStatus("이미지 분석 & 수정 중...");
    const imgErrors: string[] = [];
    const resized = await fileToResizedBase64(editImg.file, 1024);
    const refData = [resized];

    // editVariants는 OCR 결과에 따라 달라지므로 ref로 capture
    let editVariants: CTContent[] = [];
    let editCount = 0;
    const ocrPromise = tryOcr(resized, apiFetch);
    const editPromise = generateParallelImages(
      promptText,
      { imageType: "" } as CTContent,
      null,
      {
        count: 3,
        edit: true,
        referenceImages: refData,
        onEach: (i, total, imgUrl) => {
          if (imgUrl) {
            const variant = editVariants[0];
            pools.addImageToPool(imgUrl, variant?.textColor, variant?.bgTreatment, {
              generationPrompt: promptText,
              generationStyle: "realistic",
              generationVariation: i,
            });
            editCount++;
          }
          if (i + 1 < total) {
            showStatus(`이미지 ${i + 1}/${total} 완성! ${i + 2}/${total} 수정 중...`);
          }
        },
      },
      apiFetch,
      imgErrors,
    );

    const ocrResult = await ocrPromise;
    if (ocrResult?.label || ocrResult?.titleLine1) {
      const ocrVariant = ocrToVariant(ocrResult);
      const ocrContext = `${ocrResult.label || ""} ${ocrResult.titleLine1 || ""} ${ocrResult.titleLine2 || ""}`.trim();
      const more = await generateText(ocrContext, null, apiFetch).catch(() => []);
      editVariants = [ocrVariant, ...more];
    } else {
      const textPrompt = [contentSpec.brand, contentSpec.content].filter(Boolean).join(" ") || promptText;
      editVariants = await generateText(textPrompt, null, apiFetch);
    }
    pools.appendToPool(editVariants);

    await editPromise;

    const failDetail = editCount === 0 && imgErrors.length > 0 ? ` (${imgErrors[0]})` : "";
    chat.addMessage({
      role: "assistant",
      content:
        editCount > 0
          ? `이미지 ${editCount}안을 만들었어요! 스와이프해서 비교해보세요.`
          : `문구는 완성! 이미지 수정에 실패했어요.${failDetail}`,
      showReport: editCount > 0,
    });
    return { ok: editCount > 0 };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "알 수 없는 오류";
    chat.addMessage({ role: "assistant", content: `이미지 수정에 실패했어요. (${msg})` });
    return { ok: false };
  }
}

// ── attached_reference: 첨부 이미지를 스타일 참고로 새 카드 3안 ──
async function runAttachedReference(
  intent: GenerateIntent,
  deps: DispatchDeps,
  promptText: string,
): Promise<DispatchResult> {
  const { pools, chat, setBrandCtx, showStatus, apiFetch, log } = deps;
  const refImg =
    intent.attachedImages?.find((i) => i.option === "reference") ||
    intent.attachedImages?.find((i) => i.option === "edit");
  if (!refImg) {
    chat.addMessage({ role: "assistant", content: "참고할 이미지를 찾을 수 없어요." });
    return { ok: false };
  }

  showStatus("브랜드 검색 & 문구 생성 중...");
  const brand = intent.promptSource.brand;
  let activeBrandCtx: BrandContext | null = null;
  if (brand) {
    const known = getKnownBrandContext(brand);
    if (known) {
      activeBrandCtx = {
        ...known,
        mascotName: null,
        mascotDescription: null,
        mascotImage: null,
      } as BrandContext;
    } else {
      activeBrandCtx = await searchBrand(brand, apiFetch);
    }
    if (activeBrandCtx) setBrandCtx(activeBrandCtx);
  }

  const variants = await generateText(promptText, activeBrandCtx, apiFetch);
  pools.appendToPool(variants);

  showStatus("이미지 1/3 생성 중...");
  const b64 = await fileToBase64(refImg.file);
  const refData = [{ data: b64, mimeType: refImg.file.type }];

  const imgErrors: string[] = [];
  let generatedCount = 0;
  await generateParallelImages(
    promptText,
    variants[0],
    activeBrandCtx,
    {
      count: 3,
      referenceImages: refData,
      onEach: (i, total, imgUrl) => {
        if (imgUrl) {
          const variant = variants[i] || variants[0];
          pools.addImageToPool(imgUrl, variant.textColor, variant.bgTreatment, {
            generationPrompt: promptText,
            generationStyle: STYLE_MAP[i] || "realistic",
            generationVariation: i,
          });
          generatedCount++;
        }
        if (i + 1 < total) {
          showStatus(`이미지 ${i + 1}/${total} 완성! ${i + 2}/${total} 생성 중...`);
        }
      },
    },
    apiFetch,
    imgErrors,
  );

  log({
    message: intent.promptSource.freeText,
    intent: "new",
    attached_images_count: intent.attachedImages?.length || 0,
  });

  reportCompletion(deps, generatedCount, imgErrors);
  return { ok: generatedCount > 0 };
}

// ── 공통: OCR ──
interface OcrFields {
  label?: string;
  titleLine1?: string;
  titleLine2?: string;
  subLine1?: string;
  subLine2?: string;
}

async function tryOcr(
  image: { data: string; mimeType: string },
  apiFetch: DispatchDeps["apiFetch"],
): Promise<OcrFields | null> {
  try {
    const res = await apiFetch("/api/extract-text-from-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.extracted || null;
  } catch {
    return null;
  }
}

function ocrToVariant(ocr: OcrFields): CTContent {
  return {
    id: crypto.randomUUID(),
    label: ocr.label || "",
    titleLine1: ocr.titleLine1 || "",
    titleLine2: ocr.titleLine2 || "",
    subLine1: ocr.subLine1 || "",
    subLine2: ocr.subLine2 || "",
    textColor: "WT",
    imageType: "",
    bgTreatment: { type: "none" },
    imageConstraint: { fit: "cover", alignX: "center", alignY: "center" },
  };
}

function reportCompletion(
  deps: DispatchDeps,
  generatedCount: number,
  imgErrors: string[],
) {
  const { chat, showStatus } = deps;
  const failDetail = generatedCount === 0 && imgErrors.length > 0 ? ` (${imgErrors[0]})` : "";
  showStatus(
    generatedCount > 0
      ? `완성! 각 영역을 넘기면서 조합해보세요.`
      : `문구는 완성! 이미지 생성에 실패했어요.${failDetail}`,
  );
  chat.addMessage({
    role: "assistant",
    content:
      generatedCount > 0
        ? "완성! 이상한 거 있으면 추가 요청해주세요."
        : `문구를 만들었어요! 이미지를 첨부하거나 요청해보세요.`,
    showReport: generatedCount > 0,
  });
}
