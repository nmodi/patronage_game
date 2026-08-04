---
name: Patronage
description: Parchment-and-ink HUD for a cozy Renaissance-Italy city builder
colors:
  sienna: "#9c3a24"
  prestige-gold: "#c9932f"
  prestige-ink: "#8a6a1c"
  verde: "#4a6551"
  crest-blue: "#2f3d63"
  crest-blue-deep: "#1b2340"
  parchment: "#f9f5ec"
  parchment-deep: "#ede7da"
  ink: "#453824"
  ink-faint: "#7d6b4f"
  wood: "#b39868"
  navy: "#14161f"
  navy-deep: "#212533"
  navy-ink: "#e9e3d3"
  navy-ink-faint: "#9ba0b1"
  navy-wood: "#383d4f"
  navy-sienna: "#cf7a52"
  navy-prestige-ink: "#d4a94c"
typography:
  display:
    fontFamily: "Sorts Mill Goudy, EB Garamond, serif"
    fontSize: "4.5rem"
    fontWeight: 700
    letterSpacing: "0.02em"
  headline:
    fontFamily: "Sorts Mill Goudy, EB Garamond, serif"
    fontSize: "1.125rem"
    fontWeight: 600
  title:
    fontFamily: "Sorts Mill Goudy, EB Garamond, serif"
    fontSize: "0.875rem"
    fontWeight: 600
    letterSpacing: "0.05em"
  body:
    fontFamily: "EB Garamond, Georgia, Times New Roman, serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.4
  small:
    fontFamily: "EB Garamond, Georgia, serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.3
  label:
    fontFamily: "EB Garamond, Georgia, serif"
    fontSize: "0.625rem"
    fontWeight: 400
    letterSpacing: "0.025em"
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
components:
  button-primary:
    backgroundColor: "{colors.sienna}"
    textColor: "{colors.parchment}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  button-secondary:
    backgroundColor: "{colors.parchment-deep}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  button-quiet:
    backgroundColor: "{colors.parchment-deep}"
    textColor: "{colors.sienna}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
---

# Design System: Patronage

## Overview

**Creative North Star: "The Patron's Ledger"**

The DOM overlay is a Renaissance banker-patron's account book laid open over the living city: parchment pages, ink entries, small-caps headings, and the occasional flash of gold where prestige is tallied. Every panel is a page from that ledger — cream paper with a faint grain, a thin wood-toned rule around the edge, entries written in warm brown ink. The register is quiet and bookish: controls recede so the low-poly city (the Dorfromantik-warm canvas beneath) stays the star. Nothing shouts; arrivals, warnings, and even a faction's denunciation are delivered as calm entries on paper, never as native dialogs or alarmist chrome.

Density is compact but never cramped — small type, tight gaps, information tabulated in label/value rows like ledger lines. Color is scarce by design: sienna is the single voice of action and attention, gold appears only as iconography beside tallies, and everything else is ink on parchment.

**Key Characteristics:**
- Parchment cards with double hairline borders and paper-grain noise, floating over a full-viewport 3D canvas
- Warm all-serif typography (Sorts Mill Goudy display, EB Garamond body); small-caps ledger headings
- One accent (sienna) for actions, focus, and attention; gold reserved for resource icons
- Tabular label/value rows; tiny uppercase labels under bold values
- In-world confirmations (two-click), no native browser dialogs

## Colors

A scarce, warm palette: ink on parchment, one sienna voice, gold only where value is tallied.

