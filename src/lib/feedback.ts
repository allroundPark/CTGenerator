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
