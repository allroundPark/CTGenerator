"use client";

import { useState, useRef } from "react";
import { CTContent, AttachedImage, BgTreatment, ImageConstraint } from "@/types/ct";
import ChatInput from "@/components/ChatInput";
import DeviceViewer from "@/components/DeviceViewer";

// ── 필드 풀 타입 ──
interface CopyOption {
  label: string;
  titleLine1: string;
  titleLine2: string;
}
interface SubOption {
  subLine1: string;
  subLine2: string;
}
interface ImageOption {
  imageUrl: string;
  textColor: "BK" | "WT";
  bgTreatment: BgTreatment;
  imageConstraint: ImageConstraint;
  imageType?: string;
}

const EMPTY_CONTENT: CTContent = {
  id: "empty", label: "", titleLine1: "", titleLine2: "",
  subLine1: "", subLine2: "", imageUrl: "",
  imageConstraint: { fit: "cover", alignX: "center", alignY: "center" },
  textColor: "WT", bgTreatment: { type: "none" },
};

export default function Home() {
  // 필드 풀
  const [copyPool, setCopyPool] = useState<CopyOption[]>([]);
  const [subPool, setSubPool] = useState<SubOption[]>([]);
  const [imagePool, setImagePool] = useState<ImageOption[]>([]);

  // 선택 인덱스 (각 풀에서 현재 선택된 옵션)
  const [selCopy, setSelCopy] = useState(0);
  const [selSub, setSelSub] = useState(0);
  const [selImage, setSelImage] = useState(0);

  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // 변주 로딩 상태
  const [variatingField, setVariatingField] = useState<"copy" | "sub" | "image" | null>(null);

  const hasContent = copyPool.length > 0;

  // ── 현재 선택 조합 → CTContent ──
  const composite: CTContent = hasContent ? {
    id: "composite",
    ...(copyPool[selCopy] || copyPool[0]),
    ...(subPool[selSub] || subPool[0]),
    imageUrl: imagePool[selImage]?.imageUrl || "",
    textColor: imagePool[selImage]?.textColor || "WT",
    bgTreatment: imagePool[selImage]?.bgTreatment || { type: "none" },
    imageConstraint: imagePool[selImage]?.imageConstraint || { fit: "cover", alignX: "center", alignY: "center" },
    imageType: imagePool[selImage]?.imageType,
  } : EMPTY_CONTENT;

  const showStatus = (msg: string) => setStatusMessage(msg);
  const clearStatus = () => setStatusMessage(null);

  // ── 풀에 항목 추가 (기존에 append) ──
  const appendToPool = (variants: CTContent[], imageUrl?: string) => {
    const newCopies: CopyOption[] = [];
    const newSubs: SubOption[] = [];

    variants.forEach((v) => {
      newCopies.push({ label: v.label, titleLine1: v.titleLine1, titleLine2: v.titleLine2 });
      newSubs.push({ subLine1: v.subLine1, subLine2: v.subLine2 });
    });

    setCopyPool((prev) => [...prev, ...newCopies]);
    setSubPool((prev) => [...prev, ...newSubs]);

    // 이미지는 공유 — 하나만 추가 (중복 방지)
    const imgUrl = imageUrl || variants[0]?.imageUrl;
    if (imgUrl) {
      const v = variants[0];
      setImagePool((prev) => {
        if (prev.some((p) => p.imageUrl === imgUrl)) return prev;
        return [...prev, {
          imageUrl: imgUrl,
          textColor: v.textColor || "WT",
          bgTreatment: v.bgTreatment || { type: "none" },
          imageConstraint: v.imageConstraint || { fit: "cover", alignX: "center", alignY: "center" },
          imageType: v.imageType,
        }];
      });
    }

    // 첫 생성이면 첫 번째로 선택
    if (copyPool.length === 0) {
      setSelCopy(0);
      setSelSub(0);
      setSelImage(0);
    }
  };

  // ── 이미지 풀에 추가 ──
  const addImageToPool = (imageUrl: string, textColor?: "BK" | "WT", bgTreatment?: BgTreatment) => {
    setImagePool((prev) => [...prev, {
      imageUrl,
      textColor: textColor || composite.textColor,
      bgTreatment: bgTreatment || composite.bgTreatment,
      imageConstraint: { fit: "cover", alignX: "center", alignY: "center" },
    }]);
    // 새 이미지를 자동 선택
    setSelImage(imagePool.length);
  };

  // ── 메인 생성 ──
  const handleSend = async (text: string, attachedImages?: AttachedImage[]) => {
    const applyImages = attachedImages?.filter((i) => i.option === "apply") || [];
    const editImages = attachedImages?.filter((i) => i.option === "edit") || [];
    const refImages = attachedImages?.filter((i) => i.option === "reference") || [];

    const directImageUrl = applyImages.length > 0 ? applyImages[0].previewUrl : "";

    setIsLoading(true);
    showStatus("문구 생성 중...");

    try {
      // STEP 1: 문구 생성
      const firstApplyFile = applyImages[0]?.file;
      const [genRes, imageAnalysis] = await Promise.all([
        fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: text }),
        }),
        firstApplyFile ? analyzeImage(firstApplyFile) : Promise.resolve(null),
      ]);

      if (!genRes.ok) {
        const err = await genRes.json().catch(() => ({ error: "서버 오류" }));
        throw new Error(err.error || `HTTP ${genRes.status}`);
      }

      const data = await genRes.json();
      const newVariants: CTContent[] = data.variants.map((v: CTContent) => ({
        ...v,
        imageUrl: directImageUrl || v.imageUrl,
        ...(imageAnalysis && !imageAnalysis.isSmall
          ? { imageConstraint: { fit: "cover" as const, alignX: imageAnalysis.alignX, alignY: imageAnalysis.alignY } }
          : {}),
        ...(imageAnalysis && imageAnalysis.isSmall
          ? { imageConstraint: { fit: "contain" as const, alignX: "center" as const, alignY: "center" as const } }
          : {}),
      }));

      appendToPool(newVariants, directImageUrl);
      showStatus("문구 3안 추가! 각 영역을 넘겨서 조합해보세요.");

      // STEP 2: 이미지 처리
      if (!directImageUrl) {
        let foundImageUrl = "";

        // 참고 이미지
        if (refImages.length > 0) {
          showStatus("참고 이미지 기반 생성 중...");
          foundImageUrl = await generateImage(text, refImages[0], newVariants[0], "reference") || "";
        }
        // 편집 이미지
        if (!foundImageUrl && editImages.length > 0) {
          showStatus("이미지 편집 중...");
          foundImageUrl = await generateImage(text, editImages[0], newVariants[0], "edit") || "";
        }
        // 에셋 검색 → AI 생성
        if (!foundImageUrl) {
          showStatus("이미지 검색 중...");
          foundImageUrl = await searchAsset(text) || "";
          if (!foundImageUrl) {
            showStatus("AI로 이미지 생성 중...");
            foundImageUrl = await generateImageFromPrompt(text, newVariants[0]) || "";
          }
        }

        if (foundImageUrl) {
          addImageToPool(foundImageUrl, newVariants[0].textColor, newVariants[0].bgTreatment);
        }
      }

      showStatus(imagePool.length > 0 || directImageUrl
        ? "완성! 각 영역을 넘기면서 조합해보세요."
        : "문구는 완성! 이미지를 첨부하거나 생성 요청해보세요.");
    } catch (e) {
      showStatus(`오류: ${e instanceof Error ? e.message : "알 수 없는 오류"}`);
    } finally {
      setIsLoading(false);
    }
  };

  // ── 변주 (필드별 대안 추가) ──
  const handleVariate = async (field: "copy" | "sub" | "image") => {
    setVariatingField(field);

    try {
      if (field === "copy" || field === "sub") {
        const res = await fetch("/api/suggest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            field: field === "copy" ? "title" : "sub",
            content: composite,
          }),
        });
        if (!res.ok) throw new Error("대안 생성 실패");
        const data = await res.json();

        if (field === "copy" && Array.isArray(data.suggestions)) {
          // title 그룹: [[line1, line2], ...]
          const newCopies: CopyOption[] = data.suggestions.map((s: [string, string]) => ({
            label: composite.label,
            titleLine1: s[0],
            titleLine2: s[1],
          }));
          setCopyPool((prev) => [...prev, ...newCopies]);
          setSelCopy(copyPool.length); // 새 첫 번째로 이동
        } else if (field === "sub" && Array.isArray(data.suggestions)) {
          const newSubs: SubOption[] = data.suggestions.map((s: [string, string]) => ({
            subLine1: s[0],
            subLine2: s[1],
          }));
          setSubPool((prev) => [...prev, ...newSubs]);
          setSelSub(subPool.length);
        }
      } else {
        // 이미지 변주: 새 이미지 생성
        showStatus("새 이미지 생성 중...");
        const imgUrl = await generateImageFromPrompt(
          `${composite.label} ${composite.titleLine1} ${composite.titleLine2}`,
          composite
        );
        if (imgUrl) {
          addImageToPool(imgUrl);
        }
      }
    } catch {
      showStatus("변주 생성에 실패했어요.");
    } finally {
      setVariatingField(null);
    }
  };

  // ── 헬퍼 함수들 ──
  async function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(",")[1]);
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
    } catch { return null; }
  }

  async function generateImage(
    text: string,
    attachedImg: AttachedImage,
    variant: CTContent,
    mode: "reference" | "edit"
  ): Promise<string | null> {
    try {
      const base64 = await fileToBase64(attachedImg.file);
      const prompt = mode === "reference"
        ? `${text}. 첨부된 이미지의 스타일과 분위기를 참고해서 새로운 이미지를 생성해줘.`
        : `${text}. 첨부된 이미지를 카드 배경에 적합하도록 편집/보정해줘.`;
      const res = await fetch("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          referenceImages: [{ data: base64, mimeType: attachedImg.file.type }],
          imageType: variant.imageType || "",
          copyContext: { nm1_label: variant.label, nm2_title: variant.titleLine1, nm3_desc: variant.titleLine2 },
        }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.image ? `data:${data.image.mimeType};base64,${data.image.data}` : null;
    } catch { return null; }
  }

  async function searchAsset(query: string): Promise<string | null> {
    try {
      const res = await fetch("/api/search-asset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.results?.[0]?.imgUrl || null;
    } catch { return null; }
  }

  async function generateImageFromPrompt(prompt: string, variant: CTContent): Promise<string | null> {
    try {
      const res = await fetch("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          imageType: variant.imageType || "",
          copyContext: { nm1_label: variant.label, nm2_title: variant.titleLine1, nm3_desc: variant.titleLine2 },
        }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.image ? `data:${data.image.mimeType};base64,${data.image.data}` : null;
    } catch { return null; }
  }

  const handleMessage = async (text: string, images?: AttachedImage[]) => {
    const imageKeywords = ["이미지 생성", "이미지 만들", "배경 생성", "배경 만들", "그림 그려", "이미지도 생성"];
    const isImageOnly = imageKeywords.some((kw) => text.includes(kw)) && (!images || images.length === 0);

    if (isImageOnly) {
      setIsLoading(true);
      showStatus("이미지 생성 중...");
      try {
        const imgUrl = await generateImageFromPrompt(text, composite);
        if (imgUrl) addImageToPool(imgUrl);
        showStatus(imgUrl ? "이미지 추가 완료!" : "이미지 생성에 실패했어요.");
      } finally {
        setIsLoading(false);
      }
    } else {
      await handleSend(text, images);
    }
  };

  // ── 필드 셀렉터 네비게이션 ──
  const navField = (pool: unknown[], sel: number, setSel: (n: number) => void, dir: -1 | 1) => {
    const next = sel + dir;
    if (next >= 0 && next < pool.length) setSel(next);
  };

  const PRESETS = [
    "스타벅스 브랜드 혜택 카드",
    "Amex 도쿄 다이닝 혜택",
    "맞춤 혜택 추천 마켓컬리",
    "현대카드 Boutique 소개",
    "자동차담보대출 안내",
  ];

  return (
    <div className="h-[100dvh] flex items-center justify-center bg-gray-100">
      <div className="w-full h-full sm:w-[375px] sm:max-h-[812px] flex flex-col bg-gray-50 overflow-hidden sm:shadow-2xl sm:rounded-[2rem] sm:border sm:border-gray-200 relative">

        {/* 메인: 디바이스 목업 */}
        <div className="flex-1 flex flex-col items-center justify-start pt-4 overflow-hidden">
          <DeviceViewer
            content={composite}
            scale={0.72}
          />
        </div>

        {/* 하단 플로팅 */}
        <div className="absolute bottom-0 left-0 right-0 z-10">
          <div className="h-6 bg-gradient-to-t from-gray-50 to-transparent pointer-events-none" />

          <div className="bg-gray-50 px-4 pb-5 sm:pb-5 pt-0 space-y-1.5" style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}>
            {/* 필드 셀렉터 (콘텐츠 있을 때) */}
            {hasContent && (
              <div className="space-y-1">
                <FieldSelector
                  label="상단"
                  index={selCopy}
                  total={copyPool.length}
                  preview={`${copyPool[selCopy]?.label} · ${copyPool[selCopy]?.titleLine1}`}
                  onPrev={() => navField(copyPool, selCopy, setSelCopy, -1)}
                  onNext={() => navField(copyPool, selCopy, setSelCopy, 1)}
                  onVariate={() => handleVariate("copy")}
                  isVariating={variatingField === "copy"}
                />
                <FieldSelector
                  label="이미지"
                  index={selImage}
                  total={imagePool.length}
                  preview={imagePool[selImage]?.imageUrl ? `이미지 ${selImage + 1}` : "없음"}
                  onPrev={() => navField(imagePool, selImage, setSelImage, -1)}
                  onNext={() => navField(imagePool, selImage, setSelImage, 1)}
                  onVariate={() => handleVariate("image")}
                  isVariating={variatingField === "image"}
                />
                <FieldSelector
                  label="하단"
                  index={selSub}
                  total={subPool.length}
                  preview={subPool[selSub]?.subLine1 || ""}
                  onPrev={() => navField(subPool, selSub, setSelSub, -1)}
                  onNext={() => navField(subPool, selSub, setSelSub, 1)}
                  onVariate={() => handleVariate("sub")}
                  isVariating={variatingField === "sub"}
                />
              </div>
            )}

            {/* 프리셋 (첫 화면) */}
            {!hasContent && !isLoading && (
              <div className="flex flex-wrap gap-1.5 justify-center pb-1">
                {PRESETS.map((p) => (
                  <button
                    key={p}
                    onClick={() => handleMessage(p)}
                    className="px-3 py-1.5 text-xs text-gray-500 bg-white border border-gray-200 rounded-full hover:bg-gray-100 transition-colors"
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}

            {/* 상태 메시지 */}
            {statusMessage && (
              <div className="flex items-center gap-2 px-1">
                {isLoading && (
                  <div className="w-3 h-3 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin shrink-0" />
                )}
                <p className="text-xs text-gray-500">{statusMessage}</p>
                {!isLoading && (
                  <button onClick={clearStatus} className="text-gray-300 hover:text-gray-500 ml-auto shrink-0">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
      </div>
    </div>
  );
}

// ── 필드 셀렉터 컴포넌트 ──
function FieldSelector({
  label,
  index,
  total,
  preview,
  onPrev,
  onNext,
  onVariate,
  isVariating,
}: {
  label: string;
  index: number;
  total: number;
  preview: string;
  onPrev: () => void;
  onNext: () => void;
  onVariate: () => void;
  isVariating: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5 h-8">
      <span className="text-[10px] text-gray-400 w-8 shrink-0">{label}</span>

      {/* < */}
      <button
        onClick={onPrev}
        disabled={index === 0}
        className="w-6 h-6 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-900 disabled:opacity-20 transition-colors"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>

      {/* 프리뷰 */}
      <div className="flex-1 text-xs text-gray-700 truncate text-center">
        {preview}
        <span className="text-gray-300 ml-1">{index + 1}/{total}</span>
      </div>

      {/* > */}
      <button
        onClick={onNext}
        disabled={index >= total - 1}
        className="w-6 h-6 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-900 disabled:opacity-20 transition-colors"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>

      {/* 변주 버튼 */}
      <button
        onClick={onVariate}
        disabled={isVariating}
        className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 hover:bg-gray-200 hover:text-gray-600 disabled:opacity-40 transition-colors shrink-0"
        title="변주 생성"
      >
        {isVariating ? (
          <div className="w-3 h-3 border-[1.5px] border-gray-300 border-t-gray-600 rounded-full animate-spin" />
        ) : (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        )}
      </button>
    </div>
  );
}
