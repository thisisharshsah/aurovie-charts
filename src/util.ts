import type { Bar, Theme } from "./types";

// ---- themes ---------------------------------------------------------------
// Sensible built-in dark/light themes. A host can override any field (e.g. map to design
// tokens) via ChartOptions.theme.
export const DARK: Theme = {
  background: "#0e0e10",
  paneBackground: "#0e0e10",
  grid: "#1c1c20",
  border: "#2a2a30",
  text: "#8a8a92",
  textStrong: "#e8e8ea",
  crosshair: "#6b6b74",
  crosshairLabelBg: "#2a2a30",
  crosshairLabelText: "#e8e8ea",
  up: "#00c805",
  down: "#ff5000",
  upWick: "#00c805",
  downWick: "#ff5000",
  volumeUp: "rgba(0,200,5,0.5)",
  volumeDown: "rgba(255,80,0,0.5)",
  line: "#ebae3d",
  font: "12px -apple-system, system-ui, 'Segoe UI', Roboto, sans-serif",
  monoFont: "11px ui-monospace, 'SF Mono', Menlo, monospace",
};
export const LIGHT: Theme = {
  ...DARK,
  background: "#ffffff",
  paneBackground: "#ffffff",
  grid: "#eceef1",
  border: "#d7dae0",
  text: "#6b7280",
  textStrong: "#111318",
  crosshair: "#9aa0aa",
  crosshairLabelBg: "#111318",
  crosshairLabelText: "#ffffff",
  up: "#089981",
  down: "#e33f45",
  upWick: "#089981",
  downWick: "#e33f45",
  volumeUp: "rgba(8,153,129,0.45)",
  volumeDown: "rgba(227,63,69,0.45)",
};

// Curated premium theme presets, offered in the chart's theme picker. Each spreads DARK for the
// fonts + any unspecified field, then paints a distinct, tasteful palette (direction stays
// green/red so it's never ambiguous).
export const THEMES: Record<string, Theme> = {
  "Default Dark": DARK,
  "Default Light": LIGHT,
  Midnight: {
    ...DARK,
    background: "#0b1020",
    paneBackground: "#0b1020",
    grid: "#161d33",
    border: "#26314f",
    text: "#7d89b0",
    textStrong: "#e6ebff",
    crosshair: "#5a6890",
    crosshairLabelBg: "#26314f",
    crosshairLabelText: "#e6ebff",
    up: "#21d07a",
    down: "#ff5470",
    upWick: "#21d07a",
    downWick: "#ff5470",
    volumeUp: "rgba(33,208,122,0.42)",
    volumeDown: "rgba(255,84,112,0.42)",
    line: "#7aa2ff",
  },
  Ocean: {
    ...DARK,
    background: "#06171c",
    paneBackground: "#06171c",
    grid: "#0f2e35",
    border: "#1b4e58",
    text: "#6fa3ab",
    textStrong: "#e6fbff",
    crosshair: "#3f7079",
    crosshairLabelBg: "#1b4e58",
    crosshairLabelText: "#e6fbff",
    up: "#2fd4b0",
    down: "#ff6b6b",
    upWick: "#2fd4b0",
    downWick: "#ff6b6b",
    volumeUp: "rgba(47,212,176,0.4)",
    volumeDown: "rgba(255,107,107,0.4)",
    line: "#35c4e8",
  },
  Carbon: {
    ...DARK,
    background: "#131315",
    paneBackground: "#131315",
    grid: "#232327",
    border: "#33333a",
    text: "#8a8a92",
    textStrong: "#f2f2f4",
    crosshair: "#5f5f68",
    crosshairLabelBg: "#33333a",
    crosshairLabelText: "#f2f2f4",
    up: "#4caf82",
    down: "#e5574b",
    upWick: "#4caf82",
    downWick: "#e5574b",
    volumeUp: "rgba(76,175,130,0.38)",
    volumeDown: "rgba(229,87,75,0.38)",
    line: "#c9ccd1",
  },
  Terminal: {
    ...DARK,
    background: "#000000",
    paneBackground: "#000000",
    grid: "#0e1a0e",
    border: "#173417",
    text: "#4f9f57",
    textStrong: "#c6ffc6",
    crosshair: "#2f7f37",
    crosshairLabelBg: "#0b2e0b",
    crosshairLabelText: "#c6ffc6",
    up: "#00e676",
    down: "#ff3b3b",
    upWick: "#00e676",
    downWick: "#ff3b3b",
    volumeUp: "rgba(0,230,118,0.38)",
    volumeDown: "rgba(255,59,59,0.38)",
    line: "#ffb300",
  },
  Sepia: {
    ...DARK,
    background: "#f6f0e2",
    paneBackground: "#f6f0e2",
    grid: "#e7ddc7",
    border: "#d6cab0",
    text: "#8a7d63",
    textStrong: "#3a3327",
    crosshair: "#a99a7d",
    crosshairLabelBg: "#3a3327",
    crosshairLabelText: "#f6f0e2",
    up: "#3f8f5f",
    down: "#c0503f",
    upWick: "#3f8f5f",
    downWick: "#c0503f",
    volumeUp: "rgba(63,143,95,0.4)",
    volumeDown: "rgba(192,80,63,0.4)",
    line: "#b5852f",
  },
  Dracula: {
    ...DARK,
    background: "#282a36",
    paneBackground: "#282a36",
    grid: "#373844",
    border: "#44475a",
    text: "#6272a4",
    textStrong: "#f8f8f2",
    crosshair: "#6272a4",
    crosshairLabelBg: "#44475a",
    crosshairLabelText: "#f8f8f2",
    up: "#50fa7b",
    down: "#ff5555",
    upWick: "#50fa7b",
    downWick: "#ff5555",
    volumeUp: "rgba(80,250,123,0.4)",
    volumeDown: "rgba(255,85,85,0.4)",
    line: "#bd93f9",
  },
  "Solarized Dark": {
    ...DARK,
    background: "#002b36",
    paneBackground: "#002b36",
    grid: "#073642",
    border: "#586e75",
    text: "#657b83",
    textStrong: "#839496",
    crosshair: "#586e75",
    crosshairLabelBg: "#073642",
    crosshairLabelText: "#839496",
    up: "#2aa198",
    down: "#dc322f",
    upWick: "#2aa198",
    downWick: "#dc322f",
    volumeUp: "rgba(42,161,152,0.4)",
    volumeDown: "rgba(220,50,47,0.4)",
    line: "#268bd2",
  },
};
export const THEME_NAMES = Object.keys(THEMES);

