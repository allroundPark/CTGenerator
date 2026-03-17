import { CTContent } from "@/types/ct";
import { getByteLength, truncateToBytes } from "@/lib/bytes";

const SYSTEM_PROMPT = `너는 한국 금융사 앱의 CT(콘텐츠스레드) 카드 카피라이터야.
사용자의 요청에 맞는 카드 콘텐츠를 정확히 3가지 안으로 만들어.

## 필드 설명
- label: 좌상단 라벨 (14pt, 카테고리/태그)
- titleLine1: 메인 타이틀 1줄 (24pt)
- titleLine2: 메인 타이틀 2줄 (24pt)
- subLine1: 좌하단 서브텍스트 1줄 (14pt)
- subLine2: 좌하단 서브텍스트 2줄 (14pt)

## 제약사항
- 각 텍스트 필드는 반드시 34byte 이내 (한글=2byte, 영문/숫자=1byte)
- 한글 기준 약 17자, 영문 기준 34자 이내
- 줄바꿈 없이 한 줄로 작성

## textColor 규칙
- "WT": 어두운 배경/이미지일 때 흰색 텍스트
- "BK": 밝은 배경/이미지일 때 검은색 텍스트

## bgTreatment 옵션
1. {"type":"none"} — 배경 처리 없음
2. {"type":"solid","color":"#HEX색상","height":140} — 상단 솔리드 배경
3. {"type":"gradient","direction":"dark","stops":[{"position":0,"opacity":0.6},{"position":60,"opacity":0.3},{"position":100,"opacity":0}]} — 어두운 그라데이션
4. {"type":"gradient","direction":"light","stops":[{"position":0,"opacity":0.6},{"position":60,"opacity":0.3},{"position":100,"opacity":0}]} — 밝은 그라데이션

## 3가지 안의 톤
- 안 1: 정보 전달형 (명확하고 직관적)
- 안 2: 감성/혜택 강조형 (감성적, 혜택 부각)
- 안 3: 행동 유도형 (긴급감, CTA)

## 출력 형식
CTContent 객체 3개의 JSON 배열만 반환. 설명 없이 JSON만.
각 객체에 id, label, titleLine1, titleLine2, subLine1, subLine2, textColor, bgTreatment, imageConstraint 포함.
imageConstraint는 항상 {"fit":"cover","alignX":"center","alignY":"center"}.
id는 "variant-1", "variant-2", "variant-3".`;

export function buildRequestBody(userMessage: string, currentVariants?: CTContent[]) {
  let prompt = SYSTEM_PROMPT + "\n\n";

  // 기존 안이 있으면 컨텍스트로 전달
  if (currentVariants && currentVariants.length > 0) {
    const context = currentVariants.map((v) => ({
      label: v.label,
      titleLine1: v.titleLine1,
      titleLine2: v.titleLine2,
      subLine1: v.subLine1,
      subLine2: v.subLine2,
      textColor: v.textColor,
      bgTreatment: v.bgTreatment,
    }));
    prompt += `[현재 카드 안]:\n${JSON.stringify(context, null, 2)}\n\n`;
    prompt += `[수정 요청]: ${userMessage}\n\n위 안을 기반으로 수정해서 3가지 새 안을 만들어줘.`;
  } else {
    prompt += `[사용자 요청]: ${userMessage}`;
  }

  return {
    contents: [
      { role: "user", parts: [{ text: prompt }] },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.9,
    },
  };
}

export function parseGeminiResponse(raw: string): CTContent[] {
  // JSON 추출 (마크다운 코드블록 처리)
  let jsonStr = raw.trim();
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }

  const parsed = JSON.parse(jsonStr);
  const variants: CTContent[] = Array.isArray(parsed) ? parsed : [parsed];

  // 검증 및 보정
  return variants.slice(0, 3).map((v, i) => ({
    id: v.id || `variant-${i + 1}`,
    label: ensureBytes(v.label || ""),
    titleLine1: ensureBytes(v.titleLine1 || ""),
    titleLine2: ensureBytes(v.titleLine2 || ""),
    subLine1: ensureBytes(v.subLine1 || ""),
    subLine2: ensureBytes(v.subLine2 || ""),
    imageUrl: "",
    imageConstraint: { fit: "cover" as const, alignX: "center" as const, alignY: "center" as const },
    textColor: v.textColor === "BK" ? "BK" as const : "WT" as const,
    bgTreatment: validateBgTreatment(v.bgTreatment),
  }));
}

function ensureBytes(str: string): string {
  if (getByteLength(str) <= 34) return str;
  return truncateToBytes(str, 34);
}

function validateBgTreatment(bg: unknown): CTContent["bgTreatment"] {
  if (!bg || typeof bg !== "object") {
    return { type: "gradient", direction: "dark", stops: [{ position: 0, opacity: 0.6 }, { position: 60, opacity: 0.3 }, { position: 100, opacity: 0 }] };
  }
  const b = bg as Record<string, unknown>;
  if (b.type === "none") return { type: "none" };
  if (b.type === "solid" && typeof b.color === "string") {
    return { type: "solid", color: b.color, height: typeof b.height === "number" ? b.height : 140 };
  }
  if (b.type === "gradient") {
    const dir = b.direction === "light" ? "light" as const : "dark" as const;
    const stops = Array.isArray(b.stops) ? b.stops : [{ position: 0, opacity: 0.6 }, { position: 60, opacity: 0.3 }, { position: 100, opacity: 0 }];
    return { type: "gradient", direction: dir, stops };
  }
  return { type: "gradient", direction: "dark", stops: [{ position: 0, opacity: 0.6 }, { position: 60, opacity: 0.3 }, { position: 100, opacity: 0 }] };
}
