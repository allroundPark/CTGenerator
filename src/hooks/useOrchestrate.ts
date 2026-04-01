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
  classifyByDiff,
  searchBrand,
  generateText,
  generateParallelImages,
  suggestField,
  suggestContent,
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
    const extracted = await extractSpec(text, contentSpec, apiFetch);
    const intent = classifyByDiff(extracted, text);

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
        // 수정 전용 모드: 현재 이미지 + 원본 프롬프트를 전달
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
            count: 1,
            referenceImages: refImgs,
            edit: true,
            originalPrompt: currentImg?.generationPrompt,
          },
          apiFetch,
          imgErrors,
        );
        foundImageUrl = results[0] || "";
      }
      if (foundImageUrl) {
        // 수정된 이미지에 원본 메타데이터 유지
        const currentImg = pools.imagePool[pools.selImage];
        pools.addImageToPool(foundImageUrl, composite.textColor, composite.bgTreatment, {
          generationPrompt: currentImg?.generationPrompt,
          generationStyle: currentImg?.generationStyle,
          generationVariation: currentImg?.generationVariation,
        });
      }
      showStatus(foundImageUrl ? "이미지 추가 완료!" : "");
      const failDetail = imgErrors.length > 0 ? ` (${imgErrors[0]})` : "";
      chat.addMessage({
        role: "assistant",
        content: foundImageUrl
          ? "이미지를 수정했어요! 스와이프해서 비교해보세요."
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

    // 문구 생성
    const newVariants = await generateText(text, activeBrandCtx, apiFetch);
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

  // ── handleMessage: 대화 라우팅 ──
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

    // 이미지 첨부 대기 중 + 텍스트만 → AI 생성
    if (highlightAttach && !images?.length) {
      setHighlightAttach(false);
      setChatPlaceholder("만들고 싶은 콘텐츠를 알려주세요");
      const prompt = [contentSpec.brand, contentSpec.content]
        .filter(Boolean)
        .join(" ");
      chat.addMessage({
        role: "assistant",
        content: "알겠어요, AI가 알아서 만들어볼게요!",
      });
      await handleSend(prompt || text);
      return;
    }

    // 이미 카드 있으면 수정 모드
    const hasImages = !!(images && images.length > 0);
    if (pools.hasContent) {
      await handleSend(text, images);
      return;
    }

    // 이미지 첨부 + 처리 방식 미명시 → 질문
    const imageProcessKeywords = [
      "보정",
      "조합",
      "합성",
      "합쳐",
      "섞어",
      "바로 적용",
      "그대로",
    ];
    const hasImageIntent = imageProcessKeywords.some((kw) => text.includes(kw));
    if (hasImages && !hasImageIntent) {
      setHighlightAttach(false);
      chat.addMessage({
        role: "assistant",
        content: "이미지를 어떻게 활용할까요?",
        type: "options",
        options: [
          {
            label: "그대로 사용",
            value: "이 이미지를 그대로 카드 배경으로 사용해줘",
          },
          {
            label: "AI 보정",
            value: "이 이미지를 AI로 보정해서 카드 만들어줘",
          },
          {
            label: "스타일 변형",
            value: "이 이미지 스타일을 참고해서 새로 만들어줘",
          },
        ],
      });
      return;
    }

    // 이미지 첨부 + 의도 명확 → 바로 생성
    if (hasImages) {
      await handleSend(text, images);
      return;
    }

    // ── Extract-Spec: LLM 필드 추출 → 클라이언트 판단 ──
    try {
      const statusId = chat.addMessage({
        role: "assistant",
        content: "생각하는 중...",
        type: "status",
      });

      // 위임형 발화 → 현재 spec으로 생성
      const isDelegation =
        text === "AI가 바로 만들기" ||
        (contentSpec.brand &&
          /그냥|걍|알아서|다해|니가|너가|넘어가|바로.*만들|만들어줘|ㄱㄱ|고고/.test(
            text,
          ));
      if (isDelegation) {
        setHighlightAttach(false);
        const prompt = [contentSpec.brand, contentSpec.content]
          .filter(Boolean)
          .join(" ");
        chat.updateMessage(statusId, {
          content: "만들어볼게요!",
          type: "text",
        });
        await handleSend(prompt || text, images);
        return;
      }

      // 고정 응답 처리
      if (text === "텍스트 초안 있어요") {
        chat.updateMessage(statusId, {
          content: "텍스트 초안을 입력해주세요!",
          type: "text",
        });
        setChatPlaceholder("텍스트 초안을 입력해주세요");
        raiseSheet();
        return;
      }

      if (text === "이미지 있어요") {
        setHighlightAttach(true);
        setContentSpec((prev) => ({ ...prev, imageSource: "upload" }));
        chat.updateMessage(statusId, {
          content: "이미지를 첨부해주세요!",
          type: "text",
        });
        setChatPlaceholder("이미지를 첨부해주세요");
        raiseSheet();
        return;
      }

      if (text === "둘 다 있어요") {
        setHighlightAttach(true);
        setContentSpec((prev) => ({ ...prev, imageSource: "upload" }));
        chat.updateMessage(statusId, {
          content: "텍스트 초안을 입력하고, 이미지도 첨부해주세요!",
          type: "text",
        });
        setChatPlaceholder("텍스트 초안을 입력하세요 (이미지도 첨부)");
        raiseSheet();
        return;
      }

      if (text === "AI가 알아서 해주세요") {
        // brand가 있든 없든, 가진 정보로 바로 생성
        const prompt = [contentSpec.brand, contentSpec.content]
          .filter(Boolean)
          .join(" ") || "현대카드 앱 서비스 혜택";
        chat.updateMessage(statusId, {
          content: "AI가 알아서 만들어볼게요!",
          type: "text",
        });
        await handleSend(prompt, images);
        return;
      }

      // extract-spec 호출
      const extracted = await extractSpec(text, contentSpec, apiFetch);
      const newSpec = { ...contentSpec, ...extracted };
      setContentSpec(newSpec);

      // 클라이언트 판단
      if (!newSpec.brand) {
        // content는 있는데 brand만 없으면 content를 brand로 간주하고 바로 생성 옵션 제공
        if (newSpec.content) {
          chat.updateMessage(statusId, {
            content: `"${newSpec.content}" 관련 콘텐츠를 만들까요?`,
            type: "options",
            options: [
              { label: "AI가 바로 만들기", value: "AI가 바로 만들기" },
              { label: "브랜드 지정하기", value: "브랜드 지정하기" },
            ],
          });
        } else {
          chat.updateMessage(statusId, {
            content: "어떤 브랜드/주제의 콘텐츠를 만들까요?",
            type: "options",
            options: [
              { label: "AI가 알아서 해주세요", value: "AI가 알아서 해주세요" },
              { label: "대한항공카드", value: "대한항공카드" },
              { label: "마켓컬리", value: "마켓컬리" },
              { label: "자동차대출", value: "자동차대출" },
            ],
          });
        }
        raiseSheet();
      } else if (!newSpec.content) {
        chat.updateMessage(statusId, {
          content: `${newSpec.brand} 관련 소재를 찾고 있어요...`,
          type: "status",
        });
        try {
          const suggestions = await suggestContent(newSpec.brand, apiFetch);
          const options = [
            { label: "AI가 알아서 해주세요", value: "AI가 알아서 해주세요" },
            ...suggestions.map((s) => ({ label: s, value: s })),
          ];
          chat.updateMessage(statusId, {
            content: `${newSpec.brand} 관련 어떤 내용을 담을까요?`,
            type: "options",
            options,
          });
        } catch {
          chat.updateMessage(statusId, {
            content: `${newSpec.brand} 관련 어떤 내용을 담을까요?`,
            type: "options",
            options: [
              {
                label: "AI가 알아서 해주세요",
                value: "AI가 알아서 해주세요",
              },
            ],
          });
        }
        raiseSheet();
      } else if (newSpec.textDraft && !contentSpec.textDraft) {
        chat.updateMessage(statusId, {
          content: "초안을 받았어요! 어떻게 활용할까요?",
          type: "options",
          options: [
            { label: "초안 바로 적용", value: "초안 바로 적용" },
            { label: "초안 보정해서 적용", value: "초안 보정해서 적용" },
            { label: "초안 기반 새로 생성", value: "초안 기반 새로 생성" },
          ],
        });
        raiseSheet();
      } else {
        const hasText = !!newSpec.textDraft;
        const hasImage = !!newSpec.imageSource;

        if (hasText && hasImage) {
          const prompt = [newSpec.brand, newSpec.content]
            .filter(Boolean)
            .join(" ");
          chat.updateMessage(statusId, {
            content: "만들어볼게요!",
            type: "text",
          });
          await handleSend(prompt);
        } else if (hasText && !hasImage) {
          chat.updateMessage(statusId, {
            content: `텍스트는 받았어요! 이미지는 어떻게 할까요?`,
            type: "options",
            options: [
              { label: "AI가 바로 만들기", value: "AI가 바로 만들기" },
              { label: "이미지 있어요", value: "이미지 있어요" },
            ],
          });
        } else if (!hasText && hasImage) {
          chat.updateMessage(statusId, {
            content: `이미지는 받았어요! 텍스트는 어떻게 할까요?`,
            type: "options",
            options: [
              { label: "AI가 바로 만들기", value: "AI가 바로 만들기" },
              { label: "텍스트 초안 있어요", value: "텍스트 초안 있어요" },
            ],
          });
        } else {
          chat.updateMessage(statusId, {
            content: `${newSpec.brand} — ${newSpec.content}`,
            type: "options",
            options: [
              { label: "AI가 바로 만들기", value: "AI가 바로 만들기" },
              { label: "텍스트 초안 있어요", value: "텍스트 초안 있어요" },
              { label: "이미지 있어요", value: "이미지 있어요" },
              { label: "둘 다 있어요", value: "둘 다 있어요" },
            ],
          });
        }
        raiseSheet();
      }
    } catch (e) {
      console.error("[extract-spec] error:", e);
      await handleSend(text, images);
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
