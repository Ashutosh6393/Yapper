---
name: Yapper
description: Calm, identity-first collaborative notes — a trusted desk, not a control panel.
colors:
  brand: "oklch(0.47 0.15 275)"
  iris: "oklch(0.7 0.13 280)"
  iris-soft: "oklch(0.955 0.02 285)"
  ink: "oklch(0.17 0.015 275)"
  panel: "oklch(0.21 0.018 275)"
  panel-2: "oklch(0.25 0.02 275)"
  fg: "oklch(0.96 0.004 275)"
  paper: "oklch(0.99 0.002 275)"
  surface: "oklch(1 0 0)"
  ink-fg: "oklch(0.27 0.012 275)"
  subtle: "oklch(0.47 0.008 275)"
  line: "oklch(0.9 0.006 275)"
  presence-blue: "#4ea8ff"
  presence-orange: "#ff7b4e"
  presence-green: "#22d3a5"
  danger: "#f87070"
typography:
  display:
    fontFamily: "'Bricolage Grotesque', -apple-system, sans-serif"
    fontSize: "clamp(40px, 5.6vw, 72px)"
    fontWeight: 800
    lineHeight: 1.02
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "'Bricolage Grotesque', -apple-system, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  title:
    fontFamily: "'Hanken Grotesk', -apple-system, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "normal"
  body:
    fontFamily: "'Hanken Grotesk', -apple-system, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.65
    letterSpacing: "normal"
  label:
    fontFamily: "'Hanken Grotesk', -apple-system, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "0.08em"
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "14px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
components:
  button-primary:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  button-primary-hover:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.surface}"
  button-outline:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink-fg}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  button-ghost:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink-fg}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  button-destructive:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-fg}"
    rounded: "{rounded.md}"
    padding: "4px 12px"
    height: "36px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-fg}"
    rounded: "{rounded.xl}"
    padding: "24px"
---

# Design System: Yapper

## 1. Overview

**Creative North Star: "The Trusted Desk"**

Yapper is a dependable, grown-up place to write. The interface reads like a well-kept desk: everything legible, everything where you expect it, nothing shouting. The near-monochrome surface — cool indigo-tinted neutrals from `paper` to `ink` — is deliberately quiet so the two things that matter can be loud: **the words you're writing** and **who's in the room with you**. A single deep `brand` indigo and its brighter `iris` sibling are the only saturated voice the system spends, and it spends them sparingly, on identity and primary action. Everything else is ink, paper, and hairline.

This system is defined as much by what it refuses as by what it does. It is **not** a faceless link-trust collaboration tool — every presence carries a real name and a stable color, never an anonymous cursor. It is **not** a heavy enterprise admin console — access is one switch, never a permission matrix. It is **not** a generic AI-SaaS template — no gradient hero, no cream-washed sand background, no identical icon-card grids, no uppercase eyebrow above every section. And it is **not** toy-cute — radii stay moderate, motion never bounces, nothing is emoji-decorated. Calm authority is the whole posture.

The app runs light-first with a full dark mode (`.dark` on `<html>` via next-themes); the logged-out marketing landing (`app/_landing/`) is always-dark and is the one place the system is allowed to perform — narrative composition, ambient aurora, layered depth, and orchestrated entrance motion — while staying in the same palette, type, and voice.

**Key Characteristics:**
- Cool indigo-tinted neutrals carry 90%+ of every surface; `brand`/`iris` indigo is rationed.
- Two distinctive families: Bricolage Grotesque (display) + Hanken Grotesk (text) — not the system-font reflex.
- App is flat by tonal layering (`paper`→`surface`, `ink`→`panel`→`panel-2`); the landing earns layered shadow + glow.
- Identity is always legible: real names, stable per-user colors, never color alone.
- Control is a switch, never a control panel.

## 2. Colors

A cool, near-neutral system anchored by a single deep indigo and its brighter sibling — restraint is the strategy; color marks identity and action, never decoration. Blue/green/orange are **not** in the brand palette; they belong to live collaborators.

### Primary
- **Deep Indigo** (`oklch(0.47 0.15 275)`): The one saturated voice on light. Primary buttons, focus rings, feature icons and accent text, the logo mark. Chosen to sit clear of the presence-blue hue so brand and presence never blur.
- **Iris** (`oklch(0.7 0.13 280)`): The brighter indigo for dark surfaces. Accent text and the *primary* action color in dark mode (where deep indigo would sink into the panel); the highlighted word in landing headlines.
- **Iris Soft** (`oklch(0.955 0.02 285)`): A faint indigo wash. Light-mode `secondary`/`accent` surfaces, the highlighted "Yapper" column in the comparison, hover tints on list rows.

