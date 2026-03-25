"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { CTContent, AttachedImage, BgTreatment, ImageConstraint, CTTextField, BrandContext, ChatMessage, GenerationStatus, ContentSpec, EMPTY_SPEC } from "@/types/ct";
import ChatInput from "@/components/ChatInput";
import ChatPanel from "@/components/ChatPanel";
import DeviceViewer from "@/components/DeviceViewer";
import ReportModal from "@/components/ReportModal";
import ApiKeySetup from "@/components/ApiKeySetup";
import { exportCtPng, exportCtBase64 } from "@/lib/exportPng";
import { isKnownBrand, getKnownBrandContext, detectBrandName } from "@/lib/imagePrompt";
import { supabase } from "@/lib/supabase";
import { getDeviceId } from "@/lib/deviceId";
import { loadKey, hasStoredKey, isWorkingGroup, clearKey } from "@/lib/apiKey";

const PRESETS = [
  "Amex 도쿄 다이닝 혜택",
  "자동차담보대출 안내",
];

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
  // API 키 상태
  const [apiKeyReady, setApiKeyReady] = useState<boolean | null>(null); // null=로딩중
  const apiKeyRef = useRef<string | null>(null);

  useEffect(() => {
    (async () => {
      if (typeof window === "undefined") return;
      if (isWorkingGroup()) {
        apiKeyRef.current = null; // 서버 env 사용
        setApiKeyReady(true);
        return;
      }
      if (hasStoredKey()) {
        const key = await loadKey();
        if (key) {
          apiKeyRef.current = key;
          setApiKeyReady(true);
          return;
        }
      }
      setApiKeyReady(false);
    })();
  }, []);

  // API 키를 포함한 fetch wrapper
  const apiFetch = useCallback((url: string, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    if (apiKeyRef.current) {
      headers.set("x-api-key", apiKeyRef.current);
    }
    return fetch(url, { ...init, headers });
  }, []);

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

  // 텍스트 수정 상태
  const [editingField, setEditingField] = useState<{ field: CTTextField; value: string } | null>(null);

  // 변주 입력 모드 (+ 버튼 → 입력창 활성화)
  const [variateInput, setVariateInput] = useState<"copy" | "sub" | "image" | null>(null);

  // 브랜드 컨텍스트 (웹 검색 결과)
  const [brandCtx, setBrandCtx] = useState<BrandContext | null>(null);

  // 채팅 입력창 placeholder
  const [chatPlaceholder, setChatPlaceholder] = useState("만들고 싶은 콘텐츠를 알려주세요");

  // 첨부 버튼 강조 상태
  const [highlightAttach, setHighlightAttach] = useState(false);

  // 리포트 팝업
  const [showReport, setShowReport] = useState(false);

  // 입력창 포커스 — 현상 유지 (포커스만으로 바텀시트 변경 안 함)
  const handleInputFocusChange = useCallback((_focused: boolean) => {
    // no-op: 바텀시트 높이는 대화 흐름(raiseSheet)에서만 변경
  }, []);

  // ── ContentSpec 상태 (유저 발화에서 추출된 정보) ──
  const [contentSpec, setContentSpec] = useState<ContentSpec>({ ...EMPTY_SPEC });

  // 바텀시트 높이 (드래그) — 초기 10%, 대화 시작되면 25%
  const [sheetHeight, setSheetHeight] = useState(100);
  const [sheetSnapping, setSheetSnapping] = useState(false);
  const sheetHeightRef = useRef(sheetHeight);
  sheetHeightRef.current = sheetHeight;
  const dragRef = useRef<{ startY: number; startH: number } | null>(null);

  // 스냅: 입력창+상태(100px), 대화UI(280px), 50%
  const getSnaps = () => {
    const vh = window.innerHeight;
    return [100, 280, Math.round(vh * 0.6)];
  };

  const onDragStart = useCallback((clientY: number) => {
    setSheetSnapping(false);
    dragRef.current = { startY: clientY, startH: sheetHeightRef.current };
  }, []);

  const onDragMove = useCallback((clientY: number) => {
    if (!dragRef.current) return;
    const dy = dragRef.current.startY - clientY;
    const [min, , max] = getSnaps();
    const h = Math.max(min, Math.min(max, dragRef.current.startH + dy));
    sheetHeightRef.current = h;
    setSheetHeight(h);
  }, []);

  const onDragEnd = useCallback(() => {
    if (!dragRef.current) return;
    const cur = sheetHeightRef.current;
    const snaps = getSnaps();
    // 가장 가까운 스냅 포인트로
    let closest = snaps[0];
    let minDist = Math.abs(cur - snaps[0]);
    for (const s of snaps) {
      const d = Math.abs(cur - s);
      if (d < minDist) { closest = s; minDist = d; }
    }
    setSheetSnapping(true);
    setSheetHeight(closest);
    sheetHeightRef.current = closest;
    dragRef.current = null;
  }, []);

  // 채팅 메시지 히스토리
  const [messages, setMessages] = useState<ChatMessage[]>([]);



  const addMessage = useCallback((msg: Omit<ChatMessage, "id" | "timestamp">) => {
    const newMsg: ChatMessage = { ...msg, id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, timestamp: Date.now() };
    setMessages((prev) => [...prev, newMsg]);
    return newMsg.id;
  }, []);

  const updateMessage = useCallback((id: string, update: Partial<ChatMessage>) => {
    setMessages((prev) => prev.map((m) => m.id === id ? { ...m, ...update } : m));
  }, []);

  // 바텀시트 올리기 헬퍼
  const raiseSheet = useCallback(() => {
    try {
      const midSnap = getSnaps()[1];
      if (sheetHeightRef.current < midSnap) {
        setSheetSnapping(true);
        setSheetHeight(midSnap);
        sheetHeightRef.current = midSnap;
      }
    } catch { /* SSR 무시 */ }
  }, []);

  // 메시지가 있거나 로딩 중이면 최소 280px(대화UI) 스냅으로 올리기
  useEffect(() => {
    if ((messages.length > 0 || isLoading) && sheetHeightRef.current <= 100) {
      setSheetSnapping(true);
      setSheetHeight(280);
      sheetHeightRef.current = 280;
    }
  }, [messages.length, isLoading]);

  // 첫 생성 안내
  const [showHint, setShowHint] = useState(true);


  // 메일 보내기
  const [showEmailInput, setShowEmailInput] = useState(false);
  const [emailAddr, setEmailAddr] = useState("");
  const [emailSending, setEmailSending] = useState(false);

  const handleSendEmail = async () => {
    if (!emailAddr.trim() || !hasContent) return;
    setEmailSending(true);
    try {
      const { base64, fileName } = await exportCtBase64(composite);
      const res = await apiFetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: emailAddr.trim(), imageBase64: base64, fileName }),
      });
      if (res.ok) {
        setShowEmailInput(false);
        setEmailAddr("");
        showStatus("메일 발송 완료!");
      } else {
        const data = await res.json().catch(() => ({ error: "발송 실패" }));
        showStatus(`메일 발송 실패: ${data.error}`);
      }
    } catch {
      showStatus("메일 발송 중 오류가 발생했습니다.");
    } finally {
      setEmailSending(false);
    }
  };

  // 스와이프 상태
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);

  // 디바이스 프리뷰 — 컨테이너 너비/높이에 맞게 동적 스케일
  const deviceContainerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  useEffect(() => {
    const el = deviceContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width: w, height: h } = entries[0]?.contentRect ?? { width: 0, height: 0 };
      if (w > 0) setContainerWidth(w);
      if (h > 0) setContainerHeight(h);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [apiKeyReady]);
  // CT 콘텐츠 하단(1x) + 10px 여유를 두고 스케일 제한
  // CT 하단 = (188 + 348) = 536px + 10px 마진 = 546px (1x 기준)
  const CT_BOTTOM_1X = 546;
  const scaleByWidth = containerWidth > 0 ? containerWidth / 375 : 1;
  // 바텀시트가 -mt-[15px]로 15px 겹치므로 실제 가용 높이에서 차감
  const availableHeight = Math.max(0, containerHeight - 15);
  const scaleByHeight = availableHeight > 0 ? availableHeight / CT_BOTTOM_1X : 1;
  const SCALE = Math.min(scaleByWidth, scaleByHeight);

  const hasContent = copyPool.length > 0;

  // CT 카드 영역 좌표 (동적 스케일 기반)
  const CT = { x: 19 * SCALE, y: 188 * SCALE, w: 335 * SCALE, h: 348 * SCALE };
  // 존 분할: 상단 텍스트 0~35%, 이미지 35~80%, 하단 텍스트 80~100%
  const ZONE_TOP = 0.35;
  const ZONE_MID = 0.80;

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

  // ── CT 카드 위 스와이프 핸들러 ──
  const handleCardTouchStart = (e: React.TouchEvent) => {
    swipeStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const handleCardTouchEnd = (e: React.TouchEvent, zone: "copy" | "image" | "sub") => {
    if (!swipeStartRef.current || !hasContent) return;
    const dx = swipeStartRef.current.x - e.changedTouches[0].clientX;
    swipeStartRef.current = null;
    if (Math.abs(dx) < 40) return; // 탭은 무시
    const dir = dx > 0 ? 1 : -1;

    if (zone === "copy") {
      setSelCopy((prev) => Math.max(0, Math.min(copyPool.length - 1, prev + dir)));
    } else if (zone === "image") {
      setSelImage((prev) => Math.max(0, Math.min(imagePool.length - 1, prev + dir)));
    } else {
      setSelSub((prev) => Math.max(0, Math.min(subPool.length - 1, prev + dir)));
    }
    setShowHint(false);
  };

  // 마우스 드래그도 지원 (PC)
  const handleCardMouseDown = (e: React.MouseEvent) => {
    swipeStartRef.current = { x: e.clientX, y: e.clientY };
  };
  const handleCardMouseUp = (e: React.MouseEvent, zone: "copy" | "image" | "sub") => {
    if (!swipeStartRef.current || !hasContent) return;
    const dx = swipeStartRef.current.x - e.clientX;
    swipeStartRef.current = null;
    if (Math.abs(dx) < 40) return;
    const dir = dx > 0 ? 1 : -1;

    if (zone === "copy") {
      setSelCopy((prev) => Math.max(0, Math.min(copyPool.length - 1, prev + dir)));
    } else if (zone === "image") {
      setSelImage((prev) => Math.max(0, Math.min(imagePool.length - 1, prev + dir)));
    } else {
      setSelSub((prev) => Math.max(0, Math.min(subPool.length - 1, prev + dir)));
    }
    setShowHint(false);
  };

  // ── 텍스트 필드 탭 → 수정 모드 ──
  const handleFieldClick = useCallback((field: CTTextField) => {
    if (!hasContent) return;
    // 그룹 필드는 개별 라인으로 분리하지 않고 첫 줄로
    let value = "";
    if (field === "label") value = composite.label;
    else if (field === "titleLine1" || field === "title") value = composite.titleLine1;
    else if (field === "titleLine2") value = composite.titleLine2;
    else if (field === "subLine1" || field === "sub") value = composite.subLine1;
    else if (field === "subLine2") value = composite.subLine2;
    setEditingField({ field, value });
  }, [hasContent, composite]);

  const handleFieldSave = (field: CTTextField, value: string) => {
    const copyFields = ["label", "titleLine1", "titleLine2", "title"];
    const subFields = ["subLine1", "subLine2", "sub"];

    if (copyFields.includes(field)) {
      setCopyPool((prev) => prev.map((c, i) => i === selCopy ? { ...c, [field]: value } : c));
    } else if (subFields.includes(field)) {
      setSubPool((prev) => prev.map((s, i) => i === selSub ? { ...s, [field]: value } : s));
    }
    setEditingField(null);
  };

  // ── 풀에 항목 추가 (기존에 append) ──
  const appendToPool = (variants: CTContent[], imageUrl?: string) => {
    const newCopies: CopyOption[] = [];
    const newSubs: SubOption[] = [];

    variants.forEach((v) => {
      newCopies.push({ label: v.label, titleLine1: v.titleLine1, titleLine2: v.titleLine2 });
      newSubs.push({ subLine1: v.subLine1, subLine2: v.subLine2 });
    });

    setCopyPool((prev) => [...prev, ...newCopies]);
    // 첫 생성 시 "없음"을 첫 번째 옵션으로 추가
    const emptySub: SubOption = { subLine1: "", subLine2: "" };
    setSubPool((prev) => prev.length === 0 ? [emptySub, ...newSubs] : [...prev, ...newSubs]);

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
    setImagePool((prev) => {
      const newIndex = prev.length;
      const next = [...prev, {
        imageUrl,
        textColor: textColor || composite.textColor,
        bgTreatment: bgTreatment || composite.bgTreatment,
        imageConstraint: { fit: "cover" as const, alignX: "center" as const, alignY: "center" as const },
      }];
      // 첫 번째 이미지일 때만 자동 선택 (병렬 호출 시 마지막 도착이 선택되는 문제 방지)
      if (newIndex === 0) setSelImage(0);
      return next;
    });
  };

  // ── 로그 적재 (fire-and-forget) ──
  const logToSupabase = (data: Record<string, unknown>) => {
    supabase.from("ct_logs").insert({ device_id: getDeviceId(), ...data }).then(({ error }) => {
      if (error) console.error("[log] insert error:", error);
    });
  };

  // ── 메인 생성 ──
  const handleSend = async (text: string, attachedImages?: AttachedImage[]) => {
    const applyImages = attachedImages?.filter((i) => i.option === "apply") || [];
    const editImages = attachedImages?.filter((i) => i.option === "edit") || [];
    const refImages = attachedImages?.filter((i) => i.option === "reference") || [];

    // "바로적용" 이미지 → base64로 변환 (reference로 Gemini 보정에 사용)
    let applyImageData: { data: string; mimeType: string } | null = null;
    if (applyImages.length > 0) {
      const b64 = await fileToBase64(applyImages[0].file);
      applyImageData = { data: b64, mimeType: applyImages[0].file.type || "image/jpeg" };
    }

    setIsLoading(true);

    try {
      // 후속 요청: 의도 분류 후 해당 풀만 추가
      if (hasContent) {
        showStatus("요청 분석 중...");
        const intentRes = await apiFetch("/api/classify-intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text, currentContent: composite }),
        });
        const { intent } = await intentRes.json();

        // 후속 요청 로그
        logToSupabase({
          message: text,
          intent,
          attached_images_count: attachedImages?.length || 0,
        });

        if (intent === "image") {
          showStatus("이미지 수정 중...");
          const prompt = text || `${composite.label} ${composite.titleLine1} ${composite.titleLine2}`;
          let foundImageUrl = "";
          if (refImages.length > 0) {
            foundImageUrl = await generateImage(text, refImages[0], composite, "reference") || "";
          } else if (editImages.length > 0) {
            foundImageUrl = await generateImage(text, editImages[0], composite, "edit") || "";
          } else if (applyImageData) {
            showStatus("첨부 이미지 보정 중...");
            foundImageUrl = await generateImageFromPrompt(
              text || prompt, composite, brandCtx, undefined, [applyImageData], true
            ) || "";
          } else {
            // 현재 이미지를 reference로 전달하여 수정
            const currentImgUrl = imagePool[selImage]?.imageUrl;
            let refImgs: { data: string; mimeType: string }[] | undefined;
            if (currentImgUrl) {
              const imgData = await imageUrlToBase64(currentImgUrl);
              if (imgData) refImgs = [imgData];
            }
            const editPrompt = currentImgUrl
              ? `현재 이미지를 기반으로 수정해줘: ${text}`
              : prompt;
            const res = await apiFetch("/api/generate-image", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                prompt: editPrompt,
                imageType: composite.imageType || "",
                copyContext: { nm1_label: composite.label, nm2_title: composite.titleLine1, nm3_desc: composite.titleLine2 },
                ...(refImgs ? { referenceImages: refImgs } : {}),
                ...(brandCtx ? { brandContext: brandCtx } : {}),
              }),
            });
            if (res.ok) {
              const data = await res.json();
              foundImageUrl = data.image ? `data:${data.image.mimeType};base64,${data.image.data}` : "";
            }
          }
          if (foundImageUrl) {
            addImageToPool(foundImageUrl, composite.textColor, composite.bgTreatment);
          }
          showStatus("이미지 추가 완료!");
          addMessage({ role: "assistant", content: foundImageUrl ? "이미지를 수정했어요! 스와이프해서 비교해보세요." : "이미지 수정에 실패했어요." });
          return;
        }

        if (intent === "copy") {
          showStatus("상단 문구 생성 중...");
          const res = await apiFetch("/api/suggest", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ field: "title", currentContent: composite, hint: text }),
          });
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data.suggestions)) {
              const newCopies: CopyOption[] = data.suggestions.map((s: [string, string]) => ({
                label: composite.label, titleLine1: s[0], titleLine2: s[1],
              }));
              setCopyPool((prev) => [...prev, ...newCopies]);
              setSelCopy(copyPool.length);
            }
          }
          showStatus("상단 문구 추가 완료!");
          addMessage({ role: "assistant", content: "상단 문구를 추가했어요! 스와이프해서 확인해보세요." });
          return;
        }

        if (intent === "sub") {
          showStatus("하단 문구 생성 중...");
          const res = await apiFetch("/api/suggest", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ field: "sub", currentContent: composite, hint: text }),
          });
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data.suggestions)) {
              const newSubs: SubOption[] = data.suggestions.map((s: [string, string]) => ({
                subLine1: s[0], subLine2: s[1],
              }));
              setSubPool((prev) => [...prev, ...newSubs]);
              setSelSub(subPool.length);
            }
          }
          showStatus("하단 문구 추가 완료!");
          addMessage({ role: "assistant", content: "하단 문구를 추가했어요! 스와이프해서 확인해보세요." });
          return;
        }

        // intent === "new" or "all" → 풀 초기화 후 전체 재생성
        setCopyPool([]);
        setSubPool([]);
        setImagePool([]);
        setSelCopy(0);
        setSelSub(0);
        setSelImage(0);
        setBrandCtx(null);
      }

      // 첫 생성 또는 새 주제 전체 생성
      showStatus(applyImageData ? "이미지 보정 & 문구 생성 중..." : "브랜드 검색 & 문구 생성 중...");

      // 바로적용 이미지가 있으면 이미지 보정을 즉시 병렬로 시작
      const isEnhance = !!applyImageData;
      let imagePromise: Promise<void> | null = null;
      let generatedCount = 0;

      if (applyImageData) {
        // 이미지 보정을 문구 생성과 병렬로 즉시 시작 (문구 결과 기다리지 않음)
        const IMAGE_COUNT = 3;
        const attachedRefData = [applyImageData];
        imagePromise = (async () => {
          showStatus("첨부 이미지 보정 중...");
          const promises = Array.from({ length: IMAGE_COUNT }, (_, i) =>
            generateImageFromPrompt(text, { imageType: "" } as CTContent, null, i, attachedRefData, true)
              .then((imgUrl) => {
                if (imgUrl) {
                  addImageToPool(imgUrl);
                  generatedCount++;
                }
              })
          );
          await Promise.all(promises);
        })();
      }

      // Step 1: 브랜드 검색 (이미지 보정과 병렬)
      const knownBrand = getKnownBrandContext(text);
      const brandSearchResult = knownBrand ? null : await searchBrand(text);

      // 브랜드 컨텍스트: 로컬 knowledge 우선, 없으면 웹 검색 결과
      let activeBrandCtx: BrandContext | null = knownBrand
        ? { ...knownBrand, mascotName: null, mascotDescription: null, mascotImage: null } as BrandContext
        : brandSearchResult;
      if (activeBrandCtx) {
        setBrandCtx(activeBrandCtx);
        showStatus(`"${activeBrandCtx.brandName}" 정보 확인! 문구 생성 중...`);
      } else {
        showStatus("문구 생성 중...");
      }

      // Step 2: 문구 생성 (brandContext 포함)
      const genRes = await apiFetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: text,
          ...(activeBrandCtx ? { brandContext: activeBrandCtx } : {}),
        }),
      });

      if (!genRes.ok) {
        const err = await genRes.json().catch(() => ({ error: "서버 오류" }));
        throw new Error(err.error || `HTTP ${genRes.status}`);
      }

      const data = await genRes.json();
      const newVariants: CTContent[] = data.variants.map((v: CTContent) => ({
        ...v,
      }));

      appendToPool(newVariants);

      // 첫 생성 로그
      logToSupabase({
        message: text,
        intent: "new",
        attached_images_count: attachedImages?.length || 0,
        variants: newVariants.map((v) => ({
          label: v.label, titleLine1: v.titleLine1, titleLine2: v.titleLine2,
          subLine1: v.subLine1, subLine2: v.subLine2, textColor: v.textColor, imageType: v.imageType,
        })),
        image_type: newVariants[0]?.imageType || null,
        brand_context: activeBrandCtx ? { brandName: activeBrandCtx.brandName, category: activeBrandCtx.category, primaryColor: activeBrandCtx.primaryColor } : null,
      });

      // 이미지 처리
      if (imagePromise) {
        // 바로적용: 이미 병렬로 시작한 이미지 보정 완료 대기
        await imagePromise;
        showStatus(generatedCount > 0
          ? `이미지 ${generatedCount}장 보정 완료! 각 영역을 넘기면서 조합해보세요.`
          : "문구는 완성! 이미지 보정에 실패했어요. 다시 시도해보세요.");
      } else {
        // 일반: 문구 결과 기반으로 이미지 3장 생성
        const IMAGE_COUNT = 3;

        let attachedRefData: { data: string; mimeType: string }[] | undefined;
        if (refImages.length > 0) {
          const b64 = await fileToBase64(refImages[0].file);
          attachedRefData = [{ data: b64, mimeType: refImages[0].file.type }];
        } else if (editImages.length > 0) {
          const b64 = await fileToBase64(editImages[0].file);
          attachedRefData = [{ data: b64, mimeType: editImages[0].file.type }];
        }

        showStatus("이미지 3장 동시 생성 중...");

        const promises = Array.from({ length: IMAGE_COUNT }, (_, i) => {
          const variant = newVariants[i] || newVariants[0];
          return generateImageFromPrompt(text, variant, activeBrandCtx, i, attachedRefData)
            .then((imgUrl) => {
              if (imgUrl) {
                addImageToPool(imgUrl, variant.textColor, variant.bgTreatment);
                generatedCount++;
                if (i === 0) {
                  logToSupabase({ message: text, intent: "image_generated", image_generated: true, image_type: variant.imageType || null });
                }
              }
            });
        });

        await Promise.all(promises);

        showStatus(generatedCount > 0
          ? `이미지 ${generatedCount}장 생성 완료! 각 영역을 넘기면서 조합해보세요.`
          : "문구는 완성! 이미지를 첨부하거나 생성 요청해보세요.");
      }
      // 생성 완료 메시지
      addMessage({
        role: "assistant",
        content: generatedCount > 0
          ? "완성! 이상한 거 있으면 추가 요청해주세요."
          : "문구를 만들었어요! 이미지를 첨부하거나 요청해보세요.",
        showReport: generatedCount > 0,
      });
    } catch (e) {
      showStatus(`오류: ${e instanceof Error ? e.message : "알 수 없는 오류"}`);
      addMessage({ role: "assistant", content: `오류가 발생했어요: ${e instanceof Error ? e.message : "알 수 없는 오류"}` });
    } finally {
      setIsLoading(false);
    }
  };

  // ── 변주 (+ 버튼) → 입력창 활성화 ──
  const handleVariateClick = (field: "copy" | "sub" | "image") => {
    setVariateInput(field);
    setEditingField(null);
  };

  // 변주 실행 (입력창에서 submit)
  const handleVariateSubmit = async (userPrompt: string) => {
    const field = variateInput;
    if (!field) return;
    setVariateInput(null);
    setVariatingField(field);

    try {
      if (field === "copy" || field === "sub") {
        const res = await apiFetch("/api/suggest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            field: field === "copy" ? "title" : "sub",
            currentContent: composite,
            ...(userPrompt ? { hint: userPrompt } : {}),
          }),
        });
        if (!res.ok) throw new Error("대안 생성 실패");
        const data = await res.json();

        if (field === "copy" && Array.isArray(data.suggestions)) {
          const newCopies: CopyOption[] = data.suggestions.map((s: [string, string]) => ({
            label: composite.label,
            titleLine1: s[0],
            titleLine2: s[1],
          }));
          setCopyPool((prev) => [...prev, ...newCopies]);
          setSelCopy(copyPool.length);
        } else if (field === "sub" && Array.isArray(data.suggestions)) {
          const newSubs: SubOption[] = data.suggestions.map((s: [string, string]) => ({
            subLine1: s[0],
            subLine2: s[1],
          }));
          setSubPool((prev) => [...prev, ...newSubs]);
          setSelSub(subPool.length);
        }
      } else {
        showStatus("새 이미지 생성 중...");
        const prompt = userPrompt || `${composite.label} ${composite.titleLine1} ${composite.titleLine2}`;
        const imgUrl = await generateImageFromPrompt(prompt, composite, brandCtx);
        if (imgUrl) addImageToPool(imgUrl);
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
      const res = await apiFetch("/api/analyze-image", { method: "POST", body: formData });
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
      const res = await apiFetch("/api/generate-image", {
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

  async function imageUrlToBase64(url: string): Promise<{ data: string; mimeType: string } | null> {
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
    } catch { return null; }
  }

  async function searchBrand(query: string): Promise<BrandContext | null> {
    try {
      const res = await apiFetch("/api/search-brand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.found ? data as BrandContext : null;
    } catch { return null; }
  }

  async function generateImageFromPrompt(prompt: string, variant: CTContent, brandContext?: BrandContext | null, variation?: number, referenceImages?: { data: string; mimeType: string }[], enhance?: boolean): Promise<string | null> {
    try {
      const res = await apiFetch("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          imageType: variant.imageType || "",
          copyContext: { nm1_label: variant.label, nm2_title: variant.titleLine1, nm3_desc: variant.titleLine2 },
          ...(brandContext ? { brandContext } : {}),
          ...(variation !== undefined ? { variation } : {}),
          ...(referenceImages?.length ? { referenceImages } : {}),
          ...(enhance ? { enhance: true } : {}),
        }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.image ? `data:${data.image.mimeType};base64,${data.image.data}` : null;
    } catch { return null; }
  }

  const handleMessage = async (rawText: string, images?: AttachedImage[]) => {
    // 숫자만 입력했으면 마지막 options 메시지에서 해당 옵션으로 변환
    let text = rawText.trim();
    const numMatch = text.match(/^(\d)$/);
    if (numMatch) {
      const lastOptions = [...messages].reverse().find((m) => m.type === "options" && m.options?.length);
      if (lastOptions?.options) {
        const idx = parseInt(numMatch[1]) - 1;
        if (idx >= 0 && idx < lastOptions.options.length) {
          text = lastOptions.options[idx].value;
        }
      }
    }

    // 유저 메시지를 채팅에 추가
    addMessage({
      role: "user",
      content: text,
      imageUrls: images?.map((img) => img.previewUrl),
      attachedImages: images,
    });

    // ── 이미지/텍스트 첨부 대기 중인데 이미지 없이 텍스트만 온 경우 → 그냥 만들어주기 ──
    if (highlightAttach && !images?.length) {
      setHighlightAttach(false);
      setChatPlaceholder("만들고 싶은 콘텐츠를 알려주세요");
      const prompt = [contentSpec.brand, contentSpec.content].filter(Boolean).join(" ");
      addMessage({ role: "assistant", content: "알겠어요, AI가 알아서 만들어볼게요!" });
      await handleSend(prompt || text);
      return;
    }

    // ── 이미 카드 있으면 수정 모드 ──
    const hasImages = !!(images && images.length > 0);
    if (hasContent) {
      await handleSend(text, images);
      return;
    }

    // ── 이미지 첨부됨 + 처리 방식 미명시 → 이미지 처리 옵션 질문 ──
    const imageProcessKeywords = ["보정", "조합", "합성", "합쳐", "섞어", "바로 적용", "그대로"];
    const hasImageIntent = imageProcessKeywords.some((kw) => text.includes(kw));
    if (hasImages && !hasImageIntent) {
      setHighlightAttach(false);
      addMessage({
        role: "assistant",
        content: "이미지를 어떻게 활용할까요?",
        type: "options",
        options: [
          { label: "그대로 사용", value: "이 이미지를 그대로 카드 배경으로 사용해줘" },
          { label: "AI 보정", value: "이 이미지를 AI로 보정해서 카드 만들어줘" },
          { label: "스타일 변형", value: "이 이미지 스타일을 참고해서 새로 만들어줘" },
        ],
      });
      return;
    }

    // ── 이미지 첨부 + 의도 명확 → 바로 생성 ──
    if (hasImages) {
      await handleSend(text, images);
      return;
    }

    // ── Extract-Spec: LLM이 필드 추출 → 클라이언트가 판단 ──
    try {
      const statusId = addMessage({ role: "assistant", content: "생각하는 중...", type: "status" });

      // "AI가 바로 만들기" 또는 위임형 발화 → 현재 spec으로 생성
      const isDelegation = text === "AI가 바로 만들기" ||
        (contentSpec.brand && /그냥|걍|알아서|다해|니가|너가|넘어가|바로.*만들|만들어줘|ㄱㄱ|고고/.test(text));
      if (isDelegation) {
        setHighlightAttach(false);
        const prompt = [contentSpec.brand, contentSpec.content].filter(Boolean).join(" ");
        updateMessage(statusId, { content: "만들어볼게요!", type: "text" });
        await handleSend(prompt || text, images);
        return;
      }

      // "텍스트 초안 있어요" → 텍스트 입력 유도
      if (text === "텍스트 초안 있어요") {
        updateMessage(statusId, {
          content: "텍스트 초안을 입력해주세요!",
          type: "text",
        });
        setChatPlaceholder("텍스트 초안을 입력해주세요");
        raiseSheet();
        return;
      }

      // "이미지 있어요" → 첨부 유도 + imageSource 기록
      if (text === "이미지 있어요") {
        setHighlightAttach(true);
        setContentSpec(prev => ({ ...prev, imageSource: "upload" }));
        updateMessage(statusId, {
          content: "이미지를 첨부해주세요!",
          type: "text",
        });
        setChatPlaceholder("이미지를 첨부해주세요");
        raiseSheet();
        return;
      }

      // "둘 다 있어요" → 텍스트 + 이미지 첨부 유도 + imageSource 기록
      if (text === "둘 다 있어요") {
        setHighlightAttach(true);
        setContentSpec(prev => ({ ...prev, imageSource: "upload" }));
        updateMessage(statusId, {
          content: "텍스트 초안을 입력하고, 이미지도 첨부해주세요!",
          type: "text",
        });
        setChatPlaceholder("텍스트 초안을 입력하세요 (이미지도 첨부)");
        raiseSheet();
        return;
      }

      // "AI가 알아서 해주세요" → brand 있으면 바로 생성, 없으면 brand 질문
      if (text === "AI가 알아서 해주세요") {
        if (contentSpec.brand) {
          const prompt = contentSpec.brand + (contentSpec.content ? " " + contentSpec.content : "");
          updateMessage(statusId, { content: "AI가 알아서 만들어볼게요!", type: "text" });
          await handleSend(prompt, images);
        } else {
          updateMessage(statusId, {
            content: "어떤 브랜드/주제의 콘텐츠를 만들까요?",
            type: "options",
            options: [
              { label: "AI가 알아서 해주세요", value: "AI가 알아서 해주세요" },
              { label: "대한항공카드", value: "대한항공카드" },
              { label: "마켓컬리", value: "마켓컬리" },
              { label: "자동차대출", value: "자동차대출" },
            ],
          });
          raiseSheet();
        }
        return;
      }

      // extract-spec 호출 → 필드 추출
      const res = await apiFetch("/api/extract-spec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, currentSpec: contentSpec }),
      });
      const { extracted } = await res.json();

      // contentSpec 머지
      const newSpec = { ...contentSpec, ...extracted };
      setContentSpec(newSpec);

      // 클라이언트 판단: 필수 필드 체크
      if (!newSpec.brand) {
        // brand 없음 → 질문
        updateMessage(statusId, {
          content: "어떤 브랜드/주제의 콘텐츠를 만들까요?",
          type: "options",
          options: [
            { label: "AI가 알아서 해주세요", value: "AI가 알아서 해주세요" },
            { label: "대한항공카드", value: "대한항공카드" },
            { label: "마켓컬리", value: "마켓컬리" },
            { label: "자동차대출", value: "자동차대출" },
          ],
        });
        raiseSheet();
      } else if (!newSpec.content) {
        // brand 있고 content 없음 → 소재 추천 요청
        updateMessage(statusId, { content: `${newSpec.brand} 관련 소재를 찾고 있어요...`, type: "status" });
        try {
          const suggestRes = await apiFetch("/api/suggest-content", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ brand: newSpec.brand }),
          });
          const { suggestions } = await suggestRes.json();
          const options = [
            { label: "AI가 알아서 해주세요", value: "AI가 알아서 해주세요" },
            ...((suggestions as string[]) || []).map((s: string) => ({ label: s, value: s })),
          ];
          updateMessage(statusId, {
            content: `${newSpec.brand} 관련 어떤 내용을 담을까요?`,
            type: "options",
            options,
          });
        } catch {
          updateMessage(statusId, {
            content: `${newSpec.brand} 관련 어떤 내용을 담을까요?`,
            type: "options",
            options: [{ label: "AI가 알아서 해주세요", value: "AI가 알아서 해주세요" }],
          });
        }
        raiseSheet();
      } else if (newSpec.textDraft && !contentSpec.textDraft) {
        // 텍스트 초안이 방금 입력됨 → 3안 제시
        updateMessage(statusId, {
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
        // brand + content 확정 → 부족한 필드만 질문
        const hasText = !!newSpec.textDraft;
        const hasImage = !!newSpec.imageSource;

        if (hasText && hasImage) {
          // 모두 확정 → 바로 생성
          const prompt = [newSpec.brand, newSpec.content].filter(Boolean).join(" ");
          updateMessage(statusId, { content: "만들어볼게요!", type: "text" });
          await handleSend(prompt);
        } else if (hasText && !hasImage) {
          // 텍스트 있고 이미지 없음 → 이미지만 질문
          updateMessage(statusId, {
            content: `텍스트는 받았어요! 이미지는 어떻게 할까요?`,
            type: "options",
            options: [
              { label: "AI가 바로 만들기", value: "AI가 바로 만들기" },
              { label: "이미지 있어요", value: "이미지 있어요" },
            ],
          });
        } else if (!hasText && hasImage) {
          // 이미지 있고 텍스트 없음 → 텍스트만 질문
          updateMessage(statusId, {
            content: `이미지는 받았어요! 텍스트는 어떻게 할까요?`,
            type: "options",
            options: [
              { label: "AI가 바로 만들기", value: "AI가 바로 만들기" },
              { label: "텍스트 초안 있어요", value: "텍스트 초안 있어요" },
            ],
          });
        } else {
          // 둘 다 없음 → 전체 옵션
          updateMessage(statusId, {
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

  const textColor = composite.textColor === "BK" ? "#000000" : "#FFFFFF";


  // API 키 로딩 중
  if (apiKeyReady === null) {
    return <div className="h-[100dvh] flex items-center justify-center bg-[#555]"><div className="w-4 h-4 border-2 border-gray-400 border-t-white rounded-full animate-spin" /></div>;
  }

  // API 키 미설정 → 설정 화면
  if (!apiKeyReady) {
    return (
      <ApiKeySetup onComplete={async () => {
        if (isWorkingGroup()) {
          apiKeyRef.current = null;
        } else {
          apiKeyRef.current = await loadKey();
        }
        setApiKeyReady(true);
      }} />
    );
  }

  return (
    <div className="h-[100dvh] flex items-center justify-center bg-[#555]">
      <div className="w-full h-full sm:max-w-[430px] sm:max-h-[932px] flex flex-col bg-[#555] overflow-hidden sm:shadow-2xl sm:rounded-[2rem] sm:border sm:border-gray-700 relative">

        {/* 메인: 디바이스 목업 */}
        <div
          ref={deviceContainerRef}
          className="flex-1 flex flex-col items-center justify-start overflow-hidden"
        >
          <div className="relative">
            <DeviceViewer
              content={composite}
              onFieldClick={hasContent ? (field: CTTextField, _rect: DOMRect) => handleFieldClick(field) : undefined}
              onToggleTextColor={undefined}
              scale={SCALE}
              skeleton={hasContent}
              cropRatio={1}
            />

            {/* 캐러셀 레이어 — 목업 위, CT 카드 영역에 클리핑 */}
            {hasContent && (
              <div
                className="absolute overflow-hidden pointer-events-none"
                style={{
                  left: CT.x,
                  top: CT.y,
                  width: CT.w,
                  height: CT.h,
                  borderRadius: 16 * SCALE,
                }}
              >
                {/* 이미지 캐러셀 (전체 카드 영역) */}
                <div
                  className="absolute inset-0 pointer-events-auto cursor-grab active:cursor-grabbing"
                  onTouchStart={handleCardTouchStart}
                  onTouchEnd={(e) => handleCardTouchEnd(e, "image")}
                  onMouseDown={handleCardMouseDown}
                  onMouseUp={(e) => handleCardMouseUp(e, "image")}
                >
                  <div
                    className="flex h-full transition-transform duration-300 ease-out"
                    style={{ width: `${imagePool.length * 100}%`, transform: `translateX(-${(selImage / imagePool.length) * 100}%)` }}
                  >
                    {imagePool.map((img, i) => (
                      <div key={i} className="relative h-full transition-opacity duration-300" style={{ width: `${100 / imagePool.length}%`, opacity: i === selImage ? 1 : 0.3 }}>
                        {img.imageUrl && (
                          <img src={img.imageUrl} alt="" className="absolute inset-0 w-full h-full" style={{ objectFit: "cover" }} draggable={false} />
                        )}
                        {/* 그라데이션 */}
                        {img.bgTreatment.type === "gradient" && (
                          <div className="absolute top-0 left-0 w-full" style={{
                            height: `${(2/3)*100}%`,
                            background: img.bgTreatment.direction === "dark"
                              ? `linear-gradient(to bottom, ${img.bgTreatment.stops.map(s => `rgba(0,0,0,${s.opacity}) ${s.position}%`).join(", ")})`
                              : `linear-gradient(to bottom, ${img.bgTreatment.stops.map(s => `rgba(255,255,255,${s.opacity}) ${s.position}%`).join(", ")})`,
                          }} />
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* 상단 텍스트 캐러셀 */}
                <div
                  className="absolute top-0 left-0 right-0 pointer-events-auto cursor-grab active:cursor-grabbing"
                  style={{ height: CT.h * ZONE_TOP }}
                  onTouchStart={handleCardTouchStart}
                  onTouchEnd={(e) => handleCardTouchEnd(e, "copy")}
                  onMouseDown={handleCardMouseDown}
                  onMouseUp={(e) => handleCardMouseUp(e, "copy")}
                >
                  <div
                    className="flex h-full transition-transform duration-300 ease-out"
                    style={{ width: `${copyPool.length * 100}%`, transform: `translateX(-${(selCopy / copyPool.length) * 100}%)` }}
                  >
                    {copyPool.map((opt, i) => (
                      <div key={i} className="h-full transition-opacity duration-300" style={{ width: `${100 / copyPool.length}%`, opacity: i === selCopy ? 1 : 0.3, padding: `${24*SCALE}px` }}>
                        <div style={{ fontSize: 14*SCALE, lineHeight: `${20*SCALE}px`, fontWeight: 700, color: textColor }}>{opt.label}</div>
                        <div style={{ height: 8*SCALE }} />
                        <div style={{ fontSize: 24*SCALE, lineHeight: `${32*SCALE}px`, fontWeight: 700, color: textColor, wordBreak: "keep-all" }}>
                          <div>{opt.titleLine1}</div>
                          <div>{opt.titleLine2}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 하단 텍스트 캐러셀 */}
                <div
                  className="absolute bottom-0 left-0 right-0 pointer-events-auto cursor-grab active:cursor-grabbing"
                  style={{ height: CT.h * (1 - ZONE_MID) }}
                  onTouchStart={handleCardTouchStart}
                  onTouchEnd={(e) => handleCardTouchEnd(e, "sub")}
                  onMouseDown={handleCardMouseDown}
                  onMouseUp={(e) => handleCardMouseUp(e, "sub")}
                >
                  <div
                    className="flex h-full transition-transform duration-300 ease-out"
                    style={{ width: `${subPool.length * 100}%`, transform: `translateX(-${(selSub / subPool.length) * 100}%)` }}
                  >
                    {subPool.map((opt, i) => (
                      <div key={i} className="h-full flex items-end transition-opacity duration-300 min-h-full" style={{ width: `${100 / subPool.length}%`, opacity: (!opt.subLine1 && !opt.subLine2) ? 0 : i === selSub ? 1 : 0.3, padding: `${24*SCALE}px` }}>
                        <div style={{ fontSize: 14*SCALE, lineHeight: `${20*SCALE}px`, fontWeight: 700, color: textColor }}>
                          <div>{opt.subLine1}</div>
                          <div>{opt.subLine2}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 첫 생성 힌트 */}
                {showHint && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none animate-pulse">
                    <div className="bg-black/60 text-white text-[10px] px-3 py-1.5 rounded-full">
                      ← 영역별로 스와이프 →
                    </div>
                  </div>
                )}
              </div>
            )}

{/* 인디케이터는 바텀시트로 이동 */}
          </div>
        </div>

        {/* 하단 바텀시트 */}
        <div
          className="shrink-0 z-10 relative -mt-[15px]"
          style={{
            height: sheetHeight + 15,
            borderRadius: "15px 15px 0 0",
            paddingBottom: "env(safe-area-inset-bottom)",
            transition: sheetSnapping ? "height 0.25s ease-out" : "none",
            background: "linear-gradient(to bottom, #666 0%, #666 70%, #555 100%)",
          }}
        >
          {/* 드래그 핸들 */}
          <div
            className="flex justify-center pt-3 pb-5 cursor-grab active:cursor-grabbing touch-none"
            onMouseDown={(e) => {
              onDragStart(e.clientY);
              const onMove = (me: MouseEvent) => onDragMove(me.clientY);
              const onUp = () => { onDragEnd(); window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
              window.addEventListener("mousemove", onMove);
              window.addEventListener("mouseup", onUp);
            }}
            onTouchStart={(e) => {
              onDragStart(e.touches[0].clientY);
              const onMove = (te: TouchEvent) => onDragMove(te.touches[0].clientY);
              const onUp = () => { onDragEnd(); window.removeEventListener("touchmove", onMove); window.removeEventListener("touchend", onUp); };
              window.addEventListener("touchmove", onMove, { passive: true });
              window.addEventListener("touchend", onUp);
            }}
          >
            <div className="w-10 h-1 rounded-full bg-[#444]" />
          </div>
          {/* 풀별 도트 인디케이터 + 액션 버튼 */}
          {hasContent && (
            <div className="flex items-center px-4 pb-2 -mt-2">
              {/* 인디케이터 — 중앙 */}
              <div className="flex-1 flex items-center justify-center gap-4">
                {[
                  { pool: copyPool, sel: selCopy, label: "상단문구" },
                  { pool: imagePool, sel: selImage, label: "이미지" },
                  { pool: subPool, sel: selSub, label: "하단문구" },
                ].map(({ pool, sel, label }) => {
                  const isImageLoading = label === "이미지" && pool.length === 0 && isLoading;
                  if (pool.length <= 1 && !isImageLoading) return null;
                  return (
                    <div key={label} className="flex items-center gap-1.5">
                      <span className="text-[10px] text-gray-400 mr-0.5">{label}</span>
                      {isImageLoading ? (
                        <div className="w-3 h-3 border border-gray-400 border-t-white rounded-full animate-spin" />
                      ) : (
                        pool.map((_, i) => (
                          <div
                            key={i}
                            className="rounded-full transition-all duration-200"
                            style={{
                              width: i === sel ? 16 : 6,
                              height: 6,
                              backgroundColor: i === sel ? "#fff" : "rgba(255,255,255,0.3)",
                            }}
                          />
                        ))
                      )}
                    </div>
                  );
                })}
              </div>
              {/* 우측 액션: 글자색 토글 + 이미지 받기 */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => {
                    const newColor = composite.textColor === "WT" ? "BK" : "WT";
                    const newBg = newColor === "WT"
                      ? { type: "gradient" as const, direction: "dark" as const, stops: [{ position: 0, opacity: 0.6 }, { position: 100, opacity: 0 }] }
                      : { type: "gradient" as const, direction: "light" as const, stops: [{ position: 0, opacity: 0.6 }, { position: 100, opacity: 0 }] };
                    setImagePool((prev) => prev.map((img, i) =>
                      i === selImage ? { ...img, textColor: newColor as "BK" | "WT", bgTreatment: newBg } : img
                    ));
                  }}
                  className="w-7 h-7 rounded-full flex items-center justify-center border transition-colors"
                  style={{
                    backgroundColor: composite.textColor === "WT" ? "#fff" : "#1a1a1a",
                    borderColor: composite.textColor === "WT" ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.2)",
                    color: composite.textColor === "WT" ? "#555" : "#fff",
                  }}
                  title={`글자색: ${composite.textColor === "WT" ? "흰색→검정" : "검정→흰색"}`}
                >
                  <span className="text-[10px] font-bold">{composite.textColor === "WT" ? "W" : "B"}</span>
                </button>
                <button
                  onClick={() => exportCtPng(composite)}
                  className="w-7 h-7 rounded-full flex items-center justify-center bg-white/20 hover:bg-white/30 transition-colors"
                  title="이미지 받기 (WebP 3x)"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                </button>
              </div>
            </div>
          )}
          {/* 텍스트 수정 시트 (오버레이) */}
          {editingField && (
            <div className="absolute inset-0 z-20 bg-[#666] px-4 pt-3 flex flex-col">
              <EditSheet
                field={editingField.field}
                value={editingField.value}
                onSave={(v) => handleFieldSave(editingField.field, v)}
                onCancel={() => setEditingField(null)}
              />
            </div>
          )}
          {/* 변주 입력 모드 (오버레이) */}
          {variateInput && !editingField && (
            <div className="absolute inset-0 z-20 bg-[#666] px-4 pt-3 flex flex-col">
              <VariateInputSheet
                field={variateInput}
                onSubmit={handleVariateSubmit}
                onCancel={() => setVariateInput(null)}
                loading={variatingField !== null}
              />
            </div>
          )}
          <ChatPanel
            messages={messages}
            onSend={handleMessage}
            isLoading={isLoading}
            genStatus={statusMessage as GenerationStatus}
            placeholder={chatPlaceholder}
            collapsed={sheetHeight <= 100}
            highlightAttach={highlightAttach}
            onReport={() => setShowReport(true)}
            onInputFocusChange={handleInputFocusChange}
          />
        </div>
      </div>

      {showReport && hasContent && (
        <ReportModal content={composite} onClose={() => setShowReport(false)} />
      )}
    </div>
  );
}

// ── 변주 버튼 ──
function VariateButton({ label, onClick, loading, count }: {
  label: string; onClick: () => void; loading: boolean; count: number;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="flex items-center gap-1 px-3 py-1.5 text-xs bg-white border border-gray-200 rounded-full hover:bg-gray-50 disabled:opacity-50 transition-colors"
    >
      {loading ? (
        <div className="w-3 h-3 border-[1.5px] border-gray-300 border-t-gray-600 rounded-full animate-spin" />
      ) : (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      )}
      <span className="text-gray-600">{label}</span>
      <span className="text-gray-300">{count}</span>
    </button>
  );
}

// ── 텍스트 수정 시트 ──
const FIELD_NAMES: Record<string, string> = {
  label: "라벨", title: "타이틀", titleLine1: "타이틀 1줄", titleLine2: "타이틀 2줄",
  sub: "서브텍스트", subLine1: "서브 1줄", subLine2: "서브 2줄",
};

function EditSheet({
  field,
  value,
  onSave,
  onCancel,
}: {
  field: CTTextField;
  value: string;
  onSave: (v: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="bg-white border border-blue-200 rounded-xl p-2 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-blue-500 shrink-0">{FIELD_NAMES[field] || field}</span>
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") onSave(text); if (e.key === "Escape") onCancel(); }}
          autoFocus
          className="flex-1 text-sm outline-none bg-transparent"
        />
        <button onClick={() => onSave(text)} className="px-2.5 h-7 rounded-lg bg-blue-500 text-white text-xs shrink-0">
          적용
        </button>
        <button onClick={onCancel} className="text-gray-300 hover:text-gray-500 shrink-0">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ── 변주 입력 시트 ──
const VARIATE_LABELS = {
  copy: "상단 문구",
  sub: "하단 문구",
  image: "이미지",
};

function VariateInputSheet({
  field,
  onSubmit,
  onCancel,
  loading,
}: {
  field: "copy" | "sub" | "image";
  onSubmit: (prompt: string) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const hints: Record<string, string[]> = {
    copy: ["더 감성적으로", "할인 강조해서", "짧고 임팩트있게", "호기심 유발하게"],
    sub: ["CTA 느낌으로", "혜택 요약해서", "없이 깔끔하게"],
    image: ["따뜻한 톤으로", "3D 모델링 느낌", "벡터 일러스트", "미니멀하게", "고급스럽게"],
  };

  return (
    <div className="bg-white border-2 border-blue-400 rounded-xl p-2 shadow-sm">
      <div className="text-[10px] text-blue-500 mb-1 px-1">
        {VARIATE_LABELS[field]} 변주 — 추가 요청사항이 있나요?
      </div>
      <div className="flex items-center gap-2">
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSubmit(text); } if (e.key === "Escape") onCancel(); }}
          placeholder={`예: ${hints[field]?.slice(0, 2).join(", ")}...`}
          autoFocus
          rows={1}
          className="flex-1 resize-none outline-none bg-transparent text-sm placeholder:text-gray-300"
          style={{ fontSize: "16px" }}
          disabled={loading}
        />
        <button
          onClick={() => onSubmit(text)}
          disabled={loading}
          className="shrink-0 px-3 h-8 rounded-lg bg-blue-500 text-white text-xs disabled:opacity-50 transition-colors whitespace-nowrap"
        >
          {loading ? "생성 중..." : text.trim() ? "생성" : "바로 생성"}
        </button>
        <button onClick={onCancel} className="text-gray-300 hover:text-gray-500 shrink-0">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      <div className="flex flex-wrap gap-1 mt-1.5 px-0.5">
        {hints[field]?.map((h) => (
          <button
            key={h}
            onClick={() => setText((prev) => prev ? `${prev}, ${h}` : h)}
            className="text-[10px] text-gray-400 bg-gray-50 border border-gray-100 rounded-full px-2 py-0.5 hover:bg-blue-50 hover:text-blue-500 hover:border-blue-200 transition-colors"
          >
            {h}
          </button>
        ))}
      </div>
    </div>
  );
}
