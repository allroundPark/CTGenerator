"use client";

import { useEffect, useRef, useState } from "react";
import { CTContent, CTTextField } from "@/types/ct";
import { getByteLength } from "@/lib/bytes";

interface FieldPopoverProps {
  field: CTTextField;
  content: CTContent;
  anchorRect: DOMRect;
  onSelect: (field: CTTextField, value: string) => void;
  onGroupSelect?: (line1Key: string, line1: string, line2Key: string, line2: string) => void;
  onClose: () => void;
}

const isGroup = (f: CTTextField) => f === "title" || f === "sub";

export default function FieldPopover({
  field,
  content,
  anchorRect,
  onSelect,
  onGroupSelect,
  onClose,
}: FieldPopoverProps) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [groupSuggestions, setGroupSuggestions] = useState<[string, string][]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  // 바깥 클릭 → 닫기
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  // ESC → 닫기
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // 대안 생성 API 호출
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/suggest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ field, currentContent: content }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) {
          if (data.groupSuggestions) setGroupSuggestions(data.groupSuggestions);
          else if (data.suggestions) setSuggestions(data.suggestions);
        }
      } catch {
        if (!cancelled) setError("대안 생성 실패");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [field, content]);

  const group = isGroup(field);
  const currentLine1 = field === "title" ? content.titleLine1 : field === "sub" ? content.subLine1 : "";
  const currentLine2 = field === "title" ? content.titleLine2 : field === "sub" ? content.subLine2 : "";
  const currentValue = group ? `${currentLine1}\n${currentLine2}` : (content as unknown as Record<string, string>)[field] || "";

  // 모바일: 바텀시트, 데스크톱: 앵커 근처 팝오버
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

  return (
    <>
      {/* 모바일 오버레이 배경 */}
      {isMobile && <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />}
      <div
        ref={ref}
        className={
          isMobile
            ? "fixed z-50 bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-xl py-2 max-h-[60vh] overflow-y-auto"
            : "fixed z-50 bg-white rounded-xl shadow-xl border border-gray-200 py-1 min-w-[240px] max-w-[400px]"
        }
        style={isMobile ? {} : { top: anchorRect.bottom + 4, left: anchorRect.left }}
      >
      {/* 현재 값 */}
      <div className="px-3 py-2 border-b border-gray-100">
        <span className="text-[10px] text-gray-400 uppercase tracking-wide">현재</span>
        {group ? (
          <div className="mt-0.5">
            <p className="text-sm text-gray-900">{currentLine1}</p>
            <p className="text-sm text-gray-500">{currentLine2}</p>
          </div>
        ) : (
          <p className="text-sm text-gray-900 mt-0.5">{currentValue}</p>
        )}
      </div>

      {/* 로딩 */}
      {loading && (
        <div className="px-3 py-3 flex items-center gap-2 text-xs text-gray-400">
          <span className="animate-spin w-3 h-3 border-2 border-gray-300 border-t-gray-600 rounded-full" />
          대안 생성 중...
        </div>
      )}

      {/* 에러 */}
      {error && <div className="px-3 py-2 text-xs text-red-500">{error}</div>}

      {/* 그룹 대안 리스트 */}
      {!loading && !error && group && groupSuggestions.map(([l1, l2], i) => (
        <button
          key={i}
          onClick={() => {
            if (onGroupSelect) {
              const k1 = field === "title" ? "titleLine1" : "subLine1";
              const k2 = field === "title" ? "titleLine2" : "subLine2";
              onGroupSelect(k1, l1, k2, l2);
            }
          }}
          className="w-full text-left px-3 py-2 hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-gray-700">{l1}</span>
            <span className="text-[10px] text-gray-300 shrink-0">{getByteLength(l1)}b</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-gray-500">{l2}</span>
            <span className="text-[10px] text-gray-300 shrink-0">{getByteLength(l2)}b</span>
          </div>
        </button>
      ))}

      {/* 단일 대안 리스트 */}
      {!loading && !error && !group && suggestions.map((s, i) => (
        <button
          key={i}
          onClick={() => onSelect(field, s)}
          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors flex items-center justify-between gap-2"
        >
          <span className="text-gray-700">{s}</span>
          <span className="text-[10px] text-gray-300 shrink-0">{getByteLength(s)}b</span>
        </button>
      ))}
    </div>
    </>
  );
}
