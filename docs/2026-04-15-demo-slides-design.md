# Demo Slides — Design Spec

**Date:** 2026-04-15
**Owner:** Product1팀 윤성호, Product2팀 박주형
**Goal:** 데모데이용 10장 슬라이드를 Next.js 앱 내부 라우트로 제공.

## Scope
- 경로: `/demo-slides` (ct-generator 앱 내부)
- 레퍼런스 (`ux2demoday1st.vercel.app/session2/03-banner-agent`) 구조 포팅
- 디자인 톤: DESIGN.md의 Dark Workshop 팔레트 (warm dark + Pretendard + indigo/amber). 보라/핑크 accent 제거.

## Architecture
- 라우트: `src/app/demo-slides/page.tsx` — 'use client', 슬라이드 렌더러
- 데이터: `src/app/demo-slides/slide-data.ts` — `SLIDE_DATA` 객체 (TypeScript)
- 스타일: 동일 디렉토리 `slides.module.css` 또는 인라인 `<style jsx global>` — 1920×1080 고정 + fit-to-screen 스케일
- 이미지/에셋: `public/demo-slides/` 하위

## Slide Data Shape
기본은 레퍼런스 `SLIDE_DATA` 스키마 그대로. variant는 필요한 것만 (cover=hero, built=steps, next=roadmap).

## 10 Slides (Content)
1. **Cover (hero)** — title "C/T 카드 제작 도구" / subtitle "현업이 직접 대화로 만들고, 실제 앱 룩앤필까지 바로 확인" / members "Product1팀 윤성호, Product2팀 박주형"
2. **Problem** — 같은 카드, 매번 처음부터 (3 카드: 규격/문구 규칙/일관성 + 기존 프로세스 6단계)
3. **Built (steps)** — URL·브랜드 하나로 끝나는 CT 카드 제작 (4 feature: 브랜드 자동 추출 / 문구 3안 / 이미지 3장 병렬 / Mix & Match + PNG·메일)
4. **How** — 기술 구조 flow + 3가지 why (LLM 추출 전용, 3풀 독립, 2단계 아웃페인팅)
5. **Before/After** — "여러 조직·여러 날 걸리던 CT 제작, 한 화면에서 완결" (6단계/일 단위 → 1단계/현업 단독)
6. **What's Next (roadmap)** — can/can't/next
7. **Closing** — "매번 처음부터 만들던 CT 카드, 브랜드 하나로 끝낼 수 있었습니다."
8. **Q&A** (자동)
9. **Extra cards — LESSONS LEARNED** (position: after-ba)
10. **Extra image** — 최종 카드 스크린샷

## Features (포팅 대상)
- 키보드 네비 (←/→/Space), 프로그레스 바, 슬라이드 카운터
- 다크/라이트 토글, 폰트 스케일 (−/+), 풀스크린
- fadeInUp 애니메이션 (step delay)
- PDF/PNG 익스포트는 **v1에서 제외** (복잡도↑ — 데모 우선). 필요 시 후속 iteration.

## Design Tokens (override 레퍼런스)
```
--bg-base       #1A1816
--bg-surface    #242220
--bg-elevated   #2E2C2A
--text-primary  #E8E2D9
--text-secondary #8C8680
--border-subtle #2E2C2A
--border-default #3C3A38
--accent        #5B6CF8 (indigo)
--highlight     #D4A843 (amber, 슬라이드당 1회)
```
- Font: Pretendard Variable (이미 프로젝트 로드됨)
- 텍스트 밸런스, 행간은 DESIGN.md 따름

## Out of Scope (v1)
- PDF/PNG export
- 3D/motion 효과 추가
- 모바일 반응형 (1920×1080 고정 + scale-to-fit만 지원)

## Verification
- 로컬 `npm run dev` → `/demo-slides` 10장 이동 확인
- 키보드 ←/→/Space 동작
- 다크/라이트 토글
- 빌드 `npm run build` 통과
