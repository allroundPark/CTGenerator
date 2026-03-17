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
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs text-gray-400">{label}</label>
        <span
          className={`text-xs ${bytes > 34 ? "text-red-500 font-semibold" : "text-gray-300"}`}
        >
          {bytes}/34
        </span>
      </div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        placeholder={placeholder}
      />
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
          direction: "dark" as const,
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
    <div className="flex-1 overflow-hidden">
      <div className="max-w-[1400px] mx-auto h-full flex gap-5 px-5 py-4">
        {/* 좌측: 텍스트 + 이미지 컨트롤 */}
        <div className="w-[520px] shrink-0 overflow-y-auto">
          <div className="flex gap-3">
            {/* 서브컬럼 1: 텍스트 편집 */}
            <div className="flex-1 space-y-3">
              <section className="bg-white rounded-lg p-3 shadow-sm border border-gray-100">
                <h2 className="text-sm font-semibold text-gray-600 mb-2">좌상단 텍스트</h2>
                <div className="space-y-2">
                  <TextInput label="라벨 (14/20)" value={content.label} onChange={(v) => setContent((prev) => ({ ...prev, label: v }))} placeholder="라벨..." />
                  <TextInput label="타이틀 1줄 (24/32)" value={content.titleLine1} onChange={(v) => setContent((prev) => ({ ...prev, titleLine1: v }))} placeholder="타이틀 1줄..." />
                  <TextInput label="타이틀 2줄 (24/32)" value={content.titleLine2} onChange={(v) => setContent((prev) => ({ ...prev, titleLine2: v }))} placeholder="타이틀 2줄..." />
                </div>
              </section>

              <section className="bg-white rounded-lg p-3 shadow-sm border border-gray-100">
                <h2 className="text-sm font-semibold text-gray-600 mb-2">좌하단 텍스트</h2>
                <div className="space-y-2">
                  <TextInput label="서브 1줄 (14/20)" value={content.subLine1} onChange={(v) => setContent((prev) => ({ ...prev, subLine1: v }))} placeholder="서브 1줄..." />
                  <TextInput label="서브 2줄 (14/20)" value={content.subLine2} onChange={(v) => setContent((prev) => ({ ...prev, subLine2: v }))} placeholder="서브 2줄..." />
                </div>
              </section>

              <section className="bg-white rounded-lg p-3 shadow-sm border border-gray-100">
                <h2 className="text-sm font-semibold text-gray-600 mb-2">텍스트 색상</h2>
                <div className="flex gap-1.5">
                  <button onClick={() => setContent((prev) => ({ ...prev, textColor: "BK" }))} className={`flex-1 py-2 text-base rounded-md border transition-colors ${content.textColor === "BK" ? "border-gray-900 bg-white text-black font-semibold" : "border-gray-200 text-gray-400"}`}>BK</button>
                  <button onClick={() => setContent((prev) => ({ ...prev, textColor: "WT" }))} className={`flex-1 py-2 text-base rounded-md border transition-colors ${content.textColor === "WT" ? "border-gray-900 bg-gray-900 text-white font-semibold" : "border-gray-200 bg-gray-100 text-gray-400"}`}>WT</button>
                </div>
              </section>
            </div>

            {/* 서브컬럼 2: 이미지 컨트롤 */}
            <div className="flex-1 space-y-3">
              <section className="bg-white rounded-lg p-3 shadow-sm border border-gray-100">
                <h2 className="text-sm font-semibold text-gray-600 mb-2">이미지</h2>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                {content.imageUrl ? (
                  <div className="relative">
                    <img src={content.imageUrl} alt="uploaded" className="w-full h-24 object-cover rounded-md" />
                    <button onClick={() => { setContent((prev) => ({ ...prev, imageUrl: "" })); if (fileInputRef.current) fileInputRef.current.value = ""; }} className="absolute top-1 right-1 bg-black/60 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px]">✕</button>
                  </div>
                ) : (
                  <button onClick={() => fileInputRef.current?.click()} className="w-full h-24 border-2 border-dashed border-gray-200 rounded-md flex flex-col items-center justify-center text-gray-400 hover:border-gray-400 transition-colors">
                    <span className="text-xl mb-0.5">+</span>
                    <span className="text-xs">이미지 업로드</span>
                  </button>
                )}
              </section>

              <section className="bg-white rounded-lg p-3 shadow-sm border border-gray-100">
                <h2 className="text-sm font-semibold text-gray-600 mb-2">이미지 정렬</h2>
                <div className="grid grid-cols-2 gap-2">
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
              </section>

              <section className="bg-white rounded-lg p-3 shadow-sm border border-gray-100">
                <h2 className="text-sm font-semibold text-gray-600 mb-2">배경 처리</h2>
                <div className="flex gap-1.5 mb-2">
                  {(["none", "gradient", "solid"] as const).map((type) => (
                    <button key={type} onClick={() => updateBgTreatment(type)} className={`flex-1 py-1.5 text-xs rounded-md transition-colors ${content.bgTreatment.type === type ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-500"}`}>
                      {type === "none" ? "없음" : type === "gradient" ? "그라데이션" : "솔리드"}
                    </button>
                  ))}
                </div>
                {content.bgTreatment.type === "solid" && (
                  <div className="flex items-center gap-2">
                    <input type="color" value={content.bgTreatment.color} onChange={(e) => setContent((prev) => ({ ...prev, bgTreatment: { type: "solid" as const, color: e.target.value, height: 140 } }))} className="w-6 h-6 rounded border-0 cursor-pointer" />
                    <span className="text-xs text-gray-400 font-mono">{content.bgTreatment.color.toUpperCase()}</span>
                  </div>
                )}
                {content.bgTreatment.type === "gradient" && (
                  <div className="flex gap-1.5">
                    {(["dark", "light"] as const).map((dir) => (
                      <button key={dir} onClick={() => setContent((prev) => ({ ...prev, bgTreatment: { ...(prev.bgTreatment as Extract<typeof prev.bgTreatment, { type: "gradient" }>), direction: dir } }))} className={`flex-1 py-1.5 text-xs rounded-md ${content.bgTreatment.type === "gradient" && content.bgTreatment.direction === dir ? dir === "dark" ? "bg-gray-800 text-white" : "bg-gray-200 text-gray-800" : "bg-gray-100"}`}>
                        {dir === "dark" ? "어두운 톤" : "밝은 톤"}
                      </button>
                    ))}
                  </div>
                )}
              </section>

              {/* 내보내기 */}
              <button onClick={() => exportCtPng(content)} className="w-full py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800 transition-colors">
                내보내기 (PNG)
              </button>
            </div>
          </div>
        </div>

        {/* 우측: 디바이스 뷰어 */}
        <div className="flex-1 flex items-center justify-center">
          <DeviceViewer content={content} />
        </div>
      </div>
    </div>
  );
}
