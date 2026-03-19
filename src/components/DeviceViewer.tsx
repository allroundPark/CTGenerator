"use client";

import { useState } from "react";
import { CTContent, CTTextField, CT_BASE_WIDTH, CT_BASE_HEIGHT } from "@/types/ct";
import CTCard from "./CTCard";

interface DeviceViewerProps {
  content: CTContent;
  onFieldClick?: (field: CTTextField, rect: DOMRect) => void;
  onImageDrag?: (customX: number, customY: number) => void;
  /** 모바일에서 축소 스케일 (기본 0.85) */
  scale?: number;
}

// 목업 이미지 기준 (1x = 375x812)
// CT 회색 영역 위치 (1x 기준): top-left (19, 302), 335x348
const MOCKUP = {
  width: 375,
  height: 812, // 1125/3 × 2436/3
  ct: { x: 19, y: 302, w: 335, h: 348 },
};

type Theme = "dark" | "light";

export default function DeviceViewer({ content, onFieldClick, onImageDrag, scale }: DeviceViewerProps) {
  const [theme, setTheme] = useState<Theme>("light");

  const displayScale = scale ?? 0.85;
  const displayWidth = MOCKUP.width * displayScale;
  const displayHeight = MOCKUP.height * displayScale;

  return (
    <div className="relative">
      {/* 목업 이미지 + CT 카드 오버레이 */}
      <div
        className="relative rounded-[40px] overflow-hidden"
        style={{
          width: displayWidth,
          height: displayHeight,
          boxShadow: "0 25px 60px -12px rgba(0, 0, 0, 0.4), 0 10px 20px -8px rgba(0, 0, 0, 0.3)",
        }}
      >
        {/* 앱 목업 배경 이미지 */}
        <img
          src={`/assets/${theme}-375.png`}
          alt="App mockup"
          className="absolute inset-0 w-full h-full"
          style={{ objectFit: "cover" }}
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
          />
        </div>
      </div>

      {/* 다크/라이트 토글 — 목업 우측 바깥 */}
      <button
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        className="absolute -right-10 top-4 w-7 h-7 rounded-full flex items-center justify-center bg-white border border-gray-200 shadow-sm text-gray-500 hover:text-gray-900 transition-colors"
        title={theme === "dark" ? "라이트 모드" : "다크 모드"}
      >
        {theme === "dark" ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
          </svg>
        )}
      </button>
    </div>
  );
}
