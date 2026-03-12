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
}

export interface ImageConstraint {
  // 이미지 핏 방식
  fit: "cover" | "contain";
  // 이미지 정렬 (가로, 세로)
  alignX: "left" | "center" | "right";
  alignY: "top" | "center" | "bottom";
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
