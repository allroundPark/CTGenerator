// 단일 분류기. 유저 입력 → ClassifyResult.
// 옛 구조의 3중 분류(extractSpec / orchestrate / handleFirstGeneration의 inline regex)를
// 이 파일 한 곳으로 통합. 옛 classifyByDiff와 같은 fallback 휴리스틱은 모두 이 모듈
// 내부의 private 함수로 흡수 — 외부에서 또 분기하지 않게.

import { AttachedImage, BrandContext, ContentSpec, CTContent } from "@/types/ct";
import {
  ClassifyResult,
  Intent,
  GenerateInputMode,
  EditImageOperation,
  NeedInfoMissing,
} from "@/types/intent";

type ApiFetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export interface ClassifyInput {
  text: string;
  images?: AttachedImage[];
  contentSpec: ContentSpec;
  hasContent: boolean;
  apiFetch: ApiFetchFn;
}

export async function classifyIntent(
  input: ClassifyInput,
): Promise<ClassifyResult> {
  const { images, hasContent } = input;

  // 1. 첨부 이미지가 있으면 별도 경로 — 옛 handleMessage의 "이미지 첨부 직행"
  // 분기를 여기로 흡수. extract-spec API는 호출하되 결과로 generate / edit_image
  // 둘 중 하나로 결정.
  if (images && images.length > 0) {
    return classifyWithImages(input, images);
  }

  // 2. 카드가 이미 있으면 수정 경로 — extract-spec만 호출하고 결과 매핑
  if (hasContent) {
    return classifyModification(input);
  }

  // 3. 첫 생성 (텍스트만) — orchestrate API로 분류 + 데이터 prefetch
  return classifyFirstGeneration(input);
}

// ── 첨부 이미지 케이스 ──
async function classifyWithImages(
  input: ClassifyInput,
  images: AttachedImage[],
): Promise<ClassifyResult> {
  const { text, hasContent } = input;
  const applyImg = images.find((i) => i.option === "apply");
  const editImg = images.find((i) => i.option === "edit");
  const refImg = images.find((i) => i.option === "reference");

  // 카드가 이미 있으면: 이미지 첨부 = edit_image (attached source)
  if (hasContent) {
    const operation: EditImageOperation =
      refImg ? "reference_generate" : editImg ? "restyle" : "enhance";
    const attachedImage = refImg || editImg || applyImg;
    return {
      ok: true,
      intent: {
        type: "edit_image",
        source: "attached",
        operation,
        instruction: text || undefined,
        attachedImage,
      },
    };
  }

  // 카드가 없으면: 첫 생성. 어떤 inputMode인지 결정.
  // 우선순위:
  //   1) "그대로/유지" 의도 + apply → verbatim (AI 변형 없음)
  //   2) "수정/바꿔" 의도 + apply → attached_edit
  //   3) ref/edit 첨부 옵션 → 그대로 매핑
  //   4) 기본: attached_apply (보정 + 변형)
  let inputMode: GenerateInputMode;
  const wantsVerbatim = text ? looksLikeVerbatim(text) : false;
  const wantsEdit = text ? looksLikeImageEdit(text) : false;
  if (refImg) {
    inputMode = "attached_reference";
  } else if (editImg) {
    inputMode = "attached_edit";
  } else if (applyImg) {
    if (wantsVerbatim) inputMode = "attached_verbatim";
    else if (wantsEdit) inputMode = "attached_edit";
    else inputMode = "attached_apply";
  } else {
    inputMode = "attached_apply";
  }

  // text가 있으면 brand/content best-effort 추출 — 수정 단계에서 컨텍스트 이어가기 위함.
  // 실패해도 OK (fail-open으로 generate 진행).
  let extractedBrand: string | undefined;
  let extractedContent: string | undefined;
  if (text) {
    const ex = await callExtractSpec(input);
    if (ex.ok) {
      extractedBrand = (ex.fields.brand as string | null | undefined) ?? undefined;
      extractedContent = (ex.fields.content as string | null | undefined) ?? undefined;
    }
  }

  return {
    ok: true,
    intent: {
      type: "generate",
      inputMode,
      promptSource: {
        brand: extractedBrand,
        content: extractedContent,
        freeText: text || "이 이미지로 카드 만들어줘",
      },
      brandSearch: "skip",
      attachedImages: images,
    },
  };
}

