"use client";
// THE WIDGET'S DESIGN SYSTEM.
//
// Everything visual in the React layer resolves through this file: one spacing grid, one radius
// ramp, one type scale, one elevation set, and one stylesheet that owns colour and interaction.
//
// It exists because of a limitation that shaped the whole UI badly. The widget was built from
// inline `style` objects, and an inline style cannot express a pseudo-class — so nothing in it
// had a hover state, or a pressed state, and the only focus treatment was a single ring bolted on
// through a scoped `<style>` tag. Every control was therefore inert: it looked the same before,
// during and after you touched it, which is the difference between a control and a picture of one.
// Meanwhile the values themselves were literals typed at ~470 call sites — `height: 29` here,
// `height: 23` there, seven different radii, five near-identical greys.
//
// The division of labour below is the rule to keep:
//
//   CLASSES own colour, state and elevation.   INLINE STYLES own layout only.
//
// It is not a preference. An inline `background` beats a class's `:hover` in the cascade, so a
// control that sets its own colour inline can never light up under the pointer. Anything in this
// file's stylesheet is therefore free of layout, and anything still written inline at a call site
// must be free of colour.
//
// Theme reaches the stylesheet as CSS custom properties stamped on the widget root (`themeVars`),
// so one static sheet serves every theme, every host override, and both light and dark, and a
// theme change repaints without re-rendering a single rule.
import type { CSSProperties } from "react";
import { alpha, mix } from "../src/util";
import type { Theme } from "../src/types";

/**
 * SPACING — a strict 4px grid.
 *
 * Named by step, not by pixel, so the scale can be retuned in one place. Everything that was a
 * loose 3 / 5 / 7 / 11 / 13 snapped to the nearest step; the row of controls that used to sit at
 * `gap: 3` beside one at `gap: 5` now reads as one rhythm rather than two.
 */
export const SPACE = { 0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 7: 28, 8: 32 } as const;

/**
 * RADIUS — one ramp, softest on the largest surface.
 *
 * The widget had seven radii (4, 5, 6, 8, 9, 10, 12, 14, 16) assigned by whoever wrote the line.
 * A radius is a statement about how large a thing is: a 6px chip and a 6px card claim to be the
 * same kind of object. These four steps are keyed to scale, and nothing may pick a value off it.
 */
export const RADIUS = {
  /** Chips, swatches, the smallest inline marks. */
  xs: 6,
  /** Menu rows, bar buttons, tiles. */
  sm: 8,
  /** Buttons, inputs, segmented controls. */
  md: 10,
  /** Menus, popovers, panels. */
  lg: 14,
  /** Cards — the widget frame and the ticket. */
  xl: 16,
  /** Bottom sheets, which meet the edge and only round the top. */
  "2xl": 20,
  pill: 999,
} as const;

/**
 * TYPE — a real scale, not the eleven ad-hoc sizes it replaces (9.5, 10, 10.5, 11, 11.5, 12,
 * 12.5, 13, 13.5, 14.5, 15, 17, 21). Half-pixel type does not render as half a pixel; it renders
 * as an inconsistent one.
 */
export const TYPE = { micro: 10, xs: 11, sm: 12, base: 13, md: 14, lg: 17, xl: 21, display: 26 } as const;

/** Weights, so "bold" means one thing. */
export const WEIGHT = { regular: 400, medium: 500, semibold: 600, bold: 700 } as const;

/**
 * CONTROL HEIGHTS. Three sizes, all on the 4px grid, all clearing the 24px minimum a pointer
 * needs and the largest clearing the 32px a thumb needs.
 */
export const CONTROL = { sm: 24, md: 28, lg: 32, xl: 40 } as const;

/**
 * ELEVATION — reserved for surfaces that FLOAT. Every button used to carry
 * `0 1px 2px rgba(0,0,0,0.08)`, which is not depth, it is grime: forty shadowed rectangles in a
 * toolbar read as noise and leave nothing for a menu to rise above.
 */
export const ELEV = {
  none: "none",
  /** A menu or popover, sitting just off the surface. */
  sm: "0 2px 8px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.04)",
  /** A floating panel over the plot. */
  md: "0 8px 24px rgba(0,0,0,0.28), 0 0 0 1px rgba(0,0,0,0.05)",
  /** A modal or bottom sheet — the only things allowed to cast this far. */
  lg: "0 16px 48px rgba(0,0,0,0.42), 0 0 0 1px rgba(0,0,0,0.06)",
} as const;

