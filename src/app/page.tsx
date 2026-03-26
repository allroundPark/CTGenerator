"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { CTTextField, GenerationStatus } from "@/types/ct";
import ChatPanel from "@/components/ChatPanel";
import DeviceViewer from "@/components/DeviceViewer";
import ReportModal from "@/components/ReportModal";
import ApiKeySetup from "@/components/ApiKeySetup";
import { exportCtPng, exportCtBase64 } from "@/lib/exportPng";
import { loadKey, hasStoredKey, isWorkingGroup } from "@/lib/apiKey";
import { supabase } from "@/lib/supabase";
import { getDeviceId } from "@/lib/deviceId";
import { useOrchestrate } from "@/hooks/useOrchestrate";

export default function Home() {
  // ── API 키 상태 ──
  const [apiKeyReady, setApiKeyReady] = useState<boolean | null>(null);
  const apiKeyRef = useRef<string | null>(null);

  useEffect(() => {
    (async () => {
      if (typeof window === "undefined") return;
      if (isWorkingGroup()) {
        apiKeyRef.current = null;
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

  const apiFetch = useCallback((url: string, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    if (apiKeyRef.current) {
      headers.set("x-api-key", apiKeyRef.current);
    }
    return fetch(url, { ...init, headers });
  }, []);

  // ── Orchestrate 훅 ──
  const orch = useOrchestrate(apiFetch);

  // ── UI 전용 상태 ──
  const [showHint, setShowHint] = useState(true);
  const [showEmailInput, setShowEmailInput] = useState(false);
  const [emailAddr, setEmailAddr] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [reportRating, setReportRating] = useState<"good" | "bad" | null>(null);
  const [editingField, setEditingField] = useState<{ field: CTTextField; value: string } | null>(null);

  // ── 바텀시트 ──
  const [sheetHeight, setSheetHeight] = useState(100);
  const [sheetSnapping, setSheetSnapping] = useState(false);
  const sheetHeightRef = useRef(sheetHeight);
  sheetHeightRef.current = sheetHeight;
  const dragRef = useRef<{ startY: number; startH: number } | null>(null);

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

  // raiseSheet를 orchestrate에 주입
  useEffect(() => {
    orch.setRaiseSheet(raiseSheet);
  }, [raiseSheet, orch.setRaiseSheet]);

  // 메시지가 있거나 로딩 중이면 최소 280px 스냅
  const messagesLength = orch.messages.length;
  const orchIsLoading = orch.isLoading;
  useEffect(() => {
    if ((messagesLength > 0 || orchIsLoading) && sheetHeightRef.current <= 100) {
      setSheetSnapping(true);
      setSheetHeight(280);
      sheetHeightRef.current = 280;
    }
  }, [messagesLength, orchIsLoading]);

  // 입력창 포커스 — no-op
  const handleInputFocusChange = useCallback((_focused: boolean) => {}, []);

  // ── 디바이스 프리뷰 ──
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

  const CT_BOTTOM_1X = 546;
  const scaleByWidth = containerWidth > 0 ? containerWidth / 375 : 1;
  const availableHeight = Math.max(0, containerHeight - 15);
  const scaleByHeight = availableHeight > 0 ? availableHeight / CT_BOTTOM_1X : 1;
  const SCALE = Math.min(scaleByWidth, scaleByHeight);

  const CT = { x: 19 * SCALE, y: 188 * SCALE, w: 335 * SCALE, h: 348 * SCALE };
  const ZONE_TOP = 0.35;
  const ZONE_MID = 0.80;
  const textColor = orch.composite.textColor === "BK" ? "#000000" : "#FFFFFF";

  // ── 스와이프 ──
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const handleCardTouchStart = (e: React.TouchEvent) => {
    swipeStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const handleSwipeEnd = (clientX: number, zone: "copy" | "image" | "sub") => {
    if (!swipeStartRef.current || !orch.hasContent) return;
    const dx = swipeStartRef.current.x - clientX;
    swipeStartRef.current = null;
    if (Math.abs(dx) < 40) return;
    orch.handleSwipe(zone, dx > 0 ? 1 : -1);
    setShowHint(false);
  };
  const handleCardTouchEnd = (e: React.TouchEvent, zone: "copy" | "image" | "sub") =>
    handleSwipeEnd(e.changedTouches[0].clientX, zone);
  const handleCardMouseDown = (e: React.MouseEvent) => {
    swipeStartRef.current = { x: e.clientX, y: e.clientY };
  };
  const handleCardMouseUp = (e: React.MouseEvent, zone: "copy" | "image" | "sub") =>
    handleSwipeEnd(e.clientX, zone);

  // ── 필드 클릭 → 수정 모드 ──
  const handleFieldClick = useCallback((field: CTTextField) => {
    if (!orch.hasContent) return;
    let value = "";
    if (field === "label") value = orch.composite.label;
    else if (field === "titleLine1" || field === "title") value = orch.composite.titleLine1;
    else if (field === "titleLine2") value = orch.composite.titleLine2;
    else if (field === "subLine1" || field === "sub") value = orch.composite.subLine1;
    else if (field === "subLine2") value = orch.composite.subLine2;
    setEditingField({ field, value });
  }, [orch.hasContent, orch.composite]);

  const handleFieldSave = (field: CTTextField, value: string) => {
    orch.handleFieldSave(field, value);
    setEditingField(null);
  };

  // ── 메일 ──
  const handleSendEmail = async () => {
    if (!emailAddr.trim() || !orch.hasContent) return;
    setEmailSending(true);
    try {
      const { base64, fileName } = await exportCtBase64(orch.composite);
      const res = await apiFetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: emailAddr.trim(), imageBase64: base64, fileName }),
      });
      if (res.ok) {
        setShowEmailInput(false);
        setEmailAddr("");
      }
    } catch { /* ignore */ }
    finally { setEmailSending(false); }
  };

  // ── 퀵 레이팅 ──
  const handleQuickRate = useCallback(async (_msgId: string, rating: "good" | "bad"): Promise<boolean> => {
    try {
      const { error } = await supabase.from("ct_reports").insert({
        device_id: getDeviceId(),
        card_state: {
          label: orch.composite.label,
          titleLine1: orch.composite.titleLine1,
          titleLine2: orch.composite.titleLine2,
          subLine1: orch.composite.subLine1,
          subLine2: orch.composite.subLine2,
          textColor: orch.composite.textColor,
          bgTreatment: orch.composite.bgTreatment,
          imageType: orch.composite.imageType,
          imageUrl: orch.composite.imageUrl?.startsWith("data:") ? "(base64 생성 이미지)" : orch.composite.imageUrl,
        },
        rating,
        user_memo: "",
        resolved: false,
      });
      if (error) { console.error("Quick rate error:", error); return false; }
      return true;
    } catch { return false; }
  }, [orch.composite]);

  // ── 렌더링 ──
  if (apiKeyReady === null) {
    return <div className="h-[100dvh] flex items-center justify-center bg-[#555]"><div className="w-4 h-4 border-2 border-gray-400 border-t-white rounded-full animate-spin" /></div>;
  }

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
              content={orch.composite}
              onFieldClick={orch.hasContent ? (field: CTTextField, _rect: DOMRect) => handleFieldClick(field) : undefined}
              onToggleTextColor={undefined}
              scale={SCALE}
              skeleton={orch.hasContent}
              cropRatio={1}
            />

            {/* 캐러셀 레이어 */}
            {orch.hasContent && (
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
                {/* 이미지 캐러셀 */}
                <div
                  className="absolute inset-0 pointer-events-auto cursor-grab active:cursor-grabbing"
                  onTouchStart={handleCardTouchStart}
                  onTouchEnd={(e) => handleCardTouchEnd(e, "image")}
                  onMouseDown={handleCardMouseDown}
                  onMouseUp={(e) => handleCardMouseUp(e, "image")}
                >
                  <div
                    className="flex h-full transition-transform duration-300 ease-out"
                    style={{ width: `${orch.imagePool.length * 100}%`, transform: `translateX(-${(orch.selImage / orch.imagePool.length) * 100}%)` }}
                  >
                    {orch.imagePool.map((img, i) => (
                      <div key={i} className="relative h-full transition-opacity duration-300" style={{ width: `${100 / orch.imagePool.length}%`, opacity: i === orch.selImage ? 1 : 0.3 }}>
                        {img.imageUrl && (
                          <img src={img.imageUrl} alt="" className="absolute inset-0 w-full h-full" style={{ objectFit: "cover" }} draggable={false} />
                        )}
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
                    style={{ width: `${orch.copyPool.length * 100}%`, transform: `translateX(-${(orch.selCopy / orch.copyPool.length) * 100}%)` }}
                  >
                    {orch.copyPool.map((opt, i) => (
                      <div key={i} className="h-full transition-opacity duration-300" style={{ width: `${100 / orch.copyPool.length}%`, opacity: i === orch.selCopy ? 1 : 0.3, padding: `${24*SCALE}px` }}>
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
                    style={{ width: `${orch.subPool.length * 100}%`, transform: `translateX(-${(orch.selSub / orch.subPool.length) * 100}%)` }}
                  >
                    {orch.subPool.map((opt, i) => (
                      <div key={i} className="h-full flex items-end transition-opacity duration-300 min-h-full" style={{ width: `${100 / orch.subPool.length}%`, opacity: (!opt.subLine1 && !opt.subLine2) ? 0 : i === orch.selSub ? 1 : 0.3, padding: `${24*SCALE}px` }}>
                        <div style={{ fontSize: 14*SCALE, lineHeight: `${20*SCALE}px`, fontWeight: 700, color: textColor }}>
                          <div>{opt.subLine1}</div>
                          <div>{opt.subLine2}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 힌트 */}
                {showHint && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none animate-pulse">
                    <div className="bg-black/60 text-white text-[10px] px-3 py-1.5 rounded-full">
                      ← 영역별로 스와이프 →
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 바텀시트 */}
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
            <div className="w-9 h-1 rounded-full bg-gray-400/60" />
          </div>

          {/* 인디케이터 + 액션 */}
          {orch.hasContent && (
            <div className="flex items-center px-4 pb-2 -mt-2">
              <div className="flex-1 flex items-center justify-center gap-4">
                {[
                  { pool: orch.copyPool, sel: orch.selCopy, label: "상단문구" },
                  { pool: orch.imagePool, sel: orch.selImage, label: "이미지" },
                  { pool: orch.subPool, sel: orch.selSub, label: "하단문구" },
                ].map(({ pool, sel, label }) => {
                  const isImageLoading = label === "이미지" && pool.length === 0 && orch.isLoading;
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
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => {
                    const newColor = orch.composite.textColor === "WT" ? "BK" : "WT";
                    const newBg = newColor === "WT"
                      ? { type: "gradient" as const, direction: "dark" as const, stops: [{ position: 0, opacity: 0.6 }, { position: 100, opacity: 0 }] }
                      : { type: "gradient" as const, direction: "light" as const, stops: [{ position: 0, opacity: 0.6 }, { position: 100, opacity: 0 }] };
                    orch.updateImageOption(orch.selImage, { textColor: newColor as "BK" | "WT", bgTreatment: newBg });
                  }}
                  className="w-7 h-7 rounded-full flex items-center justify-center border transition-colors"
                  style={{
                    backgroundColor: orch.composite.textColor === "WT" ? "#fff" : "#1a1a1a",
                    borderColor: orch.composite.textColor === "WT" ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.2)",
                    color: orch.composite.textColor === "WT" ? "#555" : "#fff",
                  }}
                  title={`글자색: ${orch.composite.textColor === "WT" ? "흰색→검정" : "검정→흰색"}`}
                >
                  <span className="text-[10px] font-bold">{orch.composite.textColor === "WT" ? "W" : "B"}</span>
                </button>
                <button
                  onClick={() => exportCtPng(orch.composite)}
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

          {/* 텍스트 수정 시트 */}
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

          {/* 변주 입력 모드 */}
          {orch.variateInput && !editingField && (
            <div className="absolute inset-0 z-20 bg-[#666] px-4 pt-3 flex flex-col">
              <VariateInputSheet
                field={orch.variateInput}
                onSubmit={orch.handleVariateSubmit}
                onCancel={() => orch.setVariateInput(null)}
                loading={orch.variatingField !== null}
              />
            </div>
          )}

          <ChatPanel
            messages={orch.messages}
            onSend={orch.handleMessage}
            isLoading={orch.isLoading}
            genStatus={orch.statusMessage as GenerationStatus}
            placeholder={orch.chatPlaceholder}
            collapsed={sheetHeight <= 100}
            highlightAttach={orch.highlightAttach}
            onReport={(rating) => { setReportRating(rating ?? null); setShowReport(true); }}
            onQuickRate={handleQuickRate}
            onInputFocusChange={handleInputFocusChange}
            hasContent={orch.hasContent}
          />
        </div>
      </div>

      {showReport && orch.hasContent && (
        <ReportModal content={orch.composite} onClose={() => { setShowReport(false); setReportRating(null); }} rating={reportRating} />
      )}
    </div>
  );
}

// ── EditSheet ──
const FIELD_NAMES: Record<string, string> = {
  label: "라벨", title: "타이틀", titleLine1: "타이틀 1줄", titleLine2: "타이틀 2줄",
  sub: "서브텍스트", subLine1: "서브 1줄", subLine2: "서브 2줄",
};

function EditSheet({
  field, value, onSave, onCancel,
}: {
  field: CTTextField; value: string; onSave: (v: string) => void; onCancel: () => void;
}) {
  const [text, setText] = useState(value);
  return (
    <div className="bg-white border border-blue-200 rounded-xl p-2 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-blue-500 shrink-0">{FIELD_NAMES[field] || field}</span>
        <input
          type="text" value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") onSave(text); if (e.key === "Escape") onCancel(); }}
          autoFocus className="flex-1 text-sm outline-none bg-transparent"
        />
        <button onClick={() => onSave(text)} className="px-2.5 h-7 rounded-lg bg-blue-500 text-white text-xs shrink-0">적용</button>
        <button onClick={onCancel} className="text-gray-300 hover:text-gray-500 shrink-0">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>
    </div>
  );
}

// ── VariateInputSheet ──
const VARIATE_LABELS = { copy: "상단 문구", sub: "하단 문구", image: "이미지" };

function VariateInputSheet({
  field, onSubmit, onCancel, loading,
}: {
  field: "copy" | "sub" | "image"; onSubmit: (prompt: string) => void; onCancel: () => void; loading: boolean;
}) {
  const [text, setText] = useState("");
  const hints: Record<string, string[]> = {
    copy: ["더 감성적으로", "할인 강조해서", "짧고 임팩트있게", "호기심 유발하게"],
    sub: ["CTA 느낌으로", "혜택 요약해서", "없이 깔끔하게"],
    image: ["따뜻한 톤으로", "3D 모델링 느낌", "벡터 일러스트", "미니멀하게", "고급스럽게"],
  };

  return (
    <div className="bg-white border-2 border-blue-400 rounded-xl p-2 shadow-sm">
      <div className="text-[10px] text-blue-500 mb-1 px-1">{VARIATE_LABELS[field]} 변주 — 추가 요청사항이 있나요?</div>
      <div className="flex items-center gap-2">
        <textarea
          value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSubmit(text); } if (e.key === "Escape") onCancel(); }}
          placeholder={`예: ${hints[field]?.slice(0, 2).join(", ")}...`}
          autoFocus rows={1} disabled={loading}
          className="flex-1 resize-none outline-none bg-transparent text-sm placeholder:text-gray-300"
          style={{ fontSize: "16px" }}
        />
        <button
          onClick={() => onSubmit(text)} disabled={loading}
          className="shrink-0 px-3 h-8 rounded-lg bg-blue-500 text-white text-xs disabled:opacity-50 transition-colors whitespace-nowrap"
        >
          {loading ? "생성 중..." : text.trim() ? "생성" : "바로 생성"}
        </button>
        <button onClick={onCancel} className="text-gray-300 hover:text-gray-500 shrink-0">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>
      <div className="flex flex-wrap gap-1 mt-1.5 px-0.5">
        {hints[field]?.map((h) => (
          <button
            key={h} onClick={() => setText((prev) => prev ? `${prev}, ${h}` : h)}
            className="text-[10px] text-gray-400 bg-gray-50 border border-gray-100 rounded-full px-2 py-0.5 hover:bg-blue-50 hover:text-blue-500 hover:border-blue-200 transition-colors"
          >
            {h}
          </button>
        ))}
      </div>
    </div>
  );
}
