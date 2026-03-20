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

`.env.local`에 `GEMINI_API_KEY` 필수. 모든 API route가 이 키를 사용. Vercel에도 동일 환경변수 설정 필요.

## Project Structure

```
Contents Generator/          ← 작업 루트
├── ct-generator/            ← Next.js 앱 (npm 명령은 여기서 실행)
│   └── src/
│       ├── app/             ← App Router (page.tsx + api/)
│       ├── components/      ← React 컴포넌트
│       ├── lib/             ← 유틸리티 (gemini, bytes, contrast, exportPng, imagePrompt, feedback)
│       │   └── imagePrompt.ts에 브랜드 키컬러 데이터 + 프리셋 9종 인라인
│       └── types/ct.ts      ← CTContent 등 핵심 타입 정의
├── data/                    ← 운영 데이터 (CSV, JSON, 이미지)
└── Guidelines/              ← CT 041 디자인 가이드 PDF
```

경로 alias: `@/` → `src/` (tsconfig paths). 모든 import에 `@/lib/`, `@/components/`, `@/types/` 사용.

## Architecture

CT Generator는 금융사(현대카드) 앱 메인피드에 들어가는 **콘텐츠스레드(CT) 041 타입** 카드를 AI로 제작하는 웹 도구. 기존 피그마+외주 워크플로우를 대체하여 비디자이너(카드상품 기획자)가 직접 제작.

### Core Data Flow

```
첫 요청:
  → /api/generate (Gemini) → 문구 3안 생성 (NM1/NM2/NM3 + sub)
  → /api/generate-image (Gemini) → AI 이미지 생성
  → CTCard (프리뷰 렌더링) → DeviceViewer (앱 목업) → exportPng (WebP 추출)

후속 요청 (이미 안이 있을 때):
  → /api/classify-intent (Gemini Flash) → 의도 분류 (image/copy/sub/new/all)
  → 해당 풀만 추가 (전체 재생성 아님)
```

Tech: Next.js 16 (App Router), React 19, Tailwind CSS v4, TypeScript 5.

### 상태 관리 — 3개 독립 풀 (Mix & Match)

`page.tsx`에서 3개 풀을 독립 관리. 유저가 영역별 스와이프로 자유 조합:

- **copyPool** (CopyOption[]): label, titleLine1, titleLine2
- **subPool** (SubOption[]): subLine1, subLine2 — 첫 번째는 항상 "없음"(빈 값)
- **imagePool** (ImageOption[]): imageUrl, textColor, bgTreatment, imageConstraint

선택 인덱스: `selCopy`, `selSub`, `selImage` → `composite` CTContent로 합성. 별도 상태 라이브러리 없음.

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
| `/api/generate` | gemini-2.0-flash | 문구 3안 생성 (JSON mode) |
| `/api/generate-image` | gemini-2.5-flash-image (폴백 3종) | 이미지 생성 (TEXT+IMAGE mode, imageConfig 1:1) |
| `/api/analyze-image` | gemini-2.0-flash | 첨부 이미지 크롭 추천 (로고 판별) |
| `/api/suggest` | gemini-2.0-flash | 텍스트 필드별 대안 5개 |
| `/api/classify-intent` | gemini-2.0-flash | 후속 요청 의도 분류 (문구수정/이미지수정/신규생성 등) |
| `/api/search-asset` | - | 기존 에셋 DB(contents_master.csv) 브랜드명 검색 + 웹 크롤링 |

### 이미지 첨부 플로우

ChatInput에서 다중 이미지 첨부 가능. 이미지별 처리 옵션 3종:
- **apply** (바로 적용): 원본 그대로 배경으로
- **edit** (수정 후 적용): Gemini에 편집 요청
- **reference** (참고용): 스타일만 참고하여 새 이미지 생성

레퍼런스 이미지가 최우선순위. 이미지 미첨부 시: AI 이미지 생성 (에셋 검색 미사용)

### 순차 생성 UX

page.tsx의 handleSend가 단계별로 상태 메시지 표시:
1. "문구 생성 중..." → 문구 완성 후 캔버스 즉시 업데이트
2. "AI로 이미지 생성 중..." → Gemini 이미지 생성
3. 완성 메시지

### 디바이스 목업

DeviceViewer가 앱 스크린샷(public/assets/dark-375.png, light-375.png) 위에 CTCard를 오버레이.
목업 좌표 (1x): CT 영역 x:19 y:302 w:335 h:348.

### 내보내기

exportPng.ts: Canvas API로 **이미지+배경처리만** 3x(1005×1044) WebP 추출. 텍스트/하트/로고는 앱에서 렌더하므로 PNG에 포함하지 않음. 파일명: `YYMMDD_CT041_BK|WT@3x.webp`.

