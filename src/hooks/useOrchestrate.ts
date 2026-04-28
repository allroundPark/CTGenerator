"use client";

import { useState, useRef, useCallback } from "react";
import {
  AttachedImage,
  BrandContext,
  ContentSpec,
  EMPTY_SPEC,
} from "@/types/ct";
import { useChatMessages } from "./useChatMessages";
import { useCardPools } from "./useCardPools";
import {
  generateParallelImages,
  suggestField,
} from "@/lib/orchestrate";
import { matchDemoScenario, loadDemoCache } from "@/lib/demoCache";
import {
  findDemoScenario,
  fetchDemoCopy,
  sleep as demoSleep,
  type DemoScenario,
} from "@/lib/demoMode";
import { useDemoMode } from "./useDemoMode";
import { appendLog } from "@/lib/localLog";
import { classifyIntent } from "@/lib/intent";
import { dispatchIntent, type DispatchDeps } from "@/lib/dispatch";

export function useOrchestrate(apiFetch: (url: string, init?: RequestInit) => Promise<Response>) {
  // ── 내부 훅 ──
  const chat = useChatMessages();
  const pools = useCardPools();
  const isDemoMode = useDemoMode();

  // ── Orchestrate 상태 ──
  const [contentSpec, setContentSpec] = useState<ContentSpec>({ ...EMPTY_SPEC });
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [brandCtx, setBrandCtx] = useState<BrandContext | null>(null);
  const [chatPlaceholder] = useState("만들고 싶은 콘텐츠를 알려주세요");
  const [highlightAttach] = useState(false);
  const [variatingField, setVariatingField] = useState<"copy" | "sub" | "image" | null>(null);
  const [variateInput, setVariateInput] = useState<"copy" | "sub" | "image" | null>(null);

  // 옵션 선택 시 원본 이미지 복원용
  const lastAttachedImagesRef = useRef<AttachedImage[] | null>(null);

  const showStatus = useCallback((msg: string) => setStatusMessage(msg), []);

  // ── 로그 (localStorage) ──
  // 옛 supabase ct_logs를 대체. 로컬 디바이스에 최근 200개 유지.
  // 분석 필요 시 DevTools console에서 `localStorage.ct_logs` 확인 또는
  // import { getAllLogs } from "@/lib/localLog"; getAllLogs() 호출.
  const log = useCallback((data: Record<string, unknown>) => {
    appendLog(data);
  }, []);

  // ── 바텀시트 올리기 콜백 (page.tsx에서 주입) ──
  const raiseSheetRef = useRef<() => void>(() => {});
  const setRaiseSheet = useCallback((fn: () => void) => {
    raiseSheetRef.current = fn;
  }, []);
  const raiseSheet = useCallback(() => raiseSheetRef.current(), []);

  // ── 데모 모드 재생기 ──
  const playDemoSteps = async (scenario: DemoScenario) => {
    console.log("[demo] play scenario:", scenario.id);
    if (scenario.setSpec) {
      setContentSpec((prev) => ({ ...prev, ...scenario.setSpec }));
    }
    const statusId = chat.addMessage({
      role: "assistant",
      content: "...",
      type: "status",
    });
    for (const step of scenario.steps) {
      if (step.delayMs > 0) await demoSleep(step.delayMs);
      if (step.type === "status") {
        chat.updateMessage(statusId, { content: step.message, type: "status" });
      } else if (step.type === "options") {
        chat.updateMessage(statusId, {
          type: "options",
          content: step.prompt,
          options: step.options,
        });
      } else if (step.type === "copy") {
        const variants = await fetchDemoCopy(step.copyUrl);
        console.log("[demo] copy: appending", variants.length, "variants");
        if (variants.length > 0) {
          pools.appendToPool(variants);
        }
        chat.updateMessage(statusId, { content: "문구 완성! 이미지 만드는 중...", type: "status" });
      } else if (step.type === "images") {
        const variants = step.copyUrl ? await fetchDemoCopy(step.copyUrl) : [];
        const STYLE_MAP: Array<"realistic" | "3d" | "2d"> = ["realistic", "3d", "2d"];
        for (let i = 0; i < step.imageUrls.length; i++) {
          const url = step.imageUrls[i];
          const v = variants[i] || variants[0];
          console.log(`[demo] addImage[${i}] url=${url} textColor=${v?.textColor} bgType=${v?.bgTreatment?.type}`);
          pools.addImageToPool(url, v?.textColor, v?.bgTreatment, {
            generationPrompt: scenario.id,
            generationStyle: STYLE_MAP[i] || "realistic",
            generationVariation: i,
          });
          // 각 이미지를 별개 렌더 사이클로 분리 + 시각적 진행감
          await demoSleep(1500);
        }
        chat.updateMessage(statusId, { content: step.finalMessage, type: "text" });
      }
    }
  };

  // ── handleMessage: 단일 라우터 — classify → dispatch ──
  // 옛 handleSend / handleModification / handleFirstGeneration / orchestrate switch는
  // 모두 lib/intent.ts + lib/dispatch/*.ts로 흡수됨. 이 함수는 이제 4가지만 함:
  //   1) 채팅 메시지 추가 + 데모 모드 분기
  //   2) classifyIntent로 단일 분류
  //   3) dispatchIntent로 단일 실행 (1회 재시도 + 데모 캐시 fallback)
  //   4) 로딩 상태 관리
  const handleMessage = async (
    rawText: string,
    images?: AttachedImage[],
  ) => {
    const text = chat.resolveNumberInput(rawText.trim());

    chat.addMessage({
      role: "user",
      content: text,
      imageUrls: images?.map((img) => img.previewUrl),
      attachedImages: images,
    });

    // 이미지가 없지만 이전 첨부 이미지가 있으면 복원
    const effectiveImages = images || lastAttachedImagesRef.current || undefined;
    if (effectiveImages && !images) lastAttachedImagesRef.current = null;

    // 데모 모드: 매칭되는 시나리오면 캐시 응답으로 우회.
    // 매칭 안 되면 안내 메시지로 종료 — 실 LLM/네트워크 호출 차단 (시연 안정성).
    if (isDemoMode) {
      const scenario = findDemoScenario(text, {
        hasPool: pools.hasContent,
        hasAttached: !!effectiveImages,
        brand: contentSpec.brand ?? undefined,
      });
      if (scenario) {
        await playDemoSteps(scenario);
        return;
      }
      chat.addMessage({
        role: "assistant",
        content: "이 입력은 운영 환경에서 처리되는 영역입니다 (개발·보완 예정).",
      });
      return;
    }

    setIsLoading(true);
    showStatus("요청 분석 중...");

    try {
      // 1. 분류
      const result = await classifyIntent({
        text,
        images: effectiveImages,
        contentSpec,
        hasContent: pools.hasContent,
        apiFetch,
      });

      if (!result.ok) {
        showStatus(`요청을 이해하지 못했어요`);
        chat.addMessage({
          role: "assistant",
          content: `요청 분류에 실패했어요. (${result.error.kind}: ${result.error.message})`,
        });
        return;
      }

      // 2. 디스패치 — 1회 재시도 + 데모 캐시 fallback (옛 handleSend의 graceful degradation 보존)
      const deps: DispatchDeps = {
        pools,
        chat,
        contentSpec,
        setContentSpec,
        brandCtx,
        setBrandCtx,
        showStatus,
        apiFetch,
        log,
        raiseSheet,
        prepared: result.prepared,
      };

      const intent = result.intent;
      try {
        await dispatchIntent(intent, deps);
      } catch (firstError) {
        console.error("[handleMessage] dispatch failed once, retrying:", firstError);
        showStatus("다시 시도하는 중...");
        try {
          await dispatchIntent(intent, deps);
        } catch (retryError) {
          // 캐시 fallback (옛 handleSend의 demo cache fallback)
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
          const msg = retryError instanceof Error ? retryError.message : "알 수 없는 오류";
          showStatus(`오류: ${msg}`);
          chat.addMessage({
            role: "assistant",
            content: `오류가 발생했어요: ${msg}`,
          });
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  // ── 변주 (out of scope for intent refactor — suggest API 직접 호출 유지) ──
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
