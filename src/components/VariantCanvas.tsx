"use client";

import { useState, useCallback } from "react";
import { CTContent, CTTextField, CT_BASE_WIDTH, CT_BASE_HEIGHT } from "@/types/ct";
import CTCard from "./CTCard";
import DeviceViewer from "./DeviceViewer";
import FieldPopover from "./FieldPopover";
import { exportCtPng } from "@/lib/exportPng";
import { checkContent, autoFixContrast, Feedback } from "@/lib/feedback";

interface VariantCanvasProps {
  variants: CTContent[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onUpdateVariant?: (index: number, updated: CTContent) => void;
}

const TAB_LABELS = ["A안", "B안", "C안"];
const THUMB_W_DESKTOP = 160;
const THUMB_W_MOBILE = 90;
const thumbH = (w: number) => w * (CT_BASE_HEIGHT / CT_BASE_WIDTH);

export default function VariantCanvas({
  variants,
  selectedIndex,
  onSelect,
  onUpdateVariant,
}: VariantCanvasProps) {
  const selected = variants[selectedIndex];
  const [popover, setPopover] = useState<{ field: CTTextField; rect: DOMRect } | null>(null);

  const handleFieldClick = useCallback((field: CTTextField, rect: DOMRect) => {
    setPopover({ field, rect });
  }, []);

  const handleImageDrag = useCallback(
    (customX: number, customY: number) => {
      if (!selected || !onUpdateVariant) return;
      const updated = {
        ...selected,
        imageConstraint: { ...selected.imageConstraint, customX, customY },
      };
      onUpdateVariant(selectedIndex, updated);
    },
    [selected, selectedIndex, onUpdateVariant]
  );

  const handleFieldSelect = useCallback(
    (field: CTTextField, value: string) => {
      if (!selected || !onUpdateVariant) return;
      const updated = { ...selected, [field]: value };
      onUpdateVariant(selectedIndex, updated);
      setPopover(null);
    },
    [selected, selectedIndex, onUpdateVariant]
  );

  const handleGroupSelect = useCallback(
    (line1Key: string, line1: string, line2Key: string, line2: string) => {
      if (!selected || !onUpdateVariant) return;
      const updated = { ...selected, [line1Key]: line1, [line2Key]: line2 };
      onUpdateVariant(selectedIndex, updated);
      setPopover(null);
    },
    [selected, selectedIndex, onUpdateVariant]
  );

  if (!selected) return null;

  const feedbacks = checkContent(selected);

  return (
    <div className="flex flex-col md:flex-row h-full items-center justify-center gap-3 md:gap-6 py-2 md:py-4 overflow-y-auto">
      {/* 썸네일: 모바일 가로 / 데스크톱 세로 */}
      <div className="flex md:flex-col items-center gap-2 md:gap-3 shrink-0">
        {variants.map((v, i) => {
          const tw = typeof window !== "undefined" && window.innerWidth < 768 ? THUMB_W_MOBILE : THUMB_W_DESKTOP;
          return (
            <button
              key={i}
              onClick={() => onSelect(i)}
              className={`flex flex-col items-center gap-1 transition-all ${
                i === selectedIndex ? "" : "opacity-50 hover:opacity-75"
              }`}
            >
              <div
                className={`rounded-lg md:rounded-xl overflow-hidden border-2 transition-colors ${
                  i === selectedIndex ? "border-gray-900" : "border-transparent"
                }`}
                style={{ width: tw, height: thumbH(tw) }}
              >
                <CTCard content={v} renderWidth={tw} />
              </div>
              <span
                className={`text-[10px] md:text-xs font-medium ${
                  i === selectedIndex ? "text-gray-900" : "text-gray-400"
                }`}
              >
                {TAB_LABELS[i]}
              </span>
            </button>
          );
        })}
      </div>

      {/* 디바이스 프리뷰 + 피드백 + 내보내기 */}
      <div className="flex flex-col items-center">
        {/* 모바일: 0.6 스케일, 데스크톱: 0.85 */}
        <div className="block md:hidden">
          <DeviceViewer content={selected} onFieldClick={handleFieldClick} onImageDrag={handleImageDrag} scale={0.6} />
        </div>
        <div className="hidden md:block">
          <DeviceViewer content={selected} onFieldClick={handleFieldClick} onImageDrag={handleImageDrag} scale={0.85} />
        </div>

        {/* AI 피드백 */}
        <div className="mt-2 md:mt-3 w-full max-w-[320px] space-y-1 px-4 md:px-0">
          {feedbacks.map((fb, i) => (
            <FeedbackBadge key={i} feedback={fb} />
          ))}
          {feedbacks.some((f) => f.type === "warning") && onUpdateVariant && (
            <button
              onClick={() => {
                const { fixed, changes } = autoFixContrast(selected);
                if (changes.length > 0) onUpdateVariant(selectedIndex, fixed);
              }}
              className="w-full text-left px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-600 text-xs hover:bg-blue-100 transition-colors"
            >
              ✦ 자동 교정하기
            </button>
          )}
        </div>

        <button
          onClick={() => exportCtPng(selected)}
          className="mt-2 md:mt-3 px-6 py-2.5 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800 transition-colors"
        >
          내보내기 (PNG)
        </button>
      </div>

      {/* 필드 수정안 팝오버 */}
      {popover && (
        <FieldPopover
          field={popover.field}
          content={selected}
          anchorRect={popover.rect}
          onSelect={handleFieldSelect}
          onGroupSelect={handleGroupSelect}
          onClose={() => setPopover(null)}
        />
      )}
    </div>
  );
}

function FeedbackBadge({ feedback }: { feedback: Feedback }) {
  const styles = {
    error: "bg-red-50 text-red-600 border-red-200",
    warning: "bg-amber-50 text-amber-700 border-amber-200",
    ok: "bg-green-50 text-green-600 border-green-200",
  };
  const icons = { error: "✕", warning: "!", ok: "✓" };

  return (
    <div className={`flex items-start gap-2 px-3 py-1.5 rounded-lg border text-xs ${styles[feedback.type]}`}>
      <span className="shrink-0 font-bold">{icons[feedback.type]}</span>
      <span>{feedback.message}</span>
    </div>
  );
}