### 브랜드 키컬러 시스템

`imagePrompt.ts`와 `gemini.ts`에 24개 브랜드 키컬러 데이터가 인라인 정의. 양방향 매칭 (컬리 → 마켓컬리). 이미지 생성 시 subtle accent로만 적용 (전체 도배 금지). `detectBrandName()`은 export되어 다른 모듈에서도 사용 가능.

**로고**: `public/logos/`에 영문 소문자 파일명 (starbucks.png, kurly.png 등). `generate-image/route.ts`의 `BRAND_LOGO_MAP`으로 브랜드명 → 파일명 매핑. Gemini Flash가 유저 요청에 로고 포함 의도가 있는지 판별(`checkLogoIntent`) → 있을 때만 reference image로 전달.

### 이미지 프롬프트 Hard Constraints

imagePrompt.ts의 `flattenPreset()`이 항상 적용하는 제약:
- 텍스트/타이포그래피 절대 금지
- 로고/브랜드 마크/워터마크/심볼 금지 (명시적 요청 시만 포함)
- 전자기기(노트북, 폰 등) 금지
- Safe zone: 좌상단 40%×65%, 좌하단 18%×55%, 우하단 15%×20%
- 피사체는 중앙~우하단에 집중, 텍스트 영역과 여유 10~15% 마진

## 콘텐츠 생성 규칙

### 문구 3-Layer 구조 (NM1/NM2/NM3)

| 필드 | 역할 | 글자수 | CTContent 매핑 |
|------|------|--------|---------------|
| NM1 (라벨) | 카테고리/상품 식별 | 5~20자 | `label` |
| NM2 (타이틀 1) | 후킹/맥락 설정 | 6~15자 | `titleLine1` |
| NM3 (타이틀 2) | 구체 혜택/CTA | 6~18자 | `titleLine2` |

### 종결 어미 규칙 (필수 준수)

- **명사형 종결** (~60%): `10% 할인 쿠폰`, `VIP 멤버십 제공`, `누리는 완벽한 쉼`
- **해요체** (~25%): `혜택이 있어요!`, `확인해 보세요`, `여행을 떠나요`
- **~기 종결** (~10%): `미리 예약하고 10% 할인받기`, `찾기`
- **금지**: 반말(~해,~야,~지), 합쇼체(~합니다), 물음형(~할까요?)

### 이미지 유형 (imageType 필드)

CTContent에 `imageType` 필드로 분류. Gemini 생성 가능 여부가 다름:

| 유형 | Gemini | 용도 |
|------|:------:|------|
| INTERIOFOCUSED | O | 실내 공간 (레스토랑, 호텔, 라운지) |
| PRODUCTFOCUSED | O | 상품 (음식, 패키지) |
| OUTERIOR | O | 야외/여행 |
| VECTOR-UI | △ | 3D일러스트 (Claymorphism) |
| HUMAN | O | 인물 (얼굴 비노출) |
| CARDPRODUCT | X | 카드 제품샷 (기존 에셋) |
| LOGO | X | 브랜드 로고 (기존 에셋) |

## 운영 데이터 (../data/)

프로젝트 루트의 `data/` 폴더에 운영 데이터 위치:

| 파일 | 내용 |
|------|------|
| `contents_master.csv` | 전체 181건 (CT-0001~, 카테고리/문구/이미지 매핑) |
| `image_classification_final.csv` | 이미지 7종 분류 |
| `ux_writing_pattern_guide.md` | UX Writing 패턴 가이드 (종결어미 규칙 포함) |
| `gemini_prompt_spec.json` | 이미지 프리셋 9종 + decision_tree |
| `gemini_meta_prompt.json` | Gemini 메타 프롬프트 (system_instruction + request_template) |
| `images/{TYPE}/` | 다운로드된 에셋 112건 (7개 하위 폴더) |

search-asset API가 contents_master.csv를 인메모리 캐시로 로드하여 브랜드명 검색에 사용. 일반 단어(브랜드/혜택/카드 등)는 매칭에서 제외하고 실제 브랜드명만 매칭.

## TODO

### 이미지 생성 개선
- [ ] 턴테이킹: 채팅으로 "더 따뜻하게", "어둡게" 등 스타일 조정
- [ ] 생성된 이미지 로컬 저장 + 목록에서 불러오기

### 이미지 배치/조작
- [ ] 로고/작은 이미지 자동 중앙 배치
- [ ] 큰 이미지 드래그/이동 크롭 위치 조정

### 내보내기
- [x] CMS용 WebP @3x (구현 완료)
- [ ] 모션용 Lottie JSON 내보내기
- [ ] 파일명 자동생성 규칙 확장
- [ ] Figma 연동 (REST API 또는 Plugin)
