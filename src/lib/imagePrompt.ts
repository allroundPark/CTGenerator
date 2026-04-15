// 이미지 생성 프롬프트 빌더: imageType → 프리셋 선택 → 구조화 영문 프롬프트

import type { BrandContext } from "@/types/ct";

// 브랜드 knowledge DB
interface BrandKnowledge {
  primary: string;
  secondary: string | null;
  tertiary?: string;
  category: string;
  description: string;
  targetAudience: string;
  serviceCharacteristics: string;
}

const BRAND_DB: Record<string, BrandKnowledge> = {
  "Amex": { primary: "#016FD0", secondary: null, category: "금융/카드", description: "American Express 프리미엄 카드", targetAudience: "고소득 직장인, 해외 출장/여행 빈도 높은 30~50대", serviceCharacteristics: "프리미엄 다이닝/호텔/라운지 혜택 중심 글로벌 카드" },
  "스타벅스": { primary: "#00704A", secondary: "#B5A369", category: "카페/F&B", description: "글로벌 스페셜티 커피 브랜드", targetAudience: "20~40대 직장인, 커피 애호가", serviceCharacteristics: "프리미엄 커피 경험, 리워드 프로그램, 시즌 한정 메뉴" },
  "마켓컬리": { primary: "#5F0080", secondary: null, category: "커머스/식품", description: "프리미엄 식품 새벽배송", targetAudience: "30~40대 여성, 맞벌이 가정, 식품 품질 중시", serviceCharacteristics: "새벽배송, 엄선된 프리미엄 식품, 신선식품 큐레이션" },
  "올리브영": { primary: "#9ACD32", secondary: "#F0918C", category: "뷰티/헬스", description: "국내 1위 헬스&뷰티 스토어", targetAudience: "10~30대 여성, 뷰티 트렌드 민감층", serviceCharacteristics: "K-뷰티 큐레이션, 오프라인+온라인, 트렌드 뷰티 플랫폼" },
  "GS칼텍스": { primary: "#009A82", secondary: "#F47920", category: "에너지/주유", description: "국내 대형 주유소 체인", targetAudience: "자가용 운전자, 30~50대 남성", serviceCharacteristics: "주유 할인, 보너스카드 포인트, 세차/정비 연계" },
  "코스트코": { primary: "#E31837", secondary: "#1E3B8B", category: "유통/대형마트", description: "멤버십 기반 창고형 할인매장", targetAudience: "4인 이상 가족, 대량구매 선호, 30~50대", serviceCharacteristics: "회원제 창고형 매장, 대용량 가성비, 수입 식품/생활용품" },
  "네이버": { primary: "#03C75A", secondary: null, category: "IT/포털", description: "국내 1위 검색 포털 & 디지털 플랫폼", targetAudience: "전 연령대 인터넷 이용자", serviceCharacteristics: "검색, 쇼핑, 결제(네이버페이), 콘텐츠 플랫폼 통합 생태계" },
  "무신사": { primary: "#000000", secondary: "#FFFFFF", category: "패션/커머스", description: "국내 최대 온라인 패션 플랫폼", targetAudience: "10~30대 남녀, 스트릿/캐주얼 패션 관심층", serviceCharacteristics: "스트릿/캐주얼 패션 큐레이션, 무신사 스탠다드 자체브랜드" },
  "SSG.COM": { primary: "#FF0050", secondary: null, category: "커머스/유통", description: "신세계그룹 통합 온라인몰", targetAudience: "30~50대, 프리미엄 쇼핑 선호", serviceCharacteristics: "백화점/이마트/트레이더스 통합, 새벽배송, 프리미엄 식품" },
  "G마켓": { primary: "#00C73C", secondary: "#0B2B8E", category: "커머스/오픈마켓", description: "국내 대형 오픈마켓", targetAudience: "가격 비교 민감 20~40대", serviceCharacteristics: "오픈마켓 가격경쟁, 스마일배송, 대규모 할인 이벤트" },
  "대한항공": { primary: "#003DA5", secondary: null, category: "항공/여행", description: "대한민국 국적 항공사 (2025년 리브랜딩: 상모 리본에서 착안한 현대적 태극마크, 메탈릭 하늘색 동체, 슬로건 'Anywhere is Possible')", targetAudience: "해외여행객, 비즈니스 출장 30~50대", serviceCharacteristics: "풀서비스 항공, 마일리지 프로그램, 글로벌 노선 네트워크. 2025 신규 CI: 네이비 단색 태극마크(빨강 없음), 미니멀 모던 디자인, 메탈릭 스카이블루 항공기 도장" },
  "쏘카": { primary: "#00B8FF", secondary: null, category: "모빌리티", description: "카셰어링 플랫폼", targetAudience: "무차량 20~30대 도시 거주자", serviceCharacteristics: "앱 기반 카셰어링, 시간/일 단위 렌탈, 다양한 차종" },
  "도미노": { primary: "#E31837", secondary: "#006491", category: "F&B/배달", description: "글로벌 피자 배달 체인", targetAudience: "10~30대, 가족 단위 주문", serviceCharacteristics: "배달 피자 전문, 앱 주문, 프로모션/쿠폰 중심 마케팅" },
  "파리바게뜨": { primary: "#0062B8", secondary: null, category: "F&B/베이커리", description: "국내 최대 프랜차이즈 베이커리", targetAudience: "전 연령대, 가벼운 식사/간식 소비", serviceCharacteristics: "프랜차이즈 베이커리 카페, 빵/케이크/샌드위치, 시즌 한정 메뉴" },
  "투썸플레이스": { primary: "#D4003A", secondary: "#4A4A4A", category: "카페/F&B", description: "프리미엄 디저트 카페", targetAudience: "20~40대 여성, 디저트 애호가", serviceCharacteristics: "프리미엄 케이크/디저트, 넓은 좌석 공간, 스터디/미팅 카페" },
  "이마트": { primary: "#FFB81C", secondary: null, category: "유통/대형마트", description: "국내 대형마트 1위", targetAudience: "30~50대 주부, 가족 단위 장보기", serviceCharacteristics: "대형마트 오프라인+온라인, 노브랜드 PB상품, SSG 연계" },
  "베스킨라빈스": { primary: "#FF1D8E", secondary: "#0C1D82", category: "F&B/디저트", description: "글로벌 아이스크림 브랜드", targetAudience: "10~30대, 가족 단위, 아이스크림 애호가", serviceCharacteristics: "31가지 플레이버 아이스크림, 아이스크림 케이크, 시즌 한정 맛" },
  "넥슨": { primary: "#0C3558", secondary: "#2BB8E0", tertiary: "#C5D629", category: "게임/IT", description: "국내 대형 게임사", targetAudience: "10~30대 게이머, PC/모바일 게임 유저", serviceCharacteristics: "메이플스토리/던파 등 장수 IP, 캐시 아이템, e스포츠" },
  "롯데홈쇼핑": { primary: "#E60000", secondary: null, category: "커머스/홈쇼핑", description: "롯데그룹 TV/온라인 홈쇼핑", targetAudience: "40~60대 여성, TV 시청 소비층", serviceCharacteristics: "TV홈쇼핑+온라인, 패션/뷰티/가전, 방송 연동 라이브커머스" },
  "현대카드": { primary: "#1A1A1A", secondary: null, category: "금융/카드", description: "디자인/문화 중심 카드사", targetAudience: "트렌드 민감 20~40대 직장인", serviceCharacteristics: "디자인 카드, 바이닐/라이브러리 문화공간, PLCC 파트너십" },
  "현대백화점": { primary: "#2D5A45", secondary: null, category: "유통/백화점", description: "국내 주요 백화점 체인", targetAudience: "30~50대 고소득 소비자, 프리미엄 쇼핑", serviceCharacteristics: "프리미엄 쇼핑 경험, VIP 라운지, 문화센터, 식품관" },
  "현대자동차": { primary: "#002C5F", secondary: null, category: "자동차", description: "글로벌 자동차 제조사", targetAudience: "자동차 구매/이용 30~50대", serviceCharacteristics: "세단/SUV/전기차 라인업, 블루멤버스 포인트, A/S 네트워크" },
  "멜론": { primary: "#00CD3C", secondary: null, category: "음악/스트리밍", description: "국내 대표 음악 스트리밍 서비스", targetAudience: "10~30대 음악 청취층", serviceCharacteristics: "음원 스트리밍, 차트/플레이리스트 큐레이션, 이용권 구독" },
  "T다이렉트샵": { primary: "#3C2CF5", secondary: null, category: "통신/커머스", description: "SKT 공식 온라인 쇼핑몰", targetAudience: "SKT 가입자, 디바이스 교체 고려 20~40대", serviceCharacteristics: "스마트폰/태블릿 구매, 요금제 결합, T멤버십 할인" },
  "고트럭": { primary: "#F26522", secondary: "#FFFFFF", category: "물류/모빌리티", description: "중고트럭 매매 플랫폼", targetAudience: "트럭 운전사, 물류 자영업자 40~60대", serviceCharacteristics: "중고 상용차 직거래 플랫폼, 시세 조회, 딜러 연결" },
  "국민비서": { primary: "#2DBCB6", secondary: "#FFFFFF", category: "공공/정부", description: "정부 행정서비스 알림 앱", targetAudience: "전 국민, 공공 서비스 이용자", serviceCharacteristics: "정부24 연동, 보조금/세금/민원 알림, 마이데이터 기반 맞춤 안내" },
};

