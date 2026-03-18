"use client";

import { CTContent, CT_BASE_WIDTH, CT_BASE_HEIGHT, CTTextField } from "@/types/ct";

interface CTCardProps {
  content: CTContent;
  /** 렌더링할 너비 (디바이스 너비에 맞춤) */
  renderWidth: number;
  /** 텍스트 필드 클릭 시 콜백 (없으면 클릭 비활성) */
  onFieldClick?: (field: CTTextField, rect: DOMRect) => void;
  /** 이미지 드래그 콜백 (customX, customY %) */
  onImageDrag?: (customX: number, customY: number) => void;
}

export default function CTCard({ content, renderWidth, onFieldClick, onImageDrag }: CTCardProps) {
  const scale = renderWidth / CT_BASE_WIDTH;
  const renderHeight = CT_BASE_HEIGHT * scale;
  const textColor = content.textColor === "BK" ? "#000000" : "#FFFFFF";

  // 이미지 정렬 CSS (커스텀 % 우선)
  const { customX, customY } = content.imageConstraint;
  const objectPosition =
    customX !== undefined && customY !== undefined
      ? `${customX}% ${customY}%`
      : `${content.imageConstraint.alignX} ${content.imageConstraint.alignY}`;

  return (
    <div
      className="relative overflow-hidden"
      style={{
        width: renderWidth,
        height: renderHeight,
        borderRadius: 16 * scale,
      }}
    >
      {/* 배경 이미지 (드래그로 크롭 조정 가능) */}
      {content.imageUrl && (
        <img
          src={content.imageUrl}
          alt=""
          className={`absolute inset-0 w-full h-full ${onImageDrag ? "cursor-grab active:cursor-grabbing" : ""}`}
          style={{
            objectFit: content.imageConstraint.fit,
            objectPosition,
          }}
          draggable={false}
          onMouseDown={
            onImageDrag && content.imageConstraint.fit === "cover"
              ? (e) => {
                  e.preventDefault();
                  const startX = e.clientX;
                  const startY = e.clientY;
                  const startCX = customX ?? 50;
                  const startCY = customY ?? 50;
                  const onMove = (me: MouseEvent) => {
                    const dx = ((me.clientX - startX) / renderWidth) * -100;
                    const dy = ((me.clientY - startY) / renderHeight) * -100;
                    onImageDrag!(
                      Math.max(0, Math.min(100, startCX + dx)),
                      Math.max(0, Math.min(100, startCY + dy))
                    );
                  };
                  const onUp = () => {
                    window.removeEventListener("mousemove", onMove);
                    window.removeEventListener("mouseup", onUp);
                  };
                  window.addEventListener("mousemove", onMove);
                  window.addEventListener("mouseup", onUp);
                }
              : undefined
          }
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
        <FieldSpan
          field="label"
          scale={scale}
          fontSize={14}
          lineHeight={20}
          color={textColor}
          onFieldClick={onFieldClick}
        >
          {content.label}
        </FieldSpan>

        {/* gap 8px */}
        <div style={{ height: 8 * scale }} />

        {/* 2-3. title 그룹 (titleLine1 + titleLine2) */}
        <FieldSpan
          field="title"
          scale={scale}
          fontSize={24}
          lineHeight={32}
          color={textColor}
          onFieldClick={onFieldClick}
          keepAll
        >
          <div>{content.titleLine1}</div>
          <div>{content.titleLine2}</div>
        </FieldSpan>
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
        {/* sub 그룹 (subLine1 + subLine2) */}
        <FieldSpan
          field="sub"
          scale={scale}
          fontSize={14}
          lineHeight={20}
          color={textColor}
          onFieldClick={onFieldClick}
        >
          <div>{content.subLine1}</div>
          <div>{content.subLine2}</div>
        </FieldSpan>
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

/** 클릭 가능한 텍스트 필드 래퍼 */
function FieldSpan({
  field,
  scale,
  fontSize,
  lineHeight,
  color,
  onFieldClick,
  keepAll,
  children,
}: {
  field: CTTextField;
  scale: number;
  fontSize: number;
  lineHeight: number;
  color: string;
  onFieldClick?: (field: CTTextField, rect: DOMRect) => void;
  keepAll?: boolean;
  children: React.ReactNode;
}) {
  const interactive = !!onFieldClick;
  return (
    <div
      onClick={
        interactive
          ? (e) => {
              e.stopPropagation();
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              onFieldClick!(field, rect);
            }
          : undefined
      }
      className={interactive ? "cursor-pointer transition-colors rounded-sm hover:bg-white/20" : ""}
      style={{
        fontSize: fontSize * scale,
        lineHeight: `${lineHeight * scale}px`,
        fontWeight: 700,
        color,
        wordBreak: keepAll ? "keep-all" : undefined,
      }}
    >
      {children}
    </div>
  );
}
