"use client";

import { useState, useRef, useCallback } from "react";
import {
  CTContent,
  AttachedImage,
  BrandContext,
  ContentSpec,
  EMPTY_SPEC,
} from "@/types/ct";
import { useChatMessages } from "./useChatMessages";
import { useCardPools } from "./useCardPools";
import {
  extractSpec,
  orchestrate,
  classifyByDiff,
  searchBrand,
  generateText,
  generateParallelImages,
  suggestField,
  suggestContent,
  type ExtractAction,
} from "@/lib/orchestrate";
import { matchDemoScenario, loadDemoCache } from "@/lib/demoCache";
import { getKnownBrandContext } from "@/lib/imagePrompt";
import { supabase } from "@/lib/supabase";
import { getDeviceId } from "@/lib/deviceId";

export function useOrchestrate(apiFetch: (url: string, init?: RequestInit) => Promise<Response>) {
  // ── 내부 훅 ──
  const chat = useChatMessages();
  const pools = useCardPools();

  // ── Orchestrate 상태 ──
  const [contentSpec, setContentSpec] = useState<ContentSpec>({ ...EMPTY_SPEC });
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [brandCtx, setBrandCtx] = useState<BrandContext | null>(null);
  const [chatPlaceholder, setChatPlaceholder] = useState("만들고 싶은 콘텐츠를 알려주세요");
  const [highlightAttach, setHighlightAttach] = useState(false);
  const [variatingField, setVariatingField] = useState<"copy" | "sub" | "image" | null>(null);
  const [variateInput, setVariateInput] = useState<"copy" | "sub" | "image" | null>(null);

  // 옵션 선택 시 원본 이미지 복원용
  const lastAttachedImagesRef = useRef<AttachedImage[] | null>(null);

  const showStatus = (msg: string) => setStatusMessage(msg);

  // ── 로그 ──
  const logToSupabase = (data: Record<string, unknown>) => {
    supabase
      .from("ct_logs")
      .insert({ device_id: getDeviceId(), ...data })
      .then(({ error }) => {
        if (error) console.error("[log] insert error:", error);
      });
  };

  // ── 헬퍼 ──
  async function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /** 이미지를 maxSize로 리사이즈 후 base64 반환 (Gemini 전송 최적화) */
  async function fileToResizedBase64(file: File, maxSize = 1024): Promise<{ data: string; mimeType: string }> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let w = img.width, h = img.height;
        if (w > maxSize || h > maxSize) {
          const scale = maxSize / Math.max(w, h);
          w = Math.round(w * scale);
          h = Math.round(h * scale);
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
        resolve({
          data: dataUrl.split(",")[1],
          mimeType: "image/jpeg",
        });
        URL.revokeObjectURL(img.src);
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  async function imageUrlToBase64(
    url: string,
  ): Promise<{ data: string; mimeType: string } | null> {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const blob = await res.blob();
      const buffer = await blob.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i += 8192) {
        binary += String.fromCharCode(...bytes.slice(i, i + 8192));
      }
      return { data: btoa(binary), mimeType: blob.type || "image/png" };
    } catch {
      return null;
    }
  }

  async function generateImage(
    text: string,
    attachedImg: AttachedImage,
    variant: CTContent,
    mode: "reference" | "edit",
    errors?: string[],
  ): Promise<string | null> {
    try {
      const base64 = await fileToBase64(attachedImg.file);
      const prompt =
        mode === "reference"
          ? `${text}. 첨부된 이미지의 스타일과 분위기를 참고해서 새로운 이미지를 생성해줘.`
          : `${text}. 첨부된 이미지를 카드 배경에 적합하도록 편집/보정해줘.`;
      const res = await apiFetch("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          referenceImages: [{ data: base64, mimeType: attachedImg.file.type }],
          imageType: variant.imageType || "",
          copyContext: {
            nm1_label: variant.label,
            nm2_title: variant.titleLine1,
            nm3_desc: variant.titleLine2,
          },
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ error: res.statusText }));
        errors?.push(`${res.status}: ${errBody.error || res.statusText}`);
        return null;
      }
      const data = await res.json();
      return data.image
        ? `data:${data.image.mimeType};base64,${data.image.data}`
        : null;
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : "알 수 없는 오류";
      errors?.push(errMsg);
      return null;
    }
  }

  // ── 바텀시트 올리기 콜백 (page.tsx에서 주입) ──
  const raiseSheetRef = useRef<() => void>(() => {});
  const setRaiseSheet = useCallback((fn: () => void) => {
    raiseSheetRef.current = fn;
  }, []);
  const raiseSheet = () => raiseSheetRef.current();

  // ── handleModification: 수정 플로우 (contentSpec diff 기반) ──
  // 반환값: intent (new/all이면 handleSend에서 firstGeneration 호출)
  const handleModification = async (
    text: string,
    attachedImages?: AttachedImage[],
  ): Promise<string> => {
    const { composite } = pools;
    const applyImages = attachedImages?.filter((i) => i.option === "apply") || [];
    const editImages = attachedImages?.filter((i) => i.option === "edit") || [];
    const refImages = attachedImages?.filter((i) => i.option === "reference") || [];

    // extract-spec으로 수정 의도 추출
    showStatus("요청 분석 중...");
    console.log(`[handleModification] text="${text.slice(0, 50)}", hasImages=${!!attachedImages}, applyImages=${applyImages.length}, editImages=${editImages.length}`);
    const { extracted, action } = await extractSpec(text, contentSpec, apiFetch);
    // action을 기존 intent 형태로 매핑
    const intentMap: Record<string, string> = {
      edit_image: "image", edit_copy: "copy", edit_sub: "sub",
      generate: "new", need_info: "image",
    };
    const intent = intentMap[action] || classifyByDiff(extracted, text);
    console.log(`[handleModification] action="${action}", intent="${intent}", extracted=`, extracted);

    // spec 업데이트
    if (Object.keys(extracted).length > 0) {
      setContentSpec((prev) => ({ ...prev, ...extracted }));
    }

    logToSupabase({
      message: text,
      intent,
      attached_images_count: attachedImages?.length || 0,
    });

    if (intent === "image") {
      showStatus("이미지 수정 중...");
      const prompt = text || `${composite.label} ${composite.titleLine1} ${composite.titleLine2}`;
      let foundImageUrl = "";
      const imgErrors: string[] = [];
      if (refImages.length > 0) {
        foundImageUrl = (await generateImage(text, refImages[0], composite, "reference", imgErrors)) || "";
      } else if (editImages.length > 0) {
        foundImageUrl = (await generateImage(text, editImages[0], composite, "edit", imgErrors)) || "";
      } else if (applyImages.length > 0) {
        showStatus("첨부 이미지 보정 중...");
        const b64 = await fileToBase64(applyImages[0].file);
        const applyImageData = { data: b64, mimeType: applyImages[0].file.type || "image/jpeg" };
        const results = await generateParallelImages(
          text || prompt,
          composite,
          brandCtx,
          { count: 1, enhance: true, referenceImages: [applyImageData] },
          apiFetch,
          imgErrors,
        );
        foundImageUrl = results[0] || "";
      } else {
        // 수정 전용 모드: 현재 이미지 기반 3안 생성
        const currentImg = pools.imagePool[pools.selImage];
        const currentImgUrl = currentImg?.imageUrl;
        let refImgs: { data: string; mimeType: string }[] | undefined;
        if (currentImgUrl) {
          const imgData = await imageUrlToBase64(currentImgUrl);
          if (imgData) refImgs = [imgData];
        }
        const results = await generateParallelImages(
          text,
          composite,
          brandCtx,
          {
            count: 3,
            referenceImages: refImgs,
            edit: true,
            originalPrompt: currentImg?.generationPrompt,
          },
          apiFetch,
          imgErrors,
        );
        results.forEach((imgUrl, i) => {
          if (imgUrl) {
            pools.addImageToPool(imgUrl, composite.textColor, composite.bgTreatment, {
              generationPrompt: currentImg?.generationPrompt,
              generationStyle: currentImg?.generationStyle,
              generationVariation: i,
            });
          }
        });
        foundImageUrl = results.find((r) => r !== null) || "";
      }
      const editCount = foundImageUrl ? 1 : 0; // 최소 1개 성공 여부
      showStatus(foundImageUrl ? "이미지 수정 완료!" : "");
      const failDetail = imgErrors.length > 0 ? ` (${imgErrors[0]})` : "";
      chat.addMessage({
        role: "assistant",
        content: foundImageUrl
          ? "이미지 수정안을 만들었어요! 스와이프해서 비교해보세요."
          : `이미지 수정에 실패했어요.${failDetail}`,
      });
      return intent;
    }

    if (intent === "copy") {
      showStatus("상단 문구 생성 중...");
      const suggestions = await suggestField("title", composite, text, apiFetch);
      if (suggestions.length > 0) {
        pools.addCopyOptions(
          suggestions.map((s) => ({
            label: composite.label,
            titleLine1: s[0],
            titleLine2: s[1],
          })),
        );
      }
      showStatus("상단 문구 추가 완료!");
      chat.addMessage({
        role: "assistant",
        content: "상단 문구를 추가했어요! 스와이프해서 확인해보세요.",
      });
      return intent;
    }

    if (intent === "sub") {
      showStatus("하단 문구 생성 중...");
      const suggestions = await suggestField("sub", composite, text, apiFetch);
      if (suggestions.length > 0) {
        pools.addSubOptions(
          suggestions.map((s) => ({ subLine1: s[0], subLine2: s[1] })),
        );
      }
      showStatus("하단 문구 추가 완료!");
      chat.addMessage({
        role: "assistant",
        content: "하단 문구를 추가했어요! 스와이프해서 확인해보세요.",
      });
      return intent;
    }

    // intent === "new" or "all" → 풀 초기화 후 전체 재생성
    pools.resetPools();
    setBrandCtx(null);
    // 리턴하지 않음 — handleSend에서 intent를 확인하여 firstGeneration 호출
    return intent;
  };

  // ── handleFirstGeneration: 첫 생성 ──
  const handleFirstGeneration = async (
    text: string,
    attachedImages?: AttachedImage[],
  ) => {
    const applyImages = attachedImages?.filter((i) => i.option === "apply") || [];
    const editImages = attachedImages?.filter((i) => i.option === "edit") || [];
    const refImages = attachedImages?.filter((i) => i.option === "reference") || [];

    // 이미지+텍스트 동시 첨부 시: extract-spec으로 의도 파악 → edit/enhance 분기
    const hasAttachedImages = applyImages.length > 0 || editImages.length > 0 || refImages.length > 0;
    console.log(`[handleFirstGeneration] text="${text.slice(0, 50)}", hasAttachedImages=${hasAttachedImages}, applyImages=${applyImages.length}`);
    if (hasAttachedImages && text) {
      showStatus("요청 분석 중...");
      const { extracted, action } = await extractSpec(text, contentSpec, apiFetch);
      console.log(`[handleFirstGeneration] extract action="${action}", extracted=`, extracted);
      if (Object.keys(extracted).length > 0) {
        setContentSpec((prev) => ({ ...prev, ...extracted }));
      }
      // LLM이 이미지 수정 의도로 판단했거나, 키워드 매칭
      const isImageEdit = action === "edit_image" || !!extracted.imageStyle ||
        /바꿔|변경|수정|톤|밝게|어둡게|색감|분위기|초록|파란|빨간|노란|보라|핑크/.test(text);
      console.log(`[handleFirstGeneration] isImageEdit=${isImageEdit}, action=${action}, imageStyle=${extracted.imageStyle}`);
      if (isImageEdit) {
        // 이미지 수정 + 문구 생성 병렬 진행 (에러 내부 처리, 재시도 방지)
        try {
          showStatus("이미지 수정 & 문구 생성 중...");
          const imgErrors: string[] = [];
          const targetImg = applyImages[0] || editImages[0];
          // 리사이즈해서 전송 (833kb→~100kb, Gemini 처리 시간 대폭 절감)
          const resized = await fileToResizedBase64(targetImg.file, 1024);
          const refData = [resized];

          // 이미지 수정 3안 + 문구 생성을 병렬로
          const editPromise = generateParallelImages(
            text,
            { imageType: "" } as CTContent,
            brandCtx,
            { count: 3, edit: true, referenceImages: refData },
            apiFetch,
            imgErrors,
          );

          // 브랜드 검색 + 문구 생성
          const specForText = { ...contentSpec, ...extracted };
          const knownBrand = getKnownBrandContext(specForText.brand || text);
          const brandSearchResult = knownBrand ? null : await searchBrand(specForText.brand || text, apiFetch);
          const activeBrandCtx: BrandContext | null = knownBrand
            ? ({ ...knownBrand, mascotName: null, mascotDescription: null, mascotImage: null } as BrandContext)
            : brandSearchResult;
          if (activeBrandCtx) setBrandCtx(activeBrandCtx);

          const textPrompt = [specForText.brand, specForText.content].filter(Boolean).join(" ") || text;
          const newVariants = await generateText(textPrompt, activeBrandCtx, apiFetch);
          pools.appendToPool(newVariants);

          // 이미지 수정 3안 결과 대기
          const editResults = await editPromise;
          let editCount = 0;
          editResults.forEach((imgUrl, i) => {
            if (imgUrl) {
              const variant = newVariants[0];
              pools.addImageToPool(imgUrl, variant?.textColor, variant?.bgTreatment, {
                generationPrompt: text,
                generationStyle: "realistic",
                generationVariation: i,
              });
              editCount++;
            }
          });

          const failDetail = editCount === 0 && imgErrors.length > 0 ? ` (${imgErrors[0]})` : "";
          chat.addMessage({
            role: "assistant",
            content: editCount > 0
              ? `이미지 ${editCount}안을 만들었어요! 스와이프해서 비교해보세요.`
              : `문구는 완성! 이미지 수정에 실패했어요.${failDetail}`,
            showReport: editCount > 0,
          });
        } catch (e) {
          console.error("[handleFirstGeneration] isImageEdit error:", e);
          const msg = e instanceof Error ? e.message : "알 수 없는 오류";
          chat.addMessage({
            role: "assistant",
            content: `이미지 수정에 실패했어요. (${msg})`,
          });
        }
        return;
      }
    }

    let applyImageData: { data: string; mimeType: string } | null = null;
    if (applyImages.length > 0) {
      const b64 = await fileToBase64(applyImages[0].file);
      applyImageData = { data: b64, mimeType: applyImages[0].file.type || "image/jpeg" };
    }

    showStatus(
      applyImageData
        ? "이미지 보정 & 문구 생성 중..."
        : "브랜드 검색 & 문구 생성 중...",
    );

    // 바로적용 이미지 병렬 시작
    let imagePromise: Promise<void> | null = null;
    let generatedCount = 0;
    const imgErrors: string[] = [];

    if (applyImageData) {
      const attachedRefData = [applyImageData];
      imagePromise = (async () => {
        showStatus("첨부 이미지 보정 중...");
        const results = await generateParallelImages(
          text,
          { imageType: "" } as CTContent,
          null,
          { count: 3, enhance: true, referenceImages: attachedRefData },
          apiFetch,
          imgErrors,
        );
        results.forEach((imgUrl, i) => {
          if (imgUrl) {
            pools.addImageToPool(imgUrl, undefined, undefined, {
              generationPrompt: text,
              generationStyle: "realistic",
              generationVariation: i,
            });
            generatedCount++;
          }
        });
      })();
    }

    // 브랜드 검색
    const knownBrand = getKnownBrandContext(text);
    const brandSearchResult = knownBrand ? null : await searchBrand(text, apiFetch);
    const activeBrandCtx: BrandContext | null = knownBrand
      ? ({
          ...knownBrand,
          mascotName: null,
          mascotDescription: null,
          mascotImage: null,
        } as BrandContext)
      : brandSearchResult;
    if (activeBrandCtx) {
      setBrandCtx(activeBrandCtx);
      showStatus(`"${activeBrandCtx.brandName}" 정보 확인! 문구 생성 중...`);
    } else {
      showStatus("문구 생성 중...");
    }

    // 문구 생성 — 이미지만 첨부된 경우 이미지 분석 결과를 프롬프트에 추가
    let textPrompt = text;
    if (applyImageData && (!contentSpec.brand && !contentSpec.content)) {
      // 이미지만 있고 brand/content 없으면 → 이미지 기반으로 문구 유추
      textPrompt = `첨부된 이미지를 분석해서 이 이미지에 어울리는 카드 문구를 만들어줘. 이미지의 분위기, 색감, 주제를 파악해서 적절한 브랜드/혜택 문구를 생성해줘. 유저 요청: ${text}`;
    }
    const newVariants = await generateText(textPrompt, activeBrandCtx, apiFetch);
    pools.appendToPool(newVariants);

    logToSupabase({
      message: text,
      intent: "new",
      attached_images_count: attachedImages?.length || 0,
      variants: newVariants.map((v) => ({
        label: v.label,
        titleLine1: v.titleLine1,
        titleLine2: v.titleLine2,
        subLine1: v.subLine1,
        subLine2: v.subLine2,
        textColor: v.textColor,
        imageType: v.imageType,
      })),
      image_type: newVariants[0]?.imageType || null,
      brand_context: activeBrandCtx
        ? {
            brandName: activeBrandCtx.brandName,
            category: activeBrandCtx.category,
            primaryColor: activeBrandCtx.primaryColor,
          }
        : null,
    });

    // 이미지
    if (imagePromise) {
      await imagePromise;
      const enhanceFailDetail = generatedCount === 0 && imgErrors.length > 0 ? ` (${imgErrors[0]})` : "";
      showStatus(
        generatedCount > 0
          ? `이미지 ${generatedCount}장 보정 완료! 각 영역을 넘기면서 조합해보세요.`
          : `문구는 완성! 이미지 보정에 실패했어요.${enhanceFailDetail}`,
      );
    } else {
      let attachedRefData: { data: string; mimeType: string }[] | undefined;
      if (refImages.length > 0) {
        const b64 = await fileToBase64(refImages[0].file);
        attachedRefData = [{ data: b64, mimeType: refImages[0].file.type }];
      } else if (editImages.length > 0) {
        const b64 = await fileToBase64(editImages[0].file);
        attachedRefData = [{ data: b64, mimeType: editImages[0].file.type }];
      }

      showStatus("이미지 3장 동시 생성 중...");

      const results = await generateParallelImages(
        text,
        newVariants[0],
        activeBrandCtx,
        { count: 3, referenceImages: attachedRefData },
        apiFetch,
        imgErrors,
      );
      const STYLE_MAP: Array<"realistic" | "3d" | "2d"> = ["realistic", "3d", "2d"];
      results.forEach((imgUrl, i) => {
        if (imgUrl) {
          const variant = newVariants[i] || newVariants[0];
          pools.addImageToPool(imgUrl, variant.textColor, variant.bgTreatment, {
            generationPrompt: text,
            generationStyle: STYLE_MAP[i] || "realistic",
            generationVariation: i,
          });
          generatedCount++;
          if (i === 0) {
            logToSupabase({
              message: text,
              intent: "image_generated",
              image_generated: true,
              image_type: variant.imageType || null,
            });
          }
        }
      });

      const failDetail = generatedCount === 0 && imgErrors.length > 0 ? ` (${imgErrors[0]})` : "";
      showStatus(
        generatedCount > 0
          ? `이미지 ${generatedCount}장 생성 완료! 각 영역을 넘기면서 조합해보세요.`
          : `문구는 완성! 이미지 생성에 실패했어요.${failDetail}`,
      );
    }

    chat.addMessage({
      role: "assistant",
      content:
        generatedCount > 0
          ? "완성! 이상한 거 있으면 추가 요청해주세요."
          : "문구를 만들었어요! 이미지를 첨부하거나 요청해보세요.",
      showReport: generatedCount > 0,
    });
  };

  // ── handleSend: 통합 생성 (first + modification) + 재시도 + 캐시 fallback ──
  const handleSend = async (text: string, attachedImages?: AttachedImage[]) => {
    console.log(`[handleSend] text="${text.slice(0, 50)}", hasImages=${!!attachedImages}, hasContent=${pools.hasContent}`);
    setIsLoading(true);

    const doGenerate = async () => {
      if (pools.hasContent) {
        const intent = await handleModification(text, attachedImages);
        if (intent === "new" || intent === "all") {
          await handleFirstGeneration(text, attachedImages);
        }
      } else {
        await handleFirstGeneration(text, attachedImages);
      }
    };

    try {
      await doGenerate();
    } catch (firstError) {
      // 1회 재시도
      try {
        showStatus("다시 시도하는 중...");
        await doGenerate();
      } catch (retryError) {
        // 캐시 fallback
        const scenarioId = await matchDemoScenario(text);
        if (scenarioId) {
          const cached = await loadDemoCache(scenarioId);
          if (cached) {
            pools.appendToPool(cached.variants);
            cached.images.forEach((img) =>
              pools.addImageToPool(img.url, img.textColor, img.bgTreatment),
            );
            showStatus("캐시된 결과를 보여드려요.");
            chat.addMessage({
              role: "assistant",
              content: "완성! 이상한 거 있으면 추가 요청해주세요.",
              showReport: true,
            });
            return;
          }
        }
        // 캐시도 없음
        const msg = retryError instanceof Error ? retryError.message : "알 수 없는 오류";
        showStatus(`오류: ${msg}`);
        chat.addMessage({
          role: "assistant",
          content: `오류가 발생했어요: ${msg}`,
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  // ── handleMessage: LLM 통합 라우터 ──
  // Claude Code 방식: LLM이 의도 판단 → 바로 실행. 질문은 최후의 수단.
  const handleMessage = async (
    rawText: string,
    images?: AttachedImage[],
  ) => {
    const text = chat.resolveNumberInput(rawText.trim());

    // 유저 메시지를 채팅에 추가
    chat.addMessage({
      role: "user",
      content: text,
      imageUrls: images?.map((img) => img.previewUrl),
      attachedImages: images,
    });

    // 이미지가 없지만 이전 첨부 이미지가 있으면 복원
    const effectiveImages = images || lastAttachedImagesRef.current || undefined;
    if (effectiveImages && !images) lastAttachedImagesRef.current = null;

    console.log(`[handleMessage] text="${text}", hasImages=${!!images}, effectiveImages=${!!effectiveImages}, hasContent=${pools.hasContent}`);

    // 이미 카드 있으면 수정 모드 → handleSend가 handleModification 호출
    if (pools.hasContent) {
      console.log("[handleMessage] → 수정 모드 (pools.hasContent=true)");
      await handleSend(text, effectiveImages);
      return;
    }

    // 이미지 첨부 시 → 바로 생성 (orchestrate 건너뜀, 이미지가 핵심 입력)
    if (effectiveImages) {
      console.log("[handleMessage] → 이미지 첨부 → handleSend 직행");
      await handleSend(text || "이 이미지로 카드 만들어줘", effectiveImages);
      return;
    }

    // LLM에게 의도 판단 위임
    const statusId = chat.addMessage({
      role: "assistant",
      content: "생각하는 중...",
      type: "status",
    });

    try {
      // 통합 orchestrate: 의도 파악 + 브랜드 검색 + 문구 생성을 1개 HTTP 연결로
      const result = await orchestrate(text, contentSpec, apiFetch);
      const { extracted, action, question, brandContext: orchBrandCtx, variants } = result;

      // spec 업데이트
      if (Object.keys(extracted).length > 0) {
        setContentSpec((prev) => ({ ...prev, ...extracted }));
      }

      const newSpec = { ...contentSpec, ...extracted };
      const prompt = [newSpec.brand, newSpec.content].filter(Boolean).join(" ") || text;

      switch (action) {
        case "generate": {
          // 문구가 이미 생성되어 왔으면 바로 적용, 이미지만 생성
          if (variants.length > 0) {
            chat.updateMessage(statusId, { content: "이미지 생성 중...", type: "status" });
            if (orchBrandCtx) setBrandCtx(orchBrandCtx);
            pools.appendToPool(variants);

            // 이미지 생성만 별도로 (이것만 병렬 HTTP 연결 사용)
            setIsLoading(true);
            showStatus("이미지 3장 동시 생성 중...");
            const imgErrors: string[] = [];

            // 이미지 첨부는 이미 위에서 handleSend로 분기됨, 여기는 텍스트 전용
            const results = await generateParallelImages(
              prompt,
              variants[0],
              orchBrandCtx,
              { count: 3 },
              apiFetch,
              imgErrors,
            );
            const STYLE_MAP: Array<"realistic" | "3d" | "2d"> = ["realistic", "3d", "2d"];
            let generatedCount = 0;
            results.forEach((imgUrl, i) => {
              if (imgUrl) {
                const variant = variants[i] || variants[0];
                pools.addImageToPool(imgUrl, variant.textColor, variant.bgTreatment, {
                  generationPrompt: prompt,
                  generationStyle: STYLE_MAP[i] || "realistic",
                  generationVariation: i,
                });
                generatedCount++;
              }
            });

            const failDetail = generatedCount === 0 && imgErrors.length > 0 ? ` (${imgErrors[0]})` : "";
            showStatus(
              generatedCount > 0
                ? `완성! 각 영역을 넘기면서 조합해보세요.`
                : `문구는 완성! 이미지 생성에 실패했어요.${failDetail}`,
            );
            chat.addMessage({
              role: "assistant",
              content: generatedCount > 0
                ? "완성! 이상한 거 있으면 추가 요청해주세요."
                : `문구를 만들었어요! 이미지를 첨부하거나 요청해보세요.`,
              showReport: generatedCount > 0,
            });
            setIsLoading(false);
          } else {
            // variants가 없으면 기존 handleSend 폴백
            chat.updateMessage(statusId, { content: "만들어볼게요!", type: "text" });
            await handleSend(prompt, effectiveImages);
          }
          break;
        }
        case "edit_image": {
          chat.updateMessage(statusId, { content: "이미지 수정 중...", type: "status" });
          await handleSend(text, effectiveImages);
          break;
        }
        case "edit_copy": {
          chat.updateMessage(statusId, { content: "문구 수정 중...", type: "status" });
          await handleSend(text, effectiveImages);
          break;
        }
        case "edit_sub": {
          chat.updateMessage(statusId, { content: "하단 텍스트 수정 중...", type: "status" });
          await handleSend(text, effectiveImages);
          break;
        }
        case "need_info": {
          chat.updateMessage(statusId, {
            content: question || "어떤 브랜드/주제의 콘텐츠를 만들까요?",
            type: "text",
          });
          raiseSheet();
          break;
        }
        default: {
          chat.updateMessage(statusId, { content: "만들어볼게요!", type: "text" });
          await handleSend(prompt, effectiveImages);
        }
      }
    } catch (e) {
      console.error("[handleMessage] error:", e);
      chat.updateMessage(statusId, { content: "만들어볼게요!", type: "text" });
      await handleSend(text, effectiveImages);
    }
  };

  // ── 변주 ──
  const handleVariateClick = (field: "copy" | "sub" | "image") => {
    setVariateInput(field);
  };

  const handleVariateSubmit = async (userPrompt: string) => {
    const field = variateInput;
    if (!field) return;
    setVariateInput(null);
    setVariatingField(field);

    try {
      if (field === "copy" || field === "sub") {
        const suggestions = await suggestField(
          field === "copy" ? "title" : "sub",
          pools.composite,
          userPrompt || undefined,
          apiFetch,
        );
        if (field === "copy" && suggestions.length > 0) {
          pools.addCopyOptions(
            suggestions.map((s) => ({
              label: pools.composite.label,
              titleLine1: s[0],
              titleLine2: s[1],
            })),
          );
        } else if (field === "sub" && suggestions.length > 0) {
          pools.addSubOptions(
            suggestions.map((s) => ({ subLine1: s[0], subLine2: s[1] })),
          );
        }
      } else {
        showStatus("새 이미지 생성 중...");
        const prompt =
          userPrompt ||
          `${pools.composite.label} ${pools.composite.titleLine1} ${pools.composite.titleLine2}`;
        const results = await generateParallelImages(
          prompt,
          pools.composite,
          brandCtx,
          { count: 1 },
          apiFetch,
        );
        if (results[0]) pools.addImageToPool(results[0]);
      }
    } catch {
      showStatus("변주 생성에 실패했어요.");
    } finally {
      setVariatingField(null);
    }
  };

  return {
    // pools
    ...pools,
    // chat
    messages: chat.messages,
    addMessage: chat.addMessage,
    updateMessage: chat.updateMessage,
    // orchestrate
    handleMessage,
    handleSend,
    handleVariateClick,
    handleVariateSubmit,
    setRaiseSheet,
    // state
    isLoading,
    statusMessage,
    contentSpec,
    chatPlaceholder,
    highlightAttach,
    variatingField,
    variateInput,
    setVariateInput,
    brandCtx,
  };
}