// 하위 호환: 키컬러만 추출
const BRAND_COLORS: Record<string, { primary: string; secondary: string | null; tertiary?: string }> = Object.fromEntries(
  Object.entries(BRAND_DB).map(([k, v]) => [k, { primary: v.primary, secondary: v.secondary, ...(v.tertiary ? { tertiary: v.tertiary } : {}) }])
);

const BRAND_NAMES = Object.keys(BRAND_COLORS);

/** 텍스트에서 브랜드명을 탐색하여 매칭된 브랜드명을 반환 */
export function detectBrandName(text: string): string | null {
  for (const brand of BRAND_NAMES) {
    const words = text.split(/\s+/);
    if (text.includes(brand) || words.some((w) => w.length >= 2 && brand.includes(w))) {
      return brand;
    }
  }
  return null;
}

/** 텍스트에 등록된 브랜드가 있는지 확인 */
export function isKnownBrand(text: string): boolean {
  return detectBrandName(text) !== null;
}

/** 등록 브랜드의 knowledge를 BrandContext 형태로 반환 */
export function getKnownBrandContext(text: string): BrandContext | null {
  const brand = detectBrandName(text);
  if (!brand || !BRAND_DB[brand]) return null;
  const b = BRAND_DB[brand];
  return {
    brandName: brand,
    description: b.description,
    category: b.category,
    targetAudience: b.targetAudience,
    serviceCharacteristics: b.serviceCharacteristics,
    primaryColor: b.primary,
    secondaryColor: b.secondary,
    mascotName: null,
    mascotDescription: null,
    mascotImage: null,
  };
}