// ---- series colours -------------------------------------------------------
// THE ENGINE'S ONE COLOUR SOURCE. Colour is expressed only through a
// declared source. For a host that is its design tokens; for this
// package it is this file — the engine is deliberately dependency-free (its
// package.json peer-depends on react and nothing else), so it cannot import the token
// package without giving up the independence that lets it be reused. A raw-hex lint
// allows hex HERE and nowhere else in the engine.
//
// These six were previously copy-pasted verbatim into three modules (chart.ts PALETTE,
// script.ts SERIES_PALETTE, TradingChart.tsx IND_PALETTE) plus the swatch and compare lists.
// One declaration, imported everywhere.
export const SERIES_PALETTE = ["#ebae3d", "#3d9beb", "#c86bfa", "#eb5c8a", "#3dd6c4", "#f28c3d"];

/** The colour picker's swatches: the series palette plus direction and two neutrals. */
export const SWATCHES = [...SERIES_PALETTE, "#00c805", "#ff5000", "#e8e8ea", "#8a8a92"];

/**
 * Comparison overlays. Index 0 is skipped — gold reads as the primary instrument — and the
 * remaining five are kept in their long-standing hand-picked order (pink last, so the first
 * three overlays stay maximally distinguishable), NOT plain `slice(1)`.
 */
export const CMP_COLORS = [1, 2, 4, 5, 3].map((i) => SERIES_PALETTE[i]);

/** The secondary line of a two-line study (MACD signal, stochastic %D). */
export const SIGNAL_COLOR = SERIES_PALETTE[3];

/**
 * Ink drawn ON TOP of a filled colour chip (axis tags, drawing handles, legend swatches).
 * Deliberately NOT a theme colour: the chip beneath is an arbitrary bright series colour,
 * so the label must stay legible in every theme, and near-black is the only value that
 * holds against all of SERIES_PALETTE.
 */
export const CHIP_INK = "#000";

