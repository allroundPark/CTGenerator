// 이미지 생성 프롬프트 빌더: imageType → 프리셋 선택 → 구조화 영문 프롬프트

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

/** 텍스트에서 브랜드명을 탐색하여 매칭된 브랜드의 키컬러 힌트 문자열을 반환 */
function detectBrandColorHint(text: string): string | null {
  for (const brand of BRAND_NAMES) {
    const words = text.split(/\s+/);
    if (text.includes(brand) || words.some((w) => w.length >= 2 && brand.includes(w))) {
      const colors = BRAND_COLORS[brand];
      const parts: string[] = [`Primary: ${colors.primary}`];
      if (colors.secondary) parts.push(`Secondary: ${colors.secondary}`);
      if (colors.tertiary) parts.push(`Tertiary: ${colors.tertiary}`);
      return `Brand "${brand}" key colors: ${parts.join(", ")}. Use these as subtle accent colors only (e.g. a small prop, lighting tint, or background tone). Do NOT make the entire image this color. Keep the palette natural and balanced. Do NOT render any logos, brand marks, or symbols in the image.`;
    }
  }
  return null;
}

interface PromptParameters {
  style: string;
  camera_angle: string;
  lighting: string;
  color_palette: { primary: string[]; accents: string[] };
  composition: {
    background: string;
    center_focus: { description: string; texture: string; colors: string };
    surrounding_elements: Record<string, string[]>;
  };
  atmosphere: string;
  constraints: string[];
}

interface CopyContext {
  nm1_label?: string;
  nm2_title?: string;
  nm3_desc?: string;
}

// imageType → preset 매핑 (decision_tree 기반)
const TYPE_TO_PRESET: Record<string, string> = {
  INTERIOFOCUSED: "INTERIOFOCUSED_fine_dining",
  PRODUCTFOCUSED: "PRODUCTFOCUSED_food",
  OUTERIOR: "OUTERIOR_tropical_resort",
  "VECTOR-UI": "VECTOR_UI_3d_isometric",
  HUMAN: "HUMAN_lifestyle",
};

// 유저 요청 키워드 기반 세부 프리셋 선택
function selectPresetKey(imageType: string, userRequest: string): string {
  const q = userRequest.toLowerCase();

  if (imageType === "INTERIOFOCUSED") {
    if (q.includes("일본") || q.includes("가이세키") || q.includes("교토") || q.includes("오마카세") || q.includes("일식"))
      return "INTERIOFOCUSED_japanese_dining";
    if (q.includes("호텔") || q.includes("스위트") || q.includes("리조트") || q.includes("라운지") || q.includes("풀빌라"))
      return "INTERIOFOCUSED_hotel_suite";
    if (q.includes("카페") || q.includes("커피") || q.includes("스타벅스") || q.includes("투썸") || q.includes("베이커리") || q.includes("파리바게뜨"))
      return "INTERIOFOCUSED_fine_dining";
    return "INTERIOFOCUSED_fine_dining";
  }

  if (imageType === "PRODUCTFOCUSED") {
    if (q.includes("음식") || q.includes("배달") || q.includes("피자") || q.includes("치킨") || q.includes("도미노") || q.includes("버거") || q.includes("푸드"))
      return "PRODUCTFOCUSED_food";
    if (q.includes("카페") || q.includes("커피") || q.includes("라떼") || q.includes("디저트") || q.includes("빵") || q.includes("케이크") || q.includes("아이스크림"))
      return "PRODUCTFOCUSED_food";
    return "PRODUCTFOCUSED_lifestyle";
  }

  if (imageType === "OUTERIOR") {
    if (q.includes("도시") || q.includes("건물") || q.includes("도심") || q.includes("서울") || q.includes("주유") || q.includes("gs칼텍스") || q.includes("쏘카"))
      return "OUTERIOR_urban";
    if (q.includes("골프") || q.includes("필드"))
      return "OUTERIOR_urban";
    return "OUTERIOR_tropical_resort";
  }

  if (imageType === "VECTOR-UI") {
    return "VECTOR_UI_3d_isometric";
  }

  if (imageType === "HUMAN") {
    return "HUMAN_lifestyle";
  }

  return TYPE_TO_PRESET[imageType] || "PRODUCTFOCUSED_food";
}

