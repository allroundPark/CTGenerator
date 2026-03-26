# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # 개발 서버 (기본 3000, 사용 중이면 3001)
npm run build    # 프로덕션 빌드
npm run lint     # ESLint
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

## Project Structure

```
Contents Generator/          ← 작업 루트
├── ct-generator/            ← Next.js 앱 (npm 명령은 여기서 실행)
│   └── src/
│       ├── app/             ← App Router (page.tsx + api/)
│       ├── components/      ← React 컴포넌트
│       ├── lib/             ← 유틸리티
│       │   ├── imagePrompt.ts ← BRAND_DB(26개 브랜드 knowledge) + 프리셋 9종 인라인
│       │   ├── gemini.ts      ← 문구 생성 프롬프트 빌더 + 파서
│       │   ├── apiKey.ts      ← AES-GCM 암호화 API 키 저장 (클라이언트)
│       │   ├── getApiKey.ts   ← x-api-key 헤더 → env fallback (서버)
│       │   ├── supabase.ts    ← Supabase 클라이언트
│       │   └── deviceId.ts    ← localStorage 기반 기기별 ID
│       └── types/ct.ts      ← CTContent, ContentSpec, BrandContext 등 핵심 타입
├── data/                    ← 운영 데이터 (CSV, JSON, 이미지)
└── Guidelines/              ← CT 041 디자인 가이드 PDF
```

경로 alias: `@/` → `src/` (tsconfig paths).

## Architecture

CT Generator는 금융사(현대카드) 앱 메인피드에 들어가는 **콘텐츠스레드(CT) 041 타입** 카드를 AI로 제작하는 웹 도구. 비디자이너(카드상품 기획자)가 직접 제작.

Tech: Next.js 16 (App Router), React 19, Tailwind CSS v4, TypeScript 5.

### Core Data Flow — ContentSpec 기반 Orchestration

```
유저 입력 → handleMessage()
  ├─ 빠른 경로 (이미 카드 있음 / 이미지 첨부 / 이미지 키워드)
  │   → handleSend() → /api/classify-intent → 해당 풀만 추가
  │
  └─ 대화 경로 (첫 생성)
      → /api/extract-spec (LLM: 필드 추출만, 판단 안 함)
      → contentSpec 머지
      → 클라이언트가 결정적(deterministic) 판단:
        ├─ brand 없음 → 질문 (고정 옵션)
        ├─ content 없음 → /api/suggest-content로 소재 추천
        ├─ textDraft 방금 입력됨 → 3안 (바로적용/보정/새로생성)
        └─ brand+content 있음 → 추가 요건 기회 제공
           [AI가 바로 만들기] [텍스트 초안 있어요] [이미지 있어요] [둘 다 있어요]

생성 흐름:
  → searchBrand (미등록 브랜드만 Gemini + Google Search Grounding)
  → /api/generate (Gemini Flash) → 문구 3안 생성 (brandContext 포함)
  → /api/generate-image (Gemini Flash Image) → 이미지 3장 병렬 생성
  → CTCard → DeviceViewer (앱 목업) → exportPng (WebP 추출)
```

**핵심 설계 원칙**: LLM은 추출만, 클라이언트가 판단. `/api/extract-spec`은 유저 발화에서 ContentSpec 필드만 추출하고, ask/generate 판단은 page.tsx 클라이언트 로직이 수행.

### ContentSpec — Orchestration 상태

```typescript
interface ContentSpec {
  brand: string | null;        // 필수: 브랜드/주제
  content: string | null;      // 필수: 콘텐츠 소재
  imageSource: "ai" | "upload" | "combine" | null;
  imageStyle: string | null;
  textTone: string | null;
  textDraft: string | null;
  generatedPrompt: string | null;
  generatedImageType: string | null;
  generatedTextColor: string | null;
}
```

### UI 레이아웃

```
┌──────────────────┐
│  DeviceViewer     │  flex-1 (앱 목업 + CT 카드 캐러셀)
│                   │  스케일: containerHeight에 맞춰 동적 리사이징
│                   │  CT 하단 + 10px 여유 보장 (바텀시트 오버랩 15px 반영)
├──────────────────┤
│  바텀시트          │  드래그 가능 (100px / 280px / 60% 스냅)
│  (ChatPanel)      │  - 대화 히스토리 + 인라인 옵션/입력
│  ├ 메시지 스크롤   │  - 하단 페이드 그라데이션
│  └ 입력바 (고정)   │  - pb-12로 safe area 확보
└──────────────────┘
```

- 바텀시트: -mt-[15px]로 목업 위에 겹침, border-radius 15px, 3단 스냅 (100px/280px/60%)
- 초기 진입: 바텀시트 100px(최소). 대화 시작 시 raiseSheet()로 280px까지 올림
- DeviceViewer 스케일: `min(containerWidth/375, availableHeight/CT_BOTTOM_1X)` — availableHeight = containerHeight - 15 (바텀시트 오버랩 보정). 바텀시트가 올라오면 컨테이너가 줄어들고 목업이 리사이징됨 (**크롭 아님, 리사이징**)
- 목업 이미지: `public/assets/light-375.png` (1125×2436 3x). CT 회색 영역: 1x 기준 x=19, y=188, w=335, h=348

