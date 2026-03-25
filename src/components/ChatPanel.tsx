"use client";

import { useRef, useEffect } from "react";
import { ChatMessage, AttachedImage, GenerationStatus, CTContent, CT_BASE_WIDTH, CT_BASE_HEIGHT } from "@/types/ct";
import ChatInput from "./ChatInput";

interface ChatPanelProps {
  messages: ChatMessage[];
  onSend: (text: string, images?: AttachedImage[]) => void;
  isLoading: boolean;
  genStatus?: GenerationStatus;
  onViewCanvas?: () => void;
  onReport?: () => void;
  onInputFocusChange?: (focused: boolean) => void;
  placeholder?: string;
  collapsed?: boolean;
  highlightAttach?: boolean;
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
      </div>
    </button>
  );
}

export default function ChatPanel({ messages, onSend, isLoading, genStatus, onViewCanvas, onReport, onInputFocusChange, placeholder, collapsed, highlightAttach }: ChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading, genStatus]);

  if (collapsed) {
    return (
      <div className="flex flex-col justify-start px-4 pt-1 h-full">
        <ChatInput onSubmit={onSend} disabled={isLoading} placeholder={placeholder} autoFocus={false} highlightAttach={highlightAttach} onFocusChange={onInputFocusChange} />
      </div>
    );
  }

  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-col h-full">
      {/* 빈 상태: 입력창만 위쪽에 */}
      {isEmpty ? (
        <div className="flex-1 flex flex-col justify-start px-4 pt-2">
          <ChatInput onSubmit={onSend} disabled={isLoading} placeholder={placeholder} autoFocus highlightAttach={highlightAttach} onFocusChange={onInputFocusChange} />
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
              <div key={msg.id} className="flex items-center gap-2 text-xs text-gray-300 px-1">
                <div className="w-3 h-3 border-2 border-gray-500 border-t-gray-300 rounded-full animate-spin shrink-0" />
                {msg.content}
              </div>
            );
          }

          // assistant 메시지
          return (
            <div key={msg.id} className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="text-sm text-gray-100 whitespace-pre-wrap">{msg.content}</div>
                {msg.showReport && onReport && (
                  <button
                    onClick={onReport}
                    className="shrink-0 px-2.5 py-1 text-[11px] text-gray-300 bg-[#555] border border-[#777] rounded-full hover:bg-[#666] transition-colors"
                  >
                    피드백
                  </button>
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
                          ? "px-3 py-1.5 text-xs text-white bg-indigo-500 rounded-full hover:bg-indigo-600 transition-colors disabled:opacity-50 font-medium"
                          : "px-3 py-1.5 text-xs text-gray-100 bg-[#888] rounded-full hover:bg-[#999] transition-colors disabled:opacity-50"
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
          <div className="flex items-center gap-2 text-xs text-gray-300 px-1">
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
          <ChatInput onSubmit={onSend} disabled={isLoading} placeholder={placeholder} autoFocus highlightAttach={highlightAttach} onFocusChange={onInputFocusChange} />
        </div>
      </div>
        </>
      )}
    </div>
  );
}
