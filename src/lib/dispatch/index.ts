// 단일 디스패처 진입점. classifyIntent의 결과(Intent) → 정확히 한 dispatcher.
// 옛 코드의 handleSend / handleModification / handleFirstGeneration의 중첩 분기를 대체.

import { Intent } from "@/types/intent";
import { DispatchDeps, DispatchResult } from "./types";
import { dispatchGenerate } from "./generate";
import { dispatchEditImage } from "./editImage";
import { dispatchEditCopy } from "./editCopy";
import { dispatchEditSub } from "./editSub";
import { dispatchNeedInfo } from "./needInfo";

export async function dispatchIntent(
  intent: Intent,
  deps: DispatchDeps,
): Promise<DispatchResult> {
  switch (intent.type) {
    case "generate":
      // 새 주제 생성 — 풀 비어있지 않으면 reset (옛 handleModification "new" 경로)
      if (deps.pools.hasContent) {
        deps.pools.resetPools();
        deps.setBrandCtx(null);
      }
      return dispatchGenerate(intent, deps);
    case "edit_image":
      return dispatchEditImage(intent, deps);
    case "edit_copy":
      return dispatchEditCopy(intent, deps);
    case "edit_sub":
      return dispatchEditSub(intent, deps);
    case "need_info":
      return dispatchNeedInfo(intent, deps);
  }
}

export type { DispatchDeps, DispatchResult } from "./types";
