// need_info intent — 정보 부족 → 유저에게 질문.
// 옛 handleMessage의 need_info 분기.

import { Intent } from "@/types/intent";
import { DispatchDeps, DispatchResult } from "./types";

type NeedInfoIntent = Extract<Intent, { type: "need_info" }>;

export async function dispatchNeedInfo(
  intent: NeedInfoIntent,
  deps: DispatchDeps,
): Promise<DispatchResult> {
  const { chat, raiseSheet } = deps;

  chat.addMessage({
    role: "assistant",
    content: intent.question,
  });
  raiseSheet();
  return { ok: true };
}
