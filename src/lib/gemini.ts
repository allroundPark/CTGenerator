import { CTContent, CTTextField } from "@/types/ct";
import { getByteLength, truncateToBytes } from "@/lib/bytes";
// 브랜드 키컬러 데이터 (data/brand_colors.json 기반)
const BRAND_COLORS: Record<string, { primary: string; secondary: string | null; tertiary?: string }> = {
  "Amex": { primary: "#016FD0", secondary: null },
  "스타벅스": { primary: "#00704A", secondary: "#B5A369" },
  "마켓컬리": { primary: "#5F0080", secondary: null },
  "올리브영": { primary: "#9ACD32", secondary: "#F0918C" },
  "GS칼텍스": { primary: "#009A82", secondary: "#F47920" },
  "코스트코": { primary: "#E31837", secondary: "#1E3B8B" },
  "네이버": { primary: "#03C75A", secondary: null },
  "무신사": { primary: "#000000", secondary: "#FFFFFF" },
  "SSG.COM": { primary: "#FF0050", secondary: null },
  "G마켓": { primary: "#00C73C", secondary: "#0B2B8E" },
  "대한항공": { primary: "#003DA5", secondary: null },
  "쏘카": { primary: "#00B8FF", secondary: null },
  "도미노": { primary: "#E31837", secondary: "#006491" },
  "파리바게뜨": { primary: "#0062B8", secondary: null },
  "투썸플레이스": { primary: "#D4003A", secondary: "#4A4A4A" },
  "이마트": { primary: "#FFB81C", secondary: null },
  "베스킨라빈스": { primary: "#FF1D8E", secondary: "#0C1D82" },
  "넥슨": { primary: "#0C3558", secondary: "#2BB8E0", tertiary: "#C5D629" },
  "롯데홈쇼핑": { primary: "#E60000", secondary: null },
  "현대카드": { primary: "#1A1A1A", secondary: null },
  "현대백화점": { primary: "#2D5A45", secondary: null },
  "현대자동차": { primary: "#002C5F", secondary: null },
  "멜론": { primary: "#00CD3C", secondary: null },
  "T다이렉트샵": { primary: "#3C2CF5", secondary: null },
};

const BRAND_NAMES = Object.keys(BRAND_COLORS);

/** 텍스트에서 브랜드명을 탐색하여 매칭된 브랜드의 키컬러 힌트 문자열을 반환 */
function detectBrandColorHint(text: string): string | null {
  for (const brand of BRAND_NAMES) {
    if (text.includes(brand)) {
      const colors = BRAND_COLORS[brand];
      const parts: string[] = [`Primary: ${colors.primary}`];
      if (colors.secondary) parts.push(`Secondary: ${colors.secondary}`);
      if (colors.tertiary) parts.push(`Tertiary: ${colors.tertiary}`);
      return `이 브랜드(${brand})의 키컬러는 ${parts.join(", ")}입니다. textColor와 bgTreatment를 이 키컬러와 조화롭게 설정해주세요.`;
    }
  }
  return null;
}

