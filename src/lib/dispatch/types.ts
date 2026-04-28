// dispatcher 의존성. useOrchestrate에서 React state setter들과 훅 메서드들을
// 한 번에 묶어서 넘겨줌. dispatcher 자체는 React를 import하지 않음 — 순수 모듈.

import { BrandContext, ContentSpec, CTContent } from "@/types/ct";
import { useCardPools } from "@/hooks/useCardPools";
import { useChatMessages } from "@/hooks/useChatMessages";

type ApiFetchFn = (url: string, init?: RequestInit) => Promise<Response>;
type Pools = ReturnType<typeof useCardPools>;
type Chat = ReturnType<typeof useChatMessages>;

export interface DispatchDeps {
  pools: Pools;
  chat: Chat;
  contentSpec: ContentSpec;
  setContentSpec: (updater: (prev: ContentSpec) => ContentSpec) => void;
  brandCtx: BrandContext | null;
  setBrandCtx: (ctx: BrandContext | null) => void;
  showStatus: (msg: string) => void;
  apiFetch: ApiFetchFn;
  log: (data: Record<string, unknown>) => void;
  raiseSheet: () => void;
  /** 분류기가 prefetch한 데이터가 있으면 dispatch.generate가 활용 */
  prepared?: { variants?: CTContent[]; brandContext?: BrandContext | null };
}

export interface DispatchResult {
  ok: boolean;
  /** 생성/수정으로 인해 reset이 일어났는지 (ex: 새 주제) */
  reset?: boolean;
}