/** MOTION — one duration and one curve. Collapsed to 1ms under `prefers-reduced-motion`. */
export const MOTION = { fast: "110ms", base: "160ms", slow: "240ms", ease: "cubic-bezier(0.２, 0, 0.２, 1)".replace(/２/g, "2") } as const;

/** Stacking, named so two surfaces cannot silently claim the same layer. */
export const Z = { plot: 1, overlay: 7, chrome: 10, menu: 20, scrim: 30, sheet: 31, modal: 35 } as const;

// ---- colour -----------------------------------------------------------------------------

const srgb = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
/**
 * Any colour this package can produce, as channels.
 *
 * `rgb()` as well as hex, because `mix()` from the core returns `rgb(r,g,b)` — a hex-only parser
 * silently scored every mixed colour as mid-grey, which made `readable` believe a nearly-white
 * gold was already dark enough and hand it straight back.
 */
function toRgb(c: string): [number, number, number] | null {
  const s = c.trim();
  const hex = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split("").map((x) => x + x).join("");
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
  }
  const fn = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(s);
  if (fn) return [Number(fn[1]), Number(fn[2]), Number(fn[3])];
  return null; // a `color-mix()` or a named colour — not measurable here
}
const toHex = (rgb: [number, number, number]) =>
  "#" + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");

