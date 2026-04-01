# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # 개발 서버 (기본 3000, 사용 중이면 3001)
npm run build    # 프로덕션 빌드
npm run lint     # ESLint
npm run test     # Vitest 전체 실행
npx vitest run src/__tests__/orchestrate.test.ts  # 단일 테스트 파일
```

배포: `npx vercel --yes --prod` (GitHub 연동됨: allroundPark/CTGenerator)

## Environment

`.env.local` 필수 환경변수:
- `GEMINI_API_KEY` — 서버 API route에서 사용 (workinggroup 모드)
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase 프로젝트 URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase publishable key

메일 발송 기능용 (선택):
- `GMAIL_USER` — 발신 전용 Gmail 주소
- `GMAIL_APP_PASSWORD` — Gmail 앱 비밀번호

Vercel에도 동일 환경변수 설정 필요.

## Architecture

CT Generator는 금융사(현대카드) 앱 메인피드에 들어가는 **콘텐츠스레드(CT) 041 타입** 카드를 AI로 제작하는 웹 도구. 비디자이너(카드상품 기획자)가 직접 제작.

Tech: Next.js 16 (App Router), React 19, Tailwind CSS v4, TypeScript 5.

경로 alias: `@/` → `src/` (tsconfig paths).

### 핵심 구조 — Hooks 기반 관심사 분리

```
src/
├── hooks/
│   ├── useOrchestrate.ts  ← 메인 훅: 대화 흐름 + contentSpec + 생성/수정
│   ├── useCardPools.ts    ← 3풀(copy/sub/image) + 선택 인덱스 + 합성
│   └── useChatMessages.ts ← 메시지 히스토리 CRUD
├── lib/
│   ├── orchestrate.ts     ← API 호출 순수 함수 + classifyByDiff (의도 분류)
│   ├── imagePrompt.ts     ← BRAND_DB(26개) + 스타일 프리셋 3종 + 프롬프트 빌더
│   ├── gemini.ts          ← 문구 생성 프롬프트 빌더 + JSON 파서
│   ├── apiKey.ts          ← AES-GCM 암호화 API 키 저장 (클라이언트)
│   ├── getApiKey.ts       ← x-api-key 헤더 → env fallback (서버)
│   ├── supabase.ts        ← Supabase 클라이언트
│   └── deviceId.ts        ← localStorage 기반 기기별 ID
├── app/
│   ├── page.tsx           ← UI만 (useOrchestrate 조합 + JSX + 바텀시트/스와이프)
│   └── api/               ← 9개 API route
├── components/            ← React 컴포넌트
├── types/ct.ts            ← CTContent, ContentSpec, ImageOption, BrandContext 등
└── __tests__/             ← Vitest 단위 테스트
```

**page.tsx는 UI만.** 비즈니스 로직은 `useOrchestrate()`에, API 호출은 `lib/orchestrate.ts`에, 풀 관리는 `useCardPools()`에 있음.

### Core Data Flow — ContentSpec 기반 Orchestration

```
유저 입력 → useOrchestrate.handleMessage()
  ├─ 수정 경로 (이미 카드 있음)
  │   → extractSpec() → classifyByDiff() (LLM 없이 diff+키워드로 의도 분류)
  │   → intent별: image수정 / copy변경 / sub변경 / 새주제
  │
  └─ 대화 경로 (첫 생성)
      → extractSpec() (LLM: 필드 추출만)
      → contentSpec 머지
      → 클라이언트가 결정적 판단:
        ├─ brand 없음 → 질문
        ├─ content 없음 → suggestContent()로 소재 추천
        └─ brand+content 있음 → 생성 옵션 제공

생성 흐름:
  → searchBrand() (미등록 브랜드만)
  → generateText() → 문구 3안
  → generateParallelImages() → 이미지 3장 병렬 (실사/3D/2D)
  → 3풀에 추가 → 스와이프 Mix & Match