### API 키 이중 모드

클라이언트가 직접 Gemini API 키를 입력하거나, "workinggroup" 입력 시 서버 env 키 사용.
- **클라이언트**: `apiKey.ts`에서 AES-GCM 암호화 → localStorage 저장 → 요청 시 `x-api-key` 헤더로 전달
- **서버**: `getApiKey.ts`에서 헤더 우선, env fallback
- **page.tsx**: `apiFetch()` 래퍼가 모든 API 호출에 키 헤더 자동 첨부

### 상태 관리 — 3개 독립 풀 (Mix & Match)

`page.tsx`에서 3개 풀을 독립 관리. 유저가 영역별 스와이프로 자유 조합:
- **copyPool** (CopyOption[]): label, titleLine1, titleLine2
- **subPool** (SubOption[]): subLine1, subLine2 — 첫 번째는 항상 "없음"(빈 값)
- **imagePool** (ImageOption[]): imageUrl, textColor, bgTreatment, imageConstraint

선택 인덱스: `selCopy`, `selSub`, `selImage` → `composite` CTContent로 합성. 별도 상태 라이브러리 없음.

**채팅 상태**: `messages: ChatMessage[]` — 대화 히스토리. pool이 source of truth, 대화는 UI 레이어.
- `addMessage()` / `updateMessage()` 헬퍼로 관리
- ChatMessage.type: "text" | "options" | "status"
- ChatMessage.showReport: true → 피드백 버튼 인라인 표시
- 숫자 입력("1", "2") → 마지막 options의 해당 옵션으로 자동 매핑

### CT 041 스펙 (변경 시 주의)

- **기본 사이즈**: 335×348px, border-radius 16px
- **텍스트 5개 필드**: 모두 34byte 제한 (한글 2byte, 영문 1byte)
  - 좌상단 padding 24px: label(14/20 Bold) → 8px gap → titleLine1(24/32) → titleLine2(24/32)
  - 좌하단 padding 24px: subLine1(14/20) → subLine2(14/20)
