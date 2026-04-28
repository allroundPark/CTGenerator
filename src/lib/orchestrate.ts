// Orchestrate — 외부 API 호출 순수 함수들.
// 옛 extractSpec / orchestrate / classifyByDiff는 lib/intent.ts로 이동.
// 의도 분류와 관련된 거짓말(catch → "generate" fallback)은 제거됨.

import { CTContent, BrandContext } from "@/types/ct";

type ApiFetchFn = (url: string, init?: RequestInit) => Promise<Response>;

// 타임아웃 래퍼 (서버 사이드에 45초 타임아웃이 있으므로 클라이언트는 넉넉하게).
// 실제 timeout 구현은 후속 PR (AbortController 도입). 현재는 pass-through.
async function fetchWithTimeout(
  apiFetch: ApiFetchFn,
  url: string,
  init: RequestInit,
  _timeoutMs = 60000,
): Promise<Response> {
  return apiFetch(url, init);
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

// ── generateParallelImages: 이미지 N장 생성 ──
// NOTE: 이름과 다르게 실제로는 순차. Chrome 동시 연결 6개 제한 회피용.
// 정확한 이름(generateImagesSequential)으로 rename은 후속 PR.
export interface ImageGenOpts {
  count?: number;
  enhance?: boolean;
  edit?: boolean;
  originalPrompt?: string;
  referenceImages?: { data: string; mimeType: string }[];
  /** 각 이미지가 완료되는 시점에 호출 — UI에 1장씩 점진적으로 보여주기 위함 */
  onEach?: (index: number, total: number, imageUrl: string | null) => void;
}

export async function generateParallelImages(
  prompt: string,
  variant: CTContent,
  brandContext: BrandContext | null,
  opts: ImageGenOpts,
  apiFetch: ApiFetchFn,
  errors?: string[],
): Promise<(string | null)[]> {
  const count = opts.count ?? 3;

  // 순차 생성: Chrome 동시 연결 제한(6개) 회피 + 새로고침 항상 가능
  const results: (string | null)[] = [];
  for (let i = 0; i < count; i++) {
    const result = await generateSingleImage(prompt, variant, brandContext, i, opts, apiFetch, errors);
    results.push(result);
    opts.onEach?.(i, count, result);
  }
  return results;
}

async function generateSingleImage(
  prompt: string,
  variant: CTContent,
  brandContext: BrandContext | null,
  variation: number,
  opts: ImageGenOpts,
  apiFetch: ApiFetchFn,
  errors?: string[],
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
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({ error: res.statusText }));
      const errMsg = `${res.status}: ${errBody.error || res.statusText}`;
      errors?.push(errMsg);
      return null;
    }
    const data = await res.json();
    return data.image ? `data:${data.image.mimeType};base64,${data.image.data}` : null;
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : "알 수 없는 오류";
    errors?.push(errMsg);
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
