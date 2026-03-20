"use client";

import { useState, useEffect } from "react";
import { CTContent, CTTextField, CT_BASE_WIDTH, CT_BASE_HEIGHT } from "@/types/ct";
import CTCard from "./CTCard";
import ReportModal from "./ReportModal";

interface DeviceViewerProps {
  content: CTContent;
  onFieldClick?: (field: CTTextField, rect: DOMRect) => void;
  onImageDrag?: (customX: number, customY: number) => void;
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
  ct: { x: 19, y: 302, w: 335, h: 348 },
};

type Theme = "dark" | "light";

export default function DeviceViewer({ content, onFieldClick, onImageDrag, scale, skeleton, cropRatio }: DeviceViewerProps) {
  const [theme, setTheme] = useState<Theme>("light");
  const [showReport, setShowReport] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  useEffect(() => {
    const key = "ct_tooltip_seen";
    if (typeof window !== "undefined" && !localStorage.getItem(key)) {
      setShowTooltip(true);
      const timer = setTimeout(() => {
        setShowTooltip(false);
        localStorage.setItem(key, "1");
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, []);

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
          ...(crop < 1 ? {
            WebkitMaskImage: "linear-gradient(to bottom, black 96%, transparent 100%)",
            maskImage: "linear-gradient(to bottom, black 96%, transparent 100%)",
          } : {}),
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

      {/* 리포트 버튼 — 다크모드 토글 아래 */}
      <button
        onClick={() => setShowReport(true)}
        className="absolute -right-10 top-14 w-7 h-7 rounded-full flex items-center justify-center bg-white border border-gray-200 shadow-sm text-gray-500 hover:text-orange-500 transition-colors"
        title="리포트"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>
        </svg>
      </button>

      {/* 첫 진입 툴팁 */}
      {showTooltip && (
        <div
          className="absolute -right-10 top-0 w-max animate-fade-in"
          onClick={() => { setShowTooltip(false); localStorage.setItem("ct_tooltip_seen", "1"); }}
        >
          <div className="relative">
            {/* 다크모드 툴팁 */}
            <div className="absolute right-9 top-4 bg-gray-800 text-white text-[10px] px-2.5 py-1.5 rounded-lg whitespace-nowrap shadow-lg" style={{ transform: "translateX(-4px)" }}>
              다크/라이트 전환
              <div className="absolute right-[-4px] top-1/2 -translate-y-1/2 w-0 h-0 border-t-4 border-b-4 border-l-4 border-transparent border-l-gray-800" />
            </div>
            {/* 리포트 툴팁 */}
            <div className="absolute right-9 top-14 bg-gray-800 text-white text-[10px] px-2.5 py-1.5 rounded-lg whitespace-nowrap shadow-lg" style={{ transform: "translateX(-4px)" }}>
              피드백 리포트
              <div className="absolute right-[-4px] top-1/2 -translate-y-1/2 w-0 h-0 border-t-4 border-b-4 border-l-4 border-transparent border-l-gray-800" />
            </div>
          </div>
        </div>
      )}

      {/* 리포트 모달 */}
      {showReport && (
        <ReportModal content={content} onClose={() => setShowReport(false)} />
      )}
    </div>
  );
}