/** WCAG relative luminance. */
export function luminance(color: string): number {
  const rgb = toRgb(color);
  if (!rgb) return 0.5; // a colour we cannot read is assumed mid — never a confident wrong answer
  const [r, g, b] = rgb.map((v) => srgb(v / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** Contrast ratio between two colours, 1–21. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * The same hue, moved until it is READABLE as text on `bg`.
 *
 * This fixes a real failure rather than polishing one. The widget paints every selected control's
 * LABEL in `theme.line` — and on the built-in light theme that is gold `#ebae3d` on white, which
 * measures **1.97:1**. Not "a bit low": below the 3:1 floor for large text and nowhere near the
 * 4.5:1 for body, meaning the active state of every button in the toolbar was effectively
 * invisible on a white chart. A host that points `line` at its brand colour inherits the same
 * problem with its own hue, and no amount of care in this package can predict it.
 *
 * So the accent is treated as a HUE, not as an ink. It is mixed toward the surface's opposite
 * until it clears `min`, which leaves the colour recognisably itself on a dark theme (where it
 * usually already passes and is returned untouched) and darkens it on a light one.
 */
export function readable(color: string, bg: string, min = 4.5): string {
  const from = toRgb(color);
  if (!from || contrast(color, bg) >= min) return color; // already fine, or not ours to judge
  const toward: [number, number, number] = luminance(bg) > 0.4 ? [0, 0, 0] : [255, 255, 255];
  // Mixed HERE rather than through `mix()`, which returns an `rgb()` string: the loop has to
  // measure what it just produced, and a round trip through a format the measurer cannot read is
  // how this silently returned the unmodified colour.
  let out = color;
  for (let t = 0.04; t <= 1.0001; t += 0.04) {
    out = toHex(from.map((v, i) => v + (toward[i] - v) * t) as [number, number, number]);
    if (contrast(out, bg) >= min) return out;
  }
  return out;
}

/**
 * Theme → CSS custom properties for the widget root.
 *
 * Stamped inline on the root element, which is the only inline colour left in the system: from
 * there the whole stylesheet resolves, so a theme swap is one style attribute changing rather
 * than several hundred re-rendered rules.
 */
export function themeVars(th: Theme): CSSProperties {
  const onLight = luminance(th.background) > 0.4;
  // Neutral overlays for hover / press. Derived from the theme's own ink so they sit correctly on
  // any background, rather than a hard-coded black or white that goes muddy on half the presets.
  const wash = (pct: number) => alpha(th.textStrong, pct / 100);
  return {
    "--ac-bg": th.background,
    "--ac-pane": th.paneBackground,
    "--ac-grid": th.grid,
    "--ac-line": th.border,
    "--ac-line-soft": alpha(th.border, 0.6),
    "--ac-text": th.text,
    "--ac-ink": th.textStrong,
    "--ac-up": th.up,
    "--ac-down": th.down,
    "--ac-entry": th.entry ?? th.textStrong,
    // The accent in two forms: the HUE for fills, strokes and borders, and an INK guaranteed to
    // be readable as text on this background. On every dark theme they are the same value.
    "--ac-accent": th.line,
    "--ac-accent-ink": readable(th.line, th.background, 4.5),
    "--ac-up-ink": readable(th.up, th.background, 4.5),
    "--ac-down-ink": readable(th.down, th.background, 4.5),
    // Interaction washes.
    "--ac-hover": wash(onLight ? 6 : 8),
    "--ac-press": wash(onLight ? 11 : 14),
    "--ac-sunken": wash(onLight ? 4 : 6),
    // Floating surfaces read slightly off the pane so a menu is visibly ON something.
    "--ac-surface": mix(th.paneBackground, th.textStrong, onLight ? 0.02 : 0.05),
    "--ac-elev-sm": ELEV.sm,
    "--ac-elev-md": ELEV.md,
    "--ac-elev-lg": ELEV.lg,
    "--ac-font": th.font,
    "--ac-mono": th.monoFont,
    "--ac-r-xs": `${RADIUS.xs}px`,
    "--ac-r-sm": `${RADIUS.sm}px`,
    "--ac-r-md": `${RADIUS.md}px`,
    "--ac-r-lg": `${RADIUS.lg}px`,
    "--ac-r-xl": `${RADIUS.xl}px`,
    "--ac-motion": MOTION.base,
    "--ac-ease": MOTION.ease,
  } as CSSProperties;
}

/**
 * THE STYLESHEET.
 *
 * One static string, scoped to `[data-aurovie-chart]` and `[data-aurovie-ticket]` so it can never
 * leak into the host page, and injected once per widget. Everything here is colour, state and
 * elevation; nothing here positions anything.
 *
 * Read the state block on `.ac-btn` as the template every other control follows: rest is quiet,
 * hover lifts the ground, press pushes it further and removes the lift, focus draws a ring that
 * ignores the mouse, `.is-on` takes the accent, and disabled drops to half without changing shape.
 */
export const SHEET = `
[data-aurovie-chart], [data-aurovie-ticket] {
  font-family: var(--ac-font);
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
[data-aurovie-chart] *, [data-aurovie-ticket] * { box-sizing: border-box; }

/* ---- focus: one ring, everywhere, mouse-free ---- */
[data-aurovie-chart] :is(button,summary,input,textarea,select,[tabindex]):focus-visible,
[data-aurovie-ticket] :is(button,summary,input,textarea,select,[tabindex]):focus-visible {
  outline: 2px solid var(--ac-accent-ink);
  outline-offset: 2px;
  border-radius: var(--ac-r-sm);
}
[data-aurovie-chart] canvas:focus-visible { outline: 2px solid var(--ac-accent-ink); outline-offset: -2px; }

/* ---- BUTTON — the template for every control's state model ---- */
[data-aurovie-chart] .ac-btn, [data-aurovie-ticket] .ac-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: ${SPACE[1]}px;
  height: ${CONTROL.lg}px; padding: 0 ${SPACE[3]}px;
  border: 1px solid transparent;
  border-radius: var(--ac-r-md);
  background: transparent;
  color: var(--ac-text);
  font: inherit; font-size: ${TYPE.sm}px; font-weight: ${WEIGHT.semibold}; letter-spacing: 0.01em;
  white-space: nowrap; cursor: pointer;
  transition: background var(--ac-motion) var(--ac-ease), color var(--ac-motion) var(--ac-ease),
              border-color var(--ac-motion) var(--ac-ease);
}
[data-aurovie-chart] .ac-btn:hover:not(:disabled), [data-aurovie-ticket] .ac-btn:hover:not(:disabled) {
  background: var(--ac-hover); color: var(--ac-ink);
}
[data-aurovie-chart] .ac-btn:active:not(:disabled), [data-aurovie-ticket] .ac-btn:active:not(:disabled) {
  background: var(--ac-press);
}
[data-aurovie-chart] .ac-btn.is-on, [data-aurovie-ticket] .ac-btn.is-on {
  background: color-mix(in srgb, var(--ac-accent) 14%, transparent);
  border-color: color-mix(in srgb, var(--ac-accent) 34%, transparent);
  color: var(--ac-accent-ink);
}
[data-aurovie-chart] .ac-btn.is-on:hover:not(:disabled), [data-aurovie-ticket] .ac-btn.is-on:hover:not(:disabled) {
  background: color-mix(in srgb, var(--ac-accent) 22%, transparent);
}
[data-aurovie-chart] .ac-btn:disabled, [data-aurovie-ticket] .ac-btn:disabled { opacity: 0.42; cursor: not-allowed; }

/* Destructive — a delete gets a ROLE, not an inline colour that would outrank its own hover. */
[data-aurovie-chart] .ac-btn--danger { color: var(--ac-down-ink); }
[data-aurovie-chart] .ac-btn--danger:hover:not(:disabled) { background: color-mix(in srgb, var(--ac-down) 14%, transparent); color: var(--ac-down-ink); }

/* Outlined variant — for controls that must read as objects at rest (the toolbar's own row). */
[data-aurovie-chart] .ac-btn--outline { border-color: var(--ac-line-soft); background: var(--ac-sunken); }
[data-aurovie-chart] .ac-btn--outline:hover:not(:disabled) { border-color: var(--ac-line); }

/* Sizes. Nothing may invent a fourth. */
[data-aurovie-chart] .ac-btn--sm, [data-aurovie-ticket] .ac-btn--sm { height: ${CONTROL.md}px; padding: 0 ${SPACE[2]}px; font-size: ${TYPE.xs}px; }
[data-aurovie-chart] .ac-btn--xs, [data-aurovie-ticket] .ac-btn--xs { height: ${CONTROL.sm}px; padding: 0 ${SPACE[2]}px; font-size: ${TYPE.xs}px; border-radius: var(--ac-r-sm); }
[data-aurovie-chart] .ac-btn--icon, [data-aurovie-ticket] .ac-btn--icon { width: ${CONTROL.lg}px; padding: 0; }
[data-aurovie-chart] .ac-btn--icon.ac-btn--sm { width: ${CONTROL.md}px; }
[data-aurovie-chart] .ac-btn--block, [data-aurovie-ticket] .ac-btn--block { width: 100%; }

/* Mono-numeral variant, for anything that is a figure rather than a word. */
[data-aurovie-chart] .ac-num, [data-aurovie-ticket] .ac-num { font-family: var(--ac-mono); font-variant-numeric: tabular-nums; }

/* ---- SIDE (BUY / SELL) — the one control that keeps a FILLED treatment, because side is the
       single most consequential field on a ticket and was previously the same weight as the
       venue picker. Its hue arrives per-instance as --ac-side. ---- */
[data-aurovie-ticket] .ac-btn--side { border-color: var(--ac-line-soft); }
[data-aurovie-ticket] .ac-btn--side:hover:not(:disabled) { border-color: var(--ac-side); color: var(--ac-side); background: color-mix(in srgb, var(--ac-side) 10%, transparent); }
[data-aurovie-ticket] .ac-btn--side.is-on {
  background: var(--ac-side); border-color: var(--ac-side); color: var(--ac-side-ink);
  box-shadow: 0 4px 14px color-mix(in srgb, var(--ac-side) 28%, transparent);
}
[data-aurovie-ticket] .ac-btn--side.is-on:hover:not(:disabled) { background: color-mix(in srgb, var(--ac-side) 88%, #000); color: var(--ac-side-ink); }

/* ---- MENU / SHEET ROW ---- */
[data-aurovie-chart] .ac-item, [data-aurovie-ticket] .ac-item {
  display: flex; align-items: center; gap: ${SPACE[2]}px; width: 100%;
  min-height: ${CONTROL.md}px; padding: ${SPACE[2]}px ${SPACE[2]}px;
  border: none; border-radius: var(--ac-r-sm);
  background: transparent; color: var(--ac-ink);
  font: inherit; font-size: ${TYPE.base}px; text-align: left; cursor: pointer;
  transition: background var(--ac-motion) var(--ac-ease), color var(--ac-motion) var(--ac-ease);
}
[data-aurovie-chart] .ac-item:hover:not(:disabled) { background: var(--ac-hover); }
[data-aurovie-chart] .ac-item:active:not(:disabled) { background: var(--ac-press); }
[data-aurovie-chart] .ac-item.is-on { background: color-mix(in srgb, var(--ac-accent) 12%, transparent); color: var(--ac-accent-ink); }
[data-aurovie-chart] .ac-item:disabled { opacity: 0.42; cursor: not-allowed; }
[data-aurovie-chart] .ac-item--lg { min-height: ${CONTROL.xl}px; border-radius: var(--ac-r-md); }

/* ---- SURFACES ---- */
[data-aurovie-chart] .ac-surface, [data-aurovie-ticket] .ac-surface {
  background: var(--ac-surface);
  border: 1px solid var(--ac-line);
  box-shadow: var(--ac-elev-md);
  -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px);
}
[data-aurovie-chart] .ac-menu { border-radius: var(--ac-r-lg); padding: ${SPACE[1]}px; }
[data-aurovie-chart] .ac-sheet { border-radius: var(--ac-r-xl) var(--ac-r-xl) 0 0; box-shadow: var(--ac-elev-lg); }
[data-aurovie-chart] .ac-scrim { background: rgba(0,0,0,0.5); -webkit-backdrop-filter: blur(2px); backdrop-filter: blur(2px); }
[data-aurovie-chart] .ac-card, [data-aurovie-ticket] .ac-card {
  background: var(--ac-pane); border: 1px solid var(--ac-line); border-radius: var(--ac-r-xl);
}

/* ---- SEGMENTED CONTROL ---- */
[data-aurovie-chart] .ac-seg, [data-aurovie-ticket] .ac-seg {
  display: inline-flex; align-items: center; gap: 2px;
  padding: 2px; border: 1px solid var(--ac-line-soft); border-radius: var(--ac-r-md);
  background: var(--ac-sunken);
}
[data-aurovie-chart] .ac-seg > .ac-btn, [data-aurovie-ticket] .ac-seg > .ac-btn {
  height: ${CONTROL.md}px; border-radius: var(--ac-r-sm); border-color: transparent;
}

/* ---- FIELD ---- */
[data-aurovie-chart] .ac-field, [data-aurovie-ticket] .ac-field {
  height: ${CONTROL.lg}px; width: 100%; min-width: 0; padding: 0 ${SPACE[3]}px;
  border: 1px solid var(--ac-line); border-radius: var(--ac-r-md);
  background: var(--ac-sunken); color: var(--ac-ink);
  font-family: var(--ac-mono); font-variant-numeric: tabular-nums;
  font-size: ${TYPE.base}px; font-weight: ${WEIGHT.semibold};
  outline: none;
  transition: border-color var(--ac-motion) var(--ac-ease), background var(--ac-motion) var(--ac-ease);
}
[data-aurovie-chart] .ac-field:hover:not(:disabled), [data-aurovie-ticket] .ac-field:hover:not(:disabled) { border-color: var(--ac-line); background: var(--ac-hover); }
[data-aurovie-chart] .ac-field:focus, [data-aurovie-ticket] .ac-field:focus { border-color: var(--ac-accent-ink); background: var(--ac-bg); }
[data-aurovie-chart] .ac-field::placeholder, [data-aurovie-ticket] .ac-field::placeholder { color: var(--ac-text); opacity: 0.7; }
[data-aurovie-ticket] input::-webkit-outer-spin-button,
[data-aurovie-ticket] input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
[data-aurovie-ticket] input[type=number] { -moz-appearance: textfield; }

/* ---- TEXT ROLES. Named by JOB, so a caption cannot drift into being a heading. ---- */
[data-aurovie-chart] .ac-cap, [data-aurovie-ticket] .ac-cap {
  font-family: var(--ac-mono); font-size: ${TYPE.micro}px; font-weight: ${WEIGHT.semibold};
  text-transform: uppercase; letter-spacing: 0.08em; color: var(--ac-text); white-space: nowrap;
}
[data-aurovie-chart] .ac-muted, [data-aurovie-ticket] .ac-muted { color: var(--ac-text); font-size: ${TYPE.xs}px; }
[data-aurovie-chart] .ac-strong, [data-aurovie-ticket] .ac-strong { color: var(--ac-ink); font-weight: ${WEIGHT.semibold}; }

/* ---- SCROLLING ROWS — chrome that scrolls instead of wrapping, with no visible bar ---- */
[data-aurovie-chart] .ac-scroll { overflow-x: auto; overflow-y: hidden; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
[data-aurovie-chart] .ac-scroll::-webkit-scrollbar, [data-aurovie-ticket] ::-webkit-scrollbar { width: 0; height: 0; }
[data-aurovie-chart] .ac-scroll > * { flex-shrink: 0; }

/* ---- TILE — a labelled figure (the ticket's risk readout) ---- */
[data-aurovie-ticket] .ac-tile {
  display: flex; flex-direction: column; gap: ${SPACE[1]}px;
  padding: ${SPACE[2]}px ${SPACE[3]}px;
  border: 1px solid var(--ac-line-soft); border-radius: var(--ac-r-sm);
  background: var(--ac-sunken);
}

/* ---- MOTION ---- */
@media (prefers-reduced-motion: reduce) {
  [data-aurovie-chart] *, [data-aurovie-ticket] * { transition-duration: 1ms !important; animation-duration: 1ms !important; }
}
`;

/** Join class names, dropping anything falsy — `cx("ac-btn", on && "is-on")`. */
export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");
