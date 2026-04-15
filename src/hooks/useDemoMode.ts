"use client";

import { useEffect, useState } from "react";

/** ?demo=1 URL 쿼리로 데모 모드 활성화 여부 */
export function useDemoMode(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const v = params.get("demo");
    setEnabled(v === "1" || v === "true");
  }, []);
  return enabled;
}