/** 텍스트에서 브랜드명을 탐색하여 매칭된 브랜드의 키컬러 힌트 문자열을 반환 */
function detectBrandColorHint(text: string): string | null {
  for (const brand of BRAND_NAMES) {
    const words = text.split(/\s+/);
    if (text.includes(brand) || words.some((w) => w.length >= 2 && brand.includes(w))) {
      const colors = BRAND_COLORS[brand];
      const parts: string[] = [`Primary: ${colors.primary}`];
      if (colors.secondary) parts.push(`Secondary: ${colors.secondary}`);
      if (colors.tertiary) parts.push(`Tertiary: ${colors.tertiary}`);
      let hint = `Brand "${brand}" key colors: ${parts.join(", ")}. Use these as subtle accent colors only (e.g. a small prop, lighting tint, or background tone). Do NOT make the entire image this color. Keep the palette natural and balanced. Do NOT render any logos, brand marks, or symbols in the image.`;

      // 대한항공 신규 CI 강제 — 구 CI(빨강+파랑 태극) 사용 방지
      if (brand === "대한항공") {
        hint += ` IMPORTANT: Korean Air rebranded in 2025. The NEW CI uses a SINGLE navy-blue (#003DA5) modern taeguk mark inspired by sangmo ribbon — NO red color in the logo. The aircraft livery is metallic sky-blue. Do NOT use the OLD Korean Air CI (red and blue taeguk, bright sky-blue body with red/blue stripes). Use only the 2025 modern, minimalist, navy-mono design language.`;
      }

      return hint;
    }
  }
  return null;
}

