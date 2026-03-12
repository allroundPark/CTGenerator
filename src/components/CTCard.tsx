"use client";

import { CTContent, CT_BASE_WIDTH, CT_BASE_HEIGHT } from "@/types/ct";

interface CTCardProps {
  content: CTContent;
  /** 렌더링할 너비 (디바이스 너비에 맞춤) */
  renderWidth: number;
}

export default function CTCard({ content, renderWidth }: CTCardProps) {
  const scale = renderWidth / CT_BASE_WIDTH;
  const renderHeight = CT_BASE_HEIGHT * scale;
  const textColor = content.textColor === "BK" ? "#000000" : "#FFFFFF";

  // 이미지 정렬 CSS
  const objectPosition = `${content.imageConstraint.alignX} ${content.imageConstraint.alignY}`;

  return (
    <div
      className="relative overflow-hidden"
      style={{
        width: renderWidth,
        height: renderHeight,
        borderRadius: 16 * scale,
      }}
    >
      {/* 배경 이미지 */}
      {content.imageUrl && (
        <img
          src={content.imageUrl}
          alt=""
          className="absolute inset-0 w-full h-full"
          style={{
            objectFit: content.imageConstraint.fit,
            objectPosition,
          }}
        />
      )}

      {/* 배경 처리: 솔리드 or 그라데이션 */}
      {content.bgTreatment.type === "solid" && (
        <div
          className="absolute top-0 left-0 w-full"
          style={{
            height: content.bgTreatment.height * scale,
            backgroundColor: content.bgTreatment.color,
          }}
        />
      )}
      {content.bgTreatment.type === "gradient" && (
        <div
          className="absolute top-0 left-0 w-full"
          style={{
            height: renderHeight * (2 / 3),
            background:
              content.bgTreatment.direction === "dark"
                ? `linear-gradient(to bottom, ${content.bgTreatment.stops
                    .map(
                      (s) =>
                        `rgba(0,0,0,${s.opacity}) ${s.position}%`
                    )
                    .join(", ")})`
                : `linear-gradient(to bottom, ${content.bgTreatment.stops
                    .map(
                      (s) =>
                        `rgba(255,255,255,${s.opacity}) ${s.position}%`
                    )
                    .join(", ")})`,
          }}
        />
      )}

      {/* 좌상단 텍스트 영역: padding 24px */}
      <div
        className="absolute"
        style={{
          top: 24 * scale,
          left: 24 * scale,
          right: 24 * scale,
        }}
      >
        {/* 1. label: 14/20 SF Display Pro Bold */}
        <div
          style={{
            fontSize: 14 * scale,
            lineHeight: `${20 * scale}px`,
            fontWeight: 700,
            color: textColor,
          }}
        >
          {content.label}
        </div>

        {/* gap 8px */}
        <div style={{ height: 8 * scale }} />

        {/* 2. titleLine1: 24/32 SF Display Pro Bold */}
        <div
          style={{
            fontSize: 24 * scale,
            lineHeight: `${32 * scale}px`,
            fontWeight: 700,
            color: textColor,
            wordBreak: "keep-all",
          }}
        >
          {content.titleLine1}
        </div>

        {/* 3. titleLine2: 24/32 SF Display Pro Bold (gap 0) */}
        <div
          style={{
            fontSize: 24 * scale,
            lineHeight: `${32 * scale}px`,
            fontWeight: 700,
            color: textColor,
            wordBreak: "keep-all",
          }}
        >
          {content.titleLine2}
        </div>
      </div>

      {/* 좌하단 서브텍스트: padding 24px 하단/좌/우 */}
      <div
        className="absolute"
        style={{
          bottom: 24 * scale,
          left: 24 * scale,
          right: 24 * scale,
        }}
      >
        {/* subLine1: 14/20 */}
        <div
          style={{
            fontSize: 14 * scale,
            lineHeight: `${20 * scale}px`,
            fontWeight: 700,
            color: textColor,
          }}
        >
          {content.subLine1}
        </div>
        {/* subLine2: 14/20 (gap 0) */}
        <div
          style={{
            fontSize: 14 * scale,
            lineHeight: `${20 * scale}px`,
            fontWeight: 700,
            color: textColor,
          }}
        >
          {content.subLine2}
        </div>
      </div>

      {/* 우상단: 하트 아이콘 — padding 14px */}
      <div
        className="absolute"
        style={{
          top: 14 * scale,
          right: 14 * scale,
        }}
      >
        <svg
          width={26 * scale}
          height={26 * scale}
          viewBox="0 0 26 26"
          fill="none"
        >
          <path fillRule="evenodd" clipRule="evenodd" d="M4.95665 7.02891C6.96199 5.02357 10.2133 5.02356 12.2186 7.02891C12.2186 7.02891 12.2186 7.02891 12.2186 7.02891L13 7.81028L13.7814 7.02892C13.7814 7.02892 13.7814 7.02891 13.7814 7.02892C15.7867 5.02357 19.038 5.02357 21.0433 7.02891C23.0487 9.03426 23.0487 12.2855 21.0433 14.2909L13.71 21.6242C13.3179 22.0164 12.6821 22.0164 12.29 21.6242L4.95665 14.2909C2.9513 12.2855 2.9513 9.03426 4.95665 7.02891ZM10.8398 8.40776C9.59597 7.16395 7.57933 7.16394 6.3355 8.40777C5.09168 9.65159 5.09168 11.6682 6.3355 12.912L13 19.5765L19.6645 12.912C20.9083 11.6682 20.9083 9.65159 19.6645 8.40777C18.4207 7.16394 16.404 7.16395 15.1602 8.40776L13 10.568L10.8398 8.40776Z" fill="white" fillOpacity="0.48"/>
        </svg>
      </div>

      {/* 우하단: 로고 */}
      {content.logoUrl && (
        <img
          src={content.logoUrl}
          alt="logo"
          className="absolute"
          style={{
            bottom: 12 * scale,
            right: 12 * scale,
            height: 16 * scale,
            width: "auto",
          }}
        />
      )}
    </div>
  );
}