// ── 수정 경로 ──
async function classifyModification(input: ClassifyInput): Promise<ClassifyResult> {
  const { text } = input;
  const extracted = await callExtractSpec(input);
  if (!extracted.ok) return extracted;

  const { action, fields } = extracted;

  // 명시적 action이 있으면 그대로 신뢰 — LLM이 "이건 이미지 수정"이라고 했으면 따름
  if (action === "edit_image") {
    return {
      ok: true,
      intent: {
        type: "edit_image",
        source: "current",
        operation: "restyle",
        instruction: text,
      },
    };
  }
  if (action === "edit_copy") {
    return { ok: true, intent: { type: "edit_copy", instruction: text } };
  }
  if (action === "edit_sub") {
    return { ok: true, intent: { type: "edit_sub", instruction: text } };
  }
  // 카드가 이미 있는데 서버가 need_info를 요청하면 — 대화 컨텍스트 끊는 UX 안 좋음.
  // 수정 의도가 명확하지 않더라도 휴리스틱으로 영역 추정 (image가 안전한 default).
  // need_info는 첫 생성에서만 의미 있음 (classifyFirstGeneration이 처리).
  if (action === "need_info") {
    return { ok: true, intent: heuristicEditIntent(text) };
  }

  // generate: 수정 경로에서 generate가 나왔다는 건 "주제 변경" → 새 카드
  // brand/content가 추출됐을 때만 유효. 아니면 휴리스틱으로 어느 영역인지 추정.
  if (action === "generate") {
    if (fields.brand || fields.content) {
      return buildGenerateIntent(input, fields, null);
    }
    // generate인데 새 brand/content도 없음 — 휴리스틱으로 어디 수정인지 추정
    return { ok: true, intent: heuristicEditIntent(text) };
  }

  // 알 수 없는 action — 휴리스틱
  return { ok: true, intent: heuristicEditIntent(text) };
}

// ── 첫 생성 (텍스트만) ──
async function classifyFirstGeneration(input: ClassifyInput): Promise<ClassifyResult> {
  const { text, apiFetch, contentSpec } = input;

  // /api/orchestrate를 사용 — 1 HTTP 콜로 extract + brand search + text 생성까지 묶어서 처리
  // (Chrome 6-connection 제한 회피용 옛 최적화 보존)
  let res: Response;
  try {
    res = await apiFetch("/api/orchestrate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, currentSpec: contentSpec }),
    });
  } catch (e) {
    return classifyError("network", e);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const serverMsg = (body as { error?: string }).error;
    return classifyError(
      "network",
      new Error(serverMsg ? `${serverMsg} (HTTP ${res.status})` : `HTTP ${res.status}`),
    );
  }

  let data: {
    extracted?: Partial<ContentSpec>;
    action?: string;
    question?: string | null;
    brandContext?: BrandContext | null;
    variants?: CTContent[];
  };
  try {
    data = await res.json();
  } catch (e) {
    return classifyError("parse", e);
  }

  const fields = data.extracted || {};
  const action = data.action || "generate";
  const variants = data.variants || [];
  const brandContext = data.brandContext || null;

  if (action === "need_info") {
    return {
      ok: true,
      intent: {
        type: "need_info",
        missing: inferMissing(contentSpec, fields),
        question: data.question || "어떤 브랜드/주제의 콘텐츠를 만들까요?",
      },
    };
  }

  // 첫 생성 경로에서 edit_* action이 나오면 — 풀이 비어 있으니 의미 없음.
  // 그냥 generate로 처리. 옛 동작도 동일.
  return buildGenerateIntent(input, fields, { variants, brandContext });
}

// ── 헬퍼 ──

