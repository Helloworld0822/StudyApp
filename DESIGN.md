# 오늘의 공부 디자인 시스템

## 0. Research Log

- Embedded reference shortlist: Notion, Linear, and editorial notebook interfaces. Chosen direction: editorial notebook, because the study task benefits from calm paper surfaces and generous Korean reading rhythm rather than dense dashboard chrome.
- Product-screen research: unavailable within this implementation pass; the layout grammar is intentionally original: a ruled-paper backdrop, one clear study action, and progress as a small personal record.
- Concept drafts: omitted because the requested deliverable is a functional app, not a bitmap mockup; the visual contract below is implemented directly in reusable UI rules.

## 1. Product intent

`오늘의 공부` presents mathematics, English, Korean, discrete mathematics, and algorithms as five-question sessions with five options per question. The home page answers what to study, how much is complete, what to revisit, and how to import existing web questions.

## 2. Tokens

| Role | Token |
| --- | --- |
| Paper | `#f8f2e5` |
| Paper raised | `#fffdf7` |
| Ink | `#24322d` |
| Quiet ink | `#68736c` |
| Math forest | `#2f6b4f` |
| English orange | `#c96835` |
| English action | `#9b431b` |
| Korean blue | `#345f85` |
| Discrete violet | `#68517c` |
| Algorithms slate | `#41576a` |
| Focus | `--focus: #24322d` |
| Correct surface | `#edf8f0` |
| Incorrect surface | `#fff2ef` |
| Selected surface | `#f0f7ef` |
| Option surface | `#fffefb` |
| Marker surface | `#f1eadc` |
| Count surface | `#eee6d5` |
| Track | `#e7dfd0` |
| Warning border / ink / background | `#e2b889` / `#794719` / `#fff5e6` |
| Rule line | `#dfd4bd` |
| Paper ruling / margin ruling | `--paper-rule: #eee5d4` / `--margin-rule: rgba(207, 83, 67, .10)` |
| Feedback correct | `#276749` |
| Feedback incorrect | `#9e3f32` |
| Radius | 14px cards, 999px pills |
| Shadow | `0 16px 40px rgba(67, 50, 27, .10)` |

Korean type uses locally available `Noto Sans CJK KR`, `Noto Sans KR`, then system sans. No remote font is required. Type scale: 12/14/15/16/17/20/21/24/28/31/36/38/42/48/68/72px; display scales responsively. Body line-height 1.6–1.75; Korean text keeps words intact. Spacing follows a 4px base with 10/14/18/22/30px compact card exceptions.

## 3. Primitives

- **Paper card:** off-white fill, one warm border, 14px radius, soft grounded shadow.
- **Subject card:** a large subject mark, topic label, session count, and a full-width accent action.
- **Choice:** a real button with 44px minimum target, visible selected state, and a left answer marker.
- **Status chip:** small rounded count/status label, never the only source of meaning.
- **Notice:** polite visible storage warning with no blocking action.
- **Import panel:** paper card with labeled subject select and URL input; idle/loading/error/preview/saved states. Preview uses native details, ordered choices, explicit correct label and source link. Add button excludes duplicate IDs; imports remain local.
- **Question provenance:** source link appears below imported questions. A separate subject action practices only imported questions.
- **AI panel:** follows checked-answer feedback, uses the same paper and button tokens, disables requests without server configuration, and displays generated choices for explicit review before saving. Generated questions retain an AI label and any original source link.

## 4. Interaction and motion

Controls lift by 1px on hover and keep a 3px ink focus ring. Feedback appears only after the learner presses check; locked choices retain the answer explanation. `prefers-reduced-motion` removes transitions.

## 5. Responsive behavior

Above 1000px, subject cards use three columns; 761–1000px uses two; below that uses one. Import fields stack on mobile. The primary reading column remains capped at 760px. Home hero is compact enough to prioritize subject selection.

## 6. Accessibility and cognitive constraints

Every action is a semantic button, choices expose pressed state, feedback uses a polite live region, color is paired with Korean labels, and focus styles remain visible. One question and one clear action appear at a time during a session.

## 7. Accepted debt and handoff

No account sync, timers, or server persistence are in scope. Progress is intentionally device-local; a visible warning explains when browser storage cannot be used. The warm paper system can later gain charts without changing the shared token vocabulary.