const SYSTEM_PROMPT = `너는 한국 금융사(현대카드) 앱의 CT(콘텐츠스레드) 카드 카피라이터야.
사용자의 요청에 맞는 카드 콘텐츠를 정확히 3가지 안으로 만들어.

## 필드 설명 (3-Layer 구조)
- label: 좌상단 라벨 (NM1) — 카테고리/상품 식별. 5~20자.
- titleLine1: 타이틀 첫째줄 (NM2) — 후킹/맥락 설정. 6~15자.
- titleLine2: 타이틀 둘째줄 (NM3) — 구체 혜택/CTA. 6~18자.
- subLine1: 좌하단 서브 1줄 (14pt)
- subLine2: 좌하단 서브 2줄 (14pt)

## 제약사항
- 각 텍스트 필드는 반드시 34byte 이내 (한글=2byte, 영문/숫자=1byte)
- 줄바꿈 없이 한 줄로 작성

## UX Writing 패턴 가이드 (실제 운영 데이터 기반)

### label(NM1) 패턴
- 상품명 직접: "현대카드 Boutique - Satin", "Amex 멤버 전용"
- 혜택 프레이밍: "[브랜드] 브랜드 혜택", "맞춤 혜택 추천 3종 선물 도착!"
- 조건/자격: "프리미엄 카드 회원이라면"
- 금융상품: "장기카드대출(카드론)", "자동차담보대출"

### titleLine1(NM2) 패턴
- 경고형: "놓치면 안 되는" (제휴 브랜드 표준)
- 장소/상황: "도심 가까이에서", "일본에서 누리는", "오마카세부터 파인다이닝까지"
- 혜택 직접: "70% M포인트 사용", "최대 50만 M포인트를"
- 브랜드명: "Galaxy S26 Series", "마켓컬리"
- 대상 지정: "the Red 회원을 위한"
- 감성: "바쁘고 지친 일상 속", "꽃으로 채우는 일상"

### titleLine2(NM3) 패턴
- 감성 CTA: "혜택이 있어요!" (제휴 브랜드 표준)
- 할인/금액: "코스 메뉴 15% 할인", "최대 1만 2천원 할인 쿠폰"
- 행동 유도: "미리 예약하고 10% 할인받기", "확인해 보세요!"
- 경험: "누리는 완벽한 쉼", "여행을 떠나요"
- VIP: "VIP 멤버십 제공"

### 주요 조합
- 제휴 브랜드: NM1="[브랜드] 브랜드 혜택" + NM2="놓치면 안 되는" + NM3="혜택이 있어요!"
- Amex 다이닝: NM1="Amex 멤버 전용" + NM2="[장소]에서 즐기는" + NM3="[할인율]% 할인"
- 맞춤 추천: NM1="맞춤 혜택 추천 3종 선물 도착!" + NM2="[브랜드명]" + NM3="[할인 금액]"
- 호텔: NM1="Amex 호텔 혜택" + NM2="도심 가까이에서" + NM3="누리는 완벽한 쉼"

### 종결 어미 규칙 (매우 중요!)
반말 절대 금지. 아래 3가지만 사용:
1. 명사형 종결 (가장 많음): "10% 할인 쿠폰", "VIP 멤버십 제공", "누리는 완벽한 쉼"
2. 해요체: "혜택이 있어요!", "확인해 보세요", "여행을 떠나요"
3. ~기 종결: "미리 예약하고 10% 할인받기", "찾기"

금지: 반말(~해, ~야, ~지), 합쇼체(~합니다), 물음형(~할까요?)

### 카테고리별 톤
- 브랜드 혜택: 가벼운, 친근
- Amex 다이닝: 트렌디, 세련
- Amex 호텔: 고급, 여유
- 맞춤 추천: 직접적, 실용
- 금융상품: 신뢰, 안정
- 프리미엄: 독점, 격조

## textColor + bgTreatment 규칙 (매우 중요!)
허용 조합만 사용:
- "WT" + gradient dark → 어두운 이미지 위 흰 텍스트 (가장 일반적)
- "WT" + none → 어두운 이미지만으로 충분할 때
- "BK" + gradient light → 밝은 이미지 위 검은 텍스트
- "BK" + none → 밝은 이미지만으로 충분할 때
- "BK" + solid → 밝은 솔리드 배경

절대 금지 조합:
- "WT" + gradient light → 가독성 최악. 절대 사용 금지.
- "BK" + gradient dark → 가독성 나쁨. 사용 금지.

기본값: textColor "WT" + gradient dark를 써라.

## 3가지 안의 톤
- 안 1: 정보 전달형 (명확, 직관적)
- 안 2: 감성/혜택 강조형 (감성적, 혜택 부각)
- 안 3: 행동 유도형 (긴급감, CTA)

## 이미지 유형 판단 (imageType 필드)
요청 내용에 따라 적합한 이미지 유형을 판단해서 포함:
- "INTERIOFOCUSED": 실내 공간 (레스토랑, 호텔, 라운지)
- "PRODUCTFOCUSED": 상품 (음식, 패키지, 패션)
- "OUTERIOR": 야외/여행
- "LOGO": 브랜드 로고 단독
- "CARDPRODUCT": 카드 제품샷
- "VECTOR-UI": 3D일러스트/벡터
- "HUMAN": 인물 포함

## 출력 형식
JSON 배열만 반환. 설명 없이 JSON만.
각 객체: id, label, titleLine1, titleLine2, subLine1, subLine2, textColor, bgTreatment, imageConstraint, imageType.
imageConstraint는 {"fit":"cover","alignX":"center","alignY":"center"}.
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

  // 브랜드 키컬러 힌트 추가
  const brandHint = detectBrandColorHint(userMessage);
  if (brandHint) {
    prompt += `\n\n[브랜드 키컬러 참고]: ${brandHint}`;
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
  return variants.slice(0, 3).map((v, i) => {
    const textColor = v.textColor === "BK" ? "BK" as const : "WT" as const;
    const bgTreatment = validateBgTreatment(v.bgTreatment);

    // 금지 조합 자동 교정: WT + light gradient → dark gradient로
    const fixed = fixColorGradientCombo(textColor, bgTreatment);

    return {
      id: v.id || `variant-${i + 1}`,
      label: ensureBytes(v.label || ""),
      titleLine1: ensureBytes(v.titleLine1 || ""),
      titleLine2: ensureBytes(v.titleLine2 || ""),
      subLine1: ensureBytes(v.subLine1 || ""),
      subLine2: ensureBytes(v.subLine2 || ""),
      imageUrl: "",
      imageConstraint: { fit: "cover" as const, alignX: "center" as const, alignY: "center" as const },
      textColor: fixed.textColor,
      bgTreatment: fixed.bgTreatment,
      imageType: v.imageType || "",
    };
  });
}

function ensureBytes(str: string): string {
  if (getByteLength(str) <= 34) return str;
  return truncateToBytes(str, 34);
}

const FIELD_LABELS: Record<string, string> = {
  label: "좌상단 라벨 (14pt, 카테고리/태그)",
  title: "메인 타이틀 2줄 (24pt)",
  titleLine1: "메인 타이틀 1줄 (24pt)",
  titleLine2: "메인 타이틀 2줄 (24pt)",
  sub: "좌하단 서브텍스트 2줄 (14pt)",
  subLine1: "좌하단 서브텍스트 1줄 (14pt)",
  subLine2: "좌하단 서브텍스트 2줄 (14pt)",
};

// 그룹 필드인지 판별
export function isGroupField(field: CTTextField): field is "title" | "sub" {
  return field === "title" || field === "sub";
}

export function buildSuggestBody(field: CTTextField, content: CTContent, count = 5) {
  const context = {
    label: content.label,
    titleLine1: content.titleLine1,
    titleLine2: content.titleLine2,
    subLine1: content.subLine1,
    subLine2: content.subLine2,
  };

  // 그룹 필드 (title = line1+2, sub = line1+2)
  if (isGroupField(field)) {
    const line1Key = field === "title" ? "titleLine1" : "subLine1";
    const line2Key = field === "title" ? "titleLine2" : "subLine2";
    const currentLine1 = content[line1Key];
    const currentLine2 = content[line2Key];

    const prompt = `너는 한국 금융사 앱의 CT 카드 카피라이터야.