### Secondary — Presence Colors
Reserved exclusively for live collaboration. Each collaborator is assigned a stable color from this set; they never appear as decoration or brand accent.
- **Presence Blue** (`#4ea8ff`), **Presence Orange** (`#ff7b4e`), **Presence Green** (`#22d3a5`): Cursor/selection colors and the "editing now / live" status dot.

### Tertiary — State
- **Danger** (`#f87070`): Destructive actions and the "note made private / disconnected" state only.

### Neutral
- **Ink** (`oklch(0.17 0.015 275)`): Dark-mode page background; the landing's base. A cool near-black, faintly indigo.
- **Panel / Panel-2** (`oklch(0.21 0.018 275)` / `oklch(0.25 0.02 275)`): Dark card and toolbar surfaces — two steps of tonal layering.
- **Foreground** (`oklch(0.96 0.004 275)`): Primary text on dark.
- **Paper** (`oklch(0.99 0.002 275)`): Light-mode page background — a cool near-white with a whisper of indigo, *not* a warm cream.
- **Surface** (`oklch(1 0 0)`): Light-mode card surface, one step above paper.
- **Ink-fg** (`oklch(0.27 0.012 275)`): Heading/primary text on light.
- **Subtle** (`oklch(0.47 0.008 275)`): Muted body text on light. Held at ≥4.5:1 on paper — muting stops well short of unreadable.
- **Line** (`oklch(0.9 0.006 275)`): Hairline borders and dividers on light.

### Named Rules
**The Cool-Neutral Rule.** Neutrals carry a faint cool indigo tint (chroma ≤0.02 toward hue 275–285), never a warm cream/sand tint. Warmth is not this brand; a warm-tinted body is the AI-SaaS tell this system rejects.

**The Presence-Only Rule.** Blue, orange, and green belong to live collaborators. Never use a presence color for a button, a heading, an icon, or a background flourish. The brand indigo is deliberately kept off the presence-blue hue so the two never read as the same thing.

## 3. Typography

**Display Font:** Bricolage Grotesque (self-hosted via `next/font`; falls back to system sans)
**Body Font:** Hanken Grotesk (self-hosted via `next/font`; falls back to system sans)

**Character:** A distinctive contemporary grotesque for headlines against a calm humanist workhorse for text. Bricolage has real character — slightly idiosyncratic proportions that read "designed," not defaulted — while Hanken is smooth, legible, and gets out of the way. The pairing contrasts on personality (expressive display vs. neutral text), not just size. Deliberately **not** the system-font stack or the Inter/DM-Sans/Space-Grotesk reflex.

### Hierarchy
- **Display** (Bricolage, 800, `clamp(40px, 5.6vw, 72px)`, line-height 1.02, tracking −0.03em): Landing hero and section headlines only. The one place fluid clamp scaling is used.
- **Headline** (Bricolage, 700, 1.5rem / 24px): App page titles, TipTap `h1`. Fixed rem — app headings do not scale fluidly.
- **Title** (Hanken, 600, 1rem / 16px): Card titles, dialog headers, note titles in lists.
- **Body** (Hanken, 400, 0.875rem / 14px, line-height 1.65): Default UI and prose text. Note prose caps at 65–75ch; dense UI may run tighter.
- **Label** (Hanken, 700, 0.75rem / 12px, tracking 0.08em, UPPERCASE): Deliberate eyebrows/kickers — the hero status pill, access-level headers. **Not** stamped above every section.

### Named Rules
**The Fixed-Scale App Rule.** Only the landing uses fluid `clamp()` type. Every in-app heading is a fixed rem step. A note title that shrinks when the sidebar opens is a bug.

**The Display-For-Display Rule.** Bricolage is for headings and the wordmark. Body, labels, and data are Hanken. Don't set paragraphs in Bricolage or headings in Hanken.

## 4. Elevation & Motion

Two registers. **The app is flat** — depth via tonal layering (`paper`→`surface`, `ink`→`panel`→`panel-2`), with at most a `shadow-sm` on resting cards and a `shadow-xs` hairline on inputs. Motion in-app conveys state only (typing, presence, connection, revocation), 150–250 ms, no choreography.

**The landing earns more.** As a brand surface it uses a layered shadow system (a tight contact shadow + a soft ambient one that warms toward indigo on hover), inset top-highlights on dark panels, ambient radial **glows**, and an orchestrated entrance: a staggered hero rise, and scroll reveals that fade + lift + un-blur as each block enters. A slow, low-amplitude **aurora** drifts on the hero glow. Every bit of it is gated behind `prefers-reduced-motion` and enhances an already-visible default (reveals never gate content visibility on JS).

