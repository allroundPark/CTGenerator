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

  const [mobileTab, setMobileTab] = useState<"chat" | "canvas">("chat");
  const hasCanvas = variants.length > 0;

  const handleUpdateVariant = (index: number, updated: CTContent) => {
    setVariants((prev) => prev.map((v, i) => (i === index ? updated : v)));
  };

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
      // 이미지 분석 + 텍스트 생성 병렬 실행
      const [genRes, imageAnalysis] = await Promise.all([
        fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: text,
            currentVariants: variants.length > 0 ? variants : undefined,
          }),
        }),
        image ? analyzeImage(image) : Promise.resolve(null),
      ]);

      if (!genRes.ok) {
        const err = await genRes.json().catch(() => ({ error: "서버 오류" }));
        throw new Error(err.error || `HTTP ${genRes.status}`);
      }

      const data = await genRes.json();
      const newVariants: CTContent[] = data.variants.map((v: CTContent) => ({
        ...v,
        imageUrl: imageUrl || v.imageUrl,
        // AI 크롭 추천 적용
        ...(imageAnalysis && !imageAnalysis.isSmall
          ? {
              imageConstraint: {
                fit: "cover" as const,
                alignX: imageAnalysis.alignX,
                alignY: imageAnalysis.alignY,
              },
            }
          : {}),
        // 작은 이미지(로고)면 contain + center
        ...(imageAnalysis && imageAnalysis.isSmall
          ? {
              imageConstraint: {
                fit: "contain" as const,
                alignX: "center" as const,
                alignY: "center" as const,
              },
            }
          : {}),
      }));

      setVariants(newVariants);
      setSelectedIndex(0);
      setMobileTab("canvas");

      let assistantContent: string;
      if (!newVariants.some((v) => v.imageUrl)) {
        assistantContent =
          "3가지 안을 만들었어요!\n\n배경 이미지가 아직 없는데,\n• 이미지를 첨부해주시거나\n• \"이미지도 생성해줘\"라고 말씀해주세요.";
      } else if (imageAnalysis) {
        const cropInfo = imageAnalysis.isSmall
          ? "로고/아이콘으로 판단해서 중앙 배치했어요."
          : `AI 크롭 추천: ${imageAnalysis.reason}`;
        assistantContent = `3가지 안을 만들었어요.\n${cropInfo}`;
      } else {
        assistantContent = "3가지 안을 만들었어요. 확인해보세요!";
      }

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

  // 이미지 분석 (AI 크롭 추천)
  async function analyzeImage(file: File) {
    try {
      const formData = new FormData();
      formData.append("image", file);
      const res = await fetch("/api/analyze-image", { method: "POST", body: formData });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  // 이미지 생성 (Nano Banana 2)
  const handleGenerateImage = async (prompt: string) => {
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: prompt,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const res = await fetch("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "서버 오류" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const dataUrl = `data:${data.image.mimeType};base64,${data.image.data}`;

      // 현재 variants에 이미지 적용
      if (variants.length > 0) {
        const updated = variants.map((v) => ({ ...v, imageUrl: dataUrl }));
        setVariants(updated);
        setMobileTab("canvas");

        const assistantMsg: ChatMessage = {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: "이미지를 생성해서 카드에 적용했어요!",
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
      } else {
        // variants 없으면 생성과 함께
        const genRes = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: `${prompt} 관련 카드` }),
        });
        if (genRes.ok) {
          const genData = await genRes.json();
          const newVariants = genData.variants.map((v: CTContent) => ({
            ...v,
            imageUrl: dataUrl,
          }));
          setVariants(newVariants);
          setSelectedIndex(0);
          setMobileTab("canvas");
        }

        const assistantMsg: ChatMessage = {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: "이미지를 생성하고 3가지 안을 만들었어요!",
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
      }
    } catch (e) {
      const errorMsg: ChatMessage = {
        id: `error-${Date.now()}`,
        role: "assistant",
        content: `이미지 생성 실패: ${e instanceof Error ? e.message : "알 수 없는 오류"}`,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  // 메시지 라우팅: 이미지 생성 요청인지 판단
  const handleMessage = async (text: string, image?: File) => {
    const imageKeywords = ["이미지 생성", "이미지 만들", "배경 생성", "배경 만들", "그림 그려", "이미지도 생성"];
    const isImageRequest = imageKeywords.some((kw) => text.includes(kw));

    if (isImageRequest && !image) {
      await handleGenerateImage(text);
    } else {
      await handleSend(text, image);
    }
  };

  return (
    <div className="h-screen flex bg-gray-50 overflow-hidden">
      {/* 좌측 사이드바 — 데스크톱만 */}
      <Sidebar mode={mode} onModeChange={setMode} />

      {/* 메인 영역 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 헤더 */}
        <header className="bg-white border-b border-gray-200 px-4 md:px-6 py-2.5 shrink-0">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-gray-900">
              CT Generator
              <span className="ml-1.5 text-xs font-normal text-gray-400">041</span>
            </span>
            {/* 모바일: 모드 토글 */}
            <div className="flex md:hidden gap-1">
              <button
                onClick={() => setMode("chat")}
                className={`px-3 py-1 text-xs rounded-full transition-colors ${
                  mode === "chat" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-500"
                }`}
              >
                AI
              </button>
              <button
                onClick={() => setMode("manual")}
                className={`px-3 py-1 text-xs rounded-full transition-colors ${
                  mode === "manual" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-500"
                }`}
              >
                편집
              </button>
            </div>
          </div>
        </header>

        {/* 콘텐츠 */}
        <div className="flex-1 min-h-0 overflow-y-auto md:overflow-hidden">
          {mode === "manual" ? (
            <ManualEditor key={selectedIndex} initialContent={variants[selectedIndex]} />
          ) : !hasCanvas && messages.length === 0 ? (
            /* 채팅 Phase 1: 인풋만 */
            <div className="h-full flex flex-col items-center justify-center px-4">
              <div className="mb-6 md:mb-8 text-center">
                <h1 className="text-xl md:text-2xl font-bold text-gray-900 mb-2">CT Generator</h1>
                <p className="text-sm text-gray-400">콘텐츠스레드 카드를 만들어보세요</p>
              </div>
              <div className="w-full max-w-lg">
                <ChatInput onSubmit={handleMessage} disabled={isLoading} large autoFocus />
              </div>
              <div className="mt-4 md:mt-6 flex flex-wrap justify-center gap-2">
                {["3월 적금 이벤트", "신용카드 혜택 안내", "대출 금리 인하"].map((example) => (
                  <button
                    key={example}
                    onClick={() => handleMessage(example)}
                    className="px-3 py-1.5 text-xs text-gray-500 bg-white border border-gray-200 rounded-full hover:bg-gray-100 transition-colors"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* 채팅 Phase 2 */
            <div className="h-full flex flex-col md:flex-row">
              {/* 채팅 패널 — 데스크톱: 좌측 고정 / 모바일: 탭 전환 */}
              <div className={`${
                mobileTab === "chat" ? "flex" : "hidden"
              } md:flex w-full md:w-[400px] shrink-0 border-r border-gray-200 bg-white flex-col`}>
                <ChatPanel messages={messages} onSend={handleMessage} isLoading={isLoading} />
              </div>

              {/* 캔버스 — 데스크톱: 우측 / 모바일: 탭 전환 */}
              <div className={`${
                mobileTab === "canvas" ? "flex" : "hidden"
              } md:flex flex-1 overflow-hidden`}>
                {hasCanvas ? (
                  <VariantCanvas
                    variants={variants}
                    selectedIndex={selectedIndex}
                    onSelect={setSelectedIndex}
                    onUpdateVariant={handleUpdateVariant}
                  />
                ) : (
                  <div className="h-full flex items-center justify-center text-gray-400 text-sm w-full">
                    생성 중...
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 모바일 하단 탭 바 — Phase 2에서만 표시 */}
        {mode === "chat" && (hasCanvas || messages.length > 0) && (
          <div className="md:hidden bg-white border-t border-gray-200 flex shrink-0">
            <button
              onClick={() => setMobileTab("chat")}
              className={`flex-1 py-3 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
                mobileTab === "chat" ? "text-gray-900" : "text-gray-400"
              }`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              채팅
            </button>
            <button
              onClick={() => setMobileTab("canvas")}
              className={`flex-1 py-3 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
                mobileTab === "canvas" ? "text-gray-900" : "text-gray-400"
              }`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              </svg>
              캔버스
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Sidebar({ mode, onModeChange }: { mode: Mode; onModeChange: (m: Mode) => void }) {
  return (
    <div className="hidden md:flex w-14 bg-white border-r border-gray-200 flex-col items-center py-4 gap-2 shrink-0">
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
