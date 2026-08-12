// Script rendering: turn a script draw list into things the chart engine already knows how to draw.
//
// The engine's overlay/study machinery is generic over `lines` (and `fills`, `dir`, `shiftLines`),
// and the render loop, autoscale, pane allocation, clipping and legend all key off those fields
// rather than off an indicator's `kind`. So a script's output does NOT need a second renderer — it
// needs an ADAPTER that hands the existing machinery precomputed series. That is why this file is
// small: the drawing was already solved.
//
// Values arrive already computed (the script ran on the server, or in WASM), so there is nothing to
// recompute per frame. `na` arrives as `null` because JSON has no NaN, and is converted back to NaN
// here — the engine's line renderer already treats NaN as a gap.

import type { Theme } from "./types";

/// The semantic colour slots a script may ask for. Scripts never name a hex colour: the HOST maps
/// these onto its design tokens, which is what keeps the tokens-only law and the semantic-colour
/// law (up/down mean DIRECTION) intact even for user-authored code.
export type ScriptColor =
  | "up" | "down" | "neutral" | "accent" | "ai" | "text" | "mute"
  | "s1" | "s2" | "s3" | "s4" | "s5" | "s6";

export type ScriptPlotStyle = "line" | "step" | "histogram" | "columns" | "area" | "circles" | "cross";

export interface ScriptPlot {
  title: string;
  style: ScriptPlotStyle;
  color: ScriptColor;
  width: number;
  /** false = computed but not drawn (a band's construction lines, which should not reach the legend) */
  display: boolean;
  /** one entry per bar; null is `na` */
  values: (number | null)[];
}

export interface ScriptDraw {
  title: string;
  /** true = draw over the price pane; false = give the script its own pane */
  overlay: boolean;
  plots: ScriptPlot[];
}

/** A parsed draw list plus the identity the host uses to track it. */
export interface ScriptRender extends ScriptDraw {
  id: string;
  /** Values as NaN-for-na, ready for the engine. */
  series: number[][];
}

const COLORS: ScriptColor[] = ["up", "down", "neutral", "accent", "ai", "text", "mute", "s1", "s2", "s3", "s4", "s5", "s6"];
const STYLES: ScriptPlotStyle[] = ["line", "step", "histogram", "columns", "area", "circles", "cross"];

// The series palette a script's s1..s6 map onto — the same six the indicator legend uses, so a
// script's lines sit in the same visual language as a built-in indicator's.
import { SERIES_PALETTE } from "./util";

/// Resolve a script's semantic colour against the live theme. Direction colours come from the
/// theme (so they follow the host's --good/--bad tokens); series slots come from the shared palette.
export function scriptColor(theme: Theme, c: ScriptColor): string {
  switch (c) {
    case "up":
      return theme.up;
    case "down":
      return theme.down;
    case "accent":
    case "ai":
      return theme.line;
    case "text":
      return theme.textStrong;
    case "neutral":
    case "mute":
      return theme.text;
    default: {
      const i = Number(c.slice(1)) - 1;
      return SERIES_PALETTE[(i >= 0 ? i : 0) % SERIES_PALETTE.length];
    }
  }
}

/**
 * Validate and normalise a draw list that arrived over the wire.
 *
 * This is deliberately strict. The payload is produced by USER-authored code, and a plot whose
 * series is the wrong length would render silently misaligned against price — a chart that lies
 * rather than a chart that errors. `barCount` is the number of bars the chart is showing; every
 * plot must match it exactly.
 *
 * Returns null (rather than throwing) when the payload is unusable, so a host can degrade loudly
 * without taking the chart down.
 */
export function parseScriptDraw(raw: unknown, id: string, barCount: number): ScriptRender | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.title !== "string" || typeof o.overlay !== "boolean" || !Array.isArray(o.plots)) return null;

  const plots: ScriptPlot[] = [];
  const series: number[][] = [];
  for (const p of o.plots) {
    if (!p || typeof p !== "object") return null;
    const q = p as Record<string, unknown>;
    if (!Array.isArray(q.values)) return null;
    // Bar-count mismatch is the failure that would misalign a plot against price — refuse it.
    if (q.values.length !== barCount) return null;
    const color = COLORS.includes(q.color as ScriptColor) ? (q.color as ScriptColor) : "s1";
    const style = STYLES.includes(q.style as ScriptPlotStyle) ? (q.style as ScriptPlotStyle) : "line";
    const width = typeof q.width === "number" && q.width > 0 && q.width <= 10 ? q.width : 1.5;
    plots.push({
      title: typeof q.title === "string" ? q.title : "",
      style,
      color,
      width,
      display: q.display !== false,
      values: q.values as (number | null)[],
    });
    // null → NaN: JSON cannot carry NaN, and the engine's renderer already breaks a line on NaN
    series.push((q.values as (number | null)[]).map((v) => (typeof v === "number" && isFinite(v) ? v : NaN)));
  }
  return { id, title: o.title, overlay: o.overlay, plots, series };
}

/// Parse a JSON string form of the same payload.
export function parseScriptDrawJson(json: string, id: string, barCount: number): ScriptRender | null {
  try {
    return parseScriptDraw(JSON.parse(json), id, barCount);
  } catch {
    return null;
  }
}
