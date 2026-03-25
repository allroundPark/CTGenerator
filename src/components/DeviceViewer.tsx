"use client";

import { useState } from "react";
import { CTContent, CTTextField, CT_BASE_WIDTH, CT_BASE_HEIGHT } from "@/types/ct";
import CTCard from "./CTCard";

interface DeviceViewerProps {
  content: CTContent;
  onFieldClick?: (field: CTTextField, rect: DOMRect) => void;
  onImageDrag?: (customX: number, customY: number) => void;
  /** 텍스트색 토글 콜백 */
  onToggleTextColor?: () => void;
  /** 모바일에서 축소 스케일 (기본 0.85) */
  scale?: number;
  /** skeleton 모드: 이미지/텍스트 숨김 (외부 캐러셀에서 렌더) */
  skeleton?: boolean;
  /** 하단 크롭 비율 (0~1, 기본 1=전체 표시). 잘린 부분은 그라데이션 페이드아웃 */
  cropRatio?: number;
}

// 목업 이미지 기준 (1x = 375x812)
// CT 회색 영역 위치 (1x 기준): top-left (19, 302), 335x348
const MOCKUP = {
  width: 375,
  height: 812, // 1125/3 × 2436/3
  ct: { x: 19, y: 188, w: 335, h: 348 },
};

type Theme = "dark" | "light";

export default function DeviceViewer({ content, onFieldClick, onImageDrag, onToggleTextColor, scale, skeleton, cropRatio }: DeviceViewerProps) {
  const [theme, setTheme] = useState<Theme>("light");

  const displayScale = scale ?? 0.85;
  const displayWidth = MOCKUP.width * displayScale;
  const fullHeight = MOCKUP.height * displayScale;
  const crop = cropRatio ?? 1;
  const displayHeight = fullHeight * crop;

  return (
    <div className="relative">
      {/* 목업 이미지 + CT 카드 오버레이 */}
      <div
        className="relative overflow-hidden"
        style={{
          width: displayWidth,
          height: displayHeight,
          borderRadius: crop < 1 ? `${40 * displayScale}px ${40 * displayScale}px 0 0` : `${40 * displayScale}px`,
          boxShadow: "0 8px 40px rgba(0, 0, 0, 0.12), 0 2px 12px rgba(0, 0, 0, 0.08)",
          ...(crop < 1 ? {} : {}),
        }}
      >
        {/* 앱 목업 배경 이미지 */}
        <img
          src={`/assets/${theme}-375.png`}
          alt="App mockup"
          className="absolute inset-0 w-full"
          style={{ objectFit: "cover", height: fullHeight }}
        />

        {/* CT 카드 — 회색 영역 위에 정확히 오버레이 */}
        <div
          className="absolute"
          style={{
            left: MOCKUP.ct.x * displayScale,
            top: MOCKUP.ct.y * displayScale,
            width: MOCKUP.ct.w * displayScale,
            height: MOCKUP.ct.h * displayScale,
          }}
        >
          <CTCard
            content={content}
            renderWidth={MOCKUP.ct.w * displayScale}
            onFieldClick={onFieldClick}
            onImageDrag={onImageDrag}
            skeleton={skeleton}
          />
        </div>
      </div>

      {/* 텍스트색 토글 — 목업 안쪽 우상단 */}
      {onToggleTextColor && (
        <button
          onClick={onToggleTextColor}
          className="absolute w-6 h-6 rounded-full flex items-center justify-center border shadow-sm transition-colors z-10"
          style={{
            top: 8 * displayScale,
            right: 8 * displayScale,
            backgroundColor: content.textColor === "WT" ? "#fff" : "#1a1a1a",
            borderColor: content.textColor === "WT" ? "#e5e7eb" : "#1a1a1a",
            color: content.textColor === "WT" ? "#666" : "#fff",
          }}
          title={`텍스트색: ${content.textColor === "WT" ? "흰색 → 검정" : "검정 → 흰색"}`}
        >
          <span className="text-[9px] font-bold">{content.textColor === "WT" ? "W" : "B"}</span>
        </button>
      )}

    </div>
  );
}
