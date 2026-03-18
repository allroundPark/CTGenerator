"use client";

import { useState, useRef } from "react";
import { CTContent } from "@/types/ct";
import { getByteLength } from "@/lib/bytes";
import DeviceViewer from "./DeviceViewer";
import { exportCtPng } from "@/lib/exportPng";

const DEFAULT_CONTENT: CTContent = {
  id: "demo-001",
  label: "일이삼사오육칠팔구십일이",
  titleLine1: "일이삼사오육칠팔구십일이",
  titleLine2: "일이삼사오육칠팔구십일이",
  subLine1: "일이삼사오육칠팔구십일이",
  subLine2: "일이삼사오육칠팔구십일이",
  imageUrl: "",
  imageConstraint: { fit: "cover", alignX: "center", alignY: "center" },
  textColor: "WT",
  bgTreatment: {
    type: "gradient",
    direction: "dark",
    stops: [
      { position: 0, opacity: 0.6 },
      { position: 60, opacity: 0.3 },
      { position: 100, opacity: 0 },
    ],
  },
};

function TextInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const bytes = getByteLength(value);
  return (
    <div>
      {label && <label className="text-xs text-gray-400 mb-1 block">{label}</label>}
      <div className="relative">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full border border-gray-200 rounded-md px-3 py-2 pr-12 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder={placeholder}
        />
        <span className={`absolute right-2 top-1/2 -translate-y-1/2 text-[10px] ${bytes > 34 ? "text-red-500 font-semibold" : "text-gray-300"}`}>
          {bytes}/34
        </span>
      </div>
    </div>
  );
}

interface ManualEditorProps {
  initialContent?: CTContent;
}

