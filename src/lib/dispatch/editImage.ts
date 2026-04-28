// edit_image intent — 카드가 이미 있는 상태에서 이미지 변경.
// source × operation 조합:
//   current  + restyle               → 현재 이미지 기반 3안 변형 (옛 handleModification image 경로)
//   attached + restyle (= edit)      → 첨부 이미지 수정 적용 (크롭/보정/Gemini 편집)
//   attached + reference_generate    → 첨부 이미지를 스타일 참고로 새 이미지 생성
//   attached + enhance (= apply)     → 첨부 이미지 보정 1장

import { Intent } from "@/types/intent";
import { CTContent } from "@/types/ct";
import { generateParallelImages } from "@/lib/orchestrate";
import { compressForApi, imageUrlToBase64 } from "@/lib/imageHelpers";
import { DispatchDeps, DispatchResult } from "./types";

type EditImageIntent = Extract<Intent, { type: "edit_image" }>;

export async function dispatchEditImage(
  intent: EditImageIntent,
  deps: DispatchDeps,
): Promise<DispatchResult> {
  const { pools, chat, brandCtx, showStatus, apiFetch, log } = deps;
  const composite = pools.composite;
  const text = intent.instruction || "";
  const imgErrors: string[] = [];

  log({
    message: text,
    intent: "image",
    attached_images_count: intent.attachedImage ? 1 : 0,
  });

  // attached source
  if (intent.source === "attached") {
    const attached = intent.attachedImage;
    if (!attached) {
      chat.addMessage({ role: "assistant", content: "첨부된 이미지를 찾을 수 없어요." });
      return { ok: false };
    }

    if (intent.operation === "reference_generate") {
      showStatus("참고 이미지 기반 생성 중...");
      const url = await singleImage(text, attached, composite, "reference", apiFetch, imgErrors);
      return finishSingle(deps, url, imgErrors);
    }

    if (intent.operation === "restyle") {
      // 첨부 이미지 직접 편집 모드
      showStatus("이미지 수정 중...");
      const url = await singleImage(text, attached, composite, "edit", apiFetch, imgErrors);
      return finishSingle(deps, url, imgErrors);
    }

    if (intent.operation === "enhance") {
      showStatus("첨부 이미지 보정 중...");
      const refData = [await compressForApi(attached.file)];
      const results = await generateParallelImages(
        text || "이 이미지로 카드 만들어줘",
        composite,
        brandCtx,
        { count: 1, enhance: true, referenceImages: refData },
        apiFetch,
        imgErrors,
      );
      return finishSingle(deps, results[0] || "", imgErrors);
    }
  }

  // source === "current" — 현재 이미지 기반 3안 변형
  showStatus("이미지 1/3 수정 중...");
  const currentImg = pools.imagePool[pools.selImage];
  let refImgs: { data: string; mimeType: string }[] | undefined;
  if (currentImg?.imageUrl) {
    const imgData = await imageUrlToBase64(currentImg.imageUrl);
    if (imgData) refImgs = [imgData];
  }
  let added = 0;
  await generateParallelImages(
    text,
    composite,
    brandCtx,
    {
      count: 3,
      referenceImages: refImgs,
      edit: true,
      originalPrompt: currentImg?.generationPrompt,
      onEach: (i, total, imgUrl) => {
        if (imgUrl) {
          pools.addImageToPool(imgUrl, composite.textColor, composite.bgTreatment, {
            generationPrompt: currentImg?.generationPrompt,
            generationStyle: currentImg?.generationStyle,
            generationVariation: i,
          });
          added++;
        }
        if (i + 1 < total) {
          showStatus(`이미지 ${i + 1}/${total} 완성! ${i + 2}/${total} 수정 중...`);
        }
      },
    },
    apiFetch,
    imgErrors,
  );

  const failDetail = added === 0 && imgErrors.length > 0 ? ` (${imgErrors[0]})` : "";
  showStatus(added > 0 ? "이미지 수정 완료!" : "");
  chat.addMessage({
    role: "assistant",
    content:
      added > 0
        ? "이미지 수정안을 만들었어요! 스와이프해서 비교해보세요."
        : `이미지 수정에 실패했어요.${failDetail}`,
  });
  return { ok: added > 0 };
}

async function singleImage(
  text: string,
  attachedImg: { file: File; previewUrl: string; option: string },
  variant: CTContent,
  mode: "reference" | "edit",
  apiFetch: DispatchDeps["apiFetch"],
  errors: string[],
): Promise<string> {
  try {
    const compressed = await compressForApi(attachedImg.file);
    const prompt =
      mode === "reference"
        ? `${text}. 첨부된 이미지의 스타일과 분위기를 참고해서 새로운 이미지를 생성해줘.`
        : `${text}. 첨부된 이미지를 카드 배경에 적합하도록 편집/보정해줘.`;
    const res = await apiFetch("/api/generate-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        referenceImages: [compressed],
        imageType: variant.imageType || "",
        copyContext: {
          nm1_label: variant.label,
          nm2_title: variant.titleLine1,
          nm3_desc: variant.titleLine2,
        },
      }),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({ error: res.statusText }));
      errors.push(`${res.status}: ${errBody.error || res.statusText}`);
      return "";
    }
    const data = await res.json();
    return data.image ? `data:${data.image.mimeType};base64,${data.image.data}` : "";
  } catch (e) {
    errors.push(e instanceof Error ? e.message : "알 수 없는 오류");
    return "";
  }
}

function finishSingle(
  deps: DispatchDeps,
  imageUrl: string,
  imgErrors: string[],
): DispatchResult {
  const { pools, chat, showStatus } = deps;
  if (imageUrl) {
    const composite = pools.composite;
    pools.addImageToPool(imageUrl, composite.textColor, composite.bgTreatment, {
      generationPrompt: composite.imageType,
      generationStyle: "realistic",
      generationVariation: 0,
    });
  }
  showStatus(imageUrl ? "이미지 수정 완료!" : "");
  const failDetail = imgErrors.length > 0 ? ` (${imgErrors[0]})` : "";
  chat.addMessage({
    role: "assistant",
    content: imageUrl
      ? "이미지 수정안을 만들었어요! 스와이프해서 비교해보세요."
      : `이미지 수정에 실패했어요.${failDetail}`,
  });
  return { ok: !!imageUrl };
}