// gemini_prompt_spec.json의 프리셋들 (인라인 — 빌드타임에 파일 읽기 대신)
const PRESETS: Record<string, PromptParameters> = {
  INTERIOFOCUSED_japanese_dining: {
    style: "Professional editorial photography, high-end food & travel magazine style",
    camera_angle: "Eye-level, looking into the room through an open sliding door",
    lighting: "Soft natural indirect light filtering through shoji screens, subtle green reflections from garden outside",
    color_palette: {
      primary: ["deep forest green", "charcoal black", "dark wood brown", "tatami beige"],
      accents: ["moss green", "warm gold from food plating"],
    },
    composition: {
      background: "Traditional Japanese kaiseki restaurant interior with tatami flooring and a lush garden visible through wide wooden-frame windows",
      center_focus: {
        description: "A long low wooden table set for a multi-course kaiseki dinner",
        texture: "Smooth dark lacquered wood, woven tatami, handcrafted ceramic plates",
        colors: "Dark tones — black lacquer, deep brown wood, cream ceramics",
      },
      surrounding_elements: {
        top_left: ["Minimal — clean area for text overlay"],
        top_center: ["Dense green garden foliage visible through window"],
        top_right: ["Continuation of garden view, overhanging tree branches"],
        bottom_left: ["Edge of tatami seating, a folded napkin"],
        bottom_center: ["The table with plates and delicate food arrangements"],
        bottom_right: ["A small sake set, subtle warm glow"],
      },
    },
    atmosphere: "Serene, contemplative, exclusive, traditional Japanese luxury",
    constraints: ["No text or typography", "No direct face shots"],
  },

  INTERIOFOCUSED_hotel_suite: {
    style: "Architectural interior photography, luxury hospitality editorial",
    camera_angle: "Wide-angle eye-level, capturing full room depth from entrance toward window",
    lighting: "Large floor-to-ceiling windows with warm daylight streaming in, complemented by soft warm-toned floor lamp",
    color_palette: {
      primary: ["warm beige", "ivory white", "light gray", "sand"],
      accents: ["camel brown (sofa)", "muted green (plants outside window)", "brass gold (lamp fixtures)"],
    },
    composition: {
      background: "Spacious modern luxury hotel suite with panoramic city/nature view through floor-to-ceiling windows, sheer curtains partially drawn",
      center_focus: {
        description: "An inviting L-shaped cream sofa with plush cushions, a round coffee table with a vase of fresh flowers",
        texture: "Soft linen fabric, polished marble floor, brushed brass metal",
        colors: "Neutral tones — cream, beige, warm gray",
      },
      surrounding_elements: {
        top_left: ["Clean wall or ceiling area (text overlay safe zone)"],
        top_center: ["Upper portion of panoramic window with distant view"],
        top_right: ["Floor lamp with warm glow, framed artwork on dark accent wall"],
        bottom_left: ["Small side table with a decorative object or book"],
        bottom_center: ["Plush area rug under the coffee table"],
        bottom_right: ["An accent armchair, or edge of a dining area with wine glasses"],
      },
    },
    atmosphere: "Serene, luxurious, restful, modern elegance, a perfect retreat",
    constraints: ["No text or typography", "No people"],
  },

  INTERIOFOCUSED_fine_dining: {
    style: "Moody editorial food photography, Michelin-star restaurant ambiance",
    camera_angle: "45-degree angle from slightly above, capturing table setting and ambient background",
    lighting: "Warm candlelight with soft overhead spot lighting, rich shadows on the table",
    color_palette: {
      primary: ["deep charcoal", "dark walnut brown", "cream white (plates)", "burgundy"],
      accents: ["ruby red (wine)", "gold (cutlery)", "forest green (herbs)"],
    },
    composition: {
      background: "Dimly lit upscale restaurant with dark wood paneling, soft bokeh of distant candles and pendant lights",
      center_focus: {
        description: "An elegantly plated fine-dining course on a white ceramic plate — architectural food presentation with micro-herbs and sauce art",
        texture: "Smooth porcelain plate, glossy sauce, delicate food textures",
        colors: "White plate against dark table, vibrant food colors",
      },
      surrounding_elements: {
        top_left: ["Soft out-of-focus warm light (text overlay safe zone)"],
        top_center: ["Bokeh of pendant lights, suggestion of other tables"],
        top_right: ["A wine glass filled with red wine, catching light"],
        bottom_left: ["Folded linen napkin, polished silver cutlery"],
        bottom_center: ["Dark wooden table surface with subtle grain"],
        bottom_right: ["Small bread plate or amuse-bouche, a water glass"],
      },
    },
    atmosphere: "Intimate, premium, gastronomic, warm sophistication",
    constraints: ["No text or typography"],
  },

  PRODUCTFOCUSED_food: {
    style: "Commercial food photography, appetizing hero shot, editorial grade",
    camera_angle: "45-degree or slightly overhead, hero product filling 60% of frame",
    lighting: "Main key light from top-left, soft fill light, minimal shadow, warm color temperature",
    color_palette: {
      primary: ["dark charcoal/black (background)", "warm golden brown (food)", "cream white"],
      accents: ["red (tomato/sauce)", "green (herbs/garnish)", "melted cheese yellow"],
    },
    composition: {
      background: "Dark textured stone or slate surface, creating dramatic contrast with the food",
      center_focus: {
        description: "Hero food item — generously topped pizza with melting cheese pull, or perfectly plated steak with sides",
        texture: "Melting cheese strings, crispy crust edges, glistening sauce, steam rising",
        colors: "Rich golden browns, vibrant greens and reds of toppings",
      },
      surrounding_elements: {
        top_left: ["Dark empty area (text overlay safe zone)"],
        top_center: ["Subtle steam or smoke rising from the food"],
        top_right: ["A small dipping sauce bowl"],
        bottom_left: ["A side dish on a smaller plate, scattered herbs"],
        bottom_center: ["Crumbs or sauce drips on the surface for authenticity"],
        bottom_right: ["Edge of a wooden cutting board or utensil"],
      },
    },
    atmosphere: "Appetizing, warm, indulgent, premium fast-casual",
    constraints: ["No text or typography", "No packaging with readable text"],
  },

  PRODUCTFOCUSED_lifestyle: {
    style: "Clean lifestyle product photography, editorial e-commerce, aspirational",
    camera_angle: "Slight 30-degree angle, product hero shot with lifestyle context",
    lighting: "Bright natural window light from left side, soft diffused shadows",
    color_palette: {
      primary: ["warm white", "light beige", "soft cream", "natural wood"],
      accents: ["brand signature color of the product", "green (plants)", "muted pastels"],
    },
    composition: {
      background: "Clean kitchen counter, marble tabletop, or styled flat surface with warm natural tones",
      center_focus: {
        description: "The featured product prominently placed on a styled surface",
        texture: "Fabric, cardboard, glass bottle — realistic material rendering",
        colors: "Product's brand color stands out against neutral background",
      },
      surrounding_elements: {
        top_left: ["Clean wall area (text overlay safe zone)"],
        top_center: ["A small plant or decorative object"],
        top_right: ["Another related product or accessory"],
        bottom_left: ["Fresh ingredients, beauty items, or relevant objects scattered naturally"],
        bottom_center: ["Surface texture — marble veins, wood grain"],
        bottom_right: ["Small accent items — lemons, herbs, or lifestyle props"],
      },
    },
    atmosphere: "Clean, aspirational, everyday luxury, curated lifestyle",
    constraints: ["No text or typography"],
  },

  OUTERIOR_tropical_resort: {
    style: "Travel editorial photography, luxury resort drone/eye-level shot",
    camera_angle: "Top-down drone view or elevated 60-degree angle",
    lighting: "Golden hour warm sunlight, long shadows, glowing highlights on water",
    color_palette: {
      primary: ["turquoise blue (pool/ocean)", "lush tropical green", "warm terracotta (rooftop)"],
      accents: ["white (sun loungers)", "golden sand", "sunset orange/pink"],
    },
    composition: {
      background: "Aerial or elevated view of a luxury private villa with infinity pool surrounded by tropical vegetation",
      center_focus: {
        description: "A pristine private infinity pool with crystal-clear turquoise water, sun loungers arranged beside it",
        texture: "Shimmering water surface, thatched roof texture, smooth pool edge tiles",
        colors: "Deep turquoise against green foliage and warm earth tones",
      },
      surrounding_elements: {
        top_left: ["Dense tropical canopy, palm fronds"],
        top_center: ["Thatched-roof villa structure"],
        top_right: ["Distant ocean horizon or rice terrace view"],
        bottom_left: ["Garden pathway with stepping stones"],
        bottom_center: ["Pool water filling the frame"],
        bottom_right: ["Outdoor lounge area with cushions"],
      },
    },
    atmosphere: "Exotic, luxurious, serene, exclusive tropical escape",
    constraints: ["No text or typography", "No people or minimal silhouettes"],
  },

  OUTERIOR_urban: {
    style: "Architectural exterior photography, modern metropolitan editorial",
    camera_angle: "Eye-level or slightly low angle looking up at architecture",
    lighting: "Blue hour twilight, building interiors glowing warm, dramatic sky",
    color_palette: {
      primary: ["deep blue (sky)", "warm amber (interior lights)", "cool gray (concrete/glass)"],
      accents: ["white LED lines", "warm yellow window glow"],
    },
    composition: {
      background: "Modern city skyline or a single striking architectural building at twilight",
      center_focus: {
        description: "A landmark modern building with dramatic glass facade, warm interior lighting visible",
        texture: "Smooth glass, brushed steel, concrete, reflecting sky colors",
        colors: "Cool blue exterior, warm amber interior glow creating contrast",
      },
      surrounding_elements: {
        top_left: ["Open sky area (text overlay safe zone)"],
        top_center: ["Sky gradient from deep blue to purple"],
        top_right: ["Distant city buildings, scattered lights"],
        bottom_left: ["Street-level trees or landscaping"],
        bottom_center: ["Building entrance or plaza"],
        bottom_right: ["Street-level activity, car light trails"],
      },
    },
    atmosphere: "Metropolitan, sophisticated, modern, prestigious",
    constraints: ["No text or typography", "No recognizable brand signage"],
  },

  VECTOR_UI_3d_isometric: {
    style: "3D illustration, 3D rendering, Claymorphism, Isometric perspective",
    camera_angle: "Top-down isometric view, 30-degree tilt",
    lighting: "Soft studio lighting, clean and bright, minimal harsh shadows, subtle ambient occlusion",
    color_palette: {
      primary: ["soft sky blue", "light periwinkle", "white", "cool gray"],
      accents: ["deep blue (brand accent)", "mint green (growth)", "warm coral (alert)"],
    },
    composition: {
      background: "Smooth soft gradient from very light sky blue to white, clean infinite backdrop",
      center_focus: {
        description: "Main 3D object representing the financial concept — e.g. a glossy car on a pedestal for auto loan, a coin stack for savings, a house for mortgage",
        texture: "Inflated, glossy, smooth clay/balloon texture, soft rounded edges",
        colors: "Gradient from light blue to periwinkle, with white highlights",
      },
      surrounding_elements: {
        top_left: ["Clean empty area (text overlay safe zone)"],
        top_center: ["Floating 3D currency symbol (₩) on a circular disc"],
        top_right: ["Another floating 3D disc with ₩ symbol, slightly smaller"],
        bottom_left: ["Small decorative 3D shapes — rounded cubes, spheres"],
        bottom_center: ["3D cylindrical pedestals of varying heights"],
        bottom_right: ["The main 3D object sitting on the tallest pedestal"],
      },
    },
    atmosphere: "Modern, trustworthy, clean, friendly fintech, approachable finance",
    constraints: ["No text or typography", "No realistic photography elements", "Keep all shapes rounded and soft"],
  },

  HUMAN_lifestyle: {
    style: "Lifestyle photography, editorial, warm and candid feel",
    camera_angle: "Behind-the-shoulder, back view, or cropped to show hands/body only",
    lighting: "Natural ambient light, warm color temperature",
    color_palette: {
      primary: ["warm neutral tones", "navy blue (uniform/clothing)", "cream white"],
      accents: ["skin tone warmth", "metallic watch/accessories"],
    },
    composition: {
      background: "Context of the service being used — airplane cabin, hotel lobby, restaurant",
      center_focus: {
        description: "A person interacting with the service environment — touching a seat, holding a menu, reaching for a product",
        texture: "Fabric of clothing, leather seat, polished surfaces",
        colors: "Muted, professional tones",
      },
      surrounding_elements: {
        top_left: ["Blurred background (text overlay safe zone)"],
        top_center: ["Interior environment depth"],
        top_right: ["Ambient environmental detail"],
        bottom_left: ["Person's arm or hand in action"],
        bottom_center: ["The object being interacted with"],
        bottom_right: ["Detail accent — watch, ring, cufflink"],
      },
    },
    atmosphere: "Premium service experience, personal, warm, aspirational",
    constraints: ["No direct frontal face", "Show person from back, side, or cropped", "No text or typography"],
  },
};