// 스타일 프리셋 — 스타일당 1개, 주제/색상은 동적 결정
interface StylePreset {
  style: string;
  camera_angle: string;
  lighting: string;
  color_palette: { primary: string[]; accents: string[] };
  atmosphere: string;
  constraints: string[];
}

interface CopyContext {
  nm1_label?: string;
  nm2_title?: string;
  nm3_desc?: string;
}

// 스타일 3개 통합 프리셋 — 주제/색상은 userRequest + brandContext에서 동적 결정
const STYLE_PRESETS_MAP: Record<string, StylePreset> = {
  STYLE_REALISTIC: {
    style: "Professional commercial photography, editorial grade, premium brand campaign quality. Cinematic depth of field with rich detail.",
    camera_angle: "45-degree or eye-level, cinematic shallow depth of field, natural perspective",
    lighting: "Natural soft lighting with subtle directional key light, warm color temperature, gentle shadows",
    color_palette: {
      primary: ["{BRAND_PRIMARY}", "warm neutral", "white"],
      accents: ["{BRAND_SECONDARY}", "natural material tones"],
    },
    atmosphere: "Premium, aspirational, clean, sophisticated, editorially polished",
    constraints: ["No text or typography", "No logos or brand marks", "No electronic devices, screens, laptops, tablets, or phones"],
  },

  STYLE_3D: {
    style: "Premium 3D rendering, Blender/Cinema4D studio quality, Apple/Google marketing visual grade. Soft matte materials with subtle subsurface scattering and fine surface detail. NOT claymorphism, NOT cartoon, NOT toy-like, NOT inflated balloon shapes. Think product visualization for a Fortune 500 brand.",
    camera_angle: "Slightly elevated 30-degree studio angle, shallow depth of field with subtle bokeh, professional product shot feel",
    lighting: "Soft HDRI studio lighting, clean key light from top-left with gentle fill from right, subtle caustics on glossy surfaces, professional product photography lighting",
    color_palette: {
      primary: ["{BRAND_PRIMARY}", "matte white", "soft warm gray"],
      accents: ["{BRAND_SECONDARY}", "metallic highlight", "subtle glass reflection"],
    },
    atmosphere: "Modern, trustworthy, premium, tech-forward, clean and sophisticated — NOT playful, NOT childish, NOT toy-like",
    constraints: ["No text or typography", "No realistic photography elements", "Soft matte materials with subtle rounded edges — NOT inflated balloon or clay texture", "Professional 3D product render quality, not illustration", "Clean studio backdrop"],
  },

  STYLE_2D: {
    style: "Limited-palette editorial illustration in the spirit of Tom Haugomat — silkscreen / risograph aesthetic with mid-century American illustration heritage (1950s-60s). Matte gouache and acrylic finish with visible paper grain and slight ink misregistration on edges. Cinematic narrative storytelling through flat color blocks. NOT vector-clean, NOT 3D, NOT photoreal, NOT cartoon, NOT digital-glossy.",
    camera_angle: "Cinematic wide framing OR slightly elevated isometric cross-section. Layered planes — silhouetted foreground (foliage / branches / window frames) frames the middle-ground subject; distant background as a single flat color field. Human figures (if any) are small and incidental — environment dominates.",
    lighting: "Single strong directional light source — sunset, sunrise, moonlight, window light, headlights, or candle. Light visualized as a hard-edged FLAT SHAPE (a beam, a band, a pool), NOT a gradient. Shadows are sharp-edged flat color blocks, one or two tones darker than the base. NO soft gradients, NO realistic shading, NO ambient occlusion.",
    color_palette: {
      primary: ["{BRAND_PRIMARY} — this is the BRAND SIGNATURE color and MUST be the most visually identifiable color in the image (used either as a large dominant surface like sky/wall/background field, OR as the single bold spot accent on a key central object — choose whichever fits the brand color's value: dark brand colors → use as dominant background field; vivid/saturated brand colors → use as the bold spot accent)", "deep midnight navy or charcoal (for shadow blocks)", "warm cream or ivory (for highlight surfaces)"],
      accents: ["{BRAND_SECONDARY}", "ONE supporting muted vintage color from: salmon coral / mustard ochre / sage olive — desaturated, NEVER neon"],
    },
    atmosphere: "Quiet, contemplative, nostalgic, cinematic, time-suspended — the feeling of a still from a 1960s film or a vintage silkscreen travel poster. The brand color is the visual identity anchor of the entire composition.",
    constraints: [
      "BRAND COLOR PRIORITY: {BRAND_PRIMARY} must be instantly recognizable as the dominant color identity of this image. A viewer should think 'this is a brand-X piece' from the color alone.",
      "Strict 4–6 color limit total — matte and slightly desaturated, vintage editorial palette",
      "Visible paper grain and subtle ink texture across all color fields",
      "Flat color blocks with HARD edges — absolutely NO soft gradients, NO smooth shading, NO blur",
      "Silhouetted foreground framing element (foliage, branch, doorway, window mullion) preferred",
      "Faceless or near-faceless figures, small in frame — environment dominates over subject",
      "Single strong directional light, dramatic time-of-day mood (golden hour / blue hour / night)",
      "ABSOLUTELY ZERO text, letters, numbers, words, or characters anywhere in the image — NO shop signs, NO storefront names, NO banners, NO packaging text, NO posters with text, NO street signs, NO logos, NO watermarks, NO English words, NO Korean words, NO foreign script. The output is purely pictorial illustration with zero typography of any kind. Do NOT invent text into the scene.",
      "NO 3D rendering, NO photorealism, NO glossy digital finish",
    ],
  },
};

