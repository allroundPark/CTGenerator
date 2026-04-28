// edit_copy intent — 상단 텍스트(label / titleLine1 / titleLine2) 변경.
// 옛 handleModification의 "copy" 분기.

import { Intent } from "@/types/intent";
import { suggestField } from "@/lib/orchestrate";
import { DispatchDeps, DispatchResult } from "./types";

type EditCopyIntent = Extract<Intent, { type: "edit_copy" }>;

export async function dispatchEditCopy(
  intent: EditCopyIntent,
  deps: DispatchDeps,
): Promise<DispatchResult> {
  const { pools, chat, showStatus, apiFetch, log } = deps;
  const composite = pools.composite;

  log({
    message: intent.instruction,
    intent: "copy",
    attached_images_count: 0,
  });

  showStatus("상단 문구 생성 중...");
  const suggestions = await suggestField("title", composite, intent.instruction, apiFetch);
  if (suggestions.length > 0) {
    pools.addCopyOptions(
      suggestions.map((s) => ({
        label: composite.label,
        titleLine1: s[0],
        titleLine2: s[1],
      })),
    );
  }
  showStatus("상단 문구 추가 완료!");
  chat.addMessage({
    role: "assistant",
    content: "상단 문구를 추가했어요! 스와이프해서 확인해보세요.",
  });
  return { ok: suggestions.length > 0 };
}
