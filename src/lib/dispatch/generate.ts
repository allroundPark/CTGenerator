// generate intent — 첫 카드 생성. inputMode에 따라 4가지 실행 경로:
//   text                  → 표준 (브랜드 검색 + 문구 + 이미지 3안)
//   attached_apply        → 첨부 이미지 보정 (OCR 시도) + 문구
//   attached_edit         → 첨부 이미지 텍스트 제거 + OCR 기반 문구 + 이미지 수정 3안
//   attached_reference    → 첨부 이미지를 스타일 참고로 새 카드 3안

import { Intent } from "@/types/intent";
import { BrandContext, CTContent } from "@/types/ct";
import { searchBrand, generateText, generateParallelImages } from "@/lib/orchestrate";
import { getKnownBrandContext } from "@/lib/imagePrompt";
import { fileToBase64, compressForApi } from "@/lib/imageHelpers";
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
    case "attached_verbatim":
      return runAttachedVerbatim(intent, deps);
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
  // 큰 파일은 자동 압축 (iPhone 사진 등). Gemini 한도(~20MB) 안에서 안전.
  const applyImageData = await compressForApi(applyImg.file);
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

  // OCR로 문구 추출 시도 — 결과를 채팅에 surface (모바일 콘솔 못 보는 케이스 대응)
  const ocrResult = await tryOcr(applyImageData, apiFetch);
  let variants: CTContent[];
  if (ocrResult?.label || ocrResult?.titleLine1) {
    const ocrVariant = ocrToVariant(ocrResult);
    const ocrContext = `${ocrResult.label || ""} ${ocrResult.titleLine1 || ""} ${ocrResult.titleLine2 || ""}`.trim();
    chat.addMessage({
      role: "assistant",
      content: `이미지에서 이렇게 읽었어요: "${ocrContext}". 첫 번째 문구로 그대로 두고, 비슷한 톤으로 변형도 같이 만들어 드릴게요.`,
    });
    const more = await generateText(ocrContext, null, apiFetch).catch(() => []);
    variants = [ocrVariant, ...more];
  } else {
    chat.addMessage({
      role: "assistant",
      content: "이미지에서 글자를 정확히 못 읽었어요. AI가 이미지를 보고 새 문구를 만들었는데, 마음에 안 드시면 \"유지하면서 [원하는 문구]로 만들어줘\" 식으로 다시 알려주세요.",
    });
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

  const enhanceFailDetail = imgErrors.length > 0 ? ` (${imgErrors[0]})` : "";
  let enhanceStatus: string;
  let enhanceChat: string;
  if (generatedCount === 0) {
    enhanceStatus = `문구는 완성! 이미지 보정에 실패했어요.${enhanceFailDetail}`;
    enhanceChat = "문구를 만들었어요! 이미지를 첨부하거나 요청해보세요.";
  } else if (generatedCount < 3) {
    const failed = 3 - generatedCount;
    enhanceStatus = `이미지 ${generatedCount}장 보정 완료 (${failed}장 실패)`;
    enhanceChat = `${generatedCount}장 완성! (${failed}장 실패${enhanceFailDetail}) 다시 받고 싶으면 "한번 더"라고 말씀해주세요.`;
  } else {
    enhanceStatus = `이미지 ${generatedCount}장 보정 완료! 각 영역을 넘기면서 조합해보세요.`;
    enhanceChat = "완성! 이상한 거 있으면 추가 요청해주세요.";
  }
  showStatus(enhanceStatus);
  chat.addMessage({
    role: "assistant",
    content: enhanceChat,
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
    const resized = await compressForApi(editImg.file);
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

    const failDetail = imgErrors.length > 0 ? ` (${imgErrors[0]})` : "";
    let editChatMsg: string;
    if (editCount === 0) {
      editChatMsg = `문구는 완성! 이미지 수정에 실패했어요.${failDetail}`;
    } else if (editCount < 3) {
      const failed = 3 - editCount;
      editChatMsg = `이미지 ${editCount}안 완성! (${failed}장 실패${failDetail}) 다시 받고 싶으면 "한번 더"라고 말씀해주세요.`;
    } else {
      editChatMsg = `이미지 ${editCount}안을 만들었어요! 스와이프해서 비교해보세요.`;
    }
    chat.addMessage({
      role: "assistant",
      content: editChatMsg,
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
  const refData = [await compressForApi(refImg.file)];

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

// ── attached_verbatim: 첨부 이미지·텍스트 그대로 보존 ──
// "유지/그대로/똑같이" 같은 발화일 때. 보정·AI 변형 둘 다 안 함.
// 실패 시 유저에게 직접 입력 요청.
async function runAttachedVerbatim(
  intent: GenerateIntent,
  deps: DispatchDeps,
): Promise<DispatchResult> {
  const { pools, chat, showStatus, apiFetch, log } = deps;
  const applyImg =
    intent.attachedImages?.find((i) => i.option === "apply") ||
    intent.attachedImages?.[0];
  if (!applyImg) {
    chat.addMessage({ role: "assistant", content: "첨부된 이미지를 찾을 수 없어요." });
    return { ok: false };
  }

  showStatus("이미지에서 글자 읽는 중...");
  // OCR 호출용은 압축본 (Gemini 한도 회피). 디스플레이용은 원본 그대로 (verbatim 약속).
  const compressedForOcr = await compressForApi(applyImg.file);
  const originalDataUrl = await fileToBase64(applyImg.file);

  const ocrResult = await tryOcr(compressedForOcr, apiFetch);

  log({
    message: intent.promptSource.freeText,
    intent: "verbatim",
    attached_images_count: 1,
    ocr_success: !!(ocrResult?.label || ocrResult?.titleLine1),
  });

  if (!ocrResult?.label && !ocrResult?.titleLine1) {
    // OCR 실패 — 카드 만들지 않고 유저에게 텍스트 입력 요청
    showStatus("");
    chat.addMessage({
      role: "assistant",
      content:
        "이미지에서 글자를 못 읽었어요. 사용하실 문구를 직접 알려주실 수 있을까요?\n예: \"제목: ___, 부제: ___\" 또는 그냥 한 줄로 적어주셔도 됩니다.",
    });
    return { ok: false };
  }

  // OCR 성공 — 원본 텍스트 + 원본 이미지 그대로 카드 1장
  const ocrVariant = ocrToVariant(ocrResult);
  const ocrPreview = `${ocrResult.label || ""} ${ocrResult.titleLine1 || ""} ${ocrResult.titleLine2 || ""}`.trim();
  chat.addMessage({
    role: "assistant",
    content: `이미지에서 이렇게 읽었어요: "${ocrPreview}". 그대로 카드 만들어 드릴게요.`,
  });

  pools.appendToPool([ocrVariant]);

  // 이미지: Gemini 호출 없이 첨부 파일 원본을 data URL로 바로 사용 (변형 없음)
  const imageDataUrl = `data:${applyImg.file.type || "image/jpeg"};base64,${originalDataUrl}`;
  pools.addImageToPool(imageDataUrl, ocrVariant.textColor, ocrVariant.bgTreatment, {
    generationPrompt: intent.promptSource.freeText,
    generationStyle: "realistic",
    generationVariation: 0,
  });

  showStatus("완성! (그대로 보존 모드)");
  chat.addMessage({
    role: "assistant",
    content: "원본 이미지·문구 그대로 카드 만들었어요. 다른 게 필요하시면 알려주세요.",
    showReport: true,
  });
  return { ok: true };
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
  const failDetail = imgErrors.length > 0 ? ` (${imgErrors[0]})` : "";

  let statusMsg: string;
  let chatMsg: string;
  if (generatedCount === 0) {
    statusMsg = `문구는 완성! 이미지 생성에 실패했어요.${failDetail}`;
    chatMsg = "문구를 만들었어요! 이미지를 첨부하거나 요청해보세요.";
  } else if (generatedCount < 3) {
    const failed = 3 - generatedCount;
    statusMsg = `${generatedCount}장 완성 (${failed}장 실패)`;
    chatMsg = `${generatedCount}장 완성! (${failed}장 실패${failDetail}) 다시 받고 싶으면 "한번 더"라고 말씀해주세요.`;
  } else {
    statusMsg = `완성! 각 영역을 넘기면서 조합해보세요.`;
    chatMsg = "완성! 이상한 거 있으면 추가 요청해주세요.";
  }

  showStatus(statusMsg);
  chat.addMessage({
    role: "assistant",
    content: chatMsg,
    showReport: generatedCount > 0,
  });
}
