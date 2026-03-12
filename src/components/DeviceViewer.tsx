"use client";

import { useState } from "react";
import { CTContent, CT_BASE_WIDTH, CT_BASE_HEIGHT } from "@/types/ct";
import CTCard from "./CTCard";

interface DeviceViewerProps {
  content: CTContent;
}

// 목업 이미지 기준 (1x = 375x812)
// CT 회색 영역 위치 (1x 기준): top-left (19, 302), 335x348
const MOCKUP = {
  width: 375,
  height: 812, // 1125/3 × 2436/3
  ct: { x: 19, y: 302, w: 335, h: 348 },
};

type Theme = "dark" | "light";

export default function DeviceViewer({ content }: DeviceViewerProps) {
  const [theme, setTheme] = useState<Theme>("dark");

  // 뷰어에 표시할 스케일 (화면에 적당한 크기로)
  const displayScale = 0.85;
  const displayWidth = MOCKUP.width * displayScale;
  const displayHeight = MOCKUP.height * displayScale;

  return (
    <div className="flex flex-col items-center gap-4">
      {/* 다크/라이트 모드 선택 */}
      <div className="flex gap-2">
        {(["dark", "light"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTheme(t)}
            className={`px-3 py-1.5 text-xs rounded-full transition-colors ${
              theme === t
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {t === "dark" ? "다크 모드" : "라이트 모드"}
          </button>
        ))}
      </div>

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
          />
        </div>
      </div>
    </div>
  );
}
