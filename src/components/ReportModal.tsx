"use client";

import { useState } from "react";
import { CTContent } from "@/types/ct";
import { supabase } from "@/lib/supabase";
import { getDeviceId } from "@/lib/deviceId";

interface ReportModalProps {
  content: CTContent;
  onClose: () => void;
  rating?: "good" | "bad" | null;
}

export default function ReportModal({ content, onClose, rating }: ReportModalProps) {
  const [memo, setMemo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async () => {
    if (!memo.trim()) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from("ct_reports").insert({
        device_id: getDeviceId(),
        card_state: {
          label: content.label,
          titleLine1: content.titleLine1,
          titleLine2: content.titleLine2,
          subLine1: content.subLine1,
          subLine2: content.subLine2,
          textColor: content.textColor,
          bgTreatment: content.bgTreatment,
          imageType: content.imageType,
          imageUrl: content.imageUrl?.startsWith("data:") ? "(base64 생성 이미지)" : content.imageUrl,
        },
        user_memo: memo,
        rating: rating ?? null,
        resolved: false,
      });

      if (error) {
        console.error("Report insert error:", error);
        alert("리포트 저장에 실패했습니다.");
      } else {
        setDone(true);
        setTimeout(onClose, 1000);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
        <div className="bg-white rounded-2xl p-6 shadow-xl text-center">
          <p className="text-sm text-gray-600">저장 완료</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="bg-white rounded-2xl p-4 shadow-xl w-[300px] space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-gray-800">리포트</h3>
        <textarea
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
          placeholder="피드백을 입력하세요..."
          rows={3}
          autoFocus
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-blue-400 resize-none"
          style={{ fontSize: "16px" }}
        />
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2 text-sm text-gray-500 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !memo.trim()}
            className="flex-1 py-2 text-sm text-white bg-blue-500 rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors"
          >
            {submitting ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