### Shadow Vocabulary
- **Hairline** (`shadow-xs`, ~`0 1px 2px oklch(0 0 0 / 0.05)`): App inputs and outline buttons.
- **Resting card, app** (`shadow-sm`): The maximum lift in-app.
- **Layered card, landing** (`0 1px 2px oklch(0.2 0.02 275 / 0.04), 0 10px 30px oklch(0.2 0.02 275 / 0.05)`; hover warms to indigo): Landing light cards.
- **Dark panel, landing** (`0 1px 0 oklch(1 0 0 / 0.06) inset, 0 30px 80px oklch(0.1 0.02 275 / 0.6)`): Landing product mockups — inset highlight + deep drop.
- **Ambient glow / aurora** (radial-gradient in the brand indigo hue, ~`oklch(0.55 0.16 278 / 0.16–0.2)`): Landing atmosphere only. Never a component shadow.

### Named Rules
**The Two-Register Rule.** Flat, state-only motion in the app; layered depth and orchestrated motion on the landing. Don't leak landing choreography into app UI, or app flatness into the landing.

**The Enhance-Don't-Gate Rule.** Reveal animations enhance content that is visible by default. The hidden state is applied by JS only when motion is allowed; no content ships blank to a no-JS or headless render.

## 5. Components

Crisp and flat in-app; radii stay moderate (8–14px, landing cards up to 24px), interactions quick and quiet.

### Buttons
- **Shape:** `rounded-md` (8px) in-app; landing CTAs 12–13px. Default height 36px (`h-9`); `sm` 32px, `lg` 40px, plus icon squares.
- **Primary:** `brand` indigo, white text (light); `iris` indigo, `ink` text (dark). Hover deepens/lifts.
- **Outline / Ghost / Link:** Hairline border or no chrome; hover fills `accent` (iris-soft). Quiet secondary actions.
- **Destructive:** `danger` — reserved for delete and "make private."
- **Focus:** `focus-visible` 3px `ring` (brand light, iris dark) + offset. Every button is keyboard-visible.

### Cards / Containers
- **Corner Style:** `rounded-xl` (14px) in-app; landing feature/CTA cards 18–24px.
- **Background:** `surface` on light, `panel` on dark; one tonal step above the page.
- **Shadow Strategy:** `shadow-sm` in-app; landing uses the layered vocabulary above, with hover lift on interactive cards.
- **Border:** Hairline `line` (`oklch(1 0 0 / 0.09)` dark). **No colored side-stripe borders.**
- **Internal Padding:** 24px (`p-6`) baseline.

### Inputs / Fields
- 36px tall, `rounded-md`, hairline border, `shadow-xs`. Focus shifts border to `ring` + a 3px halo — no glow, no color flood. `aria-invalid` → `destructive` border/ring; disabled 50% opacity.

### Navigation
- Landing: fixed blur-backed top bar, indigo-accented sign-in. App: top bar + dashboard sidebar, quiet `accent` hover, a `ThemeToggle` in every top-level header. Mobile collapses structurally.

### Signature Component — Live Presence
The system's defining pattern. A live cursor is a 2px caret in the collaborator's **stable presence color**, topped by a small name label (name always present — never color alone). Selections highlight in the same color at low alpha. Presence rows pair avatar + real name + email + an editing/viewing status dot. The "made private" state is a `danger`-bordered banner. Motion here conveys state only and honors `prefers-reduced-motion`.

## 6. Do's and Don'ts

### Do:
- **Do** keep neutrals cool (a whisper of indigo, chroma ≤0.02 toward hue ~280). Warmth is not this brand.
- **Do** ration `brand`/`iris` indigo — primary action and identity only. Most of every screen is neutral.
- **Do** set headings in Bricolage Grotesque and text in Hanken Grotesk.
- **Do** attach a real **name label** to every presence color; presence must survive color-blindness and grayscale.
- **Do** convey depth by tonal layering in-app; reserve layered shadow + glow for the landing.
- **Do** keep in-app headings at fixed rem steps; reserve fluid `clamp()` type and orchestrated motion for the landing.
- **Do** give every interactive element a visible `focus-visible` ring and a `prefers-reduced-motion` fallback.
- **Do** express access control as one switch (private / view / edit) plus one decisive "make private."

### Don't:
- **Don't** use a warm cream/sand/beige background — the generic AI-SaaS tell this system rejects.
- **Don't** render anonymous cursors, or use a presence color (blue/orange/green) for anything that isn't a live person; don't let the brand indigo drift onto the presence-blue hue.
- **Don't** fall back to the system-font stack or the Inter/DM-Sans/Space-Grotesk reflex; the type is the voice.
- **Don't** build a permission matrix, role tree, or IT-console access panel — no heavy-enterprise sprawl.
- **Don't** go toy-cute: no bounce/elastic easing, no emoji-as-UI, no oversized radii.
- **Don't** stamp an uppercase tracked eyebrow above every section, or lay out identical icon-card grids.
- **Don't** use `border-left`/`border-right` >1px as a colored accent stripe, or gradient-clipped text.
- **Don't** leak landing choreography into app UI, or let a reveal gate content visibility on JS.
