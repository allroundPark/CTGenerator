// 데모 모드 — ?demo=1 일 때 사전 캐시된 시나리오를 단계별로 재생
// 운영 흐름과 동일한 UI/메시지 인프라 사용. 차이는 LLM/이미지 호출을 우회한다는 것뿐.

import { CTContent, ContentSpec } from "@/types/ct";

export interface DemoMatchContext {
  hasPool: boolean;
  /** 이번 메시지에 이미지 첨부 있음 (수정 흐름 진입 신호) */
  hasAttached: boolean;
  brand?: string;
}

interface StatusStep {
  type: "status";
  message: string;
  delayMs: number;
}

interface OptionsStep {
  type: "options";
  prompt: string;
  delayMs: number;
  options: { label: string; value: string }[];
}

interface CopyStep {
  type: "copy";
  copyUrl: string;
  delayMs: number;
}

interface ImagesStep {
  type: "images";
  imageUrls: string[];
  /** 카피 variants 텍스트색/배경처리 매핑용 (없으면 첫 카피의 것 사용) */
  copyUrl?: string;
  finalMessage: string;
  delayMs: number;
}

export type DemoStep = StatusStep | OptionsStep | CopyStep | ImagesStep;

export interface DemoScenario {
  id: string;
  match: (text: string, ctx: DemoMatchContext) => boolean;
  /** 시나리오 시작 시 contentSpec에 머지 (다음 단계 매칭에 사용) */
  setSpec?: Partial<ContentSpec>;
  steps: DemoStep[];
}

const norm = (s: string) => s.trim().replace(/\s+/g, " ");

const SCENARIOS: DemoScenario[] = [
  // ─── 시나리오 A (생성: 마켓컬리) ─────────────────────────────
  // A1: "마켓컬리" → 정보 찾기 → 소재 추천 → 옵션 노출
  {
    id: "A1-marketkurly-options",
    match: (text, ctx) => !ctx.hasPool && /^마켓컬리$/.test(norm(text)),
    setSpec: { brand: "마켓컬리" },
    steps: [
      { type: "status", message: "마켓컬리 정보를 찾는 중...", delayMs: 1000 },
      { type: "status", message: "어울리는 소재를 추천 중...", delayMs: 5000 },
      {
        type: "options",
        prompt: "마켓컬리로 어떤 콘텐츠를 만들까요?",
        delayMs: 0,
        options: [
          { label: "🪄 AI에게 모두 맡기기", value: "알아서 만들어줘" },
          { label: "컬리페이 할인", value: "마켓컬리 컬리페이 할인" },
          { label: "첫 주문 무료배송", value: "마켓컬리 첫 주문 무료배송" },
          { label: "더퍼플 10% 적립", value: "마켓컬리 더퍼플 10% 적립" },
        ],
      },
    ],
  },
  // A2: "마켓컬리 첫 주문 무료배송" 또는 "AI 위임" → 카피 + 이미지 3장
  {
    id: "A2-marketkurly-delivery-result",
    match: (text, ctx) => {
      if (ctx.hasPool) return false;
      const t = norm(text);
      if (/마켓컬리\s*첫 주문 무료배송/.test(t)) return true;
      if (t === "알아서 만들어줘" && ctx.brand === "마켓컬리") return true;
      return false;
    },
    setSpec: { brand: "마켓컬리", content: "첫 주문 무료배송" },
    steps: [
      { type: "status", message: "문구 다듬는 중...", delayMs: 6000 },
      {
        type: "copy",
        copyUrl: "/demo-cache/marketkurly-delivery/copy.json",
        delayMs: 0,
      },
      { type: "status", message: "이미지 3장 동시 생성 중...", delayMs: 6000 },
      {
        type: "images",
        copyUrl: "/demo-cache/marketkurly-delivery/copy.json",
        imageUrls: [
          "/demo-cache/marketkurly-delivery/image-0.png",
          "/demo-cache/marketkurly-delivery/image-1.png",
          "/demo-cache/marketkurly-delivery/image-2.png",
        ],
        finalMessage: "완성! 이상한 거 있으면 추가 요청해주세요.",
        delayMs: 0,
      },
    ],
  },

  // ─── 시나리오 B (수정: AI 통합 구독 카드) ──────────────────────
  // 옵션 분기 없이 바로 결과 재생.
  // 첨부 또는 풀에 카드 있는 상태에서 이미지 수정 의도 키워드면 매칭.
  {
    id: "B-edit-result",
    match: (text, ctx) => {
      if (!ctx.hasPool && !ctx.hasAttached) return false;
      return /따뜻|톤|색감|보라|보랏|핑크|이미지|바꿔|수정|변형|변경|문구|카피|버전|새로/.test(text);
    },
    steps: [
      { type: "status", message: "문구 새 버전 생성 중...", delayMs: 6000 },
      {
        type: "copy",
        copyUrl: "/demo-cache/ai-subscription-edit/copy.json",
        delayMs: 0,
      },
      { type: "status", message: "이미지 톤 변경 중...", delayMs: 6000 },
      {
        type: "images",
        copyUrl: "/demo-cache/ai-subscription-edit/copy.json",
        imageUrls: [
          "/demo-cache/ai-subscription-edit/image-0.png",
          "/demo-cache/ai-subscription-edit/image-1.png",
          "/demo-cache/ai-subscription-edit/image-2.png",
        ],
        finalMessage: "변형 추가했어요! 풀에서 비교해보세요.",
        delayMs: 0,
      },
    ],
  },
];

export function findDemoScenario(text: string, ctx: DemoMatchContext): DemoScenario | null {
  for (const s of SCENARIOS) {
    if (s.match(text, ctx)) return s;
  }
  return null;
}

export async function fetchDemoCopy(url: string): Promise<CTContent[]> {
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? (data as CTContent[]) : [];
  } catch {
    return [];
  }
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