interface ExtractSpecOk {
  ok: true;
  fields: Partial<ContentSpec>;
  action: string;
  question: string | null;
}
type ExtractSpecResult = ExtractSpecOk | (ClassifyResult & { ok: false });

async function callExtractSpec(input: ClassifyInput): Promise<ExtractSpecResult> {
  const { text, contentSpec, apiFetch } = input;
  let res: Response;
  try {
    res = await apiFetch("/api/extract-spec", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, currentSpec: contentSpec }),
    });
  } catch (e) {
    return classifyError("network", e);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const serverMsg = (body as { error?: string }).error;
    return classifyError(
      "network",
      new Error(serverMsg ? `${serverMsg} (HTTP ${res.status})` : `HTTP ${res.status}`),
    );
  }

  let data: {
    extracted?: Partial<ContentSpec>;
    action?: string;
    question?: string | null;
  };
  try {
    data = await res.json();
  } catch (e) {
    return classifyError("parse", e);
  }

  return {
    ok: true,
    fields: data.extracted || {},
    action: data.action || "generate",
    question: data.question || null,
  };
}

function buildGenerateIntent(
  input: ClassifyInput,
  fields: Partial<ContentSpec>,
  prepared: { variants: CTContent[]; brandContext: BrandContext | null } | null,
): ClassifyResult {
  const merged = { ...input.contentSpec, ...fields };
  const intent: Intent = {
    type: "generate",
    inputMode: "text",
    promptSource: {
      brand: merged.brand || undefined,
      content: merged.content || undefined,
      freeText: input.text,
    },
    brandSearch: merged.brand ? "required" : "skip",
  };
  if (prepared && (prepared.variants.length > 0 || prepared.brandContext)) {
    return {
      ok: true,
      intent,
      prepared: {
        variants: prepared.variants.length > 0 ? prepared.variants : undefined,
        brandContext: prepared.brandContext,
      },
    };
  }
  return { ok: true, intent };
}

// 옛 classifyByDiff의 키워드 fallback — 한 곳에 격리.
// 수정 경로에서 LLM이 명시적 action을 안 줬을 때만 실행.
function heuristicEditIntent(userMessage: string): Intent {
  if (/하단|서브|아래/.test(userMessage)) {
    return { type: "edit_sub", instruction: userMessage };
  }
  if (/문구|카피|제목|라벨|타이틀|짧게|길게/.test(userMessage)) {
    return { type: "edit_copy", instruction: userMessage };
  }
  // 기본은 image — 옛 동작과 동일 (코덱스가 짚은 "default to image" 편향은
  // 이 한 곳에서만 일어남. 옛 코드처럼 3곳에 흩어지지 않음.)
  return {
    type: "edit_image",
    source: "current",
    operation: "restyle",
    instruction: userMessage,
  };
}

function looksLikeImageEdit(text: string): boolean {
  return /바꿔|변경|수정|톤|밝게|어둡게|색감|분위기|초록|파란|빨간|노란|보라|핑크/.test(text);
}

// "원본 이미지·텍스트 그대로 사용" 의도 — verbatim 모드 트리거.
// looksLikeImageEdit과 충돌할 수 있는데, 우선순위는 분류기에서 verbatim 먼저 체크.
function looksLikeVerbatim(text: string): boolean {
  return /유지|그대로|똑같이|원본|이미지의|사진의|있는 ?그대로|preserve|verbatim/i.test(text);
}

function inferMissing(
  spec: ContentSpec,
  fields: Partial<ContentSpec>,
): NeedInfoMissing {
  const merged = { ...spec, ...fields };
  if (!merged.brand) return "brand";
  if (!merged.content) return "content";
  return "goal";
}

function classifyError(
  kind: "network" | "parse" | "llm_unclear",
  e: unknown,
): { ok: false; error: { kind: "network" | "parse" | "llm_unclear"; message: string } } {
  const message = e instanceof Error ? e.message : String(e);
  return { ok: false, error: { kind, message } };
}