// 프리셋 파라미터 → 자연어 영문 프롬프트
function flattenPreset(p: PromptParameters, userRequest: string, copyContext?: CopyContext): string {
  const lines: string[] = [];

  // 유저 요청 + 문구 맥락에서 주제 파악 → 피사체 결정의 최우선 기준
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
  lines.push(`Use the following photography/rendering guidelines:`);
  lines.push(`- Style: ${p.style}`);
  lines.push(`- Camera: ${p.camera_angle}`);
  lines.push(`- Lighting: ${p.lighting}`);
  lines.push(`- Atmosphere: ${p.atmosphere}`);
  lines.push(`- Use a color palette that fits "${userRequest}" — reference tones: ${p.color_palette.primary.slice(0, 2).join(", ")}`);
  lines.push(``);
  lines.push(`Composition layout guide:`);
  lines.push(`- Background: a styled surface or setting that fits "${userRequest}"`);
  lines.push(`- Center: the main subject directly related to "${userRequest}" — choose realistic, recognizable items for this topic`);

  const se = p.composition.surrounding_elements;
  lines.push(`- The image should be FULL and RICH across the entire frame — no large empty/blank areas.`);
  lines.push(`- Top-left area (upper 35% × left 60%): white text will overlay here, so keep this area LOW-CONTRAST and SIMPLE (e.g. dark/blurred/soft background, bokeh, shadow, out-of-focus elements) — but NOT empty. The background should still have content, just subdued enough for text readability.`);
  lines.push(`- Bottom-left strip (lower 15% × left 50%): small text overlay area — keep relatively simple but not blank.`);
  lines.push(`- The main subject can span the full frame but should be most prominent in the CENTER to BOTTOM-RIGHT area.`);

  lines.push(``);
  lines.push(`Hard constraints: ${p.constraints.join(". ")}. Absolutely NO text, letters, words, numbers, or typography anywhere in the image. NO logos, brand marks, symbols, watermarks, or emblems. NO electronic devices, screens, laptops, tablets, or phones.`);
  lines.push(`Format: Square 1:1, commercial-grade quality, 335×348px card background.`);

  // 브랜드 키컬러 힌트 추가
  const brandHint = detectBrandColorHint(userRequest);
  if (brandHint) {
    lines.push(``);
    lines.push(brandHint);
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

export function buildImagePrompt(
  userRequest: string,
  imageType?: string,
  copyContext?: CopyContext,
  externalBrand?: ExternalBrandContext
): string {
  const type = imageType || "PRODUCTFOCUSED";
  const presetKey = selectPresetKey(type, userRequest);
  const preset = PRESETS[presetKey] || PRESETS.PRODUCTFOCUSED_food;

  let prompt = flattenPreset(preset, userRequest, copyContext);

  // 외부 브랜드 컨텍스트 — 내장 브랜드여도 서비스 설명은 항상 활용
  if (externalBrand) {
    // 내장 브랜드가 아닌 경우에만 색상 힌트 추가 (내장 브랜드는 detectBrandColorHint에서 이미 처리)
    if (!detectBrandName(userRequest)) {
      const colorParts = [`Primary: ${externalBrand.primaryColor}`];
      if (externalBrand.secondaryColor) colorParts.push(`Secondary: ${externalBrand.secondaryColor}`);
      prompt += `\n\nBrand "${externalBrand.brandName}" key colors: ${colorParts.join(", ")}. Use these as subtle accent colors only (e.g. a small prop, lighting tint, or background tone). Do NOT make the entire image this color. Keep the palette natural and balanced. Do NOT render any logos, brand marks, or symbols in the image.`;
    }

    // 서비스 특성은 항상 전달 — 이미지 주제/분위기 결정에 핵심
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