// ---- render helpers -------------------------------------------------------
// A colour at a given opacity. Hex (our tokens, and every built-in theme) converts exactly to rgba;
// anything else (a host handing us an hsl()/oklch() token) falls back to color-mix, so a themed
// colour never silently drops to the previous fillStyle.
export function alpha(color: string, a: number): string {
  const c = color.trim();
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c);
  if (m) {
    const h = m[1];
    const full = h.length === 3 ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2] : h;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
  }
  return `color-mix(in srgb, ${c} ${Math.round(a * 100)}%, transparent)`;
}
// Blend two colours (hex-exact, else color-mix): `t` = share of `b`.
export function mix(a: string, b: string, t: number): string {
  const parse = (c: string) => {
    const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c.trim());
    if (!m) return null;
    const h = m[1].length === 3 ? m[1][0] + m[1][0] + m[1][1] + m[1][1] + m[1][2] + m[1][2] : m[1];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  };
  const A = parse(a);
  const B = parse(b);
  if (!A || !B) return `color-mix(in srgb, ${b} ${Math.round(t * 100)}%, ${a})`;
  const c = A.map((v, i) => Math.round(v + (B[i] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
// Rounded-rect path — the one primitive that separates a flat canvas chart from a modern one. Used
// by every tag/chip/pill the engine draws (axis tags, crosshair labels, price-line chips).
export function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}
// mm:ss / h:mm:ss remaining — the live countdown to the current bar's close.
export function fmtCountdown(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return h > 0 ? `${h}:${pad2(m)}:${pad2(ss)}` : `${pad2(m)}:${pad2(ss)}`;
}
const pad2 = (n: number) => (n < 10 ? "0" + n : String(n));

// ---- math helpers ---------------------------------------------------------
export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
// Snap a coordinate to the crisp centre of a device pixel so 1px lines don't blur.
export const crisp = (v: number) => Math.round(v) + 0.5;

// "Nice" axis ticks: round step (1/2/2.5/5 × 10^k) covering [min,max] with ~targetCount lines.
export function niceTicks(min: number, max: number, targetCount: number): number[] {
  if (!isFinite(min) || !isFinite(max) || max <= min || targetCount < 1) return [];
  const range = max - min;
  const rawStep = range / targetCount;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const first = Math.ceil(min / step) * step;
  const out: number[] = [];
  for (let v = first; v <= max + step * 1e-6; v += step) out.push(Math.round(v / step) * step);
  return out;
}

// Decimals to render given a value scale — more for penny/sub-dollar instruments.
export function priceDecimals(range: number): number {
  if (range >= 1000) return 1;
  if (range >= 20) return 2;
  if (range >= 1) return 2;
  if (range >= 0.1) return 3;
  if (range >= 0.01) return 4;
  return 5;
}
export const fmtPrice = (v: number, decimals: number) => v.toFixed(decimals);
export function fmtVolume(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e9) return (v / 1e9).toFixed(2) + "B";
  if (a >= 1e6) return (v / 1e6).toFixed(1) + "M";
  if (a >= 1e3) return (v / 1e3).toFixed(0) + "K";
  return String(Math.round(v));
}

// ---- time formatting ------------------------------------------------------
// The engine infers intraday vs daily from the bars' own spacing, never from a resolution string.
export function medianSpacingSec(bars: Bar[]): number {
  if (bars.length < 2) return 86400;
  const deltas: number[] = [];
  for (let i = 1; i < Math.min(bars.length, 60); i++) deltas.push(bars[i].time - bars[i - 1].time);
  deltas.sort((a, b) => a - b);
  return deltas[Math.floor(deltas.length / 2)] || 86400;
}
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => (n < 10 ? "0" + n : String(n));
/**
 * Read a bar's timestamp in the chart's clock.
 *
 * `utc` when bar times are exchange wall-clock stamped as UTC — a common storage convention, and
 * the only setting under which a chart reads identically in Kathmandu and New York. Left off, every
 * label is silently shifted by the READER's offset from UTC.
 */
const parts = (sec: number, utc: boolean) => {
  const d = new Date(sec * 1000);
  return utc
    ? { y: d.getUTCFullYear(), mo: d.getUTCMonth(), day: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes() }
    : { y: d.getFullYear(), mo: d.getMonth(), day: d.getDate(), h: d.getHours(), mi: d.getMinutes() };
};

/**
 * An axis label.
 *
 * A `boundary` bar opens a new day (intraday) or year (daily), and is labelled with the DATE.
 * Printing a day boundary as a clock time yields the session open repeated the whole way across —
 * "07:00 07:00 07:00" — which says nothing about where you are in the series. Ticks inside a day
 * carry the time.
 */
export function fmtAxisTime(sec: number, intraday: boolean, boundary: boolean, utc = false): string {
  const p = parts(sec, utc);
  if (!intraday) return boundary ? `${MON[p.mo]} ${p.y}` : `${MON[p.mo]} ${p.day}`;
  return boundary ? `${MON[p.mo]} ${p.day}` : `${pad(p.h)}:${pad(p.mi)}`;
}
export function fmtCrosshairTime(sec: number, intraday: boolean, utc = false): string {
  const p = parts(sec, utc);
  return intraday ? `${MON[p.mo]} ${p.day} ${pad(p.h)}:${pad(p.mi)}` : `${MON[p.mo]} ${p.day}, ${p.y}`;
}
// True when bar i begins a new "section" (day for intraday, month for daily) — where a time
// gridline + label belongs, the way TradingView breaks its time axis.
export function isTimeBoundary(prev: Bar | undefined, cur: Bar, intraday: boolean, utc = false): boolean {
  if (!prev) return true;
  const a = parts(prev.time, utc);
  const b = parts(cur.time, utc);
  return intraday ? a.day !== b.day : a.mo !== b.mo || a.y !== b.y;
}

// ---- indicator maths (pure) ----------------------------------------------
// NaN-padded so index i of the output aligns with bar i.
export function sma(src: number[], p: number): number[] {
  const out = new Array(src.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < src.length; i++) {
    sum += src[i];
    if (i >= p) sum -= src[i - p];
    if (i >= p - 1) out[i] = sum / p;
  }
  return out;
}
export function ema(src: number[], p: number): number[] {
  const out = new Array(src.length).fill(NaN);
  const k = 2 / (p + 1);
  let prev = NaN;
  for (let i = 0; i < src.length; i++) {
    if (i < p - 1) continue;
    if (isNaN(prev)) {
      let s = 0;
      for (let j = i - p + 1; j <= i; j++) s += src[j];
      prev = s / p;
    } else {
      prev = src[i] * k + prev * (1 - k);
    }
    out[i] = prev;
  }
  return out;
}
export function stddev(src: number[], p: number, mean: number[]): number[] {
  const out = new Array(src.length).fill(NaN);
  for (let i = p - 1; i < src.length; i++) {
    let s = 0;
    for (let j = i - p + 1; j <= i; j++) {
      const d = src[j] - mean[i];
      s += d * d;
    }
    out[i] = Math.sqrt(s / p);
  }
  return out;
}
export function bollinger(src: number[], p: number, mult: number) {
  const mid = sma(src, p);
  const sd = stddev(src, p, mid);
  const up = mid.map((m, i) => (isNaN(m) ? NaN : m + mult * sd[i]));
  const lo = mid.map((m, i) => (isNaN(m) ? NaN : m - mult * sd[i]));
  return { mid, up, lo };
}
export function rsi(src: number[], p: number): number[] {
  const out = new Array(src.length).fill(NaN);
  let avgGain = 0,
    avgLoss = 0;
  for (let i = 1; i < src.length; i++) {
    const ch = src[i] - src[i - 1];
    const gain = ch > 0 ? ch : 0;
    const loss = ch < 0 ? -ch : 0;
    if (i <= p) {
      avgGain += gain;
      avgLoss += loss;
      if (i === p) {
        avgGain /= p;
        avgLoss /= p;
        out[i] = 100 - 100 / (1 + avgGain / (avgLoss || 1e-10));
      }
    } else {
      avgGain = (avgGain * (p - 1) + gain) / p;
      avgLoss = (avgLoss * (p - 1) + loss) / p;
      out[i] = 100 - 100 / (1 + avgGain / (avgLoss || 1e-10));
    }
  }
  return out;
}
export function macd(src: number[], fast = 12, slow = 26, signal = 9) {
  const ef = ema(src, fast);
  const es = ema(src, slow);
  const line = ef.map((v, i) => (isNaN(v) || isNaN(es[i]) ? NaN : v - es[i]));
  // Signal = EMA of the MACD line, seeded (SMA) at the first VALID line value — never zero-fill the
  // NaN prefix, or those fake zeros pollute the signal (and histogram) for ~`signal` bars.
  const start = line.findIndex((v) => !isNaN(v));
  const sig = new Array(line.length).fill(NaN);
  if (start >= 0) {
    const k = 2 / (signal + 1);
    let prev = NaN;
    for (let i = start; i < line.length; i++) {
      if (i < start + signal - 1) continue;
      if (isNaN(prev)) {
        let s = 0;
        for (let j = i - signal + 1; j <= i; j++) s += line[j];
        prev = s / signal;
      } else {
        prev = line[i] * k + prev * (1 - k);
      }
      sig[i] = prev;
    }
  }
  const hist = line.map((v, i) => (isNaN(v) || isNaN(sig[i]) ? NaN : v - sig[i]));
  return { line, signal: sig, hist };
}
export function wma(src: number[], p: number): number[] {
  const out = new Array(src.length).fill(NaN);
  const denom = (p * (p + 1)) / 2;
  for (let i = p - 1; i < src.length; i++) {
    let s = 0;
    for (let j = 0; j < p; j++) s += src[i - j] * (p - j);
    out[i] = s / denom;
  }
  return out;
}
export function stochastic(bars: Bar[], kP: number, dP: number) {
  const k = new Array(bars.length).fill(NaN);
  for (let i = kP - 1; i < bars.length; i++) {
    let hh = -Infinity,
      ll = Infinity;
    for (let j = i - kP + 1; j <= i; j++) {
      hh = Math.max(hh, bars[j].high);
      ll = Math.min(ll, bars[j].low);
    }
    k[i] = hh === ll ? 50 : (100 * (bars[i].close - ll)) / (hh - ll);
  }
  const kValid = k.map((v) => (isNaN(v) ? 0 : v));
  // %D is only real once its whole window is real %K — mask until the earliest window index is valid,
  // else the zero-substituted prefix understates the first ~dP values.
  const d = sma(kValid, dP).map((v, i) => (i - dP + 1 < 0 || isNaN(k[i - dP + 1]) ? NaN : v));
  return { k, d };
}
export function atr(bars: Bar[], p: number): number[] {
  const out = new Array(bars.length).fill(NaN);
  let prev = NaN;
  for (let i = 0; i < bars.length; i++) {
    const tr = i === 0 ? bars[i].high - bars[i].low : Math.max(bars[i].high - bars[i].low, Math.abs(bars[i].high - bars[i - 1].close), Math.abs(bars[i].low - bars[i - 1].close));
    if (i < p) {
      prev = isNaN(prev) ? tr : prev + tr;
      if (i === p - 1) {
        prev /= p;
        out[i] = prev;
      }
    } else {
      prev = (prev * (p - 1) + tr) / p;
      out[i] = prev;
    }
  }
  return out;
}
// Double / Triple EMA — EMAs of the EMA, started where each becomes valid.
export function dema(src: number[], p: number): number[] {
  const e1 = ema(src, p);
  const out = new Array(src.length).fill(NaN);
  const k = 2 / (p + 1);
  let e2 = NaN;
  for (let i = 0; i < src.length; i++) {
    if (isNaN(e1[i])) continue;
    e2 = isNaN(e2) ? e1[i] : e1[i] * k + e2 * (1 - k);
    out[i] = 2 * e1[i] - e2;
  }
  return out;
}
export function tema(src: number[], p: number): number[] {
  const e1 = ema(src, p);
  const out = new Array(src.length).fill(NaN);
  const k = 2 / (p + 1);
  let e2 = NaN,
    e3 = NaN;
  for (let i = 0; i < src.length; i++) {
    if (isNaN(e1[i])) continue;
    e2 = isNaN(e2) ? e1[i] : e1[i] * k + e2 * (1 - k);
    e3 = isNaN(e3) ? e2 : e2 * k + e3 * (1 - k);
    out[i] = 3 * e1[i] - 3 * e2 + e3;
  }
  return out;
}
export function hma(src: number[], p: number): number[] {
  const half = Math.max(1, Math.round(p / 2));
  const sq = Math.max(1, Math.round(Math.sqrt(p)));
  const w1 = wma(src, half);
  const w2 = wma(src, p);
  const diff = src.map((_, i) => (isNaN(w1[i]) || isNaN(w2[i]) ? NaN : 2 * w1[i] - w2[i]));
  return wma(diff, sq);
}
export function donchian(bars: Bar[], p: number) {
  const up = new Array(bars.length).fill(NaN);
  const lo = new Array(bars.length).fill(NaN);
  const mid = new Array(bars.length).fill(NaN);
  for (let i = p - 1; i < bars.length; i++) {
    let h = -Infinity,
      l = Infinity;
    for (let j = i - p + 1; j <= i; j++) {
      h = Math.max(h, bars[j].high);
      l = Math.min(l, bars[j].low);
    }
    up[i] = h;
    lo[i] = l;
    mid[i] = (h + l) / 2;
  }
  return { up, mid, lo };
}
export function cci(bars: Bar[], p: number): number[] {
  const out = new Array(bars.length).fill(NaN);
  const tp = bars.map((b) => (b.high + b.low + b.close) / 3);
  const smaTp = sma(tp, p);
  for (let i = p - 1; i < bars.length; i++) {
    let dev = 0;
    for (let j = i - p + 1; j <= i; j++) dev += Math.abs(tp[j] - smaTp[i]);
    dev /= p;
    out[i] = dev === 0 ? 0 : (tp[i] - smaTp[i]) / (0.015 * dev);
  }
  return out;
}
export function williamsR(bars: Bar[], p: number): number[] {
  const out = new Array(bars.length).fill(NaN);
  for (let i = p - 1; i < bars.length; i++) {
    let h = -Infinity,
      l = Infinity;
    for (let j = i - p + 1; j <= i; j++) {
      h = Math.max(h, bars[j].high);
      l = Math.min(l, bars[j].low);
    }
    out[i] = h === l ? -50 : (-100 * (h - bars[i].close)) / (h - l);
  }
  return out;
}
export function obv(bars: Bar[]): number[] {
  const out = new Array(bars.length).fill(0);
  for (let i = 1; i < bars.length; i++) {
    const v = bars[i].volume ?? 0;
    out[i] = out[i - 1] + (bars[i].close > bars[i - 1].close ? v : bars[i].close < bars[i - 1].close ? -v : 0);
  }
  return out;
}
export function roc(src: number[], p: number): number[] {
  const out = new Array(src.length).fill(NaN);
  for (let i = p; i < src.length; i++) out[i] = src[i - p] === 0 ? 0 : (100 * (src[i] - src[i - p])) / src[i - p];
  return out;
}
export function mfi(bars: Bar[], p: number): number[] {
  const out = new Array(bars.length).fill(NaN);
  const tp = bars.map((b) => (b.high + b.low + b.close) / 3);
  for (let i = p; i < bars.length; i++) {
    let pos = 0,
      neg = 0;
    for (let j = i - p + 1; j <= i; j++) {
      const mf = tp[j] * (bars[j].volume ?? 0);
      if (tp[j] > tp[j - 1]) pos += mf;
      else if (tp[j] < tp[j - 1]) neg += mf;
    }
    out[i] = neg === 0 ? 100 : 100 - 100 / (1 + pos / neg);
  }
  return out;
}
// ---- advanced indicator maths ---------------------------------------------
// Wilder's smoothing (the "modified moving average" ATR/ADX/RSI are defined with): seed with the
// simple mean of the first p values, then recursively fold each new value in at weight 1/p.
function wilder(src: number[], p: number): number[] {
  const out = new Array(src.length).fill(NaN);
  let prev = NaN;
  let seed = 0;
  let seen = 0;
  for (let i = 0; i < src.length; i++) {
    const v = src[i];
    if (isNaN(v)) continue;
    if (isNaN(prev)) {
      seed += v;
      seen++;
      if (seen === p) {
        prev = seed / p;
        out[i] = prev;
      }
    } else {
      prev = (prev * (p - 1) + v) / p;
      out[i] = prev;
    }
  }
  return out;
}

// Ichimoku Kinko Hyo. Every line is a midpoint of a rolling high/low channel — no smoothing, no
// invented data. Returned UNDISPLACED (index i = bar i); the chart applies the classic forward shift
// (spans drawn `base` bars ahead) and backward shift (lagging span `base` bars behind) at draw time,
// which is what makes the cloud a leading study.
export function ichimoku(bars: Bar[], convP = 9, baseP = 26, spanBP = 52) {
  const n = bars.length;
  const mid = (p: number) => {
    const out = new Array(n).fill(NaN);
    for (let i = p - 1; i < n; i++) {
      let h = -Infinity,
        l = Infinity;
      for (let j = i - p + 1; j <= i; j++) {
        if (bars[j].high > h) h = bars[j].high;
        if (bars[j].low < l) l = bars[j].low;
      }
      out[i] = (h + l) / 2;
    }
    return out;
  };
  const conversion = mid(convP);
  const baseLine = mid(baseP);
  const spanA = conversion.map((v, i) => (isNaN(v) || isNaN(baseLine[i]) ? NaN : (v + baseLine[i]) / 2));
  const spanB = mid(spanBP);
  const lagging = bars.map((b) => b.close);
  return { conversion, baseLine, spanA, spanB, lagging, shift: baseP };
}

// Supertrend: an ATR envelope around the median price that RATCHETS — each band may only tighten
// toward price while the trend holds, and flips side when a close breaks through. `dir` is +1 in an
// uptrend (line below price) / -1 in a downtrend, so the renderer can colour each segment honestly.
export function supertrend(bars: Bar[], p = 10, mult = 3): { line: number[]; dir: number[] } {
  const n = bars.length;
  const a = atr(bars, p);
  const line = new Array(n).fill(NaN);
  const dir = new Array(n).fill(0);
  let upper = NaN,
    lower = NaN,
    trend = 1;
  for (let i = 0; i < n; i++) {
    if (isNaN(a[i])) continue;
    const mid = (bars[i].high + bars[i].low) / 2;
    const bu = mid + mult * a[i];
    const bl = mid - mult * a[i];
    const pc = i > 0 ? bars[i - 1].close : bars[i].close;
    upper = isNaN(upper) || bu < upper || pc > upper ? bu : upper;
    lower = isNaN(lower) || bl > lower || pc < lower ? bl : lower;
    if (bars[i].close > upper) trend = 1;
    else if (bars[i].close < lower) trend = -1;
    dir[i] = trend;
    line[i] = trend === 1 ? lower : upper;
  }
  return { line, dir };
}

// Parabolic SAR (Wilder). The stop accelerates toward the extreme point of the current swing and
// flips when price trades through it; `dir` carries the side so the dots can be coloured.
export function psar(bars: Bar[], step = 0.02, maxAf = 0.2): { line: number[]; dir: number[] } {
  const n = bars.length;
  const line = new Array(n).fill(NaN);
  const dir = new Array(n).fill(0);
  if (n < 2) return { line, dir };
  let rising = bars[1].close >= bars[0].close;
  let sar = rising ? bars[0].low : bars[0].high;
  let ep = rising ? bars[0].high : bars[0].low;
  let af = step;
  for (let i = 1; i < n; i++) {
    sar = sar + af * (ep - sar);
    // the SAR may never enter the previous two bars' range
    if (rising) sar = Math.min(sar, bars[i - 1].low, bars[i - 2]?.low ?? bars[i - 1].low);
    else sar = Math.max(sar, bars[i - 1].high, bars[i - 2]?.high ?? bars[i - 1].high);
    if (rising ? bars[i].low < sar : bars[i].high > sar) {
      // flip: the stop becomes the extreme point of the swing that just ended
      rising = !rising;
      sar = ep;
      ep = rising ? bars[i].high : bars[i].low;
      af = step;
    } else if (rising ? bars[i].high > ep : bars[i].low < ep) {
      ep = rising ? bars[i].high : bars[i].low;
      af = Math.min(maxAf, af + step);
    }
    line[i] = sar;
    dir[i] = rising ? 1 : -1;
  }
  return { line, dir };
}

// Keltner Channels: an EMA spine with ATR-scaled rails (the volatility-normalised cousin of
// Bollinger, which uses standard deviation instead).
export function keltner(bars: Bar[], p = 20, mult = 2, atrP = 10) {
  const mid = ema(
    bars.map((b) => b.close),
    p,
  );
  const a = atr(bars, atrP);
  const up = mid.map((m, i) => (isNaN(m) || isNaN(a[i]) ? NaN : m + mult * a[i]));
  const lo = mid.map((m, i) => (isNaN(m) || isNaN(a[i]) ? NaN : m - mult * a[i]));
  return { up, mid, lo };
}

// ADX / DMI (Wilder): directional movement smoothed against true range → ±DI, their normalised
// spread → DX, and ADX = the smoothed DX. Trend STRENGTH, never direction on its own.
export function adx(bars: Bar[], p = 14): { adx: number[]; plusDI: number[]; minusDI: number[] } {
  const n = bars.length;
  const tr = new Array(n).fill(NaN);
  const pdm = new Array(n).fill(NaN);
  const mdm = new Array(n).fill(NaN);
  for (let i = 1; i < n; i++) {
    const up = bars[i].high - bars[i - 1].high;
    const dn = bars[i - 1].low - bars[i].low;
    pdm[i] = up > dn && up > 0 ? up : 0;
    mdm[i] = dn > up && dn > 0 ? dn : 0;
    tr[i] = Math.max(bars[i].high - bars[i].low, Math.abs(bars[i].high - bars[i - 1].close), Math.abs(bars[i].low - bars[i - 1].close));
  }
  const str = wilder(tr.slice(1), p);
  const sp = wilder(pdm.slice(1), p);
  const sm = wilder(mdm.slice(1), p);
  const plusDI = new Array(n).fill(NaN);
  const minusDI = new Array(n).fill(NaN);
  const dx = new Array(n).fill(NaN);
  for (let k = 0; k < str.length; k++) {
    const i = k + 1;
    if (isNaN(str[k]) || str[k] === 0) continue;
    plusDI[i] = (100 * sp[k]) / str[k];
    minusDI[i] = (100 * sm[k]) / str[k];
    const sum = plusDI[i] + minusDI[i];
    dx[i] = sum === 0 ? 0 : (100 * Math.abs(plusDI[i] - minusDI[i])) / sum;
  }
  const valid = dx.filter((v) => !isNaN(v));
  const smoothed = wilder(valid, p);
  const out = new Array(n).fill(NaN);
  let k = 0;
  for (let i = 0; i < n; i++) if (!isNaN(dx[i])) out[i] = smoothed[k++];
  return { adx: out, plusDI, minusDI };
}

export function vwap(bars: Bar[]): number[] {
  // Session VWAP, reset each calendar day.
  const out = new Array(bars.length).fill(NaN);
  let cumPV = 0,
    cumV = 0,
    day = -1;
  for (let i = 0; i < bars.length; i++) {
    const d = new Date(bars[i].time * 1000).getDate();
    if (d !== day) {
      day = d;
      cumPV = 0;
      cumV = 0;
    }
    const tp = (bars[i].high + bars[i].low + bars[i].close) / 3;
    const v = bars[i].volume ?? 0;
    cumPV += tp * v;
    cumV += v;
    out[i] = cumV > 0 ? cumPV / cumV : bars[i].close;
  }
  return out;
}

// Anchored VWAP: cumulative Σ(typical·volume)/Σ(volume) from a user-chosen anchor bar to the end —
// unlike session vwap() it NEVER resets, which is the whole point of "anchored" (anchor an earnings
// gap, a swing high, a session open). NaN before the anchor. Reads the SAME real per-bar volume the
// session VWAP does — nothing synthesized; if the anchored window has zero volume it degrades to close.
export function vwapAnchored(bars: Bar[], anchorTime: number): number[] {
  const out = new Array(bars.length).fill(NaN);
  let cumPV = 0,
    cumV = 0;
  for (let i = 0; i < bars.length; i++) {
    if (bars[i].time < anchorTime) continue;
    const tp = (bars[i].high + bars[i].low + bars[i].close) / 3;
    const v = bars[i].volume ?? 0;
    cumPV += tp * v;
    cumV += v;
    out[i] = cumV > 0 ? cumPV / cumV : bars[i].close;
  }
  return out;
}

// Anchored VWAP + its running volume-weighted standard deviation, per bar — the inputs for the ±σ
// envelope bands a pro desk draws around an anchored VWAP. `dev[i]` = sqrt of the volume-weighted
// variance of typical price about the running VWAP (via cumulative Σvol, Σtp·vol, Σtp²·vol), so bands
// = vwap ± k·dev. Same real volume as vwapAnchored; NaN before the anchor, dev 0 with no volume.
export function vwapAnchoredBands(bars: Bar[], anchorTime: number): { vwap: number[]; dev: number[] } {
  const vwap = new Array(bars.length).fill(NaN);
  const dev = new Array(bars.length).fill(NaN);
  let cumPV = 0,
    cumV = 0,
    cumP2V = 0;
  for (let i = 0; i < bars.length; i++) {
    if (bars[i].time < anchorTime) continue;
    const tp = (bars[i].high + bars[i].low + bars[i].close) / 3;
    const v = bars[i].volume ?? 0;
    cumPV += tp * v;
    cumV += v;
    cumP2V += tp * tp * v;
    if (cumV > 0) {
      const mean = cumPV / cumV;
      vwap[i] = mean;
      dev[i] = Math.sqrt(Math.max(0, cumP2V / cumV - mean * mean));
    } else {
      vwap[i] = bars[i].close;
      dev[i] = 0;
    }
  }
  return { vwap, dev };
}

export interface VolumeProfile {
  lo: number; // bottom price of the profile
  hi: number; // top price
  binH: number; // price height of each bin
  bins: number[]; // volume per bin, index 0 = lowest price
  poc: number; // index of the point-of-control (max-volume) bin
  vaLo: number; // value-area low bin index (inclusive)
  vaHi: number; // value-area high bin index (inclusive)
  total: number; // total volume across the range
}

// Volume-by-price over the given bars, bucketed into `n` bins spanning [minLow, maxHigh]. Each bar's
// REAL total volume is spread evenly across the price bins its [low, high] range covers — a bar-range
// approximation, because we have per-bar OHLCV, not tick-level volume-at-price, so this models WHERE in
// the bar the volume traded; the volume totals themselves are the feed's own totals, never invented.
// POC = the max-volume bin; the value area is the contiguous 70%-of-volume band grown outward from POC.
export function volumeProfile(bars: Bar[], n = 24): VolumeProfile | null {
  if (!bars.length || n < 1) return null;
  let lo = Infinity,
    hi = -Infinity;
  for (const b of bars) {
    if (b.low < lo) lo = b.low;
    if (b.high > hi) hi = b.high;
  }
  if (!(hi > lo) || !isFinite(lo) || !isFinite(hi)) return null;
  const binH = (hi - lo) / n;
  const bins = new Array(n).fill(0);
  let total = 0;
  for (const b of bars) {
    const v = b.volume ?? 0;
    if (v <= 0) continue;
    total += v;
    const loI = Math.max(0, Math.min(n - 1, Math.floor((b.low - lo) / binH)));
    const hiI = Math.max(0, Math.min(n - 1, Math.floor((b.high - lo) / binH)));
    const share = v / (hiI - loI + 1);
    for (let i = loI; i <= hiI; i++) bins[i] += share;
  }
  if (total <= 0) return null;
  // Point of control + the 70% value area, grown outward from the POC taking the larger neighbour.
  let poc = 0;
  for (let i = 1; i < n; i++) if (bins[i] > bins[poc]) poc = i;
  let vaLo = poc,
    vaHi = poc,
    acc = bins[poc];
  const target = total * 0.7;
  while (acc < target && (vaLo > 0 || vaHi < n - 1)) {
    const below = vaLo > 0 ? bins[vaLo - 1] : -1;
    const above = vaHi < n - 1 ? bins[vaHi + 1] : -1;
    if (above >= below) {
      vaHi++;
      acc += Math.max(above, 0);
    } else {
      vaLo--;
      acc += Math.max(below, 0);
    }
  }
  return { lo, hi, binH, bins, poc, vaLo, vaHi, total };
}

// ---- additional indicators -----------------------------------------------
// Volume-Weighted Moving Average: each bar's close weighted by its volume so high-volume
// bars pull the MA toward the price where conviction was actually expressed.
export function vwma(bars: Bar[], p: number): number[] {
  const out = new Array(bars.length).fill(NaN);
  for (let i = p - 1; i < bars.length; i++) {
    let sumPV = 0, sumV = 0;
    for (let j = i - p + 1; j <= i; j++) {
      const v = bars[j].volume ?? 0;
      sumPV += bars[j].close * v;
      sumV += v;
    }
    out[i] = sumV > 0 ? sumPV / sumV : bars[i].close;
  }
  return out;
}

// Chaikin Money Flow: the sum of money-flow volume (close-position within the bar × volume)
// over `p` bars, normalised by total volume — positive = accumulation, negative = distribution.
export function cmf(bars: Bar[], p: number): number[] {
  const out = new Array(bars.length).fill(NaN);
  for (let i = p - 1; i < bars.length; i++) {
    let sumMFV = 0, sumV = 0;
    for (let j = i - p + 1; j <= i; j++) {
      const range = bars[j].high - bars[j].low;
      const v = bars[j].volume ?? 0;
      sumMFV += range > 0 ? ((bars[j].close - bars[j].low) - (bars[j].high - bars[j].close)) / range * v : 0;
      sumV += v;
    }
    out[i] = sumV > 0 ? sumMFV / sumV : 0;
  }
  return out;
}

// Aroon: how long (as a fraction of `p`) since the last highest high / lowest low.
// Up = (p - barsSinceHigh) / p × 100, Down = (p - barsSinceLow) / p × 100.
export function aroon(bars: Bar[], p: number): { up: number[]; down: number[] } {
  const up = new Array(bars.length).fill(NaN);
  const down = new Array(bars.length).fill(NaN);
  for (let i = p; i < bars.length; i++) {
    let highestIdx = i;
    let lowestIdx = i;
    for (let j = i - p; j < i; j++) {
      if (bars[j].high >= bars[highestIdx].high) highestIdx = j;
      if (bars[j].low <= bars[lowestIdx].low) lowestIdx = j;
    }
    up[i] = ((p - (i - highestIdx)) / p) * 100;
    down[i] = ((p - (i - lowestIdx)) / p) * 100;
  }
  return { up, down };
}

// Stochastic RSI: the stochastic normalisation of the RSI series — how extreme the current RSI
// value is within its own lookback range. Two smoothed lines: %K and %D (signal).
export function stochRsi(
  bars: Bar[],
  rsiP = 14,
  stochP = 14,
  smoothK = 3,
  smoothD = 3,
): { k: number[]; d: number[] } {
  const closes = bars.map((b) => b.close);
  const r = rsi(closes, rsiP);
  const rawK = new Array(bars.length).fill(NaN);
  for (let i = stochP - 1; i < bars.length; i++) {
    let hi = -Infinity,
      lo = Infinity;
    for (let j = i - stochP + 1; j <= i; j++) {
      if (!isNaN(r[j])) {
        hi = Math.max(hi, r[j]);
        lo = Math.min(lo, r[j]);
      }
    }
    rawK[i] = isNaN(r[i]) || !isFinite(hi) || hi === lo ? NaN : (100 * (r[i] - lo)) / (hi - lo);
  }
  // smooth %K then derive %D
  const fill = rawK.map((v) => (isNaN(v) ? 0 : v));
  const ksm = sma(fill, smoothK);
  const k = ksm.map((v, i) => (i < smoothK - 1 || isNaN(rawK[Math.max(0, i - smoothK + 1)]) ? NaN : v));
  const dsm = sma(k.map((v) => (isNaN(v) ? 0 : v)), smoothD);
  const d = dsm.map((v, i) => (i < smoothK + smoothD - 2 || isNaN(k[Math.max(0, i - smoothD + 1)]) ? NaN : v));
  return { k, d };
}

// Momentum: raw close-minus-close-n-bars-ago — the velocity of price with no smoothing.
export function momentum(src: number[], p: number): number[] {
  const out = new Array(src.length).fill(NaN);
  for (let i = p; i < src.length; i++) out[i] = src[i] - src[i - p];
  return out;
}

// TRIX: percentage rate of change of a raw triple-applied EMA — eliminates cycles shorter than p
// bars and generates a smooth oscillator whose zero-cross is a trend signal. The signal line is
// returned separately so the host (or the engine) can draw it as a trigger line.
export function trix(src: number[], p: number): { line: number[]; signal: (sigP: number) => number[] } {
  const e1 = ema(src, p);
  const e2 = ema(e1.map((v) => (isNaN(v) ? 0 : v)), p);
  const e3 = ema(e2.map((v) => (isNaN(v) ? 0 : v)), p);
  const line = new Array(src.length).fill(NaN);
  for (let i = 1; i < src.length; i++) {
    if (!isNaN(e3[i]) && !isNaN(e3[i - 1]) && e3[i - 1] !== 0) {
      line[i] = ((e3[i] - e3[i - 1]) / e3[i - 1]) * 100;
    }
  }
  const signal = (sigP: number) => {
    const firstV = line.findIndex((v) => !isNaN(v));
    const sig = new Array(src.length).fill(NaN);
    if (firstV < 0) return sig;
    const slice = ema(line.slice(firstV), sigP);
    for (let i = 0; i < slice.length; i++) sig[firstV + i] = slice[i];
    return sig;
  };
  return { line, signal };
}

// Daily pivot points (classic floor-trader formula) for intraday bars. Each calendar day's bars
// get the PREVIOUS day's H/L/C-derived levels. The last bar of each day is NaN'd so drawLine
// does not draw a diagonal to the next session's level.
export function pivotPoints(bars: Bar[]): { pp: number[]; r1: number[]; r2: number[]; s1: number[]; s2: number[] } {
  const n = bars.length;
  const out = { pp: new Array(n).fill(NaN), r1: new Array(n).fill(NaN), r2: new Array(n).fill(NaN), s1: new Array(n).fill(NaN), s2: new Array(n).fill(NaN) };
  if (n < 2) return out;
  const fill = (from: number, to: number, pH: number, pL: number, pC: number) => {
    const p = (pH + pL + pC) / 3;
    const r1v = 2 * p - pL, r2v = p + (pH - pL);
    const s1v = 2 * p - pH, s2v = p - (pH - pL);
    for (let j = from; j < to; j++) { out.pp[j] = p; out.r1[j] = r1v; out.r2[j] = r2v; out.s1[j] = s1v; out.s2[j] = s2v; }
  };
  let sH = -Infinity, sL = Infinity, sC = NaN;
  let prevH = NaN, prevL = NaN, prevC = NaN;
  let sStart = 0;
  let sDay = new Date(bars[0].time * 1000).getDate();
  sH = bars[0].high; sL = bars[0].low; sC = bars[0].close;
  for (let i = 1; i < n; i++) {
    const d = new Date(bars[i].time * 1000).getDate();
    if (d !== sDay) {
      if (!isNaN(prevC)) fill(sStart, i, prevH, prevL, prevC);
      // NaN the closing bar of the outgoing session so the line doesn't span into the next
      out.pp[i - 1] = NaN; out.r1[i - 1] = NaN; out.r2[i - 1] = NaN;
      out.s1[i - 1] = NaN; out.s2[i - 1] = NaN;
      prevH = sH; prevL = sL; prevC = sC;
      sStart = i; sDay = d;
      sH = bars[i].high; sL = bars[i].low; sC = bars[i].close;
    } else {
      sH = Math.max(sH, bars[i].high); sL = Math.min(sL, bars[i].low); sC = bars[i].close;
    }
  }
  if (!isNaN(prevC)) fill(sStart, n, prevH, prevL, prevC);
  return out;
}

/** One claimed vertical span on the right price axis. */
export type AxisSlot = { y0: number; y1: number };

/**
 * Where an axis pill should actually be drawn so it does not bury an already-claimed one.
 *
 * The right-axis pills are OPAQUE: two within a pill-height of each other and the later one hides the
 * earlier one completely. An entry, a stop and a target sit within a few percent of the live price by
 * construction, so on any real ticket that collision is the ordinary case rather than an edge case —
 * which is how the live price came to be invisible whenever a bracket was on the chart.
 *
 * `anchor` is the y everything steps AWAY from (the live price). It keeps its exact position because
 * it is the one number on the axis that cannot be read off anything else on screen. A tag also stays
 * on its own side of the anchor — a target above the price is never displayed below it.
 *
 * Pushes the resolved span onto `slots` and returns the y to draw at. The caller keeps the LINE at the
 * true price and moves only the pill, so the geometry never lies about where the level is.
 */
export function placeAxisTag(y: number, h: number, slots: AxisSlot[], anchor?: number): number {
  const half = h / 2;
  const clash = (c: number) => slots.some((s) => c - half < s.y1 + 1 && c + half > s.y0 - 1);
  let at = y;
  if (clash(at)) {
    const dir = anchor != null && y < anchor ? -1 : 1;
    // Bounded: 60 steps of 2px is 120px of travel. Beyond that the axis is genuinely full, and a tag
    // sitting on another beats a tag flung to the far end of the scale pointing at nothing.
    for (let step = 1; step <= 60; step++) {
      const cand = y + dir * step * 2;
      if (!clash(cand)) {
        at = cand;
        break;
      }
    }
  }
  slots.push({ y0: at - half, y1: at + half });
  return at;
}

// ---- forward projection geometry ------------------------------------------
// Pure arithmetic, extracted so it is testable: the chart class needs a canvas and a DOM, and the
// test runner only picks up src/**/*.test.ts. Off-by-one here shows up as a forecast that is
// unreachable by panning, or one whose first column is silently clipped.

/** Empty columns kept right of the newest bar, in bar widths, for a projection of `projLen`. */
export function rightMarginBars(projLen: number): number {
  return 6 + Math.max(0, projLen);
}

/**
 * How many bars an initial fit should show.
 *
 * This used to be a flat 160 for every chart, which reads as "a sensible default" and is
 * really a desktop measurement wearing a constant's clothes. 160 bars across a 1200px plot
 * is a comfortable 7.5px each; across a 320px phone plot it is TWO PIXELS — a body barely
 * over a pixel wide with a wick somewhere inside it. The chart was not small at that size,
 * it was illegible: no candle in it could be read individually, which is the entire reason
 * to draw candles rather than a line.
 *
 * So the count follows the width, at a spacing where a candle is still a candle, and keeps
 * the old 160 ceiling — desktop fits are unchanged, narrow ones stop lying about how much
 * history they can legibly show. The reader can always zoom out; what they could not do was
 * un-crush a chart that opened crushed.
 */
export function fitBarCount(plotW: number, barCount: number, comfortable = 7): number {
  if (!(plotW > 0) || barCount <= 0) return Math.max(0, barCount);
  const byWidth = Math.round(plotW / comfortable);
  return Math.min(barCount, Math.max(MIN_FIT_BARS, Math.min(MAX_FIT_BARS, byWidth)));
}

/** Never open on fewer than this — a handful of giant candles is its own kind of useless. */
const MIN_FIT_BARS = 30;
/** The long-standing desktop fit; a wider monitor gets bigger bars, not more history. */
const MAX_FIT_BARS = 160;

/**
 * How far left the viewport may be dragged, in bar widths past the newest bar.
 *
 * Must clear the right margin, or a projection longer than the old fixed ceiling could be drawn
 * into a region the user cannot pan to.
 */
export function panFloorBars(projLen: number): number {
  return Math.max(20, rightMarginBars(projLen) + 4);
}

/**
 * The projection columns on screen, as inclusive `[first, last]` indices into the projection
 * arrays, given the visible COLUMN range and the real bar count. Returns an empty range
 * (`[0, -1]`) when none is visible, so callers can loop without a special case.
 */
export function projVisibleRange(firstCol: number, lastCol: number, n: number, K: number): [number, number] {
  if (K <= 0) return [0, -1];
  const first = Math.max(0, firstCol - n);
  const last = Math.min(K - 1, lastCol - n);
  return last < first ? [0, -1] : [first, last];
}