아래 카드의 "${FIELD_LABELS[field]}" 영역을 대체할 수 있는 대안 ${count}개를 만들어.
이 영역은 2줄로 구성돼 있어.

[현재 카드]:
${JSON.stringify(context, null, 2)}

[수정 대상]: ${field} (현재: "${currentLine1}" / "${currentLine2}")

## 제약사항
- 각 줄은 반드시 34byte 이내 (한글=2byte, 영문/숫자=1byte)
- 2줄이 하나의 메시지로 자연스럽게 연결돼야 함
- 다양한 톤: 정보전달, 감성, 행동유도, 위트 등 섞어줘
- JSON 배열로 반환. 각 항목은 [line1, line2] 형태:
  [["1줄차 대안1", "2줄차 대안1"], ["1줄차 대안2", "2줄차 대안2"], ...]`;

    return {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 1.0,
      },
    };
  }

  // 단일 필드
  const prompt = `너는 한국 금융사 앱의 CT 카드 카피라이터야.

아래 카드의 "${FIELD_LABELS[field]}" 필드를 대체할 수 있는 대안 ${count}개를 만들어.

[현재 카드]:
${JSON.stringify(context, null, 2)}

[수정 대상 필드]: ${field} (현재 값: "${content[field]}")

## 제약사항
- 각 대안은 반드시 34byte 이내 (한글=2byte, 영문/숫자=1byte)
- 나머지 필드들과 자연스럽게 어울려야 함
- 다양한 톤: 정보전달, 감성, 행동유도, 위트 등 섞어줘
- JSON 문자열 배열만 반환: ["대안1", "대안2", ...]`;

  return {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 1.0,
    },
  };
}

// 단일 필드 대안 파싱
export function parseSuggestResponse(raw: string): string[] {
  let jsonStr = raw.trim();
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) jsonStr = codeBlockMatch[1].trim();

  const parsed = JSON.parse(jsonStr);
  if (!Array.isArray(parsed)) return [];

  return parsed
    .filter((s): s is string => typeof s === "string")
    .map((s) => (getByteLength(s) > 34 ? truncateToBytes(s, 34) : s));
}

// 그룹 필드 대안 파싱 (각 항목이 [line1, line2])
export function parseGroupSuggestResponse(raw: string): [string, string][] {
  let jsonStr = raw.trim();
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) jsonStr = codeBlockMatch[1].trim();

  const parsed = JSON.parse(jsonStr);
  if (!Array.isArray(parsed)) return [];

  return parsed
    .filter((item): item is [string, string] =>
      Array.isArray(item) && item.length >= 2 && typeof item[0] === "string" && typeof item[1] === "string"
    )
    .map(([l1, l2]) => [
      getByteLength(l1) > 34 ? truncateToBytes(l1, 34) : l1,
      getByteLength(l2) > 34 ? truncateToBytes(l2, 34) : l2,
    ]);
}

// 금지 조합 교정
function fixColorGradientCombo(
  textColor: "BK" | "WT",
  bg: CTContent["bgTreatment"]
): { textColor: "BK" | "WT"; bgTreatment: CTContent["bgTreatment"] } {
  if (bg.type === "gradient") {
    // WT + light → WT + dark
    if (textColor === "WT" && bg.direction === "light") {
      return { textColor: "WT", bgTreatment: { ...bg, direction: "dark" } };
    }
    // BK + dark → BK + light
    if (textColor === "BK" && bg.direction === "dark") {
      return { textColor: "BK", bgTreatment: { ...bg, direction: "light" } };
    }
  }
  return { textColor, bgTreatment: bg };
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
