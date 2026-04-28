// edit_sub intent — 하단 텍스트(subLine1 / subLine2) 변경.
// 옛 handleModification의 "sub" 분기.

import { Intent } from "@/types/intent";
import { suggestField } from "@/lib/orchestrate";
import { DispatchDeps, DispatchResult } from "./types";

type EditSubIntent = Extract<Intent, { type: "edit_sub" }>;

export async function dispatchEditSub(
  intent: EditSubIntent,
  deps: DispatchDeps,
): Promise<DispatchResult> {
  const { pools, chat, showStatus, apiFetch, log } = deps;
  const composite = pools.composite;

  log({
    message: intent.instruction,
    intent: "sub",
    attached_images_count: 0,
  });

  showStatus("하단 문구 생성 중...");
  const suggestions = await suggestField("sub", composite, intent.instruction, apiFetch);
  if (suggestions.length > 0) {
    pools.addSubOptions(
      suggestions.map((s) => ({ subLine1: s[0], subLine2: s[1] })),
    );
  }
  showStatus("하단 문구 추가 완료!");
  chat.addMessage({
    role: "assistant",
    content: "하단 문구를 추가했어요! 스와이프해서 확인해보세요.",
  });
  return { ok: suggestions.length > 0 };
}
