"use client";

import { useState, useRef, useCallback } from "react";
import { CTContent, ChatMessage, AttachedImage, GenerationStatus, CTTextField } from "@/types/ct";
import ChatInput from "@/components/ChatInput";
import DeviceViewer from "@/components/DeviceViewer";
import FieldPopover from "@/components/FieldPopover";

const EMPTY_CONTENT: CTContent = {
  id: "empty",
  label: "",
  titleLine1: "",
  titleLine2: "",
  subLine1: "",
  subLine2: "",
  imageUrl: "",
  imageConstraint: { fit: "cover", alignX: "center", alignY: "center" },
  textColor: "WT",
  bgTreatment: { type: "none" },
};

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [variants, setVariants] = useState<CTContent[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [genStatus, setGenStatus] = useState<GenerationStatus>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [popover, setPopover] = useState<{ field: CTTextField; rect: DOMRect } | null>(null);

  // 스와이프 상태
  const touchStartX = useRef(0);
  const hasCanvas = variants.length > 0;
  const selected = variants[selectedIndex];

  const handleUpdateVariant = (index: number, updated: CTContent) => {
    setVariants((prev) => prev.map((v, i) => (i === index ? updated : v)));
  };

  const handleFieldClick = useCallback((field: CTTextField, rect: DOMRect) => {
    setPopover({ field, rect });
  }, []);

  const handleImageDrag = useCallback(
    (customX: number, customY: number) => {
      if (!selected) return;
      const updated = {
        ...selected,
        imageConstraint: { ...selected.imageConstraint, customX, customY },
      };
      handleUpdateVariant(selectedIndex, updated);
    },
    [selected, selectedIndex]
  );

  const handleFieldSelect = useCallback(
    (field: CTTextField, value: string) => {
      if (!selected) return;
      const updated = { ...selected, [field]: value };
      handleUpdateVariant(selectedIndex, updated);
      setPopover(null);
    },
    [selected, selectedIndex]
  );

  const handleGroupSelect = useCallback(
    (line1Key: string, line1: string, line2Key: string, line2: string) => {
      if (!selected) return;
      const updated = { ...selected, [line1Key]: line1, [line2Key]: line2 };
      handleUpdateVariant(selectedIndex, updated);
      setPopover(null);
    },
    [selected, selectedIndex]
  );

  // 스와이프 핸들러
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) < 50) return;
    if (diff > 0 && selectedIndex < variants.length - 1) {
      setSelectedIndex(selectedIndex + 1);
    } else if (diff < 0 && selectedIndex > 0) {
      setSelectedIndex(selectedIndex - 1);
    }
  };

  // 상태 메시지 (짧은 시간 표시 후 사라짐)
  const showStatus = (msg: string) => {
    setStatusMessage(msg);
  };
  const clearStatus = () => setStatusMessage(null);

  const handleSend = async (text: string, attachedImages?: AttachedImage[]) => {
    const applyImages = attachedImages?.filter((i) => i.option === "apply") || [];
    const editImages = attachedImages?.filter((i) => i.option === "edit") || [];
    const refImages = attachedImages?.filter((i) => i.option === "reference") || [];

    const directImageUrl = applyImages.length > 0 ? applyImages[0].previewUrl : "";

    setIsLoading(true);
    setGenStatus("문구 생성 중...");
    showStatus("문구 생성 중...");

    try {
      const firstApplyFile = applyImages[0]?.file;
      const [genRes, imageAnalysis] = await Promise.all([
        fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: text,
            currentVariants: variants.length > 0 ? variants : undefined,
          }),
        }),
        firstApplyFile ? analyzeImage(firstApplyFile) : Promise.resolve(null),
      ]);

      if (!genRes.ok) {
        const err = await genRes.json().catch(() => ({ error: "서버 오류" }));
        throw new Error(err.error || `HTTP ${genRes.status}`);
      }

      const data = await genRes.json();
      let newVariants: CTContent[] = data.variants.map((v: CTContent) => ({
        ...v,
        imageUrl: directImageUrl || v.imageUrl,
        ...(imageAnalysis && !imageAnalysis.isSmall
          ? { imageConstraint: { fit: "cover" as const, alignX: imageAnalysis.alignX, alignY: imageAnalysis.alignY } }
          : {}),
        ...(imageAnalysis && imageAnalysis.isSmall
          ? { imageConstraint: { fit: "contain" as const, alignX: "center" as const, alignY: "center" as const } }
          : {}),
      }));

      setVariants(newVariants);
      setSelectedIndex(0);
      showStatus("3가지 안을 만들었어요! 좌우로 넘겨보세요.");

      // 이미지 처리
      const needsImage = !newVariants.some((v) => v.imageUrl);

      if (refImages.length > 0 && needsImage) {
        setGenStatus("참고 이미지 기반 생성 중...");
        showStatus("참고 이미지 기반 생성 중...");
        try {
          const refBase64 = await fileToBase64(refImages[0].file);
          const imgRes = await fetch("/api/generate-image", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt: `${text}. 첨부된 이미지의 스타일과 분위기를 참고해서 새로운 이미지를 생성해줘.`,
              referenceImages: [{ data: refBase64, mimeType: refImages[0].file.type }],
              imageType: newVariants[0]?.imageType || "",
              copyContext: {
                nm1_label: newVariants[0]?.label || "",
                nm2_title: newVariants[0]?.titleLine1 || "",
                nm3_desc: newVariants[0]?.titleLine2 || "",
              },
            }),
          });
          if (imgRes.ok) {
            const imgData = await imgRes.json();
            if (imgData.image) {
              const genImgUrl = `data:${imgData.image.mimeType};base64,${imgData.image.data}`;
              newVariants = newVariants.map((v) => ({ ...v, imageUrl: genImgUrl }));
            }
          }
        } catch { /* 실패 시 무시 */ }
      }

      if (editImages.length > 0 && !newVariants.some((v) => v.imageUrl)) {
        setGenStatus("이미지 편집 중...");
        showStatus("이미지 편집 중...");
        try {
          const editBase64 = await fileToBase64(editImages[0].file);
          const imgRes = await fetch("/api/generate-image", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt: `${text}. 첨부된 이미지를 카드 배경에 적합하도록 편집/보정해줘. 텍스트가 올라갈 좌상단 영역은 깔끔하게 유지.`,
              referenceImages: [{ data: editBase64, mimeType: editImages[0].file.type }],
              imageType: newVariants[0]?.imageType || "",
              copyContext: {
                nm1_label: newVariants[0]?.label || "",
                nm2_title: newVariants[0]?.titleLine1 || "",
                nm3_desc: newVariants[0]?.titleLine2 || "",
              },
            }),
          });
          if (imgRes.ok) {
            const imgData = await imgRes.json();
            if (imgData.image) {
              const editImgUrl = `data:${imgData.image.mimeType};base64,${imgData.image.data}`;
              newVariants = newVariants.map((v) => ({ ...v, imageUrl: editImgUrl }));
            }
          }
        } catch { /* 실패 시 무시 */ }
      }

      if (!newVariants.some((v) => v.imageUrl)) {
        setGenStatus("이미지 고민 중...");
        showStatus("이미지 검색 중...");

        let imageFound = false;
        try {
          const assetRes = await fetch("/api/search-asset", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: text }),
          });
          if (assetRes.ok) {
            const assetData = await assetRes.json();
            if (assetData.results?.length > 0) {
              const foundUrl = assetData.results[0].imgUrl;
              newVariants = newVariants.map((v) => ({ ...v, imageUrl: foundUrl }));
              imageFound = true;
            }
          }
        } catch { /* 에셋 검색 실패 */ }

        if (!imageFound) {
          setGenStatus("이미지 생성 중...");
          showStatus("AI로 이미지 생성 중...");
          try {
            const imgRes = await fetch("/api/generate-image", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                prompt: text,
                imageType: newVariants[0]?.imageType || "",
                copyContext: {
                  nm1_label: newVariants[0]?.label || "",
                  nm2_title: newVariants[0]?.titleLine1 || "",
                  nm3_desc: newVariants[0]?.titleLine2 || "",
                },
              }),
            });
            if (imgRes.ok) {
              const imgData = await imgRes.json();
              if (imgData.image) {
                const genImgUrl = `data:${imgData.image.mimeType};base64,${imgData.image.data}`;
                newVariants = newVariants.map((v) => ({ ...v, imageUrl: genImgUrl }));
              }
            }
          } catch { /* 이미지 생성 실패 */ }
        }
      }

      setVariants(newVariants);

      if (newVariants.some((v) => v.imageUrl) && needsImage) {
        showStatus("완성! 텍스트를 탭하면 수정할 수 있어요.");
      } else if (!newVariants.some((v) => v.imageUrl)) {
        showStatus("이미지 생성에 실패했어요. 이미지를 첨부해보세요.");
      } else if (imageAnalysis) {
        showStatus(imageAnalysis.isSmall ? "로고/아이콘 → 중앙 배치" : `AI 크롭: ${imageAnalysis.reason}`);
      } else {
        showStatus("완성! 텍스트를 탭하면 수정할 수 있어요.");
      }
    } catch (e) {
      showStatus(`오류: ${e instanceof Error ? e.message : "알 수 없는 오류"}`);
    } finally {
      setIsLoading(false);
      setGenStatus(null);
    }
  };

  async function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(",")[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

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

  const handleGenerateImage = async (prompt: string) => {
    setIsLoading(true);
    showStatus("이미지 생성 중...");

    try {
      const res = await fetch("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          imageType: variants[selectedIndex]?.imageType || "",
          copyContext: variants[selectedIndex] ? {
            nm1_label: variants[selectedIndex].label || "",
            nm2_title: variants[selectedIndex].titleLine1 || "",
            nm3_desc: variants[selectedIndex].titleLine2 || "",
          } : undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "서버 오류" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const dataUrl = `data:${data.image.mimeType};base64,${data.image.data}`;

      if (variants.length > 0) {
        const updated = variants.map((v) => ({ ...v, imageUrl: dataUrl }));
        setVariants(updated);
        showStatus("이미지 적용 완료!");
      } else {
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
        }
        showStatus("이미지 + 문구 생성 완료!");
      }
    } catch (e) {
      showStatus(`이미지 생성 실패: ${e instanceof Error ? e.message : "알 수 없는 오류"}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleMessage = async (text: string, images?: AttachedImage[]) => {
    const imageKeywords = ["이미지 생성", "이미지 만들", "배경 생성", "배경 만들", "그림 그려", "이미지도 생성"];
    const isImageRequest = imageKeywords.some((kw) => text.includes(kw));

    if (isImageRequest && (!images || images.length === 0)) {
      await handleGenerateImage(text);
    } else {
      await handleSend(text, images);
    }
  };

  const PRESETS = [
    "스타벅스 브랜드 혜택 카드",
    "Amex 도쿄 다이닝 혜택",
    "맞춤 혜택 추천 마켓컬리",
    "현대카드 Boutique 소개",
    "자동차담보대출 안내",
  ];

  return (
    <div className="h-screen flex items-center justify-center bg-gray-100">
      <div className="w-[375px] h-full max-h-[812px] flex flex-col bg-gray-50 overflow-hidden shadow-2xl rounded-none sm:rounded-[2rem] sm:border sm:border-gray-200 relative">

        {/* 메인: 디바이스 목업 (스와이프 영역) */}
        <div
          className="flex-1 flex flex-col items-center justify-start pt-4 overflow-hidden"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <DeviceViewer
            content={selected || EMPTY_CONTENT}
            onFieldClick={hasCanvas ? handleFieldClick : undefined}
            onImageDrag={hasCanvas ? handleImageDrag : undefined}
            scale={0.72}
          />
          {/* 안 인디케이터 (dots) */}
          {hasCanvas && (
            <>
              <div className="flex items-center gap-3 mt-3">
                {variants.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedIndex(i)}
                    className={`transition-all ${
                      i === selectedIndex
                        ? "w-6 h-2 rounded-full bg-gray-900"
                        : "w-2 h-2 rounded-full bg-gray-300"
                    }`}
                  />
                ))}
              </div>
              <span className="text-xs text-gray-400 mt-1">
                {["A안", "B안", "C안"][selectedIndex]}
              </span>
            </>
          )}
        </div>

        {/* 하단 플로팅 레이어 */}
        <div className="absolute bottom-0 left-0 right-0 z-10">
          {/* 그라데이션 페이드 */}
          <div className="h-8 bg-gradient-to-t from-gray-50 to-transparent pointer-events-none" />

          <div className="bg-gray-50 px-4 pb-6 pt-1 space-y-2">
            {/* 프리셋 버튼 (카드 없을 때만) */}
            {!hasCanvas && !isLoading && (
              <div className="flex flex-wrap gap-1.5 justify-center pb-1">
                {PRESETS.map((example) => (
                  <button
                    key={example}
                    onClick={() => handleMessage(example)}
                    className="px-3 py-1.5 text-xs text-gray-500 bg-white border border-gray-200 rounded-full hover:bg-gray-100 transition-colors"
                  >
                    {example}
                  </button>
                ))}
              </div>
            )}

            {/* AI 상태 메시지 */}
            {statusMessage && (
              <div className="flex items-center gap-2 px-1">
                {isLoading && (
                  <div className="w-3.5 h-3.5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin shrink-0" />
                )}
                <p className="text-xs text-gray-500 leading-relaxed">{statusMessage}</p>
                {!isLoading && (
                  <button onClick={clearStatus} className="text-gray-300 hover:text-gray-500 ml-auto shrink-0">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </div>
            )}

            {/* 입력창 */}
            <ChatInput onSubmit={handleMessage} disabled={isLoading} autoFocus />
          </div>
        </div>

        {/* 필드 수정안 팝오버 */}
        {popover && selected && (
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
    </div>
  );
}
