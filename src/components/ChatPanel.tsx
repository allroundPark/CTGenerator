"use client";

import { useRef, useEffect, useState } from "react";
import { ChatMessage, AttachedImage, GenerationStatus, CTContent, CT_BASE_WIDTH, CT_BASE_HEIGHT } from "@/types/ct";
import ChatInput from "./ChatInput";

type ReportRating = "good" | "bad" | null;

interface ChatPanelProps {
  messages: ChatMessage[];
  onSend: (text: string, images?: AttachedImage[]) => void;
  isLoading: boolean;
  genStatus?: GenerationStatus;
  onViewCanvas?: () => void;
  onReport?: (rating?: ReportRating) => void;
  onQuickRate?: (msgId: string, rating: "good" | "bad") => Promise<boolean>;
  onInputFocusChange?: (focused: boolean) => void;
  placeholder?: string;
  collapsed?: boolean;
  highlightAttach?: boolean;
  hasContent?: boolean;
}

/** 채팅 말풍선 안 미니 카드 프리뷰 */
function MiniCardPreview({ variant, onTap }: { variant: CTContent; onTap?: () => void }) {
  const w = 140;
  const scale = w / CT_BASE_WIDTH;
  const h = CT_BASE_HEIGHT * scale;
  const textColor = variant.textColor === "BK" ? "#000" : "#FFF";

  return (
    <button onClick={onTap} className="block rounded-lg overflow-hidden shadow-sm border border-white/20 hover:shadow-md transition-shadow" style={{ width: w, height: h }}>
      <div className="relative w-full h-full" style={{ backgroundColor: "#e5e5e5" }}>
        {variant.imageUrl && (
          <img src={variant.imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
        )}
        {variant.bgTreatment.type === "gradient" && (
          <div className="absolute inset-0" style={{
            background: variant.bgTreatment.direction === "dark"
              ? "linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.3) 60%, transparent 100%)"
              : "linear-gradient(to bottom, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.3) 60%, transparent 100%)",
          }} />
        )}
        <div className="absolute top-0 left-0 p-2" style={{ color: textColor }}>
          <div style={{ fontSize: 6, fontWeight: 700, opacity: 0.8 }}>{variant.label}</div>
          <div style={{ fontSize: 10, fontWeight: 700, marginTop: 2, lineHeight: 1.3 }}>{variant.titleLine1}</div>
          <div style={{ fontSize: 10, fontWeight: 700, lineHeight: 1.3 }}>{variant.titleLine2}</div>
        </div>
        {/* 확대 힌트 */}
        <div className="absolute bottom-1 right-1 opacity-60">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 3 21 3 21 9" />
            <polyline points="9 21 3 21 3 15" />
            <line x1="21" y1="3" x2="14" y2="10" />
            <line x1="3" y1="21" x2="10" y2="14" />
          </svg>
        </div>
      </div>
    </button>
  );
}

/** 👍👎 피드백 버튼 */
function ThumbsButtons({ msgId, onQuickRate, onReport }: {
  msgId: string;
  onQuickRate?: (msgId: string, rating: "good" | "bad") => Promise<boolean>;
  onReport?: (rating?: ReportRating) => void;
}) {
  const [rated, setRated] = useState<"good" | "bad" | null>(null);
  const [saving, setSaving] = useState(false);

  const handleRate = async (rating: "good" | "bad") => {
    if (rated || saving) return;
    setSaving(true);
    if (rating === "bad") {
      setRated("bad");
      setSaving(false);
      onReport?.("bad");
      return;
    }
    const ok = onQuickRate ? await onQuickRate(msgId, rating) : false;
    setSaving(false);
    if (ok) setRated(rating);
  };

  const disabled = rated !== null || saving;

  return (
    <div className="flex items-center gap-1 mt-1.5">
      {/* 👍 */}
      <button
        onClick={() => handleRate("good")}
        disabled={disabled}
        className={`p-2.5 rounded-full transition-colors ${
          rated === "good" ? "text-amber-400" : disabled ? "text-gray-500 opacity-50" : "text-ds-text-muted hover:text-gray-200"
        }`}
        title="좋아요"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill={rated === "good" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 22V11l5-10 1.5.5c1 .3 1.5 1.5 1 2.5L13 9h6a2 2 0 0 1 2 2v2a6 6 0 0 1-.2 1.5l-1.8 6A2 2 0 0 1 17 22H7z" />
          <path d="M2 11h3v11H2z" />
        </svg>
      </button>
      {/* 👎 */}
      <button
        onClick={() => handleRate("bad")}
        disabled={disabled}
        className={`p-2.5 rounded-full transition-colors ${
          rated === "bad" ? "text-amber-400" : disabled ? "text-gray-500 opacity-50" : "text-ds-text-muted hover:text-gray-200"
        }`}
        title="안좋아요"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill={rated === "bad" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 2H7a2 2 0 0 0-2 1.5l-1.8 6A6 6 0 0 0 3 11v2a2 2 0 0 0 2 2h6l-1.5 4.5c-.5 1 0 2.2 1 2.5L12 23l5-10V2z" />
          <path d="M19 2h3v11h-3z" />
        </svg>
      </button>
      {/* 상세 피드백 */}
      <button
        onClick={() => onReport?.(null)}
        className="ml-2 px-2.5 py-1 text-[11px] text-ds-text-secondary bg-ds-base border border-ds-border rounded-full hover:bg-ds-surface transition-colors"
      >
        상세 피드백
      </button>
    </div>
  );
}

export default function ChatPanel({ messages, onSend, isLoading, genStatus, onViewCanvas, onReport, onQuickRate, onInputFocusChange, placeholder, collapsed, highlightAttach, hasContent }: ChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading, genStatus]);

  if (collapsed) {
    return (
      <div className="flex flex-col justify-start px-4 pt-1 h-full">
        <ChatInput onSubmit={onSend} disabled={isLoading} placeholder={placeholder} autoFocus={false} highlightAttach={highlightAttach} onFocusChange={onInputFocusChange} hasContent={hasContent} />
      </div>
    );
  }

  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-col h-full">
      {/* 빈 상태: 입력창만 위쪽에 */}
      {isEmpty ? (
        <div className="flex-1 flex flex-col justify-start px-4 pt-2">
          <p className="text-ds-text-muted text-xs text-center leading-relaxed mb-3">
            브랜드와 소재를 알려주세요.{"\n"}
            예: &apos;현대카드 여행 혜택 콘텐츠 만들어줘&apos;
          </p>
          <ChatInput onSubmit={onSend} disabled={isLoading} placeholder={placeholder} autoFocus highlightAttach={highlightAttach} onFocusChange={onInputFocusChange} hasContent={hasContent} />
        </div>
      ) : (
        <>
      {/* 메시지 리스트 */}
      <div ref={scrollRef} className="overflow-y-auto flex-1 px-4 py-2 space-y-3">
        {messages.map((msg) => {
          // 유저 메시지
          if (msg.role === "user") {
            return (
              <div key={msg.id} className="flex justify-end">
                <div className="max-w-[85%] text-right">
                  {msg.imageUrls && msg.imageUrls.length > 0 && (
                    <div className="flex gap-1 mb-1 justify-end">
                      {msg.imageUrls.map((url, i) => (
                        <img key={i} src={url} alt="" className="h-12 w-12 rounded-lg object-cover" />
                      ))}
                    </div>
                  )}
                  <div className="inline-block px-3 py-2 rounded-xl text-sm bg-white/35 text-white whitespace-pre-wrap">
                    {msg.content}
                  </div>
                </div>
              </div>
            );
          }

          // status 메시지
          if (msg.type === "status") {
            return (
              <div key={msg.id} className="flex items-center gap-2 text-xs text-ds-text-secondary px-1">
                <div className="w-3 h-3 border-2 border-gray-500 border-t-gray-300 rounded-full animate-spin shrink-0" />
                {msg.content}
              </div>
            );
          }

          // assistant 메시지
          return (
            <div key={msg.id} className="space-y-2">
              <div>
                <div className="text-sm text-ds-text whitespace-pre-wrap">{msg.content}</div>
                {msg.showReport && onReport && (
                  <ThumbsButtons msgId={msg.id} onQuickRate={onQuickRate} onReport={onReport} />
                )}
              </div>

              {/* 옵션 → 제안 칩 (가로 플로우, 최대 2줄) */}
              {msg.type === "options" && msg.options && msg.options.length > 0 && (
                <div className="flex flex-wrap gap-1.5 max-h-[68px] overflow-hidden">
                  {msg.options.map((opt, i) => {
                    const isDirectInput = opt.label.includes("직접 입력") || opt.value === "직접 입력";
                    if (isDirectInput) return null;
                    const isPrimary = opt.value === "AI가 알아서 해주세요" || opt.value === "AI가 바로 만들기";
                    return (
                      <button
                        key={opt.value}
                        onClick={() => onSend(opt.value)}
                        disabled={isLoading}
                        className={isPrimary
                          ? "px-3 py-1.5 text-xs text-white bg-ds-accent rounded-full hover:bg-ds-accent-hover transition-colors disabled:opacity-50 font-medium"
                          : "px-3 py-1.5 text-xs text-ds-text bg-ds-overlay rounded-full hover:bg-ds-border-strong transition-colors disabled:opacity-50"
                        }
                      >
                        {opt.label.replace(/^\d+\.\s*/, "")}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* 미니 카드 프리뷰 */}
              {msg.variants && msg.variants.length > 0 && (
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                  {msg.variants.map((v, i) => (
                    <MiniCardPreview key={i} variant={v} onTap={onViewCanvas} />
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* 로딩 상태 — genStatus 있으면 항상 표시 */}
        {isLoading && (genStatus || !messages.some(m => m.type === "status")) && (
          <div className="flex items-center gap-2 text-xs text-ds-text-secondary px-1">
            <span className="inline-flex gap-0.5">
              <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
            </span>
            {genStatus && <span>{genStatus}</span>}
          </div>
        )}
      </div>

      {/* 하단 페이드 + 입력바 — 항상 바텀시트 하단 고정 */}
      <div className="shrink-0 relative">
        <div className="px-4 pb-12 pt-1">
          <ChatInput onSubmit={onSend} disabled={isLoading} placeholder={placeholder} autoFocus highlightAttach={highlightAttach} onFocusChange={onInputFocusChange} hasContent={hasContent} />
        </div>
      </div>
        </>
      )}
    </div>
  );
}