export default function ManualEditor({ initialContent }: ManualEditorProps) {
  const [content, setContent] = useState<CTContent>(initialContent || DEFAULT_CONTENT);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setContent((prev) => ({ ...prev, imageUrl: url }));
  };

  const updateConstraint = (key: "alignX" | "alignY", value: string) => {
    setContent((prev) => ({
      ...prev,
      imageConstraint: { ...prev.imageConstraint, [key]: value },
    }));
  };

  const updateBgTreatment = (type: "none" | "solid" | "gradient") => {
    if (type === "none") {
      setContent((prev) => ({ ...prev, bgTreatment: { type: "none" } }));
    } else if (type === "solid") {
      setContent((prev) => ({
        ...prev,
        bgTreatment: { type: "solid", color: "#5B6B7B", height: 140 },
      }));
    } else {
      setContent((prev) => ({
        ...prev,
        bgTreatment: {
          type: "gradient",
          direction: (prev.textColor === "WT" ? "dark" : "light") as "dark" | "light",
          stops: [
            { position: 0, opacity: 0.6 },
            { position: 60, opacity: 0.3 },
            { position: 100, opacity: 0 },
          ],
        },
      }));
    }
  };

  return (
    <div className="flex-1 overflow-y-auto" style={{ WebkitOverflowScrolling: "touch" }}>
      <div className="max-w-[1400px] mx-auto flex flex-col-reverse md:flex-row gap-4 md:gap-5 px-4 md:px-5 py-4">
        {/* 컨트롤 (모바일: 목업 아래) */}
        <div className="w-full md:w-[520px] shrink-0 space-y-3 pb-8 md:pb-0">
          {/* 좌상단 텍스트 */}
          <section className="bg-white rounded-lg p-3 shadow-sm border border-gray-100">
            <h2 className="text-sm font-semibold text-gray-600 mb-2">좌상단 텍스트</h2>
            <div className="space-y-2">
              <TextInput label="라벨" value={content.label} onChange={(v) => setContent((prev) => ({ ...prev, label: v }))} placeholder="라벨..." />
            </div>
            <div className="mt-2">
              <label className="text-xs text-gray-400 mb-1 block">타이틀</label>
              <div className="space-y-0">
                <TextInput label="" value={content.titleLine1} onChange={(v) => setContent((prev) => ({ ...prev, titleLine1: v }))} placeholder="타이틀 1줄..." />
                <TextInput label="" value={content.titleLine2} onChange={(v) => setContent((prev) => ({ ...prev, titleLine2: v }))} placeholder="타이틀 2줄..." />
              </div>
            </div>
          </section>

          {/* 좌하단 텍스트 */}
          <section className="bg-white rounded-lg p-3 shadow-sm border border-gray-100">
            <h2 className="text-sm font-semibold text-gray-600 mb-2">좌하단 텍스트</h2>
            <div>
              <div className="space-y-0">
                <TextInput label="" value={content.subLine1} onChange={(v) => setContent((prev) => ({ ...prev, subLine1: v }))} placeholder="서브 1줄..." />
                <TextInput label="" value={content.subLine2} onChange={(v) => setContent((prev) => ({ ...prev, subLine2: v }))} placeholder="서브 2줄..." />
              </div>
            </div>
          </section>

          {/* 텍스트 색상 + 배경 처리 (가로 나열) */}
          <div className="flex gap-3">
            <section className="flex-1 bg-white rounded-lg p-3 shadow-sm border border-gray-100">
              <h2 className="text-sm font-semibold text-gray-600 mb-2">텍스트 색상</h2>
              <div className="flex gap-1.5">
                <button onClick={() => setContent((prev) => {
                  const updated = { ...prev, textColor: "BK" as const };
                  if (prev.bgTreatment.type === "gradient") {
                    updated.bgTreatment = { ...prev.bgTreatment, direction: "light" as const };
                  }
                  return updated;
                })} className={`flex-1 py-2 text-sm rounded-md border transition-colors ${content.textColor === "BK" ? "border-gray-900 bg-white text-black font-semibold" : "border-gray-200 text-gray-400"}`}>BK</button>
                <button onClick={() => setContent((prev) => {
                  const updated = { ...prev, textColor: "WT" as const };
                  if (prev.bgTreatment.type === "gradient") {
                    updated.bgTreatment = { ...prev.bgTreatment, direction: "dark" as const };
                  }
                  return updated;
                })} className={`flex-1 py-2 text-sm rounded-md border transition-colors ${content.textColor === "WT" ? "border-gray-900 bg-gray-900 text-white font-semibold" : "border-gray-200 bg-gray-100 text-gray-400"}`}>WT</button>
              </div>
            </section>

            <section className="flex-1 bg-white rounded-lg p-3 shadow-sm border border-gray-100">
              <h2 className="text-sm font-semibold text-gray-600 mb-2">배경 처리</h2>
              <div className="flex gap-1.5">
                {(["none", "gradient", "solid"] as const).map((type) => (
                  <button key={type} onClick={() => updateBgTreatment(type)} className={`flex-1 py-1.5 text-xs rounded-md transition-colors ${content.bgTreatment.type === type ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-500"}`}>
                    {type === "none" ? "없음" : type === "gradient" ? "그라데이션" : "솔리드"}
                  </button>
                ))}
              </div>
              {content.bgTreatment.type === "solid" && (
                <div className="flex items-center gap-2 mt-2">
                  <input type="color" value={content.bgTreatment.color} onChange={(e) => setContent((prev) => ({ ...prev, bgTreatment: { type: "solid" as const, color: e.target.value, height: 140 } }))} className="w-6 h-6 rounded border-0 cursor-pointer" />
                  <span className="text-xs text-gray-400 font-mono">{content.bgTreatment.color.toUpperCase()}</span>
                </div>
              )}
            </section>
          </div>

          {/* 이미지 + 정렬 */}
          <section className="bg-white rounded-lg p-3 shadow-sm border border-gray-100">
            <h2 className="text-sm font-semibold text-gray-600 mb-2">이미지</h2>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
            <div className="flex gap-3">
              <div className="flex-1">
                {content.imageUrl ? (
                  <div className="relative">
                    <img src={content.imageUrl} alt="uploaded" className="w-full h-20 object-cover rounded-md" />
                    <button onClick={() => { setContent((prev) => ({ ...prev, imageUrl: "" })); if (fileInputRef.current) fileInputRef.current.value = ""; }} className="absolute top-1 right-1 bg-black/60 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px]">✕</button>
                  </div>
                ) : (
                  <button onClick={() => fileInputRef.current?.click()} className="w-full h-20 border-2 border-dashed border-gray-200 rounded-md flex flex-col items-center justify-center text-gray-400 hover:border-gray-400 transition-colors">
                    <span className="text-xl mb-0.5">+</span>
                    <span className="text-xs">업로드</span>
                  </button>
                )}
              </div>
              <div className="flex-1 grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-400 mb-0.5 block">가로</label>
                  <select value={content.imageConstraint.alignX} onChange={(e) => updateConstraint("alignX", e.target.value)} className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm">
                    <option value="left">Left</option>
                    <option value="center">Center</option>
                    <option value="right">Right</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-0.5 block">세로</label>
                  <select value={content.imageConstraint.alignY} onChange={(e) => updateConstraint("alignY", e.target.value)} className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm">
                    <option value="top">Top</option>
                    <option value="center">Center</option>
                    <option value="bottom">Bottom</option>
                  </select>
                </div>
              </div>
            </div>
          </section>

          {/* 내보내기 */}
          <button onClick={() => exportCtPng(content)} className="w-full py-2.5 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800 transition-colors">
            내보내기 (PNG)
          </button>
        </div>

        {/* 우측: 디바이스 뷰어 */}
        <div className="flex-1 flex items-center justify-center py-4 md:py-0 md:sticky md:top-4 md:self-start">
          <div className="block md:hidden">
            <DeviceViewer content={content} scale={0.6} />
          </div>
          <div className="hidden md:block">
            <DeviceViewer content={content} />
          </div>
        </div>
      </div>
    </div>
  );
}
