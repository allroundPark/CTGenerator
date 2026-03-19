// CT 041 콘텐츠스레드 타입 정의

export interface CTContent {
  id: string;
  label: string; // 1번 텍스트: 14/20 SF Display Pro Bold (34byte)
  titleLine1: string; // 2번 텍스트: 24/32 SF Display Pro Bold (34byte)
  titleLine2: string; // 3번 텍스트: 24/32 SF Display Pro Bold (34byte)
  subLine1: string; // 좌하단 상단: 14/20 SF Display Pro Bold (34byte)
  subLine2: string; // 좌하단 하단: 14/20 SF Display Pro Bold (34byte)
  imageUrl?: string; // 배경 이미지 URL
  imageConstraint: ImageConstraint;
  textColor: "BK" | "WT"; // 텍스트 색상
  bgTreatment: BgTreatment;
  logoUrl?: string; // 우하단 로고
  imageType?: string; // 이미지 유형 (INTERIOFOCUSED, PRODUCTFOCUSED, etc.)
}

export interface ImageConstraint {
  // 이미지 핏 방식
  fit: "cover" | "contain";
  // 이미지 정렬 (가로, 세로)
  alignX: "left" | "center" | "right";
  alignY: "top" | "center" | "bottom";
  // 드래그로 미세 조정된 커스텀 위치 (0~100%)
  customX?: number;
  customY?: number;
}

export type BgTreatment =
  | { type: "none" }
  | { type: "solid"; color: string; height: number } // 솔리드 배경 (height px)
  | {
      type: "gradient";
      direction: "dark" | "light";
      stops: { position: number; opacity: number }[];
    };

// CT 041 기본 사이즈 (제작 기준)
export const CT_BASE_WIDTH = 335;
export const CT_BASE_HEIGHT = 348;

// 디바이스 프리셋
export const DEVICE_PRESETS = [
  { name: "iPhone", width: 375, statusBarHeight: 44 },
] as const;

export type DevicePreset = (typeof DEVICE_PRESETS)[number];

// 텍스트 필드명 (title = titleLine1+2 묶음, sub = subLine1+2 묶음)
export type CTTextField = "label" | "title" | "titleLine1" | "titleLine2" | "sub" | "subLine1" | "subLine2";

// 이미지 첨부 + 처리 옵션
export type ImageAttachOption = "apply" | "edit" | "reference";
// apply: 바로 적용 (원본 그대로)
// edit: 수정 후 적용 (크롭, 보정, Gemini 편집)
// reference: 참고용 (스타일만 참고하여 새로 생성)

export interface AttachedImage {
  file: File;
  previewUrl: string;
  option: ImageAttachOption;
}

// 생성 진행 상태
export type GenerationStatus =
  | "문구 생성 중..."
  | "이미지 고민 중..."
  | "이미지 생성 중..."
  | "이미지 편집 중..."
  | "참고 이미지 기반 생성 중..."
  | "마무리 중..."
  | null;

// 채팅 메시지
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  variants?: CTContent[];
  imageUrls?: string[]; // 첨부된 이미지 프리뷰 (채팅 표시용)
  timestamp: number;
}
