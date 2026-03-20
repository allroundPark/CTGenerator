import { CTContent, CTTextField, BrandContext } from "@/types/ct";
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
  "고트럭": { primary: "#F26522", secondary: "#FFFFFF" },
  "국민비서": { primary: "#2DBCB6", secondary: "#FFFFFF" },
};

const BRAND_NAMES = Object.keys(BRAND_COLORS);

/** 텍스트에서 브랜드명을 탐색하여 매칭된 브랜드의 키컬러 힌트 문자열을 반환 */
function detectBrandColorHint(text: string): string | null {
  for (const brand of BRAND_NAMES) {
    const words = text.split(/\s+/);
    if (text.includes(brand) || words.some((w) => w.length >= 2 && brand.includes(w))) {
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

### titleLine1(NM2) 패턴 — 후킹이 핵심!
**중요: "놓치면 안 되는" 같은 뻔한 표현은 피해. 매번 새롭고 구체적인 후킹을 만들어.**

우선순위 높은 후킹 패턴 (적극 활용):
- 반전/의외: "커피값으로", "택시비보다 싼", "아직도 정가에?"
- 공감 자극: "월급은 스쳐가는데", "점심 뭐 먹지 고민될 때", "장바구니에 넣어뒀죠?"
- 숫자 충격: "하루 300원이면", "3명 중 1명이 쓰는", "연 120만원 아끼는 법"
- 트렌드/시의성: "지금이 딱 제철", "아는 사람만 아는", "딱 한 줄이면 충분"
- 스토리텔링: "그 카페, 또 갈 거잖아요", "지갑 열기 전에"

기본 패턴 (위 후킹이 안 맞을 때만):
- 장소/상황: "도심 가까이에서", "일본에서 누리는"
- 혜택 직접: "70% M포인트 사용", "최대 50만 M포인트를"
- 브랜드명: "Galaxy S26 Series", "마켓컬리"
- 대상 지정: "the Red 회원을 위한"
- 감성: "꽃으로 채우는 일상"

### titleLine2(NM3) 패턴
우선순위 높은 패턴 (구체적이고 행동을 유발):
- 할인/금액 직접: "코스 메뉴 15% 할인", "최대 1만 2천원 할인 쿠폰"
- 행동 유도: "미리 예약하고 10% 할인받기", "지금 쿠폰 받기"
- 반전 완성: "호텔 라운지 즐기기" (NM2 반전과 연결), "파인다이닝 할인"
- 경험: "누리는 완벽한 쉼", "여행을 떠나요"
- VIP: "VIP 멤버십 제공"

피해야 할 패턴:
- "혜택이 있어요!" → 너무 뻔하고 구체성 없음. 가능하면 구체적 혜택으로 대체

### 주요 조합 (후킹 버전)
- 제휴 브랜드: NM1="[브랜드] 브랜드 혜택" + NM2="아직도 정가에?" + NM3="최대 50% 캐시백"
- Amex 다이닝: NM1="Amex 멤버 전용" + NM2="택시비보다 싼" + NM3="파인다이닝 15% 할인"
- 맞춤 추천: NM1="맞춤 혜택 추천" + NM2="3명 중 1명이 쓰는" + NM3="[브랜드] [할인 금액]"
- 호텔: NM1="Amex 호텔 혜택" + NM2="커피값으로" + NM3="호텔 라운지 즐기기"

### 종결 어미 규칙 (매우 중요!)
반말 절대 금지. 아래 3가지만 사용:
1. 명사형 종결 (가장 많음): "10% 할인 쿠폰", "VIP 멤버십 제공", "누리는 완벽한 쉼"
2. 해요체: "혜택이 있어요!", "확인해 보세요", "여행을 떠나요"
3. ~기 종결: "미리 예약하고 10% 할인받기", "찾기"

금지: 반말(~해, ~야, ~지), 합쇼체(~합니다)
허용 물음형 (후킹용으로만): "아직도 정가에?", "이 혜택 놓칠 거예요?" 같은 짧은 수사적 질문은 NM2에서 사용 가능

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

## 3가지 안의 톤 — 모든 안이 후킹해야 함!
첫 생성이 서비스의 첫인상이다. 뻔한 문구는 금지.
- 안 1: 반전/의외형 (기대를 깨는 구조, "커피값으로 호텔 라운지" 같은)
- 안 2: 공감/트렌드형 (일상 밀착 + 시의성, "나 얘기인데?" 반응 유도)
- 안 3: 숫자 임팩트형 (구체적 수치로 즉각 관심, "하루 300원이면")
3가지 안은 서로 다른 후킹 전략을 써야 하며, 같은 패턴 반복 금지.

## 이미지 유형 판단 (imageType 필드) — 매우 중요!
서비스 성격, 브랜드 카테고리, 유저 요청을 종합해서 가장 적합한 이미지 유형을 선택해.
PRODUCTFOCUSED에만 치우치지 말 것. 서비스 특성에 맞는 유형을 골라야 한다.

### 유형별 사용 기준
- "INTERIOFOCUSED": 레스토랑, 호텔, 라운지, 카페, 도서관, 골프클럽 등 **공간 경험**이 핵심인 서비스
  → 다이닝 혜택, 호텔/리조트 혜택, 라운지 이용, 문화공간, 와인바, 쿠킹클래스
- "PRODUCTFOCUSED": 구매 가능한 **물리적 상품**이 핵심인 서비스
  → 음식 배달, 패션/뷰티 할인, 가전/전자기기 혜택, 식품 구독
- "OUTERIOR": **야외 활동, 여행, 자연**이 핵심인 서비스
  → 항공/여행 혜택, 리조트, 주유/충전, 아웃도어, 렌터카, 테마파크
- "VECTOR-UI": **디지털 서비스, 금융상품, 추상적 개념**에 적합 (3D 클레이모피즘/아이소메트릭)
  → 대출, 적금, 포인트 전환, 구독 서비스, 앱 기능 안내, 결제/핀테크, 게임 아이템
- "HUMAN": **라이프스타일, 사람 중심 경험**이 핵심
  → 패션/뷰티 브랜드, 쇼핑, 문화/엔터테인먼트, 피트니스
- "LOGO": 브랜드 로고 단독 (기존 에셋 사용, AI 생성 불가)
- "CARDPRODUCT": 카드 제품샷 (기존 에셋 사용, AI 생성 불가)

### 판단 우선순위
1. 유저가 직접 스타일을 지정한 경우 → 해당 유형 우선
2. 브랜드 정보가 있는 경우 → 서비스 카테고리로 판단:
   - F&B/요식업 → INTERIOFOCUSED (공간감) 또는 PRODUCTFOCUSED (음식 자체)
   - 숙박/여행 → INTERIOFOCUSED (호텔) 또는 OUTERIOR (여행지)
   - 유통/커머스 → PRODUCTFOCUSED
   - 금융/핀테크/디지털 → VECTOR-UI
   - 주유/모빌리티 → OUTERIOR
   - 게임/IT → VECTOR-UI
   - 패션/뷰티 → HUMAN 또는 PRODUCTFOCUSED
3. 브랜드 정보 없을 때 → 키워드로 추론

## 출력 형식
JSON 배열만 반환. 설명 없이 JSON만.
각 객체: id, label, titleLine1, titleLine2, subLine1, subLine2, textColor, bgTreatment, imageConstraint, imageType.
imageConstraint는 {"fit":"cover","alignX":"center","alignY":"center"}.
id는 "variant-1", "variant-2", "variant-3".`;

export function buildRequestBody(userMessage: string, currentVariants?: CTContent[], brandContext?: BrandContext) {
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

  // 브랜드 컨텍스트 (웹 검색 결과) — 내장 브랜드여도 서비스 설명/카테고리는 항상 전달
  if (brandContext) {
    if (!brandHint) {
      const colorParts = [`Primary: ${brandContext.primaryColor}`];
      if (brandContext.secondaryColor) colorParts.push(`Secondary: ${brandContext.secondaryColor}`);
      prompt += `\n키컬러: ${colorParts.join(", ")}. textColor와 bgTreatment를 이 키컬러와 조화롭게 설정해줘.`;
    }
    prompt += `\n\n[브랜드/서비스 정보]: "${brandContext.brandName}" — ${brandContext.description} (카테고리: ${brandContext.category})`;
    if (brandContext.targetAudience) {
      prompt += `\n타겟 유저: ${brandContext.targetAudience}`;
    }
    if (brandContext.serviceCharacteristics) {
      prompt += `\n서비스 특성: ${brandContext.serviceCharacteristics}`;
    }
    prompt += `\nimageType 판단 시 이 브랜드의 카테고리(${brandContext.category})와 서비스 특성(${brandContext.description})을 반드시 고려해서 적합한 이미지 유형을 선택해.`;
    if (brandContext.mascotName) {
      prompt += `\n마스코트: ${brandContext.mascotName}${brandContext.mascotDescription ? ` (${brandContext.mascotDescription})` : ""}`;
    }
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

export function buildSuggestBody(field: CTTextField, content: CTContent, count = 5, hint?: string) {
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
- 다양한 톤: 반전/의외, 공감자극, 숫자임팩트, 트렌드, 스토리텔링 등 섞어줘
- "놓치면 안 되는 + 혜택이 있어요!" 같은 뻔한 표현은 피해
- JSON 배열로 반환. 각 항목은 [line1, line2] 형태:
  [["1줄차 대안1", "2줄차 대안1"], ["1줄차 대안2", "2줄차 대안2"], ...]` + (hint ? `\n\n[유저 추가 요청]: ${hint}` : "");

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
- 다양한 톤: 반전/의외, 공감자극, 숫자임팩트, 트렌드, 스토리텔링 등 섞어줘
- "놓치면 안 되는", "혜택이 있어요!" 같은 뻔한 표현은 피해
- JSON 문자열 배열만 반환: ["대안1", "대안2", ...]` + (hint ? `\n\n[유저 추가 요청]: ${hint}` : "");

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
