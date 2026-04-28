// edit_image intent — 카드가 이미 있는 상태에서 이미지 변경.
// source × operation 조합 (전부 3장 + 점진 렌더링 통일):
//   current  + restyle               → 현재 이미지 기반 3안 변형
//   attached + restyle (= edit)      → 첨부 이미지 직접 편집/보정 3안
//   attached + reference_generate    → 첨부 이미지를 스타일 참고로 새 이미지 3안
//   attached + enhance (= apply)     → 첨부 이미지 보정 3안

import { Intent } from "@/types/intent";
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

  // ── attached source ──
  if (intent.source === "attached") {
    const attached = intent.attachedImage;
    if (!attached) {
      chat.addMessage({ role: "assistant", content: "첨부된 이미지를 찾을 수 없어요." });
      return { ok: false };
    }

    const refData = [await compressForApi(attached.file)];

    // operation별 프롬프트 + API 플래그
    let promptText: string;
    let apiFlags: { edit?: boolean; enhance?: boolean };
    let actionLabel: string;
    if (intent.operation === "reference_generate") {
      promptText = `${text}. 첨부된 이미지의 스타일과 분위기를 참고해서 새로운 이미지를 생성해줘.`;
      apiFlags = {}; // 기본 모드 + referenceImages → 스타일만 참고
      actionLabel = "참고 이미지 기반 생성";
    } else if (intent.operation === "restyle") {
      promptText = text || "이미지를 카드 배경에 적합하도록 편집해줘";
      apiFlags = { edit: true };
      actionLabel = "이미지 수정";
    } else {
      // enhance
      promptText = text || "이 이미지로 카드 만들어줘";
      apiFlags = { enhance: true };
      actionLabel = "이미지 보정";
    }

    showStatus(`${actionLabel} 1/3 중...`);
    let added = 0;
    await generateParallelImages(
      promptText,
      composite,
      brandCtx,
      {
        count: 3,
        referenceImages: refData,
        ...apiFlags,
        onEach: (i, total, imgUrl) => {
          if (imgUrl) {
            pools.addImageToPool(imgUrl, composite.textColor, composite.bgTreatment, {
              generationPrompt: text || composite.imageType,
              generationStyle: "realistic",
              generationVariation: i,
            });
            added++;
          }
          if (i + 1 < total) {
            showStatus(`이미지 ${i + 1}/${total} 완성! ${i + 2}/${total} ${actionLabel} 중...`);
          }
        },
      },
      apiFetch,
      imgErrors,
    );

    return finishMulti(deps, added, imgErrors);
  }

  // ── source === "current" — 현재 이미지 기반 3안 변형 ──
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

  return finishMulti(deps, added, imgErrors);
}

function finishMulti(
  deps: DispatchDeps,
  added: number,
  imgErrors: string[],
): DispatchResult {
  const { chat, showStatus } = deps;
  showStatus(added > 0 ? "이미지 수정 완료!" : "");

  let content: string;
  if (added === 0) {
    const detail = imgErrors.length > 0 ? ` (${imgErrors[0]})` : "";
    content = `이미지 수정에 실패했어요.${detail}`;
  } else if (added < 3) {
    // 일부만 성공 — 어떤 variation이 왜 실패했는지 보여주기
    const failed = 3 - added;
    const detail = imgErrors.length > 0 ? ` (${imgErrors[0]})` : "";
    content = `${added}장 완성! (${failed}장 실패${detail}) 스와이프해서 비교해보세요. 다시 시도하려면 "한번 더"라고 말씀해주세요.`;
  } else {
    content = "이미지 수정안을 만들었어요! 스와이프해서 비교해보세요.";
  }

  chat.addMessage({ role: "assistant", content });
  return { ok: added > 0 };
}
