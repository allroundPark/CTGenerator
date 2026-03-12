// WCAG 명암비 계산 유틸리티

/** hex 색상을 RGB로 변환 */
export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

/** 상대 휘도 계산 (WCAG 2.0) */
export function relativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/** 두 색상 간 명암비 계산 */
export function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(...hexToRgb(hex1));
  const l2 = relativeLuminance(...hexToRgb(hex2));
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** 배경색 기반으로 BK/WT 자동 추천 */
export function recommendTextColor(bgHex: string): "BK" | "WT" {
  const bkRatio = contrastRatio(bgHex, "#000000");
  const wtRatio = contrastRatio(bgHex, "#FFFFFF");
  return wtRatio >= bkRatio ? "WT" : "BK";
}

/** 명암비가 WCAG AA 기준(4.5:1) 충족하는지 */
export function meetsWcagAA(bgHex: string, textColor: "BK" | "WT"): boolean {
  const textHex = textColor === "BK" ? "#000000" : "#FFFFFF";
  return contrastRatio(bgHex, textHex) >= 4.5;
}
