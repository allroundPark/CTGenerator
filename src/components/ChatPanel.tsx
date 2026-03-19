"use client";

import { useRef, useEffect } from "react";
import { ChatMessage, AttachedImage, GenerationStatus, CTContent, CT_BASE_WIDTH, CT_BASE_HEIGHT } from "@/types/ct";
import ChatInput from "./ChatInput";

interface ChatPanelProps {
  messages: ChatMessage[];
  onSend: (text: string, images?: AttachedImage[]) => void;
  isLoading: boolean;
  genStatus?: GenerationStatus;
  onViewCanvas?: () => void; // 모바일에서 캔버스 탭으로 전환
}

/** 채팅 말풍선 안 미니 카드 프리뷰 */
function MiniCardPreview({ variant, onTap }: { variant: CTContent; onTap?: () => void }) {
  const w = 140;
  const scale = w / CT_BASE_WIDTH;
  const h = CT_BASE_HEIGHT * scale;
  const textColor = variant.textColor === "BK" ? "#000" : "#FFF";

  return (
    <button onClick={onTap} className="block rounded-lg overflow-hidden shadow-sm border border-gray-200 hover:shadow-md transition-shadow" style={{ width: w, height: h }}>
      <div className="relative w-full h-full" style={{ backgroundColor: "#e5e5e5" }}>
        {variant.imageUrl && (
          <img src={variant.imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
        )}
        {/* 그라데이션 오버레이 */}
        {variant.bgTreatment.type === "gradient" && (
          <div className="absolute inset-0" style={{
            background: variant.bgTreatment.direction === "dark"
              ? "linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.3) 60%, transparent 100%)"
              : "linear-gradient(to bottom, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.3) 60%, transparent 100%)",
          }} />
        )}
        {/* 텍스트 */}
        <div className="absolute top-0 left-0 p-2" style={{ color: textColor }}>
          <div style={{ fontSize: 6, fontWeight: 700, opacity: 0.8 }}>{variant.label}</div>
          <div style={{ fontSize: 10, fontWeight: 700, marginTop: 2, lineHeight: 1.3 }}>{variant.titleLine1}</div>
          <div style={{ fontSize: 10, fontWeight: 700, lineHeight: 1.3 }}>{variant.titleLine2}</div>
        </div>
      </div>
    </button>
  );
}

export default function ChatPanel({ messages, onSend, isLoading, genStatus, onViewCanvas }: ChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading, genStatus]);

  return (
    <div className="flex flex-col h-full">
      {/* 메시지 리스트 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div className={`max-w-[85%] ${msg.role === "user" ? "text-right" : "text-left"}`}>
              {/* 첨부 이미지 프리뷰 */}
              {msg.imageUrls && msg.imageUrls.length > 0 && (
                <div className={`flex gap-1 mb-1 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  {msg.imageUrls.map((url, i) => (
                    <img
                      key={i}
                      src={url}
                      alt={`첨부 ${i + 1}`}
                      className="h-12 w-12 rounded-lg object-cover"
                    />
                  ))}
                </div>
              )}
              {/* 메시지 본문 */}
              <div
                className={`inline-block px-3 py-2 rounded-xl text-sm whitespace-pre-wrap ${
                  msg.role === "user"
                    ? "bg-gray-900 text-white"
                    : "bg-gray-100 text-gray-800"
                }`}
              >
                {msg.content}
              </div>
              {/* 미니 카드 프리뷰 (variants가 있는 어시스턴트 메시지) */}
              {msg.role === "assistant" && msg.variants && msg.variants.length > 0 && (
                <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
                  {msg.variants.map((v, i) => (
                    <MiniCardPreview key={i} variant={v} onTap={onViewCanvas} />
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* 로딩 상태 — 단계별 표시 */}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 text-gray-600 px-3 py-2 rounded-xl text-sm flex items-center gap-2">
              <span className="inline-flex gap-0.5">
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </span>
              {genStatus && <span className="text-gray-500">{genStatus}</span>}
            </div>
          </div>
        )}
      </div>

      {/* 입력 */}
      <div className="shrink-0 px-4 pb-4">
        <ChatInput onSubmit={onSend} disabled={isLoading} autoFocus />
      </div>
    </div>
  );
}
