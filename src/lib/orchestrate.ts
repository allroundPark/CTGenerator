// Orchestrate — API 호출 순수 함수 + classifyByDiff
// page.tsx에서 추출. 내부에서 fetch() 직접 사용 (Vitest에서 글로벌 mock).

import { ContentSpec, CTContent, BrandContext } from "@/types/ct";

type ApiFetchFn = (url: string, init?: RequestInit) => Promise<Response>;

// ── fetchWithTimeout: AbortController 기반 타임아웃 래퍼 ──
async function fetchWithTimeout(
  apiFetch: ApiFetchFn,
  url: string,
  init: RequestInit,
  timeoutMs = 30000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await apiFetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ── extract-spec: 유저 발화에서 ContentSpec 필드 추출 ──
export async function extractSpec(
  message: string,
  currentSpec: ContentSpec,
  apiFetch: ApiFetchFn,
): Promise<Partial<ContentSpec>> {
  try {
    const res = await fetchWithTimeout(apiFetch, "/api/extract-spec", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, currentSpec }),
    });
    const { extracted } = await res.json();
    return extracted || {};
  } catch {
    return {};
  }
}

// ── classifyByDiff: extract-spec 결과로 의도 분류 (classify-intent 대체) ──
export function classifyByDiff(
  extracted: Partial<ContentSpec>,
  userMessage: string,
): "image" | "copy" | "sub" | "new" | "all" {
  const fields = Object.keys(extracted);

  // brand/content 변경 → 새 주제
  if (fields.includes("brand") || fields.includes("content")) return "new";
  // 이미지 관련 필드 변경
  if (fields.includes("imageStyle") || fields.includes("imageSource")) return "image";
  // 텍스트 관련 필드 변경
  if (fields.includes("textTone") || fields.includes("textDraft")) return "copy";

  // fallback: 키워드 기반 (기존 classify-intent의 규칙을 클라이언트에)
  if (/이미지|사진|그림|밝게|어둡게|톤|배경|색감|캐릭터|분위기|크게|작게/.test(userMessage)) return "image";
  if (/하단|서브|아래/.test(userMessage)) return "sub";
  if (/문구|카피|제목|라벨|타이틀|짧게|길게|바꿔|수정/.test(userMessage)) return "copy";

  return "image"; // 안전한 기본값 (기존과 동일)
}

// ── searchBrand: 브랜드 웹 검색 ──
export async function searchBrand(
  query: string,
  apiFetch: ApiFetchFn,
): Promise<BrandContext | null> {
  try {
    const res = await fetchWithTimeout(apiFetch, "/api/search-brand", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.found ? (data as BrandContext) : null;
  } catch {
    return null;
  }
}

// ── generateText: 문구 3안 생성 ──
export async function generateText(
  prompt: string,
  brandContext: BrandContext | null,
  apiFetch: ApiFetchFn,
): Promise<CTContent[]> {
  const res = await fetchWithTimeout(apiFetch, "/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      ...(brandContext ? { brandContext } : {}),
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "서버 오류" }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  const data = await res.json();
  return data.variants as CTContent[];
}

// ── generateParallelImages: 이미지 N장 병렬 생성 (통합) ──
export interface ImageGenOpts {
  count?: number;
  enhance?: boolean;
  edit?: boolean;
  originalPrompt?: string;
  referenceImages?: { data: string; mimeType: string }[];
}

export async function generateParallelImages(
  prompt: string,
  variant: CTContent,
  brandContext: BrandContext | null,
  opts: ImageGenOpts,
  apiFetch: ApiFetchFn,
): Promise<(string | null)[]> {
  const count = opts.count ?? 3;

  const promises = Array.from({ length: count }, (_, i) =>
    generateSingleImage(prompt, variant, brandContext, i, opts, apiFetch),
  );

  return Promise.all(promises);
}

async function generateSingleImage(
  prompt: string,
  variant: CTContent,
  brandContext: BrandContext | null,
  variation: number,
  opts: ImageGenOpts,
  apiFetch: ApiFetchFn,
): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(apiFetch, "/api/generate-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        imageType: variant.imageType || "",
        copyContext: {
          nm1_label: variant.label,
          nm2_title: variant.titleLine1,
          nm3_desc: variant.titleLine2,
        },
        ...(brandContext ? { brandContext } : {}),
        variation,
        ...(opts.referenceImages?.length ? { referenceImages: opts.referenceImages } : {}),
        ...(opts.enhance ? { enhance: true } : {}),
        ...(opts.edit ? { edit: true } : {}),
        ...(opts.originalPrompt ? { originalPrompt: opts.originalPrompt } : {}),
      }),
    }, 60000);
    if (!res.ok) return null;
    const data = await res.json();
    return data.image ? `data:${data.image.mimeType};base64,${data.image.data}` : null;
  } catch {
    return null;
  }
}

// ── suggestField: 텍스트 필드별 대안 생성 ──
export async function suggestField(
  field: "title" | "sub",
  currentContent: CTContent,
  hint: string | undefined,
  apiFetch: ApiFetchFn,
): Promise<[string, string][]> {
  try {
    const res = await fetchWithTimeout(apiFetch, "/api/suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        field,
        currentContent,
        ...(hint ? { hint } : {}),
      }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.suggestions) ? data.suggestions : [];
  } catch {
    return [];
  }
}

// ── suggestContent: 브랜드에 맞는 소재 추천 ──
export async function suggestContent(
  brand: string,
  apiFetch: ApiFetchFn,
): Promise<string[]> {
  try {
    const res = await fetchWithTimeout(apiFetch, "/api/suggest-content", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brand }),
    });
    const { suggestions } = await res.json();
    return Array.isArray(suggestions) ? suggestions : [];
  } catch {
    return [];
  }
}
