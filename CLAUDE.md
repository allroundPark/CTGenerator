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

`.env.local`에 `GEMINI_API_KEY` 필수. 모든 API route가 이 키를 사용.

## Project Structure

```
Contents Generator/          ← 작업 루트
├── ct-generator/            ← Next.js 앱 (npm 명령은 여기서 실행)
│   └── src/
│       ├── app/             ← App Router (page.tsx + api/)
│       ├── components/      ← React 컴포넌트
│       ├── lib/             ← 유틸리티 (gemini, bytes, contrast, exportPng, imagePrompt, feedback)
│       └── types/ct.ts      ← CTContent 등 핵심 타입 정의
├── data/                    ← 운영 데이터 (CSV, JSON, 이미지)
└── Guidelines/              ← CT 041 디자인 가이드 PDF
```

경로 alias: `@/` → `src/` (tsconfig paths). 모든 import에 `@/lib/`, `@/components/`, `@/types/` 사용.

## Architecture

CT Generator는 금융사(현대카드) 앱 메인피드에 들어가는 **콘텐츠스레드(CT) 041 타입** 카드를 AI로 제작하는 웹 도구. 기존 피그마+외주 워크플로우를 대체하여 비디자이너(카드상품 기획자)가 직접 제작.

### Core Data Flow

```
유저 채팅 요청
  → /api/generate (Gemini) → 문구 3안 생성 (NM1/NM2/NM3 + sub)
  → /api/search-asset → 기존 에셋 DB 검색
  → /api/generate-image (Gemini) → 이미지 생성 (에셋 없을 때)
  → CTCard (프리뷰 렌더링) → DeviceViewer (앱 목업) → exportPng (PNG 추출)
```

Tech: Next.js 16 (App Router), React 19, Tailwind CSS v4, TypeScript 5.

**두 가지 모드**: `page.tsx`의 `mode` state로 전환
- **chat**: AI 채팅 → 문구+이미지 자동 생성 (기본)
- **manual**: ManualEditor로 필드 직접 입력

상태 관리: 모두 `page.tsx` 클라이언트 state (`variants`, `messages`, `selectedIndex`, `genStatus`). 별도 상태 라이브러리 없음.

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
| `/api/search-asset` | - | 기존 에셋 DB(contents_master.csv) 브랜드명 검색 + 웹 크롤링 |

### 이미지 첨부 플로우

ChatInput에서 다중 이미지 첨부 가능. 이미지별 처리 옵션 3종:
- **apply** (바로 적용): 원본 그대로 배경으로
- **edit** (수정 후 적용): Gemini에 편집 요청
- **reference** (참고용): 스타일만 참고하여 새 이미지 생성

이미지 미첨부 시 자동: 에셋 DB 검색 → 없으면 Gemini 이미지 생성

### 순차 생성 UX

page.tsx의 handleSend가 단계별로 메시지를 추가:
1. "문구 생성 중..." → 문구 완성 후 캔버스 즉시 업데이트 + 말풍선
2. "이미지 고민 중..." → 에셋 검색
3. "이미지 생성 중..." → Gemini 이미지 생성 (에셋 없을 때)
4. 최종 결과 메시지

genStatus가 ChatPanel에 전달되어 로딩 말풍선에 현재 단계 표시.

### 디바이스 목업

DeviceViewer가 앱 스크린샷(public/assets/dark-375.png, light-375.png) 위에 CTCard를 오버레이.
목업 좌표 (1x): CT 영역 x:19 y:302 w:335 h:348.

### PNG 내보내기

exportPng.ts: Canvas API로 **이미지+배경처리만** 3x(1005×1044) PNG 추출. 텍스트/하트/로고는 앱에서 렌더하므로 PNG에 포함하지 않음. 파일명: `YYMMDD_CT041_BK|WT@3x.png`.

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
- [ ] CMS용 PNG @3x (현재 구현됨)
- [ ] 모션용 Lottie JSON 내보내기
- [ ] 파일명 자동생성 규칙 확장
