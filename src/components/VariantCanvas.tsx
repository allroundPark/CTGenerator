"use client";

import { CTContent, CT_BASE_WIDTH, CT_BASE_HEIGHT } from "@/types/ct";
import CTCard from "./CTCard";
import DeviceViewer from "./DeviceViewer";
import { exportCtPng } from "@/lib/exportPng";
import { checkContent, Feedback } from "@/lib/feedback";

interface VariantCanvasProps {
  variants: CTContent[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}

const TAB_LABELS = ["A안", "B안", "C안"];
const THUMB_W = 160;
const THUMB_H = THUMB_W * (CT_BASE_HEIGHT / CT_BASE_WIDTH);

export default function VariantCanvas({
  variants,
  selectedIndex,
  onSelect,
}: VariantCanvasProps) {
  const selected = variants[selectedIndex];
  if (!selected) return null;

  const feedbacks = checkContent(selected);

  return (
    <div className="flex h-full items-center justify-center gap-6 py-4">
      {/* 좌측: 썸네일 세로 나열 */}
      <div className="flex flex-col items-center gap-3">
        {variants.map((v, i) => (
          <button
            key={i}
            onClick={() => onSelect(i)}
            className={`flex flex-col items-center gap-1 transition-all ${
              i === selectedIndex ? "" : "opacity-50 hover:opacity-75"
            }`}
          >
            <div
              className={`rounded-xl overflow-hidden border-2 transition-colors ${
                i === selectedIndex ? "border-gray-900" : "border-transparent"
              }`}
              style={{ width: THUMB_W, height: THUMB_H }}
            >
              <CTCard content={v} renderWidth={THUMB_W} />
            </div>
            <span
              className={`text-xs font-medium ${
                i === selectedIndex ? "text-gray-900" : "text-gray-400"
              }`}
            >
              {TAB_LABELS[i]}
            </span>
          </button>
        ))}
      </div>

      {/* 디바이스 프리뷰 + 피드백 + 내보내기 */}
      <div className="flex flex-col items-center">
        <DeviceViewer content={selected} />

        {/* AI 피드백 */}
        <div className="mt-3 w-full max-w-[320px] space-y-1">
          {feedbacks.map((fb, i) => (
            <FeedbackBadge key={i} feedback={fb} />
          ))}
        </div>

        <button
          onClick={() => exportCtPng(selected)}
          className="mt-3 px-6 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800 transition-colors"
        >
          내보내기 (PNG)
        </button>
      </div>
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