// 스타일 프리셋 → 자연어 영문 프롬프트 (composition은 동적 생성)
function flattenPreset(p: StylePreset, userRequest: string, copyContext?: CopyContext, subjectOnly?: boolean): string {
  const lines: string[] = [];

  lines.push(`Generate an image for a card background about: "${userRequest}"`);

  if (copyContext && (copyContext.nm1_label || copyContext.nm2_title || copyContext.nm3_desc)) {
    const contextParts: string[] = [];
    if (copyContext.nm1_label) contextParts.push(copyContext.nm1_label);
    if (copyContext.nm2_title) contextParts.push(copyContext.nm2_title);
    if (copyContext.nm3_desc) contextParts.push(copyContext.nm3_desc);
    lines.push(`The card text reads: "${contextParts.join(" / ")}". Use this for mood/theme reference only — do NOT render any text in the image.`);
  }

  lines.push(``);
  lines.push(`The subject and objects in the image MUST match the topic above. Choose appropriate items, settings, and props that relate to "${userRequest}".`);
  lines.push(``);
  lines.push(`Use the following rendering guidelines:`);
  lines.push(`- Style: ${p.style}`);
  lines.push(`- Camera: ${p.camera_angle}`);
  lines.push(`- Lighting: ${p.lighting}`);
  lines.push(`- Atmosphere: ${p.atmosphere}`);
  lines.push(`- Color palette: ${p.color_palette.primary.join(", ")} with accents of ${p.color_palette.accents.join(", ")}`);
  lines.push(``);
  lines.push(`Composition:`);
  lines.push(`- Background: a styled setting that fits "${userRequest}" and the mood above`);
  lines.push(`- Center: the main subject directly related to "${userRequest}"`);
  lines.push(`- The image should be FULL and RICH across the entire frame — no large empty/blank areas.`);

  if (subjectOnly) {
    lines.push(`- This is a SUBJECT-FOCUSED crop. Fill the ENTIRE frame with the main subject and its immediate context.`);
    lines.push(`- The main subject should be prominently centered, occupying 50-70% of the frame.`);
    lines.push(`- No need to reserve space for text — every area should have rich visual content.`);
  } else {
    lines.push(`- Top-left area (upper 35% × left 60%): white text will overlay here, so keep this area LOW-CONTRAST and SIMPLE (e.g. dark/blurred/soft background, bokeh, shadow, out-of-focus elements) — but NOT empty.`);
    lines.push(`- Bottom-left strip (lower 15% × left 50%): small text overlay area — keep relatively simple but not blank.`);
    lines.push(`- The main subject can span the full frame but should be most prominent in the CENTER to BOTTOM-RIGHT area.`);
  }

  lines.push(``);
  lines.push(`Hard constraints: ${p.constraints.join(". ")}. Absolutely NO text, letters, words, numbers, or typography anywhere in the image. NO logos, brand marks, symbols, watermarks, or emblems. NO electronic devices, screens, laptops, tablets, or phones.`);
  if (subjectOnly) {
    lines.push(`Format: Landscape 3:2, commercial-grade quality. This is the subject area of a card — will be extended upward later.`);
  } else {
    lines.push(`Format: Square 1:1, commercial-grade quality, 335×348px card background.`);
  }

  return lines.join("\n");
}