- **하트 아이콘**: 우상단 padding 14px, 26×26, `Heartsave_off.svg` (fill-rule evenodd, #FFF 48%)
- **텍스트 색상**: BK(#000) 또는 WT(#FFF), WCAG 명암비 기반 추천 (src/lib/contrast.ts)
- **배경 처리**: none / solid(color+height) / gradient(dark|light, stops)
- **금지 조합**: WT + light gradient, BK + dark gradient → `gemini.ts`의 `fixColorGradientCombo()`가 자동 교정

### API Routes

| Route | 모델 | 역할 |
|-------|------|------|
| `/api/extract-spec` | gemini-2.5-flash (thinking=0) | 유저 발화에서 ContentSpec 필드 추출만. 판단 안 함 |
| `/api/suggest-content` | gemini-2.5-flash (thinking=0) | brand에 맞는 소재 3개 추천 (10자 이내) |
| `/api/generate` | gemini-2.5-flash | 문구 3안 생성 (JSON mode, brandContext 반영) |
| `/api/generate-image` | gemini-2.5-flash-image (폴백 3종) | 이미지 생성 (variation별 구도 다양성, 마스코트/로고 참조) |
| `/api/analyze-image` | gemini-2.5-flash | 첨부 이미지 크롭 추천 (로고 판별) |
| `/api/suggest` | gemini-2.5-flash | 텍스트 필드별 대안 5개 (hint 파라미터로 유저 요청 반영) |
| `/api/classify-intent` | gemini-2.5-flash | 후속 요청 의도 분류 (에러 시 안전 폴백: "image") |
| `/api/search-brand` | gemini-2.5-flash + Google Search | 미등록 브랜드 웹 검색 (키컬러, 마스코트, 타겟층) |
| `/api/search-asset` | - | 기존 에셋 DB(contents_master.csv) 브랜드명 검색 |
| `/api/send-email` | - | Nodemailer + Gmail SMTP로 WebP 첨부 메일 발송 |

### 브랜드 Knowledge 시스템

**등록 브랜드 (26개)**: `imagePrompt.ts`의 `BRAND_DB`에 인라인 정의.
- `detectBrandName()` — 텍스트에서 브랜드명 탐색
- `isKnownBrand()` — 등록 여부 확인
- `getKnownBrandContext()` — BrandContext 형태로 반환
- 등록 브랜드는 웹 검색 스킵, 로컬 knowledge 즉시 사용

**미등록 브랜드**: `/api/search-brand`에서 Gemini + Google Search Grounding으로 웹 검색 → BrandContext 반환.

**마스코트**: `generate-image/route.ts`의 `BRAND_MASCOT_MAP`. 파일은 `public/logos/`에 저장.

**로고**: `BRAND_LOGO_MAP`으로 브랜드명 → 파일명 매핑. `checkLogoIntent()`로 조건부 포함.

### 이미지 생성

- **3장 병렬 생성**: variation 0(기본), 1(클로즈업), 2(와이드샷). Promise.all로 동시 호출
- **프리셋 9종**: imageType별 구조화 영문 프롬프트 (imagePrompt.ts)
- **Hard Constraints**: 텍스트/로고/전자기기 금지, safe zone 규칙
- **후속 수정 시**: 현재 이미지를 base64로 변환 → referenceImages로 전달
- **enhance 모드**: 유저 첨부 이미지는 `enhance: true`로 보정 전용 프롬프트 사용
- **첨부 이미지 병렬 처리**: applyImage가 있으면 이미지 보정과 문구 생성을 병렬로 실행

### 내보내기

exportPng.ts: Canvas API로 **이미지+배경처리만** 3x(1005×1044) WebP 추출. 텍스트/하트/로고는 앱에서 렌더하므로 포함하지 않음. 파일명: `YYMMDD_CT041_BK|WT@3x.webp`.

## 콘텐츠 생성 규칙

### 문구 3-Layer 구조 (NM1/NM2/NM3)

| 필드 | 역할 | 글자수 | CTContent 매핑 |
|------|------|--------|---------------|
| NM1 (라벨) | 카테고리/상품 식별 | 5~20자 | `label` |
| NM2 (타이틀 1) | 후킹/맥락 설정 | 6~15자 | `titleLine1` |
| NM3 (타이틀 2) | 구체 혜택/CTA | 6~18자 | `titleLine2` |

### 종결 어미 규칙 (필수 준수)

- **명사형 종결** (~60%): `10% 할인 쿠폰`, `VIP 멤버십 제공`
- **해요체** (~25%): `혜택이 있어요!`, `확인해 보세요`
- **~기 종결** (~10%): `미리 예약하고 10% 할인받기`
- **금지**: 반말(~해,~야,~지), 합쇼체(~합니다)

### 이미지 유형 (imageType 필드)

| 유형 | Gemini | 용도 |
|------|:------:|------|
| INTERIOFOCUSED | O | 실내 공간 (레스토랑, 호텔, 라운지) |
| PRODUCTFOCUSED | O | 상품 (음식, 패키지) |
| OUTERIOR | O | 야외/여행 |
| VECTOR-UI | O | 3D일러스트 (Claymorphism) — 금융/디지털 서비스 |
| HUMAN | O | 인물 (얼굴 비노출) |
| CARDPRODUCT | X | 카드 제품샷 (기존 에셋) |
| LOGO | X | 브랜드 로고 (기존 에셋) |

## 운영 데이터 (../data/)

| 파일 | 내용 |
|------|------|
| `contents_master.csv` | 전체 181건 (CT-0001~, 카테고리/문구/이미지 매핑) |
| `image_classification_final.csv` | 이미지 7종 분류 |
| `ux_writing_pattern_guide.md` | UX Writing 패턴 가이드 (종결어미 규칙 포함) |
| `gemini_prompt_spec.json` | 이미지 프리셋 9종 + decision_tree |
| `images/{TYPE}/` | 다운로드된 에셋 112건 (7개 하위 폴더) |

## 주의사항

- `addImageToPool`은 함수형 업데이트 사용. 병렬 호출 시 첫 이미지(`newIndex === 0`)일 때만 `setSelImage` 호출
- `imageUrlToBase64`는 chunk 단위(8192) 변환 필수 (큰 이미지 스택 오버플로우)
- search-brand의 유저 입력은 반드시 sanitize (prompt injection 방지)
- suggest API는 `currentContent` 키로 전달 (`content` 아님), `hint`도 별도 파라미터
- 첨부 이미지("바로적용")는 blob URL이 아닌 base64 data URL로 변환 필수 (revokeObjectURL 때문)
- **목업 크롭 금지** — cropRatio는 항상 1, 스케일 조정으로 CT 영역 보장
- 목업 CT 영역 좌표 변경 시: DeviceViewer.tsx `MOCKUP.ct` + page.tsx `CT` + `CT_BOTTOM_1X` 동시 업데이트 필수
- 바텀시트 오버랩(-mt-[15px]) → 스케일 계산 시 `availableHeight = containerHeight - 15`로 보정
- 리포트는 완성 메시지의 인라인 피드백 버튼으로 트리거 (자동 팝업 아님)
- ResizeObserver useEffect는 `[apiKeyReady]` 의존성 필수
- ChatInput의 한글 IME 조합 중 Enter 방지: `e.nativeEvent.isComposing` 체크 필수
- extract-spec API는 `thinkingBudget: 0`으로 응답 속도 확보
- 바텀시트 드래그: `sheetHeightRef`로 최신 높이 추적 (클로저 stale 방지)
- `highlightAttach`: 이미지 첨부 대기 중 표시. 이미지 없이 텍스트만 오면 자동으로 AI 생성으로 전환
- 알약 버튼 텍스트: suggest-content API에서 10자 이내로 생성. UI에서 truncate 하지 않음

## Design System
Always read DESIGN.md before making any visual or UI decisions.
All font choices, colors, spacing, and aesthetic direction are defined there.
Do not deviate without explicit user approval.
In QA mode, flag any code that doesn't match DESIGN.md.
