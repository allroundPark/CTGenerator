"use client";

import { useState } from "react";
import { encryptAndSave, setWorkingGroup } from "@/lib/apiKey";

interface Props {
  onComplete: () => void;
}

export default function ApiKeySetup({ onComplete }: Props) {
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    const trimmed = key.trim();
    if (!trimmed) return;

    setSaving(true);
    setError("");

    // workinggroup 바이패스 → 서버 env 키 사용
    if (trimmed === "workinggroup") {
      setWorkingGroup();
      onComplete();
      return;
    }

    // 기본 유효성 체크
    if (!trimmed.startsWith("AIza") || trimmed.length < 30) {
      setError("유효한 Gemini API 키를 입력해주세요");
      setSaving(false);
      return;
    }

    try {
      await encryptAndSave(trimmed);
      onComplete();
    } catch {
      setError("키 저장에 실패했습니다");
      setSaving(false);
    }
  };

  return (
    <div className="h-[100dvh] flex items-center justify-center bg-gray-200">
      <div className="w-full max-w-sm mx-4 bg-white rounded-2xl shadow-lg p-6 space-y-4">
        <div className="text-center space-y-1">
          <h2 className="text-lg font-bold text-gray-900">CT Generator</h2>
          <p className="text-xs text-gray-400">Gemini API 키를 입력해주세요</p>
        </div>

        <div className="space-y-2">
          <input
            type="password"
            value={key}
            onChange={(e) => { setKey(e.target.value); setError(""); }}
            onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
            placeholder="AIza..."
            autoFocus
            className="w-full px-4 py-3 text-sm border border-gray-200 rounded-xl outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 transition-colors"
            style={{ fontSize: "16px" }}
          />
          {error && <p className="text-xs text-red-500 px-1">{error}</p>}
        </div>

        <button
          onClick={handleSubmit}
          disabled={saving || !key.trim()}
          className="w-full py-3 bg-gray-900 text-white text-sm font-medium rounded-xl disabled:opacity-40 hover:bg-gray-800 transition-colors"
        >
          {saving ? "저장 중..." : "시작하기"}
        </button>

        <p className="text-[10px] text-gray-300 text-center leading-relaxed">
          키는 브라우저에 암호화되어 저장됩니다.
          <br />
          서버에 저장되지 않으며 탭을 닫아도 유지됩니다.
        </p>
      </div>
    </div>
  );
}
