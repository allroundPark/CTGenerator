// Orchestrate — API 호출 순수 함수 + classifyByDiff
// page.tsx에서 추출. 내부에서 fetch() 직접 사용 (Vitest에서 글로벌 mock).

import { ContentSpec, CTContent, BrandContext } from "@/types/ct";

type ApiFetchFn = (url: string, init?: RequestInit) => Promise<Response>;

// ── fetchWithTimeout: 타임아웃 래퍼 (서버 사이드에 45초 타임아웃이 있으므로 클라이언트는 넉넉하게) ──
async function fetchWithTimeout(
  apiFetch: ApiFetchFn,
  url: string,
  init: RequestInit,
  _timeoutMs = 60000,
): Promise<Response> {
  return apiFetch(url, init);
}

// ── extract-spec: 유저 발화에서 필드 추출 + 실행 판단 ──
export type ExtractAction = "generate" | "edit_image" | "edit_copy" | "edit_sub" | "need_info";

export interface ExtractResult {
  extracted: Partial<ContentSpec>;
  action: ExtractAction;
  question: string | null;
}

export async function extractSpec(
  message: string,
  currentSpec: ContentSpec,
  apiFetch: ApiFetchFn,
): Promise<ExtractResult> {
  try {
    const res = await fetchWithTimeout(apiFetch, "/api/extract-spec", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, currentSpec }),
    });
    const data = await res.json();
    return {
      extracted: data.extracted || {},
      action: data.action || "generate",
      question: data.question || null,
    };
  } catch {
    return { extracted: {}, action: "generate", question: null };
  }
}

// ── orchestrate: 의도 파악 + 브랜드 검색 + 문구 생성을 1개 HTTP 연결로 ──
export interface OrchestrateResult extends ExtractResult {
  brandContext: BrandContext | null;
  variants: CTContent[];
}

export async function orchestrate(
  message: string,
  currentSpec: ContentSpec,
  apiFetch: ApiFetchFn,
): Promise<OrchestrateResult> {
  try {
    const res = await fetchWithTimeout(apiFetch, "/api/orchestrate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, currentSpec }),
    });
    const data = await res.json();
    return {
      extracted: data.extracted || {},
      action: data.action || "generate",
      question: data.question || null,
      brandContext: data.brandContext || null,
      variants: data.variants || [],
    };
  } catch {
    return { extracted: {}, action: "generate", question: null, brandContext: null, variants: [] };
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
  errors?: string[],
): Promise<(string | null)[]> {
  const count = opts.count ?? 3;

  // 순차 생성: Chrome 동시 연결 제한(6개) 회피 + 새로고침 항상 가능
  // 첫 이미지가 빨리 보이고, 나머지는 순차적으로 추가
  const results: (string | null)[] = [];
  for (let i = 0; i < count; i++) {
    const result = await generateSingleImage(prompt, variant, brandContext, i, opts, apiFetch, errors);
    results.push(result);
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