interface ExternalBrandContext {
  brandName: string;
  primaryColor: string;
  secondaryColor?: string | null;
  mascotDescription?: string | null;
  description?: string | null;
  targetAudience?: string | null;
  serviceCharacteristics?: string | null;
}

// variation → 스타일 매핑
const STYLE_KEYS = ["STYLE_REALISTIC", "STYLE_3D", "STYLE_2D"];

// 브랜드 색상 결정 (우선순위: externalBrand > BRAND_DB > 기본값)
function getBrandColors(userRequest: string, externalBrand?: ExternalBrandContext): { primary: string; secondary: string } {
  if (externalBrand?.primaryColor) {
    return { primary: externalBrand.primaryColor, secondary: externalBrand.secondaryColor || "subtle accent" };
  }
  const knownBrand = detectBrandName(userRequest);
  if (knownBrand && BRAND_COLORS[knownBrand]) {
    return { primary: BRAND_COLORS[knownBrand].primary, secondary: BRAND_COLORS[knownBrand].secondary || "subtle accent" };
  }
  return { primary: "warm neutral", secondary: "subtle accent" };
}

export function buildImagePrompt(
  userRequest: string,
  imageType?: string,
  copyContext?: CopyContext,
  externalBrand?: ExternalBrandContext,
  variation?: number,
  subjectOnly?: boolean
): string {
  const variationIdx = variation ?? 0;
  const presetKey = STYLE_KEYS[variationIdx] || "STYLE_REALISTIC";
  const preset = STYLE_PRESETS_MAP[presetKey];

  let prompt = flattenPreset(preset, userRequest, copyContext, subjectOnly);

  // 브랜드 색상 플레이스홀더 교체 (모든 스타일에 적용)
  const colors = getBrandColors(userRequest, externalBrand);
  prompt = prompt.replace(/\{BRAND_PRIMARY\}/g, colors.primary);
  prompt = prompt.replace(/\{BRAND_SECONDARY\}/g, colors.secondary);

  // 브랜드 키컬러 힌트 (대한항공 신규 CI 등)
  const brandHint = detectBrandColorHint(userRequest);
  if (brandHint) {
    prompt += `\n\n${brandHint}`;
  }

  // 외부 브랜드 컨텍스트 — 서비스 특성은 항상 전달
  if (externalBrand) {
    if (externalBrand.description) {
      prompt += `\n\nThis is for "${externalBrand.brandName}" — ${externalBrand.description}.`;
      if (externalBrand.targetAudience) {
        prompt += ` Target audience: ${externalBrand.targetAudience}.`;
      }
      if (externalBrand.serviceCharacteristics) {
        prompt += ` Service characteristics: ${externalBrand.serviceCharacteristics}.`;
      }
      prompt += ` The image subject, mood, and setting should reflect this service's nature and appeal to its users.`;
    }

    if (externalBrand.mascotDescription) {
      prompt += `\n\nThis brand has a mascot/character: ${externalBrand.mascotDescription}. If a reference image of the mascot is attached, use it as style/appearance reference to include the character naturally in the scene.`;
    }
  }

  return prompt;
}
