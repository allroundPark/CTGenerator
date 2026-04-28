// 유저 발화 → 시스템이 실행할 단일 결정.
// 모든 라우팅이 이 타입을 거쳐서 진행. action↔intent 이중 어휘는 더 이상 없음.

import { AttachedImage, BrandContext, CTContent } from "./ct";

// 첫 생성에서 이미지가 어떻게 들어오는지 — 실행 경로가 다른 4가지 케이스를 명시
export type GenerateInputMode =
  | "text"               // 텍스트만 → 표준 3안 생성
  | "attached_apply"     // 첨부 이미지 보정 후 사용
  | "attached_edit"      // 첨부 이미지 수정 (텍스트 제거 + OCR + 재생성)
  | "attached_reference"; // 첨부 이미지를 스타일 참고용으로

export type EditImageSource = "current" | "attached";
export type EditImageOperation = "restyle" | "enhance" | "reference_generate";
export type NeedInfoMissing = "brand" | "content" | "goal" | "image_mode";

export type Intent =
  | {
      type: "generate";
      inputMode: GenerateInputMode;
      promptSource: {
        brand?: string;
        content?: string;
        freeText: string;
      };
      brandSearch: "required" | "skip";
      attachedImages?: AttachedImage[];
    }
  | {
      type: "edit_image";
      source: EditImageSource;
      operation: EditImageOperation;
      instruction?: string;
      attachedImage?: AttachedImage;
    }
  | { type: "edit_copy"; instruction: string }
  | { type: "edit_sub"; instruction: string }
  | { type: "need_info"; missing: NeedInfoMissing; question: string };

export type ClassifyError =
  | { kind: "network"; message: string }
  | { kind: "parse"; message: string }
  | { kind: "llm_unclear"; message: string };

// prepared: classifier가 1-콜 API(/api/orchestrate)로 분류 + 데이터를 함께 받아온 경우
// dispatcher는 있으면 재사용, 없으면 자기가 다시 fetch.
export interface PreparedData {
  variants?: CTContent[];
  brandContext?: BrandContext | null;
}

export type ClassifyResult =
  | { ok: true; intent: Intent; prepared?: PreparedData }
  | { ok: false; error: ClassifyError };
