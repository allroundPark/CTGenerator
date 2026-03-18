import { CTContent } from "@/types/ct";
import { getByteLength } from "./bytes";
import { contrastRatio, recommendTextColor } from "./contrast";

export interface Feedback {
  type: "error" | "warning" | "ok";
  message: string;
}

/** CTContent에 대한 자동 피드백 생성 */
export function checkContent(content: CTContent): Feedback[] {
  const results: Feedback[] = [];

  // 글자수 체크
  const textFields = [
    { name: "라벨", value: content.label },
    { name: "타이틀 1줄", value: content.titleLine1 },
    { name: "타이틀 2줄", value: content.titleLine2 },
    { name: "서브 1줄", value: content.subLine1 },
    { name: "서브 2줄", value: content.subLine2 },
  ];

  for (const field of textFields) {
    const bytes = getByteLength(field.value);
    if (bytes > 34) {
      results.push({
        type: "error",
        message: `${field.name}: ${bytes}byte (34byte 초과)`,
      });
    }
  }

  // 명암비 체크 (솔리드 배경일 때만 정확하게 측정 가능)
  if (content.bgTreatment.type === "solid") {
    const bgColor = content.bgTreatment.color;
    const textHex = content.textColor === "BK" ? "#000000" : "#FFFFFF";
    const ratio = contrastRatio(bgColor, textHex);
    const recommended = recommendTextColor(bgColor);

    if (ratio < 4.5) {
      results.push({
        type: "warning",
        message: `명암비 ${ratio.toFixed(1)}:1 (AA 기준 4.5 미달) → ${recommended} 추천`,
      });
    }
  }

  // 그라데이션 + WT 조합 체크
  if (
    content.bgTreatment.type === "gradient" &&
    content.bgTreatment.direction === "light" &&
    content.textColor === "WT"
  ) {
    results.push({
      type: "warning",
      message: "밝은 그라데이션 + 흰색 텍스트는 가독성이 낮을 수 있어요",
    });
  }

  if (
    content.bgTreatment.type === "gradient" &&
    content.bgTreatment.direction === "dark" &&
    content.textColor === "BK"
  ) {
    results.push({
      type: "warning",
      message: "어두운 그라데이션 + 검은 텍스트는 가독성이 낮을 수 있어요",
    });
  }

  // 이미지 없음 체크
  if (!content.imageUrl) {
    results.push({
      type: "warning",
      message: "배경 이미지가 없어요 — 첨부하거나 AI로 생성해보세요",
    });
  }

  // 이미지 있는데 배경 처리 없음
  if (content.imageUrl && content.bgTreatment.type === "none") {
    results.push({
      type: "warning",
      message: "배경 처리 없이는 텍스트가 안 보일 수 있어요 — 그라데이션 추천",
    });
  }

  // 전부 OK
  if (results.length === 0) {
    results.push({ type: "ok", message: "이 조합 괜찮습니다" });
  }

  return results;
}

/** 명암비/가독성 문제 자동 교정 — 수정된 CTContent 반환 */
export function autoFixContrast(content: CTContent): { fixed: CTContent; changes: string[] } {
  const changes: string[] = [];
  let fixed = { ...content };

  // 1. 솔리드 배경 명암비 부족 → 텍스트색 변경
  if (fixed.bgTreatment.type === "solid") {
    const recommended = recommendTextColor(fixed.bgTreatment.color);
    if (fixed.textColor !== recommended) {
      fixed = { ...fixed, textColor: recommended };
      changes.push(`텍스트 색상을 ${recommended}로 변경`);
    }
  }

  // 2. 그라데이션 + 텍스트색 불일치 → 텍스트색 변경
  if (fixed.bgTreatment.type === "gradient") {
    const dir = fixed.bgTreatment.direction;
    if (dir === "dark" && fixed.textColor === "BK") {
      fixed = { ...fixed, textColor: "WT" };
      changes.push("어두운 그라데이션에 맞게 텍스트를 WT로 변경");
    }
    if (dir === "light" && fixed.textColor === "WT") {
      fixed = { ...fixed, textColor: "BK" };
      changes.push("밝은 그라데이션에 맞게 텍스트를 BK로 변경");
    }
  }

  // 3. 이미지 있는데 배경 처리 없음 → dark 그라데이션 자동 추가
  if (fixed.imageUrl && fixed.bgTreatment.type === "none") {
    fixed = {
      ...fixed,
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
    changes.push("가독성을 위해 어두운 그라데이션 + WT 텍스트 적용");
  }

  return { fixed, changes };
}
