# Design System — CT Generator

## Product Context
- **What this is:** AI-powered CT 041 card content creator for Hyundai Card app main feed
- **Who it's for:** Card product planners (non-designers)
- **Space/industry:** Internal fintech content tool
- **Project type:** Mobile-first web app (internal tool)

## Aesthetic Direction
- **Direction:** Industrial/Utilitarian — "Dark Workshop"
- **Decoration level:** Minimal — typography does all the work
- **Mood:** A precision instrument that disappears so the card being made can take center stage. Professional, calm, tool-like. The card preview is the only element that "breathes."

## Typography
- **Display/Hero:** Pretendard Variable 600 — 18px
- **Body:** Pretendard Variable 400 — 14px
- **UI/Labels:** Pretendard Variable 400 — 11-13px
- **Data/Tables:** JetBrains Mono 400 — 12px (tabular-nums)
- **Code:** JetBrains Mono
- **Loading:** Pretendard via CDN (`cdn.jsdelivr.net/gh/orioncactus/pretendard`), JetBrains Mono via Google Fonts
- **Scale:**

| Token | Size | Weight | Line Height | Usage |
|-------|------|--------|-------------|-------|
| type-xs | 11px | 400 | 1.4 | Labels, timestamps, meta |
| type-sm | 13px | 400 | 1.5 | Secondary body, chat assistant |
| type-base | 14px | 400 | 1.6 | Primary body, chat input |
| type-md | 15px | 500 | 1.5 | Section headers, option titles |
| type-lg | 18px | 600 | 1.3 | Page title, modal headers |
| type-mono | 12px | 400 | 1.6 | IDs, hex values, tokens |

## Color
- **Approach:** Restrained — warm dark palette, two accents

### Dark Mode (default)
| Role | Token | Hex | Usage |
|------|-------|-----|-------|
| Background | --bg-base | #1A1816 | App shell, page background |
| Sunken | --bg-sunken | #141210 | Inset areas, inactive zones |
| Surface | --bg-surface | #242220 | Bottom sheet, panels |
| Elevated | --bg-elevated | #2E2C2A | Dropdowns, hover states |
| Overlay | --bg-overlay | #383634 | Active input, selected row |
| Text Primary | --text-primary | #E8E2D9 | Main readable content |
| Text Secondary | --text-secondary | #8C8680 | Labels, helper text |
| Text Muted | --text-muted | #5A5652 | Placeholders, disabled |
| Border Subtle | --border-subtle | #2E2C2A | Structural separation |
| Border Default | --border-default | #3C3A38 | Input outlines, dividers |
| Border Strong | --border-strong | #555350 | Focus states |
| Primary Action | --accent-primary | #5B6CF8 | Action buttons, links |
| Primary Hover | --accent-primary-hover | #6B7CF9 | Hover state |
| Highlight | --accent-highlight | #D4A843 | Sparingly — 1x per screen |
| Success | --status-success | #3D9970 | Completion states |
| Warning | --status-warning | #D4A843 | Loading, caution |
| Error | --status-error | #D95F5F | Failures |
| Info | --status-info | #5B8CF8 | Informational |

### Light Mode
| Role | Token | Hex |
|------|-------|-----|
| Background | --bg-base | #F5F2ED |
| Surface | --bg-surface | #FFFFFF |
| Text Primary | --text-primary | #1A1816 |
| Text Secondary | --text-secondary | #6B6560 |
| Primary Action | --accent-primary | #4A5AE8 |
| Highlight | --accent-highlight | #B8912E |

### Usage Rules
- `--accent-highlight` (#D4A843) appears max **once per visible screen** — on the most important active element
- `--accent-primary` (#5B6CF8) is for interactive elements: buttons, links, focus rings
- The card preview area uses the deepest background to create a "lit stage" effect

## Spacing
- **Base unit:** 4px
- **Density:** Compact (production tool)
- **Scale:** 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 / 64

| Zone | Padding |
|------|---------|
| Chat message | 12px 16px |
| Bottom sheet input | 16px 20px |
| Option pill | 6px 16px |
| Section header | 12px 20px |

## Layout
- **Approach:** Mobile-first single column
- **Max content width:** 430px (sm breakpoint)
- **Grid:** Single column with bottom sheet overlay
- **Border radius:**

| Token | Value | Usage |
|-------|-------|-------|
| --radius-sm | 4px | Tags, badges, inputs |
| --radius-md | 8px | Buttons, panels, chat bubbles |
| --radius-lg | 12px | Bottom sheet, modals |
| --radius-xl | 16px | Device mockup, CT card (fixed at 16px) |
| --radius-full | 9999px | Pill buttons, status dots |

## Motion
- **Approach:** Functional — confirm that actions were received, nothing decorative
- **Easing:** enter(ease-out) exit(ease-in) move(ease-in-out)
- **Duration:** micro(80ms) short(150ms) medium(220ms) long(350ms)

| Component | Property | Duration | Easing |
|-----------|----------|----------|--------|
| Button hover | background-color | 80ms | linear |
| Chat bubble entry | opacity + translateY(6px) | 180ms | ease-out |
| Bottom sheet | translateY | 320ms | ease-out |
| Card preview load | opacity + scale(0.97) | 280ms | ease-spring |
| Option pill select | background-color | 120ms | linear |

**Strict rule:** No transitions on layout properties (width, height, top, left). Use transform and opacity only.

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-26 | Initial design system created | Created by /design-consultation. Industrial/utilitarian direction chosen for internal tool. Warm dark palette differentiates from corporate gray while keeping card preview as hero. |
| 2026-03-26 | Pretendard as primary font | Best Korean/Latin harmonization, variable font, free, no licensing risk |
| 2026-03-26 | Dual accent (indigo + amber) | Indigo for interactive actions, amber for highlight/status — used sparingly for premium feel |
| 2026-03-26 | Warm black (#1A1816) over neutral gray (#555) | Creates depth layering, makes card preview feel like a lit stage, feels intentional rather than corporate |
