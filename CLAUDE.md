# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # 개발 서버 (기본 3000, 사용 중이면 3001)
npm run build    # 프로덕션 빌드
npm run lint     # ESLint
```

배포: `npx vercel --yes --prod` (GitHub 연동됨: allroundPark/CTGenerator)

## Architecture

CT Generator는 금융사 앱 메인피드에 들어가는 **콘텐츠스레드(CT) 041 타입** 카드의 이미지를 제작하는 웹 도구. 기존 피그마+외주 워크플로우를 대체하여 비디자이너가 직접 제작.

### Core Data Flow

`CTContent` (src/types/ct.ts) → `page.tsx` (편집 UI + state) → `CTCard` (프리뷰 렌더링) → `DeviceViewer` (앱 목업 오버레이) → `exportPng` (Canvas API로 PNG 추출)

### CT 041 스펙 (변경 시 주의)

- **기본 사이즈**: 335×348px, border-radius 16px
- **텍스트 5개 필드**: 모두 34byte 제한 (한글 2byte, 영문 1byte)
  - 좌상단 padding 24px: label(14/20 Bold) → 8px gap → titleLine1(24/32) → titleLine2(24/32)
  - 좌하단 padding 24px: subLine1(14/20) → subLine2(14/20)
- **하트 아이콘**: 우상단 padding 14px, 26×26, `Heartsave_off.svg` 에셋 사용 (fill-rule evenodd, #FFF 48%)
- **텍스트 색상**: BK(#000) 또는 WT(#FFF), WCAG 명암비 기반 추천 (src/lib/contrast.ts)
- **배경 처리**: none / solid(color+height) / gradient(dark|light, stops, 높이 2/3)

### 디바이스 목업

DeviceViewer가 실제 앱 스크린샷(public/assets/dark-375.png, light-375.png) 위에 CTCard를 오버레이. 목업 좌표 (1x 기준): CT 영역은 x:19 y:302 w:335 h:348.

### PNG 내보내기

exportPng.ts는 Canvas API로 **이미지+배경처리만** 3x(1005×1044) PNG 추출. 텍스트/하트/로고는 앱에서 렌더하므로 PNG에 포함하지 않음. 라운드 클리핑 없이 직사각형으로 내보냄. 파일명: `YYMMDD_CT041_BK|WT@3x.png`.

## TODO — 구현 예정 기능

### 이미지 배치/조작
- [ ] 로고/작은 이미지가 올 때 카드 주제부(중앙)에 자동 배치
- [ ] 큰 이미지 드래그/이동으로 최적 구도 찾기 (크롭 위치 조정)

### AI 기능
- [ ] 문구 피드백: AI가 텍스트 개선안 제안
- [ ] 아이콘 기반 SVG 생성: 사용자가 원할 때 AI로 아이콘 생성
- [ ] 여러 이미지 합성: Gemini Nano/Banana/Pro 활용하여 합성 이미지 제작

### 내보내기
- [ ] CMS용 PNG @3x (현재 구현됨)
- [ ] 모션용 Lottie JSON 내보내기
- [ ] 파일명 자동생성 규칙 확장
