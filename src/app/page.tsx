"use client";

import { useState } from "react";
import { CTContent, ChatMessage } from "@/types/ct";
import ChatInput from "@/components/ChatInput";
import ChatPanel from "@/components/ChatPanel";
import VariantCanvas from "@/components/VariantCanvas";
import ManualEditor from "@/components/ManualEditor";

type Mode = "manual" | "chat";

export default function Home() {
  const [mode, setMode] = useState<Mode>("chat");

  // 채팅 모드 상태
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [variants, setVariants] = useState<CTContent[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const hasCanvas = variants.length > 0;

  const handleSend = async (text: string, image?: File) => {
    // 이미지가 있으면 objectURL 생성
    const imageUrl = image ? URL.createObjectURL(image) : "";

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: image ? `${text}\n[이미지 첨부됨]` : text,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: text,
          currentVariants: variants.length > 0 ? variants : undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "서버 오류" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const newVariants: CTContent[] = data.variants.map((v: CTContent) => ({
        ...v,
        imageUrl: imageUrl || v.imageUrl,
      }));

      setVariants(newVariants);
      setSelectedIndex(0);

      const hasImg = newVariants.some((v) => v.imageUrl);
      const assistantContent = hasImg
        ? "3가지 안을 만들었어요. 확인해보세요!"
        : "3가지 안을 만들었어요!\n\n배경 이미지가 아직 없는데,\n• 이미지를 첨부해주시거나\n• \"이미지도 생성해줘\"라고 말씀해주세요.";

      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: assistantContent,
        variants: newVariants,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (e) {
      const errorMsg: ChatMessage = {
        id: `error-${Date.now()}`,
        role: "assistant",
        content: `오류가 발생했어요: ${e instanceof Error ? e.message : "알 수 없는 오류"}`,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-screen flex bg-gray-50 overflow-hidden">
      {/* 좌측 사이드바 */}
      <Sidebar mode={mode} onModeChange={setMode} />

      {/* 메인 영역 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 헤더 */}
        <header className="bg-white border-b border-gray-200 px-6 py-2.5 shrink-0">
          <div className="flex items-center">
            <span className="text-sm font-bold text-gray-900">
              CT Generator
              <span className="ml-1.5 text-xs font-normal text-gray-400">041</span>
            </span>
          </div>
        </header>

        {/* 콘텐츠 */}
        <div className="flex-1 overflow-hidden">
          {mode === "manual" ? (
            <ManualEditor key={selectedIndex} initialContent={variants[selectedIndex]} />
          ) : !hasCanvas && messages.length === 0 ? (
            /* 채팅 Phase 1: 인풋만 */
            <div className="h-full flex flex-col items-center justify-center px-4">
              <div className="mb-8 text-center">
                <h1 className="text-2xl font-bold text-gray-900 mb-2">CT Generator</h1>
                <p className="text-sm text-gray-400">콘텐츠스레드 카드를 만들어보세요</p>
              </div>
              <div className="w-full max-w-lg">
                <ChatInput onSubmit={handleSend} disabled={isLoading} large autoFocus />
              </div>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {["3월 적금 이벤트", "신용카드 혜택 안내", "대출 금리 인하"].map((example) => (
                  <button
                    key={example}
                    onClick={() => handleSend(example)}
                    className="px-3 py-1.5 text-xs text-gray-500 bg-white border border-gray-200 rounded-full hover:bg-gray-100 transition-colors"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* 채팅 Phase 2: 좌 채팅 | 우 캔버스 */
            <div className="h-full flex">
              <div className="w-[400px] shrink-0 border-r border-gray-200 bg-white">
                <ChatPanel messages={messages} onSend={handleSend} isLoading={isLoading} />
              </div>
              <div className="flex-1 overflow-hidden">
                {hasCanvas ? (
                  <VariantCanvas
                    variants={variants}
                    selectedIndex={selectedIndex}
                    onSelect={setSelectedIndex}
                  />
                ) : (
                  <div className="h-full flex items-center justify-center text-gray-400 text-sm">
                    생성 중...
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Sidebar({ mode, onModeChange }: { mode: Mode; onModeChange: (m: Mode) => void }) {
  return (
    <div className="w-14 bg-white border-r border-gray-200 flex flex-col items-center py-4 gap-2 shrink-0">
      {/* 수동 편집 */}
      <button
        onClick={() => onModeChange("manual")}
        title="수동 편집"
        className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
          mode === "manual"
            ? "bg-gray-900 text-white"
            : "text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        }`}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
      </button>

      {/* AI 채팅 */}
      <button
        onClick={() => onModeChange("chat")}
        title="AI 채팅"
        className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
          mode === "chat"
            ? "bg-gray-900 text-white"
            : "text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        }`}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </button>
    </div>
  );
}