```

**핵심 설계 원칙**: LLM은 추출만, 클라이언트가 판단. 수정 시에도 `classifyByDiff()`가 extracted 필드 diff + 키워드 fallback으로 결정적 판단.

### 상태 관리 — 3개 독립 풀 (Mix & Match)

`useCardPools`에서 3개 풀을 독립 관리. 유저가 영역별 스와이프로 자유 조합:
- **copyPool** (CopyOption[]): label, titleLine1, titleLine2
- **subPool** (SubOption[]): subLine1, subLine2 — 첫 번째는 항상 "없음"(빈 값)
- **imagePool** (ImageOption[]): imageUrl, textColor, bgTreatment, imageConstraint + 생성 메타데이터

선택 인덱스: `selCopy`, `selSub`, `selImage` → `composite` CTContent로 합성.

**ImageOption 메타데이터**: 각 이미지에 `generationPrompt`, `generationStyle`, `generationVariation` 저장 → 수정 시 원래 프롬프트/스타일 참조.

### 이미지 생성 파이프라인

**3장 병렬 — 스타일 기반 variation:**
- variation 0: **실사** (STYLE_REALISTIC) — 프리미엄 상업 사진
- variation 1: **3D** (STYLE_3D) — 블렌더/C4D 프리미엄 렌더링 (NOT claymorphism)
- variation 2: **2D** (STYLE_2D) — 모던 플랫 벡터 일러스트

**2단계 파이프라인** (generate-image/route.ts):
```
Step 1: 주제부 생성 (3:2 비율, subjectOnly=true)
Step 2: 상단 확장 (3:2→1:1 아웃페인팅, 텍스트 영역 저대비)
```

**3가지 모드:**
- `enhance=true`: 첨부 이미지 보정 (2단계 스킵, 1:1 직접)
- `edit=true`: 기존 이미지 수정 (2단계 스킵, 원본 이미지 기반 변경)
- 기본: 2단계 파이프라인으로 새 이미지 생성

**브랜드 색상 동적 주입**: 모든 스타일 프리셋에서 `{BRAND_PRIMARY}`, `{BRAND_SECONDARY}` 플레이스홀더 → `getBrandColors()`가 externalBrand > BRAND_DB(26개) > 기본값 순으로 교체.

모델 폴백: gemini-2.5-flash-image → gemini-3.1-flash-image-preview → gemini-3-pro-image-preview

### API Routes

| Route | 모델 | 역할 |
|-------|------|------|
| `/api/extract-spec` | gemini-2.5-flash (thinking=0) | 유저 발화에서 ContentSpec 필드 추출만. 수정 의도도 추출. |
| `/api/suggest-content` | gemini-2.5-flash (thinking=0) | brand에 맞는 소재 3개 추천 (10자 이내) |
| `/api/generate` | gemini-2.5-flash | 문구 3안 생성 (JSON mode, brandContext 반영) |
| `/api/generate-image` | gemini-2.5-flash-image (폴백 3종) | 이미지 생성 (스타일별, 마스코트/로고 참조, edit 모드) |
| `/api/analyze-image` | gemini-2.5-flash | 첨부 이미지 크롭 추천 (로고 판별) |
| `/api/suggest` | gemini-2.5-flash | 텍스트 필드별 대안 5개 (hint 파라미터) |
| `/api/search-brand` | gemini-2.5-flash + Google Search | 미등록 브랜드 웹 검색 |
| `/api/search-asset` | - | 기존 에셋 DB(contents_master.csv) 검색 |
| `/api/send-email` | - | Nodemailer + Gmail SMTP로 WebP 첨부 메일 발송 |

### API 키 이중 모드

- **클라이언트**: `apiKey.ts`에서 AES-GCM 암호화 → localStorage → 요청 시 `x-api-key` 헤더
- **서버**: `getApiKey.ts`에서 헤더 우선, env fallback
- **"workinggroup"** 입력 시 서버 env 키 사용
- **로그아웃**: 좌상단 버튼 → `clearKey()` + apiKeyReady=false

### UI 레이아웃

```
┌──────────────────┐
│  DeviceViewer     │  flex-1 (앱 목업 + CT 카드 캐러셀)
│                   │  스케일: containerHeight에 맞춰 동적 리사이징
├──────────────────┤
│  바텀시트          │  드래그 가능 (100px / 280px / 60% 스냅)
│  (ChatPanel)      │  - 대화 히스토리 + 인라인 옵션/입력
│  └ 입력바 (고정)   │
└──────────────────┘
```

- 바텀시트: -mt-[15px]로 목업 위에 겹침, 3단 스냅
- DeviceViewer 스케일: `min(containerWidth/375, availableHeight/CT_BOTTOM_1X)`
- 캐러셀 스와이프: 3개 레이어(이미지/상단텍스트/하단텍스트) 독립. `e.stopPropagation()`으로 버블링 차단 필수.

### 브랜드 Knowledge 시스템

**등록 브랜드 (26개)**: `imagePrompt.ts`의 `BRAND_DB`에 인라인.
- `detectBrandName()` → `getKnownBrandContext()` → BrandContext
- 등록 브랜드는 웹 검색 스킵

**미등록 브랜드**: `/api/search-brand` Gemini + Google Search Grounding

**마스코트/로고**: `BRAND_MASCOT_MAP`, `BRAND_LOGO_MAP` (generate-image/route.ts). 파일은 `public/logos/`.

## CT 041 스펙 (변경 시 주의)

- **기본 사이즈**: 335×348px, border-radius 16px
- **텍스트 5개 필드**: 모두 34byte 제한 (한글 2byte, 영문 1byte)
  - 좌상단 padding 24px: label(14/20 Bold) → 8px gap → titleLine1(24/32) → titleLine2(24/32)
  - 좌하단 padding 24px: subLine1(14/20) → subLine2(14/20)
- **텍스트 색상**: BK(#000) 또는 WT(#FFF), WCAG 명암비 기반 추천
- **배경 처리**: none / solid(color+height) / gradient(dark|light, stops)
- **금지 조합**: WT + light gradient, BK + dark gradient → `fixColorGradientCombo()` 자동 교정

### 문구 3-Layer 구조 (NM1/NM2/NM3)

| 필드 | 역할 | 글자수 | CTContent 매핑 |
|------|------|--------|---------------|
| NM1 (라벨) | 카테고리/상품 식별 | 5~20자 | `label` |
| NM2 (타이틀 1) | 후킹/맥락 설정 | 6~15자 | `titleLine1` |
| NM3 (타이틀 2) | 구체 혜택/CTA | 6~18자 | `titleLine2` |

### 종결 어미 규칙 (필수 준수)

- **명사형 종결** (~60%): `10% 할인 쿠폰`
- **해요체** (~25%): `혜택이 있어요!`
- **~기 종결** (~10%): `미리 예약하고 10% 할인받기`
- **금지**: 반말(~해,~야,~지), 합쇼체(~합니다)

## 주의사항

- `addImageToPool`은 함수형 업데이트 사용. 병렬 호출 시 첫 이미지만 `setSelImage` 호출
- `imageUrlToBase64`는 chunk 단위(8192) 변환 필수 (큰 이미지 스택 오버플로우)
- search-brand의 유저 입력은 반드시 sanitize (prompt injection 방지)
- suggest API는 `currentContent` 키로 전달 (`content` 아님), `hint`도 별도 파라미터
- **목업 크롭 금지** — cropRatio는 항상 1, 스케일 조정으로 CT 영역 보장
- 목업 CT 영역 좌표 변경 시: DeviceViewer.tsx `MOCKUP.ct` + page.tsx `CT` + `CT_BOTTOM_1X` 동시 업데이트 필수
- extract-spec API는 `thinkingBudget: 0`으로 응답 속도 확보
- ChatInput의 한글 IME 조합 중 Enter 방지: `e.nativeEvent.isComposing` 체크 필수
- 캐러셀 스와이프 핸들러에서 `e.stopPropagation()` 필수 (이벤트 버블링 → 2칸 점프 방지)
- `handleModification`이 intent를 반환 → `handleSend`에서 "new"/"all" 확인 후 firstGeneration 호출 (React state 비동기 때문에 `pools.hasContent` 체크 불가)

## Design System
Always read DESIGN.md before making any visual or UI decisions.
All font choices, colors, spacing, and aesthetic direction are defined there.
Do not deviate without explicit user approval.