### Primary
- **Sienna** (#9c3a24): the single action-and-attention color — primary buttons, active toggles (pause, speed pills), focus outlines, panel icons, "Requires:" warnings, denunciation names. If something asks for the player's hand or eye, it is sienna.

### Secondary
- **Prestige Gold** (#c9932f): florin and prestige (crown) iconography in the top bar and offer cards. Icons only — see the Text-Safe Gold Rule.
- **Prestige Ink** (#8a6a1c): the text-safe darkened gold for status words (Active, Funded, at-work lines) where a gold *word* is needed on parchment.

### Tertiary
- **Verde** (#4a6551): quiet green for nature/verdant accents; used sparingly.
- **Crest Blue** (#2f3d63) and **Crest Blue Deep** (#1b2340): the night-sky world outside the ledger — main menu and loading screen radial backdrop, faction crest grounds. Never a floating-panel surface.

### Navy Chrome
The permanent HUD (top bar, build bar, materials rail, round HUD toggles) sits on a navy dark ground instead of parchment, applied via the `.theme-navy` scoped variable override in app.css — the parchment/ink/wood/sienna vars are remapped, so components restyle without new classes. Navy chrome also renders 10% larger than the parchment overlays (`zoom: 1.1` on the same class) for legibility on the dark ground. Floating panels, tooltips, and overlays opened *from* the chrome stay parchment (`.theme-parchment` resets the vars where an overlay renders inside chrome, e.g. top-bar tooltips).
- **Navy** (#14161f): the chrome surface (replaces parchment); **Navy Deep** (#212533) is its raised/hover fill (replaces parchment-deep). Deliberately darker and less saturated than the crest blues — near-black ink-blue, not sky.
- **Navy Ink** (#e9e3d3) / **Navy Ink Faint** (#9ba0b1): text on navy.
- **Navy Wood** (#383d4f): borders and rules on navy.
- **Navy Sienna** (#cf7a52): sienna lightened for contrast on the dark ground — same single-voice role.
- **Navy Prestige Ink** (#d4a94c): gold-toned status words on navy (the Text-Safe Gold Rule's dark-ground counterpart).

### Neutral
- **Parchment** (#f9f5ec): the page — every panel surface; also the text color on sienna buttons.
- **Parchment Deep** (#ede7da): the recessed page — secondary/quiet button fill, inactive pills, inset wells, hover fills.
- **Ink** (#453824): primary text, values, headings.
- **Ink Faint** (#7d6b4f): labels, metadata, secondary rows, disabled/idle icon states.
- **Wood** (#b39868): borders and rules, always softened (`wood/50` hairlines, `wood/30–40` hover tints).

### Named Rules
**The Text-Safe Gold Rule.** Prestige gold reads at ~2.5:1 on parchment — it may only appear as icon fill. Any gold-toned *text* uses prestige ink (#8a6a1c) instead.

**The One Voice Rule.** Sienna is the only color that commands. A screen region gets at most one competing sienna call-to-action; everything else speaks in ink.

## Typography

**Display Font:** Sorts Mill Goudy (with EB Garamond, serif fallback)
**Body Font:** EB Garamond (with Georgia, Times New Roman fallback)

**Character:** An old-style serif pairing that reads as hand-set Renaissance print — literary, warm, slightly antique — kept legible at small HUD sizes by bold weights and generous tracking. The display font forces lining numerals (`font-variant-numeric: lining-nums`) so figures sit on one baseline in tallies.

### Hierarchy
- **Display** (700, ~4.5rem/text-7xl, tight): the game title on the night sky only, with a soft dark text-shadow.
- **Headline** (600, 1.125rem/text-lg, display font): city name, calendar, offer titles, card headings inside panels.
- **Title** (600, 0.875rem/text-sm, display font, small-caps, tracking-wider): panel headers — the ledger's running heads. Rendered via `[font-variant-caps:small-caps]`.
- **Body** (400, 0.875rem/text-sm): panel content, rows, descriptions. Asides go *italic ink-faint*.
- **Small** (400, 0.75rem/text-xs): secondary rows, metadata, compact rail names — the step between Body and Label.
- **Label** (400, 0.625rem/10px, uppercase, tracking-wide, ink-faint): the tiny caption under every resource value.
- **Value** (600, 1.25rem/text-xl, ink): resource numbers over their labels.

### Named Rules
**The Ledger Line Rule.** Data is presented as justified label/value pairs: ink-faint label left, semibold ink value right, `flex items-baseline justify-between`.

## Layout

The overlay is a set of fixed, edge-docked surfaces over a full-viewport Babylon canvas. Containers are `pointer-events-none`; only panels re-enable pointer events, so the city stays clickable everywhere paper isn't. Top bar spans the full width (square-cornered, borderless top/x). Circular HUD buttons open one floating card at a time (`w-72` typical; `w-80` menus; `w-56/64` tooltips) dropped `mt-2` below their trigger. Alerts stack bottom-right; the materials rail docks flush to the right edge (rounded left corners only). Internal rhythm rides Tailwind's scale: panels pad `px-4 py-3`, headers `px-2 py-2` with an `mx-2` hairline rule, stacks gap 1.5–2, resource clusters gap 4–6. Section breaks inside a panel are `border-t border-wood/50` with `pt-2.5`. Desktop-only; no responsive breakpoints.

## Elevation & Depth

A hybrid: panels cast one soft warm shadow (`0 4px 12px rgba(40, 25, 10, 0.35)`) to float above the canvas, while all structure *within* the paper is drawn with hairlines and fill shifts, never shadows. Hover feedback is a tint change (`hover:bg-wood/40`, `hover:bg-parchment-deep`, `hover:bg-sienna/85`), not elevation. Active/selected state is a ring (`ring-2 ring-sienna`), not a lift.

### Shadow Vocabulary
- **Panel float** (`box-shadow: inset 0 0 0 3px var(--color-parchment), inset 0 0 0 4px color-mix(in srgb, var(--color-wood) 55%, transparent), 0 4px 12px rgba(40,25,10,0.35)`): the parchment card's combined double-border-plus-drop; the only shadow in the system.
- **Title glow** (`text-shadow: 0 2px 24px rgba(0,0,0,0.4)`): display title on the night sky only.

### Named Rules
**The Paper Doesn't Lift Rule.** Interaction states change ink and fill, never shadow. The one drop shadow belongs to the page itself.

## Shapes

Soft rectangles and full circles. Cards and wells are `rounded-lg` (8px); buttons and inputs `rounded-md` (6px) or `rounded` (4px); HUD toggles, speed pills, icon buttons, and count badges are fully round. The signature edge is the **double hairline**: a 1px wood border, then a 3px parchment inset, then a second faint wood hairline — a ruled ledger margin. Surfaces carry a barely-there fractal-noise grain (5% opacity inline SVG). Edge-docked surfaces square off their docked sides (`rounded-none border-x-0 border-t-0` top bar; `rounded-l-lg` right rail).

## Components

### Buttons — the three voices
- **Shape:** `rounded-md` (6px); size stays local to context (typically `px-2–3 py-1.5–2 text-sm`), `font-semibold`.
- **Primary (`.btn-primary`):** sienna fill, parchment text; hover `bg-sienna/85`. The commanding voice — one per region.
- **Secondary (`.btn-secondary`):** parchment-deep fill, ink text; hover `bg-wood/40`. The default voice.
- **Quiet (`.btn-quiet`):** parchment-deep fill, `border-wood/50` hairline, sienna text; hover `bg-wood/30`. The aside.
- **Focus (all):** `outline: 2px solid var(--color-sienna); outline-offset: 2px` on `:focus-visible` — never the UA blue ring.
- **Text-only actions:** ink-faint, `hover:text-ink`, optional underline on hover for link-like actions.

### Pills & Toggles
- **Style:** `rounded-full`; active = sienna fill + parchment text; inactive = parchment-deep fill + ink-faint text, `hover:text-ink` (see speed controls, pause).

### Cards / Panels
- **Corner Style:** `rounded-lg`, or squared on docked edges.
- **Background:** `.panel-parchment` — parchment + noise grain + double hairline + panel float shadow.
- **Header:** small-caps display Title, `mx-2 px-2 py-2`, `border-b border-wood/50`; optional ink-faint close X (`rounded-full p-1`, hover parchment-deep).
- **Internal Padding:** `px-4 py-3`.

### Inputs / Fields
- **Style:** parchment fill, `border-wood/50`, `rounded` (4px), `px-2 py-1.5 text-sm text-ink`, ink-faint placeholder; selects match. Inline edits are borderless with only a `border-b` rule.
- **Focus:** `outline-none focus:border-sienna` (border swap, no ring) for fields; the global sienna outline covers everything else.

### HUD Toggle (signature)
Circular `h-11 w-11 panel-parchment rounded-full` button, sienna Lucide icon (`h-5 w-5`, strokeWidth 1.75); open state `ring-2 ring-sienna`; count badge absolute top-right, `rounded-full h-4 min-w-4 text-[10px]` parchment text on ink (or sienna for attention). Opens a single floating Panel below.

### Resource Stat (signature)
Icon (`h-6 w-6`, gold or sienna) beside a stacked `text-xl font-semibold` value over a 10px uppercase ink-faint label; hover reveals a tooltip Panel of ledger-line rows.

### Alert Card (signature)
A standard Panel, bottom-right, non-blocking: small-caps header states the event ("A commission is offered", "Denunciation"), headline names it, ink-faint metadata row with inline icons, sienna requirement line, right-aligned secondary + primary buttons. Bad news uses the same paper — sienna text, never a red world.

## Do's and Don'ts

### Do:
- **Do** keep every floating overlay surface on parchment `.panel-parchment`; permanent edge-docked chrome adds `.theme-navy`. New surfaces join one of those two worlds, never a third.
- **Do** use the three button voices (`.btn-primary` / `.btn-secondary` / `.btn-quiet`) and size them locally; one primary voice per region.
- **Do** set panel headers in small-caps display Title with the `mx-2` hairline rule beneath.
- **Do** deliver confirmations in-world with a two-click pattern (button relabels to "Erase all progress?" / "Overwrite …?").
- **Do** use `border-wood/50` hairlines for every internal rule and section break.
- **Do** keep containers `pointer-events-none` and re-enable on panels, so the city stays interactive.

### Don't:
- **Don't** set text in prestige gold on parchment — icons only; use prestige ink (#8a6a1c) for gold-toned words.
- **Don't** use native browser dialogs (`confirm`, `alert`) — they break the parchment world.
- **Don't** add shadows for hover/active states; feedback is fill and ink shifts, rings for selection.
- **Don't** introduce cool grays, pure black, or pure white; every neutral is a warm parchment/ink tone.
- **Don't** use alarmist styling — no red error worlds, no pulsing badges; bad news is sienna ink on the same paper.
- **Don't** add a fourth top-bar resource or move materials/favor onto the top bar (product constraint carried into UI).
