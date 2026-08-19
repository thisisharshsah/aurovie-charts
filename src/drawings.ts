// The drawing-tool system: an extensible registry of tools, each a DrawSpec. A tool needs N
// control points (anchored in DATA space — {time, price} — so it pans/zooms with the chart),
// knows how to render itself, and how to hit-test a cursor. The chart owns the interaction
// state machine (draft → place points → select → drag handles / move / delete); this module owns
// the geometry + rendering so new tools are a self-contained addition here.
import type { Bar, Theme } from "./types";
import { vwapAnchored, vwapAnchoredBands, volumeProfile, CHIP_INK } from "./util";

export interface Point {
  time: number;
  price: number;
}
export interface Drawing {
  id: number;
  type: string;
  points: Point[];
  text?: string;
  color?: string;
  width?: number; // stroke-width multiplier (1 = default), applied via DrawCtx.widthScale
  style?: "solid" | "dashed" | "dotted"; // stroke style, applied via DrawCtx.dash
  hidden?: boolean; // toggled from the objects panel — skipped in draw + hit-test, kept in the list
}

// Coordinate + style bridge the chart hands each tool at draw/hit-test time (bound to the price
// pane's live scales).
export interface DrawCtx {
  ctx: CanvasRenderingContext2D;
  theme: Theme;
  xOfTime(t: number): number;
  yOfPrice(p: number): number;
  priceAtY(y: number): number;
  timeAtX(x: number): number;
  barsBetween(t1: number, t2: number): number; // whole bars spanned by a time range (for the date measurers)
  barsInRange(t1: number, t2: number): Bar[]; // the actual bars in a time range (for volume-aware tools: AVWAP, volume profile)
  lastPrice: number; // latest close (0 if none) — the position tool's Open-PnL basis
  decimals: number;
  plotW: number;
  plotH: number;
  widthScale: number; // per-drawing stroke-width multiplier (set by the chart before each draw)
  dash?: number[]; // per-drawing stroke dash (set by the chart before each draw)
}

export interface DrawSpec {
  points: number; // control points to create it
  label: string;
  glyph: string;
  draw(dc: DrawCtx, d: Drawing, selected: boolean): void;
  hit(dc: DrawCtx, d: Drawing, x: number, y: number): boolean;
  onCreate?(d: Drawing): void;
}

const HANDLE = 3.5;
const HIT = 6;

function distToSeg(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - x1) * dx + (py - y1) * dy) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = x1 + t * dx;
  const cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}
function drawHandles(dc: DrawCtx, pts: [number, number][]) {
  const { ctx, theme } = dc;
  ctx.save();
  ctx.fillStyle = theme.background;
  ctx.strokeStyle = theme.line;
  ctx.lineWidth = 1.4;
  for (const [x, y] of pts) {
    ctx.beginPath();
    ctx.rect(x - HANDLE, y - HANDLE, HANDLE * 2, HANDLE * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}
const col = (dc: DrawCtx, d: Drawing) => d.color || dc.theme.line;

function line(dc: DrawCtx, x1: number, y1: number, x2: number, y2: number, c: string, w = 1.4, dash?: number[]) {
  const { ctx } = dc;
  ctx.save();
  ctx.strokeStyle = c;
  ctx.lineWidth = w * (dc.widthScale ?? 1);
  if (dash) ctx.setLineDash(dash);
  else if (dc.dash) ctx.setLineDash(dc.dash);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}
// Double-headed measure arrows (the range measurers). Vertical spans a price delta, horizontal a time span.
function arrowV(dc: DrawCtx, x: number, y1: number, y2: number, c: string) {
  const { ctx } = dc;
  line(dc, x, y1, x, y2, c, 1.4);
  const h = 5;
  ctx.save();
  ctx.strokeStyle = c;
  ctx.lineWidth = 1.4;
  for (const [y, dir] of [[y1, y1 < y2 ? -1 : 1], [y2, y2 < y1 ? -1 : 1]] as [number, number][]) {
    ctx.beginPath();
    ctx.moveTo(x - h, y + dir * h);
    ctx.lineTo(x, y);
    ctx.lineTo(x + h, y + dir * h);
    ctx.stroke();
  }
  ctx.restore();
}
function arrowH(dc: DrawCtx, y: number, x1: number, x2: number, c: string) {
  const { ctx } = dc;
  line(dc, x1, y, x2, y, c, 1.4);
  const h = 5;
  ctx.save();
  ctx.strokeStyle = c;
  ctx.lineWidth = 1.4;
  for (const [x, dir] of [[x1, x1 < x2 ? -1 : 1], [x2, x2 < x1 ? -1 : 1]] as [number, number][]) {
    ctx.beginPath();
    ctx.moveTo(x + dir * h, y - h);
    ctx.lineTo(x, y);
    ctx.lineTo(x + dir * h, y + h);
    ctx.stroke();
  }
  ctx.restore();
}
function tagRight(dc: DrawCtx, y: number, text: string, c: string) {
  const { ctx, plotW } = dc;
  ctx.save();
  ctx.font = dc.theme.monoFont;
  const w = ctx.measureText(text).width + 8;
  ctx.fillStyle = c;
  ctx.fillRect(plotW - w, y - 8, w, 16);
  ctx.fillStyle = CHIP_INK;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text, plotW - w + 4, y);
  ctx.restore();
}

const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

// A filled label chip centred at (cx, y), text in on-fill black — used by the position + range tools.
function chip(dc: DrawCtx, cx: number, y: number, text: string, bg: string, align: "center" | "left" = "center") {
  const { ctx } = dc;
  ctx.save();
  ctx.font = dc.theme.font;
  const w = ctx.measureText(text).width + 12;
  const x = align === "center" ? cx - w / 2 : cx;
  ctx.fillStyle = bg;
  ctx.fillRect(x, y - 9, w, 18);
  ctx.fillStyle = CHIP_INK;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + 6, y);
  ctx.restore();
}
// A two-line filled label chip centred at (cx, y) — the position tool's richer readout.
function chip2(dc: DrawCtx, cx: number, y: number, l1: string, l2: string, bg: string) {
  const { ctx } = dc;
  ctx.save();
  ctx.font = dc.theme.font;
  const w = Math.max(ctx.measureText(l1).width, ctx.measureText(l2).width) + 16;
  const h = 30;
  ctx.fillStyle = bg;
  ctx.fillRect(cx - w / 2, y - h / 2, w, h);
  ctx.fillStyle = CHIP_INK;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(l1, cx, y - 7);
  ctx.fillText(l2, cx, y + 7);
  ctx.restore();
}
// The position sizer's basis: $ risked per trade → qty derives from it, so the reward/PnL are honest
// "for $X risked" figures (a calculator, not a live order). Kept round; adjust here to re-base sizing.
const DEFAULT_RISK = 1000;
const money = (v: number) => `$${Math.round(Math.abs(v)).toLocaleString()}`;
// Human calendar span of a seconds range: "3d 4h", "5h 20m", "45m".
function fmtDur(secs: number): string {
  const s = Math.abs(Math.round(secs));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return h > 0 ? `${d}d ${h}h` : `${d}d`;
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
}
// Shared render for the long/short position (risk-reward) tool. p0=entry, p1=target (also the box's
// right edge + width), p2=stop. During the 2-click draft p2 is absent → derive a symmetric 1:1 stop so
// the preview already shows the zones. Profit zone (entry→target) = green, loss zone (entry→stop) = red,
// whichever way the user placed them, so a long and a short read identically once positioned.
function drawPosition(dc: DrawCtx, d: Drawing, sel: boolean, side: "LONG" | "SHORT") {
  const entry = d.points[0];
  const target = d.points[1];
  const stop = d.points[2] ?? { time: target.time, price: 2 * entry.price - target.price };
  const { ctx, theme } = dc;
  const dec = dc.decimals;
  const x1 = dc.xOfTime(entry.time);
  const x2 = dc.xOfTime(target.time);
  const lo = Math.min(x1, x2);
  const w = Math.abs(x2 - x1);
  const yE = dc.yOfPrice(entry.price);
  const yT = dc.yOfPrice(target.price);
  const yS = dc.yOfPrice(stop.price);
  const green = theme.up;
  const red = theme.down;
  ctx.save();
  ctx.fillStyle = green + "22";
  ctx.fillRect(lo, Math.min(yE, yT), w, Math.abs(yT - yE)); // profit zone (entry → target)
  ctx.fillStyle = red + "22";
  ctx.fillRect(lo, Math.min(yE, yS), w, Math.abs(yS - yE)); // loss zone (entry → stop)
  ctx.restore();
  line(dc, lo, yT, lo + w, yT, green, 1.4);
  line(dc, lo, yS, lo + w, yS, red, 1.4);
  line(dc, lo, yE, lo + w, yE, theme.textStrong, 1.4, [5, 3]);
  // Position maths — a sizer for $DEFAULT_RISK risked: qty = risk / stop-distance, so the reward $ is
  // qty × target-distance (= risk × R/R) and the stop $ is the risk itself. Δ + % are pure geometry.
  const riskDist = Math.abs(entry.price - stop.price);
  const rewardDist = Math.abs(target.price - entry.price);
  const rr = riskDist > 1e-9 ? rewardDist / riskDist : 0;
  const qty = riskDist > 1e-9 ? DEFAULT_RISK / riskDist : 0;
  const rewardAmt = qty * rewardDist;
  const pct = (p: number) => (entry.price ? ((p - entry.price) / entry.price) * 100 : 0);
  const tPct = pct(target.price);
  const sPct = pct(stop.price);
  const cx = lo + w / 2;
  // SIGNED FROM THE GEOMETRY, and NAMED.
  //
  // The Δ used to be a hard-coded `+` on the target and `−` on the stop — the signs a canonical
  // plan happens to have — while the % beside it was computed from where the levels actually
  // sit. Drag them the other way and the chip contradicted itself in the same breath:
  // "+535.6 (−40.89%)". Both halves now come from the same subtraction, so they cannot disagree.
  //
  // And each carries its noun. "−731.2 (+55.82%) · $1,000" does not say what it is a distance
  // TO; the reader was left to infer target from stop by colour alone, which is exactly the
  // inference that goes wrong on a plan drawn the unusual way round.
  const signed = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(dec)}`;
  const signedPct = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}%`;
  chip(dc, cx, yT, `Target ${signed(target.price - entry.price)} (${signedPct(tPct)}) · ${money(rewardAmt)}`, green);
  chip(dc, cx, yS, `Stop ${signed(stop.price - entry.price)} (${signedPct(sPct)}) · ${money(DEFAULT_RISK)}`, red);
  const qtyStr = qty >= 10 ? String(Math.round(qty)) : qty.toFixed(2);
  const last = dc.lastPrice;
  if (last > 0) {
    const pnl = (side === "LONG" ? last - entry.price : entry.price - last) * qty;
    const bg = pnl >= 0 ? green : red;
    chip2(dc, cx, yE, `${side} · Entry ${entry.price.toFixed(dec)} · Qty ${qtyStr}`, `Open P&L ${pnl >= 0 ? "+" : "−"}$${Math.abs(pnl).toFixed(2)} · R/R ${rr.toFixed(2)}`, bg);
  } else {
    chip(dc, cx, yE, `${side} · Entry ${entry.price.toFixed(dec)} · Qty ${qtyStr} · R/R ${rr.toFixed(2)}`, theme.textStrong);
  }
  // A PLAN DRAWN THE WRONG WAY ROUND says nothing about itself otherwise. Both legs are measured
  // as distances, so a long taking profit BELOW its entry still produces a perfectly healthy
  // R/R and two confident chips — the one failure the numbers cannot show. Colour cannot carry
  // it either: the zones are painted by role, so the green sits under the target wherever the
  // target is. It has to be said in words.
  const inverted = side === "LONG" ? target.price < entry.price || stop.price > entry.price : target.price > entry.price || stop.price < entry.price;
  if (inverted) {
    chip(dc, cx, yE + 26, `⚠ Inverted for a ${side.toLowerCase()} — target and stop are on the wrong sides`, red);
  }
  if (sel) drawHandles(dc, [[x1, yE], [x2, yT], [dc.xOfTime(stop.time), yS]]);
}

// Shared render for a volume profile over a bar segment between two screen x's (fixed-range OR anchored).
// Faint dashed box + the horizontal volume-by-price histogram (POC + 70% value area highlighted) + a POC
// line and chip. Bins map through yOfPrice so they stay aligned under log/percent scales. `fallbackY`
// positions the honest-empty chip when the window has no volume or no price range.
function renderProfile(dc: DrawCtx, seg: Bar[], boxL: number, boxR: number, c: string, fallbackY: number) {
  const { ctx, theme } = dc;
  const lo = Math.min(boxL, boxR);
  const hi = Math.max(boxL, boxR);
  const prof = volumeProfile(seg, 24);
  if (!prof) {
    const vol = seg.reduce((s, b) => s + (b.volume ?? 0), 0);
    const msg = seg.length && vol > 0 ? "Volume profile · no price range in window" : "Volume profile · no volume in range";
    chip(dc, (lo + hi) / 2, fallbackY, msg, c, "left");
    return;
  }
  const yHi = dc.yOfPrice(prof.hi);
  const yLo = dc.yOfPrice(prof.lo);
  const yTop = Math.min(yHi, yLo);
  const height = Math.abs(yLo - yHi);
  ctx.save();
  ctx.strokeStyle = theme.line + "55";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 3]);
  ctx.strokeRect(lo, yTop, hi - lo, height);
  ctx.restore();
  const n = prof.bins.length;
  const maxVol = Math.max(...prof.bins);
  const maxLen = Math.min(hi - lo, dc.plotW * 0.32) || 60;
  const up = theme.up;
  ctx.save();
  for (let i = 0; i < n; i++) {
    const v = prof.bins[i];
    if (v <= 0) continue;
    const len = maxVol > 0 ? (v / maxVol) * maxLen : 0;
    // Map each bin from its true PRICE boundaries via yOfPrice — bars + POC bar stay aligned to the
    // price axis (and the dashed POC line) under log/percent scales, not just linear.
    const yA = dc.yOfPrice(prof.lo + i * prof.binH);
    const yB = dc.yOfPrice(prof.lo + (i + 1) * prof.binH);
    const yt = Math.min(yA, yB);
    const bh = Math.max(1, Math.abs(yA - yB) - 1);
    const inVA = i >= prof.vaLo && i <= prof.vaHi;
    ctx.fillStyle = i === prof.poc ? up + "cc" : inVA ? c + "88" : c + "3a";
    ctx.fillRect(lo, yt, len, bh);
  }
  ctx.restore();
  const pocPrice = prof.lo + (prof.poc + 0.5) * prof.binH;
  const yPoc = dc.yOfPrice(pocPrice);
  line(dc, lo, yPoc, hi, yPoc, up, 1.2, [2, 2]);
  const t = prof.total;
  const volM = t >= 1e9 ? `${(t / 1e9).toFixed(1)}B` : t >= 1e6 ? `${(t / 1e6).toFixed(1)}M` : t >= 1e3 ? `${(t / 1e3).toFixed(0)}K` : String(Math.round(t));
  chip(dc, hi, yPoc, `POC ${pocPrice.toFixed(dc.decimals)} · vol ${volM}`, up, "left");
}

// Linear regression of bar closes (index 0..n-1 as x values) — returns slope, intercept,
// residual std, and coefficient of determination (R²). Used by the regression channel drawing.
function linReg(bars: Bar[]): { slope: number; intercept: number; std: number; r2: number } | null {
  const n = bars.length;
  if (n < 2) return null;
  let sx = 0, sy = 0, sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) {
    sx += i; sy += bars[i].close;
    sxy += i * bars[i].close;
    sxx += i * i;
  }
  const den = n * sxx - sx * sx;
  if (Math.abs(den) < 1e-10) return null;
  const slope = (n * sxy - sx * sy) / den;
  const intercept = (sy - slope * sx) / n;
  const meanY = sy / n;
  let ss = 0, ssTot = 0;
  for (let i = 0; i < n; i++) {
    const e = bars[i].close - (intercept + slope * i);
    ss += e * e;
    ssTot += (bars[i].close - meanY) ** 2;
  }
  return { slope, intercept, std: Math.sqrt(ss / n), r2: ssTot > 0 ? 1 - ss / ssTot : 1 };
}

export const DRAW_SPECS: Record<string, DrawSpec> = {
  hline: {
    points: 1,
    label: "Horizontal line",
    glyph: "─",
    draw(dc, d, sel) {
      const y = dc.yOfPrice(d.points[0].price);
      const c = col(dc, d);
      line(dc, 0, y, dc.plotW, y, c, 1.4);
      tagRight(dc, y, d.points[0].price.toFixed(dc.decimals), c);
      if (sel) drawHandles(dc, [[dc.xOfTime(d.points[0].time), y]]);
    },
    hit: (dc, d, x, y) => Math.abs(dc.yOfPrice(d.points[0].price) - y) < HIT,
  },
  vline: {
    points: 1,
    label: "Vertical line",
    glyph: "│",
    draw(dc, d, sel) {
      const x = dc.xOfTime(d.points[0].time);
      const c = col(dc, d);
      line(dc, x, 0, x, dc.plotH, c, 1.4);
      if (sel) drawHandles(dc, [[x, dc.yOfPrice(d.points[0].price)]]);
    },
    hit: (dc, d, x) => Math.abs(dc.xOfTime(d.points[0].time) - x) < HIT,
  },
  trend: {
    points: 2,
    label: "Trend line",
    glyph: "╱",
    draw(dc, d, sel) {
      const a = d.points[0];
      const b = d.points[1];
      const x1 = dc.xOfTime(a.time);
      const y1 = dc.yOfPrice(a.price);
      const x2 = dc.xOfTime(b.time);
      const y2 = dc.yOfPrice(b.price);
      line(dc, x1, y1, x2, y2, col(dc, d), 1.6);
      if (sel) drawHandles(dc, [[x1, y1], [x2, y2]]);
    },
    hit(dc, d, x, y) {
      const a = d.points[0];
      const b = d.points[1];
      return distToSeg(x, y, dc.xOfTime(a.time), dc.yOfPrice(a.price), dc.xOfTime(b.time), dc.yOfPrice(b.price)) < HIT;
    },
  },
  ray: {
    points: 2,
    label: "Ray",
    glyph: "↗",
    draw(dc, d, sel) {
      const a = d.points[0];
      const b = d.points[1];
      const x1 = dc.xOfTime(a.time);
      const y1 = dc.yOfPrice(a.price);
      let x2 = dc.xOfTime(b.time);
      let y2 = dc.yOfPrice(b.price);
      // extend to the right edge
      const dx = x2 - x1;
      const dy = y2 - y1;
      if (dx !== 0) {
        const t = (dc.plotW - x1) / dx;
        if (t > 1) {
          x2 = dc.plotW;
          y2 = y1 + dy * t;
        }
      }
      line(dc, x1, y1, x2, y2, col(dc, d), 1.6);
      if (sel) drawHandles(dc, [[dc.xOfTime(a.time), y1], [dc.xOfTime(b.time), dc.yOfPrice(b.price)]]);
    },
    hit(dc, d, x, y) {
      const a = d.points[0];
      const b = d.points[1];
      return distToSeg(x, y, dc.xOfTime(a.time), dc.yOfPrice(a.price), dc.xOfTime(b.time), dc.yOfPrice(b.price)) < HIT;
    },
  },
  rect: {
    points: 2,
    label: "Rectangle",
    glyph: "▭",
    draw(dc, d, sel) {
      const a = d.points[0];
      const b = d.points[1];
      const x1 = dc.xOfTime(a.time);
      const y1 = dc.yOfPrice(a.price);
      const x2 = dc.xOfTime(b.time);
      const y2 = dc.yOfPrice(b.price);
      const c = col(dc, d);
      const { ctx } = dc;
      ctx.save();
      ctx.fillStyle = c + "18";
      ctx.strokeStyle = c;
      ctx.lineWidth = 1.4 * dc.widthScale;
      ctx.fillRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
      ctx.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
      ctx.restore();
      if (sel) drawHandles(dc, [[x1, y1], [x2, y2], [x1, y2], [x2, y1]]);
    },
    hit(dc, d, x, y) {
      const a = d.points[0];
      const b = d.points[1];
      const x1 = dc.xOfTime(a.time);
      const y1 = dc.yOfPrice(a.price);
      const x2 = dc.xOfTime(b.time);
      const y2 = dc.yOfPrice(b.price);
      const lo = { x: Math.min(x1, x2), y: Math.min(y1, y2) };
      const hi = { x: Math.max(x1, x2), y: Math.max(y1, y2) };
      const nearEdge =
        (Math.abs(x - lo.x) < HIT || Math.abs(x - hi.x) < HIT) && y > lo.y - HIT && y < hi.y + HIT
          ? true
          : (Math.abs(y - lo.y) < HIT || Math.abs(y - hi.y) < HIT) && x > lo.x - HIT && x < hi.x + HIT;
      const inside = x > lo.x && x < hi.x && y > lo.y && y < hi.y;
      return nearEdge || inside;
    },
  },
  fib: {
    points: 2,
    label: "Fib retracement",
    glyph: "𝑓",
    draw(dc, d, sel) {
      const a = d.points[0];
      const b = d.points[1];
      const x1 = dc.xOfTime(a.time);
      const x2 = dc.xOfTime(b.time);
      const c = col(dc, d);
      const { ctx } = dc;
      const lo = Math.min(x1, x2);
      const hi = Math.max(x1, x2);
      for (const lvl of FIB_LEVELS) {
        const price = a.price + (b.price - a.price) * lvl;
        const y = dc.yOfPrice(price);
        line(dc, lo, y, hi, y, c, 1, lvl === 0 || lvl === 1 ? undefined : [4, 3]);
        ctx.save();
        ctx.font = dc.theme.monoFont;
        ctx.fillStyle = c;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(`${(lvl * 100).toFixed(1)}%  ${price.toFixed(dc.decimals)}`, hi + 4, y);
        ctx.restore();
      }
      if (sel) drawHandles(dc, [[x1, dc.yOfPrice(a.price)], [x2, dc.yOfPrice(b.price)]]);
    },
    hit(dc, d, x, y) {
      const a = d.points[0];
      const b = d.points[1];
      const x1 = dc.xOfTime(a.time);
      const x2 = dc.xOfTime(b.time);
      if (x < Math.min(x1, x2) - HIT || x > Math.max(x1, x2) + HIT) return false;
      return FIB_LEVELS.some((lvl) => Math.abs(dc.yOfPrice(a.price + (b.price - a.price) * lvl) - y) < HIT);
    },
  },
  measure: {
    points: 2,
    label: "Measure",
    glyph: "⊹",
    draw(dc, d) {
      const a = d.points[0];
      const b = d.points[1];
      const x1 = dc.xOfTime(a.time);
      const y1 = dc.yOfPrice(a.price);
      const x2 = dc.xOfTime(b.time);
      const y2 = dc.yOfPrice(b.price);
      const up = b.price >= a.price;
      const c = up ? dc.theme.up : dc.theme.down;
      const { ctx } = dc;
      ctx.save();
      ctx.fillStyle = c + "1e";
      ctx.fillRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
      line(dc, x1, y1, x1, y2, c, 1.2);
      line(dc, x1, y2, x2, y2, c, 1.2);
      const diff = b.price - a.price;
      const pct = a.price ? (diff / a.price) * 100 : 0;
      const label = `${diff >= 0 ? "+" : ""}${diff.toFixed(dc.decimals)}  ${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;
      ctx.font = dc.theme.font;
      const w = ctx.measureText(label).width + 14;
      const bx = (x1 + x2) / 2 - w / 2;
      const by = Math.min(y1, y2) - 24;
      ctx.fillStyle = c;
      ctx.fillRect(bx, by, w, 18);
      ctx.fillStyle = CHIP_INK;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, bx + w / 2, by + 9);
      ctx.restore();
    },
    hit(dc, d, x, y) {
      const a = d.points[0];
      const b = d.points[1];
      return distToSeg(x, y, dc.xOfTime(a.time), dc.yOfPrice(a.price), dc.xOfTime(b.time), dc.yOfPrice(b.price)) < HIT;
    },
  },
  text: {
    points: 1,
    label: "Text",
    glyph: "T",
    onCreate(d) {
      const t = typeof window !== "undefined" ? window.prompt("Note text:", d.text ?? "") : null;
      d.text = t ?? d.text ?? "Text";
    },
    draw(dc, d, sel) {
      const x = dc.xOfTime(d.points[0].time);
      const y = dc.yOfPrice(d.points[0].price);
      const { ctx } = dc;
      const c = col(dc, d);
      ctx.save();
      ctx.font = dc.theme.font;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillStyle = c;
      ctx.fillText(d.text ?? "Text", x + 4, y);
      ctx.restore();
      if (sel) drawHandles(dc, [[x, y]]);
    },
    hit(dc, d, x, y) {
      const px = dc.xOfTime(d.points[0].time);
      const py = dc.yOfPrice(d.points[0].price);
      dc.ctx.font = dc.theme.font;
      const w = dc.ctx.measureText(d.text ?? "Text").width;
      return x > px && x < px + w + 8 && Math.abs(y - py) < 9;
    },
  },
  arrow: {
    points: 2,
    label: "Arrow",
    glyph: "→",
    draw(dc, d, sel) {
      const a = d.points[0];
      const b = d.points[1];
      const x1 = dc.xOfTime(a.time);
      const y1 = dc.yOfPrice(a.price);
      const x2 = dc.xOfTime(b.time);
      const y2 = dc.yOfPrice(b.price);
      const c = col(dc, d);
      const ang = Math.atan2(y2 - y1, x2 - x1);
      const size = 10;
      const spread = 0.42;
      const bx = x2 - size * 0.82 * Math.cos(ang);
      const by = y2 - size * 0.82 * Math.sin(ang);
      line(dc, x1, y1, bx, by, c, 1.6);
      const { ctx } = dc;
      ctx.save();
      ctx.fillStyle = c;
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - size * Math.cos(ang - spread), y2 - size * Math.sin(ang - spread));
      ctx.lineTo(x2 - size * Math.cos(ang + spread), y2 - size * Math.sin(ang + spread));
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      if (sel) drawHandles(dc, [[x1, y1], [x2, y2]]);
    },
    hit(dc, d, x, y) {
      const a = d.points[0];
      const b = d.points[1];
      return distToSeg(x, y, dc.xOfTime(a.time), dc.yOfPrice(a.price), dc.xOfTime(b.time), dc.yOfPrice(b.price)) < HIT;
    },
  },
  ellipse: {
    points: 2,
    label: "Ellipse",
    glyph: "◯",
    draw(dc, d, sel) {
      const a = d.points[0];
      const b = d.points[1];
      const x1 = dc.xOfTime(a.time);
      const y1 = dc.yOfPrice(a.price);
      const x2 = dc.xOfTime(b.time);
      const y2 = dc.yOfPrice(b.price);
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;
      const rx = Math.abs(x2 - x1) / 2;
      const ry = Math.abs(y2 - y1) / 2;
      const c = col(dc, d);
      const { ctx } = dc;
      ctx.save();
      ctx.fillStyle = c + "14";
      ctx.strokeStyle = c;
      ctx.lineWidth = 1.4 * dc.widthScale;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      if (sel) drawHandles(dc, [[x1, y1], [x2, y2]]);
    },
    hit(dc, d, x, y) {
      const a = d.points[0];
      const b = d.points[1];
      const x1 = dc.xOfTime(a.time);
      const y1 = dc.yOfPrice(a.price);
      const x2 = dc.xOfTime(b.time);
      const y2 = dc.yOfPrice(b.price);
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;
      const rx = Math.abs(x2 - x1) / 2;
      const ry = Math.abs(y2 - y1) / 2;
      if (rx < 1 || ry < 1) return distToSeg(x, y, x1, y1, x2, y2) < HIT;
      const norm = Math.sqrt(((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2);
      return Math.abs(norm - 1) * Math.min(rx, ry) < HIT;
    },
  },
  channel: {
    points: 3,
    label: "Parallel channel",
    glyph: "⫽",
    draw(dc, d, sel) {
      const a = d.points[0];
      const b = d.points[1];
      const p = d.points[2];
      const ax = dc.xOfTime(a.time);
      const ay = dc.yOfPrice(a.price);
      const bx = dc.xOfTime(b.time);
      const by = dc.yOfPrice(b.price);
      const cx = dc.xOfTime(p.time);
      const cy = dc.yOfPrice(p.price);
      const dx = cx + (bx - ax);
      const dy = cy + (by - ay);
      const c = col(dc, d);
      const { ctx } = dc;
      ctx.save();
      ctx.fillStyle = c + "14";
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.lineTo(dx, dy);
      ctx.lineTo(cx, cy);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      line(dc, ax, ay, bx, by, c, 1.6);
      line(dc, cx, cy, dx, dy, c, 1.6);
      if (sel) drawHandles(dc, [[ax, ay], [bx, by], [cx, cy]]);
    },
    hit(dc, d, x, y) {
      const a = d.points[0];
      const b = d.points[1];
      const p = d.points[2];
      const ax = dc.xOfTime(a.time);
      const ay = dc.yOfPrice(a.price);
      const bx = dc.xOfTime(b.time);
      const by = dc.yOfPrice(b.price);
      const cx = dc.xOfTime(p.time);
      const cy = dc.yOfPrice(p.price);
      const dx = cx + (bx - ax);
      const dy = cy + (by - ay);
      return distToSeg(x, y, ax, ay, bx, by) < HIT || distToSeg(x, y, cx, cy, dx, dy) < HIT;
    },
  },
  extended: {
    points: 2,
    label: "Extended line",
    glyph: "⤢",
    draw(dc, d, sel) {
      const a = d.points[0];
      const b = d.points[1];
      const x1 = dc.xOfTime(a.time);
      const y1 = dc.yOfPrice(a.price);
      const x2 = dc.xOfTime(b.time);
      const y2 = dc.yOfPrice(b.price);
      const c = col(dc, d);
      if (Math.abs(x2 - x1) < 0.5) {
        const xv = (x1 + x2) / 2;
        line(dc, xv, 0, xv, dc.plotH, c, 1.6);
      } else {
        const slope = (y2 - y1) / (x2 - x1);
        const yL = y1 + slope * (0 - x1);
        const yR = y1 + slope * (dc.plotW - x1);
        line(dc, 0, yL, dc.plotW, yR, c, 1.6);
      }
      if (sel) drawHandles(dc, [[x1, y1], [x2, y2]]);
    },
    hit(dc, d, x, y) {
      const a = d.points[0];
      const b = d.points[1];
      const x1 = dc.xOfTime(a.time);
      const y1 = dc.yOfPrice(a.price);
      const x2 = dc.xOfTime(b.time);
      const y2 = dc.yOfPrice(b.price);
      if (Math.abs(x2 - x1) < 0.5) return Math.abs(x - (x1 + x2) / 2) < HIT;
      const slope = (y2 - y1) / (x2 - x1);
      const yL = y1 + slope * (0 - x1);
      const yR = y1 + slope * (dc.plotW - x1);
      return distToSeg(x, y, 0, yL, dc.plotW, yR) < HIT;
    },
  },
  pitchfork: {
    points: 3,
    label: "Andrews' pitchfork",
    glyph: "Ψ",
    draw(dc, d, sel) {
      const p0 = d.points[0];
      const p1 = d.points[1];
      const p2 = d.points[2];
      const x0 = dc.xOfTime(p0.time);
      const y0 = dc.yOfPrice(p0.price);
      const x1 = dc.xOfTime(p1.time);
      const y1 = dc.yOfPrice(p1.price);
      const x2 = dc.xOfTime(p2.time);
      const y2 = dc.yOfPrice(p2.price);
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      const dx = mx - x0;
      const dy = my - y0;
      const ext = (ax: number, ay: number): [number, number] => {
        if (dx > 0.0001) {
          const t = (dc.plotW - ax) / dx;
          return [dc.plotW, ay + dy * t];
        }
        const s = Math.hypot(dx, dy) || 1;
        const k = (dc.plotW + dc.plotH) * 2;
        return [ax + (dx / s) * k, ay + (dy / s) * k];
      };
      const c = col(dc, d);
      const [mex, mey] = ext(mx, my);
      const [e1x, e1y] = ext(x1, y1);
      const [e2x, e2y] = ext(x2, y2);
      const { ctx } = dc;
      ctx.save();
      ctx.fillStyle = c + "12";
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(e1x, e1y);
      ctx.lineTo(e2x, e2y);
      ctx.lineTo(x2, y2);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      line(dc, x1, y1, x2, y2, c, 1.4);
      line(dc, x0, y0, mex, mey, c, 1.6);
      line(dc, x1, y1, e1x, e1y, c, 1.4);
      line(dc, x2, y2, e2x, e2y, c, 1.4);
      if (sel) drawHandles(dc, [[x0, y0], [x1, y1], [x2, y2]]);
    },
    hit(dc, d, x, y) {
      const p0 = d.points[0];
      const p1 = d.points[1];
      const p2 = d.points[2];
      const x0 = dc.xOfTime(p0.time);
      const y0 = dc.yOfPrice(p0.price);
      const x1 = dc.xOfTime(p1.time);
      const y1 = dc.yOfPrice(p1.price);
      const x2 = dc.xOfTime(p2.time);
      const y2 = dc.yOfPrice(p2.price);
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      const dx = mx - x0;
      const dy = my - y0;
      const ext = (ax: number, ay: number): [number, number] => {
        if (dx > 0.0001) {
          const t = (dc.plotW - ax) / dx;
          return [dc.plotW, ay + dy * t];
        }
        const s = Math.hypot(dx, dy) || 1;
        const k = (dc.plotW + dc.plotH) * 2;
        return [ax + (dx / s) * k, ay + (dy / s) * k];
      };
      const [mex, mey] = ext(mx, my);
      const [e1x, e1y] = ext(x1, y1);
      const [e2x, e2y] = ext(x2, y2);
      return (
        distToSeg(x, y, x0, y0, mex, mey) < HIT ||
        distToSeg(x, y, x1, y1, e1x, e1y) < HIT ||
        distToSeg(x, y, x2, y2, e2x, e2y) < HIT ||
        distToSeg(x, y, x1, y1, x2, y2) < HIT
      );
    },
  },
  // Freehand — placed by DRAG (the engine collects points on pointer-move), so `points` is a
  // sentinel it never reaches by clicking. Rendered as a smoothed polyline (quadratic midpoints).
  brush: {
    points: 1e9,
    label: "Brush",
    glyph: "✎",
    draw(dc, d, sel) {
      if (d.points.length < 2) return;
      const c = col(dc, d);
      const { ctx } = dc;
      const px = (i: number): [number, number] => [dc.xOfTime(d.points[i].time), dc.yOfPrice(d.points[i].price)];
      ctx.save();
      ctx.strokeStyle = c;
      ctx.lineWidth = 1.8 * dc.widthScale;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      let [x0, y0] = px(0);
      ctx.moveTo(x0, y0);
      for (let i = 1; i < d.points.length - 1; i++) {
        const [x1, y1] = px(i);
        const [x2, y2] = px(i + 1);
        ctx.quadraticCurveTo(x1, y1, (x1 + x2) / 2, (y1 + y2) / 2);
      }
      const [lx, ly] = px(d.points.length - 1);
      ctx.lineTo(lx, ly);
      ctx.stroke();
      ctx.restore();
      if (sel) drawHandles(dc, [px(0), px(d.points.length - 1)]);
    },
    hit(dc, d, x, y) {
      for (let i = 0; i < d.points.length - 1; i++) {
        const x1 = dc.xOfTime(d.points[i].time);
        const y1 = dc.yOfPrice(d.points[i].price);
        const x2 = dc.xOfTime(d.points[i + 1].time);
        const y2 = dc.yOfPrice(d.points[i + 1].price);
        if (distToSeg(x, y, x1, y1, x2, y2) < HIT) return true;
      }
      return false;
    },
  },
  // ---- FORECASTING: long / short position (risk-reward) ----
  // 2 clicks (entry, target); onCreate adds a symmetric 1:1 stop as a 3rd draggable level.
  longpos: {
    points: 2,
    label: "Long position",
    glyph: "L",
    onCreate: (d) => { const e = d.points[0]; const t = d.points[1]; d.points.push({ time: t.time, price: 2 * e.price - t.price }); },
    draw: (dc, d, sel) => drawPosition(dc, d, sel, "LONG"),
    hit(dc, d, x, y) {
      const x1 = dc.xOfTime(d.points[0].time);
      const x2 = dc.xOfTime(d.points[1].time);
      const stop = d.points[2] ?? { time: d.points[1].time, price: 2 * d.points[0].price - d.points[1].price };
      const ys = [dc.yOfPrice(d.points[0].price), dc.yOfPrice(d.points[1].price), dc.yOfPrice(stop.price)];
      return x > Math.min(x1, x2) - HIT && x < Math.max(x1, x2) + HIT && y > Math.min(...ys) - HIT && y < Math.max(...ys) + HIT;
    },
  },
  shortpos: {
    points: 2,
    label: "Short position",
    glyph: "S",
    onCreate: (d) => { const e = d.points[0]; const t = d.points[1]; d.points.push({ time: t.time, price: 2 * e.price - t.price }); },
    draw: (dc, d, sel) => drawPosition(dc, d, sel, "SHORT"),
    hit(dc, d, x, y) {
      const x1 = dc.xOfTime(d.points[0].time);
      const x2 = dc.xOfTime(d.points[1].time);
      const stop = d.points[2] ?? { time: d.points[1].time, price: 2 * d.points[0].price - d.points[1].price };
      const ys = [dc.yOfPrice(d.points[0].price), dc.yOfPrice(d.points[1].price), dc.yOfPrice(stop.price)];
      return x > Math.min(x1, x2) - HIT && x < Math.max(x1, x2) + HIT && y > Math.min(...ys) - HIT && y < Math.max(...ys) + HIT;
    },
  },
  // ---- MEASURERS: price range (vertical), date range (horizontal), date+price (box) ----
  pricerange: {
    points: 2,
    label: "Price range",
    glyph: "↕",
    draw(dc, d, sel) {
      const a = d.points[0];
      const b = d.points[1];
      const x1 = dc.xOfTime(a.time);
      const x2 = dc.xOfTime(b.time);
      const yA = dc.yOfPrice(a.price);
      const yB = dc.yOfPrice(b.price);
      const up = b.price >= a.price;
      const c = up ? dc.theme.up : dc.theme.down;
      const xc = (x1 + x2) / 2;
      line(dc, Math.min(x1, x2), yA, Math.max(x1, x2), yA, c + "88", 1);
      line(dc, Math.min(x1, x2), yB, Math.max(x1, x2), yB, c + "88", 1);
      arrowV(dc, xc, yA, yB, c);
      const diff = b.price - a.price;
      const pct = a.price ? (diff / a.price) * 100 : 0;
      chip(dc, xc, (yA + yB) / 2, `${diff >= 0 ? "+" : ""}${diff.toFixed(dc.decimals)}  ${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`, c);
      if (sel) drawHandles(dc, [[x1, yA], [x2, yB]]);
    },
    hit(dc, d, x, y) {
      const yA = dc.yOfPrice(d.points[0].price);
      const yB = dc.yOfPrice(d.points[1].price);
      const xc = (dc.xOfTime(d.points[0].time) + dc.xOfTime(d.points[1].time)) / 2;
      return Math.abs(x - xc) < HIT + 6 && y > Math.min(yA, yB) - HIT && y < Math.max(yA, yB) + HIT;
    },
  },
  daterange: {
    points: 2,
    label: "Date range",
    glyph: "↔",
    draw(dc, d, sel) {
      const a = d.points[0];
      const b = d.points[1];
      const x1 = dc.xOfTime(a.time);
      const x2 = dc.xOfTime(b.time);
      const yA = dc.yOfPrice(a.price);
      const yB = dc.yOfPrice(b.price);
      const c = dc.theme.line;
      const yc = (yA + yB) / 2;
      line(dc, x1, Math.min(yA, yB), x1, Math.max(yA, yB) + 6, c + "88", 1);
      line(dc, x2, Math.min(yA, yB), x2, Math.max(yA, yB) + 6, c + "88", 1);
      arrowH(dc, yc, x1, x2, c);
      const bars = dc.barsBetween(a.time, b.time);
      chip(dc, (x1 + x2) / 2, yc, `${bars} bar${bars === 1 ? "" : "s"} · ${fmtDur(b.time - a.time)}`, c);
      if (sel) drawHandles(dc, [[x1, yA], [x2, yB]]);
    },
    hit(dc, d, x, y) {
      const x1 = dc.xOfTime(d.points[0].time);
      const x2 = dc.xOfTime(d.points[1].time);
      const yc = (dc.yOfPrice(d.points[0].price) + dc.yOfPrice(d.points[1].price)) / 2;
      return Math.abs(y - yc) < HIT + 6 && x > Math.min(x1, x2) - HIT && x < Math.max(x1, x2) + HIT;
    },
  },
  datepricerange: {
    points: 2,
    label: "Date and price range",
    glyph: "⧉",
    draw(dc, d, sel) {
      const a = d.points[0];
      const b = d.points[1];
      const x1 = dc.xOfTime(a.time);
      const y1 = dc.yOfPrice(a.price);
      const x2 = dc.xOfTime(b.time);
      const y2 = dc.yOfPrice(b.price);
      const up = b.price >= a.price;
      const c = up ? dc.theme.up : dc.theme.down;
      const { ctx } = dc;
      ctx.save();
      ctx.fillStyle = c + "1e";
      ctx.strokeStyle = c;
      ctx.lineWidth = 1.3 * (dc.widthScale ?? 1);
      ctx.fillRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
      ctx.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
      ctx.restore();
      const diff = b.price - a.price;
      const pct = a.price ? (diff / a.price) * 100 : 0;
      const bars = dc.barsBetween(a.time, b.time);
      chip(dc, (x1 + x2) / 2, Math.min(y1, y2) - 11, `${diff >= 0 ? "+" : ""}${diff.toFixed(dc.decimals)} (${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%) · ${bars} bar${bars === 1 ? "" : "s"} · ${fmtDur(b.time - a.time)}`, c);
      if (sel) drawHandles(dc, [[x1, y1], [x2, y2], [x1, y2], [x2, y1]]);
    },
    hit(dc, d, x, y) {
      const x1 = dc.xOfTime(d.points[0].time);
      const y1 = dc.yOfPrice(d.points[0].price);
      const x2 = dc.xOfTime(d.points[1].time);
      const y2 = dc.yOfPrice(d.points[1].price);
      return x > Math.min(x1, x2) - HIT && x < Math.max(x1, x2) + HIT && y > Math.min(y1, y2) - HIT && y < Math.max(y1, y2) + HIT;
    },
  },
  // ---- VOLUME ANALYSIS: anchored VWAP, fixed-range volume profile ----
  // 1 click = the anchor bar. Body-movable (no per-point handle — see chart.handleHit), so dragging the
  // line re-anchors it in time. The line is the running Σ(tp·vol)/Σ(vol) from the anchor to the last bar.
  avwap: {
    points: 1,
    label: "Anchored VWAP",
    glyph: "V",
    draw(dc, d, sel) {
      const anchor = d.points[0];
      const seg = dc.barsInRange(anchor.time, Infinity);
      const c = col(dc, d);
      const xA = dc.xOfTime(anchor.time);
      if (!seg.length) return; // anchor past the last (or replay-hidden) bar → nothing to plot
      const totalVol = seg.reduce((s, b) => s + (b.volume ?? 0), 0);
      if (totalVol <= 0) {
        // Honest: with no volume the line would collapse to price — say so rather than draw a fake VWAP.
        chip(dc, xA, dc.yOfPrice(seg[0].close), "AVWAP · no volume", c, "left");
        return;
      }
      const vals = vwapAnchored(seg, anchor.time);
      const { ctx } = dc;
      ctx.save();
      ctx.strokeStyle = c;
      ctx.lineWidth = 1.6 * (dc.widthScale ?? 1);
      if (dc.dash) ctx.setLineDash(dc.dash);
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < seg.length; i++) {
        if (!isFinite(vals[i])) continue;
        const x = dc.xOfTime(seg[i].time);
        const y = dc.yOfPrice(vals[i]);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();
      const yA = dc.yOfPrice(vals[0]);
      ctx.save();
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(xA, yA, sel ? 4 : 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      const li = seg.length - 1;
      chip(dc, dc.xOfTime(seg[li].time), dc.yOfPrice(vals[li]), `AVWAP ${vals[li].toFixed(dc.decimals)}`, c, "left");
    },
    hit(dc, d, x, y) {
      const anchor = d.points[0];
      const seg = dc.barsInRange(anchor.time, Infinity);
      if (!seg.length) return false;
      const totalVol = seg.reduce((s, b) => s + (b.volume ?? 0), 0);
      if (totalVol <= 0) return Math.hypot(x - dc.xOfTime(anchor.time), y - dc.yOfPrice(seg[0].close)) < HIT + 4;
      const vals = vwapAnchored(seg, anchor.time);
      // Selectable near the anchor dot too — essential for a single-bar AVWAP (no polyline segment to hit).
      if (Math.hypot(x - dc.xOfTime(anchor.time), y - dc.yOfPrice(vals[0])) < HIT + 4) return true;
      let prev: [number, number] | null = null;
      for (let i = 0; i < seg.length; i++) {
        if (!isFinite(vals[i])) continue;
        const px = dc.xOfTime(seg[i].time);
        const py = dc.yOfPrice(vals[i]);
        if (prev && distToSeg(x, y, prev[0], prev[1], px, py) < HIT) return true;
        prev = [px, py];
      }
      return false;
    },
  },
  // 2 clicks box a time range; the profile spans the price range of the bars INSIDE it (standard fixed
  // range). Horizontal histogram of volume-by-price from the left edge, POC + 70% value area highlighted.
  volprofile: {
    points: 2,
    label: "Volume profile (fixed range)",
    glyph: "▤",
    draw(dc, d, sel) {
      const a = d.points[0];
      const b = d.points[1];
      const x1 = dc.xOfTime(a.time);
      const x2 = dc.xOfTime(b.time);
      const seg = dc.barsInRange(Math.min(a.time, b.time), Math.max(a.time, b.time));
      renderProfile(dc, seg, x1, x2, col(dc, d), dc.yOfPrice(a.price));
      if (sel) drawHandles(dc, [[x1, dc.yOfPrice(a.price)], [x2, dc.yOfPrice(b.price)]]);
    },
    hit(dc, d, x, y) {
      const x1 = dc.xOfTime(d.points[0].time);
      const y1 = dc.yOfPrice(d.points[0].price);
      const x2 = dc.xOfTime(d.points[1].time);
      const y2 = dc.yOfPrice(d.points[1].price);
      return x > Math.min(x1, x2) - HIT && x < Math.max(x1, x2) + HIT && y > Math.min(y1, y2) - HIT && y < Math.max(y1, y2) + HIT;
    },
  },
  // 1 click = the anchor bar; the profile spans the anchored range (anchor → the latest bar). Same
  // volume-by-price render as the fixed-range profile, so it tracks as new bars arrive.
  avolprofile: {
    points: 1,
    label: "Anchored volume profile",
    glyph: "▥",
    draw(dc, d, sel) {
      const anchor = d.points[0];
      const seg = dc.barsInRange(anchor.time, Infinity);
      const boxL = dc.xOfTime(anchor.time);
      if (!seg.length) return;
      const boxR = dc.xOfTime(seg[seg.length - 1].time);
      renderProfile(dc, seg, boxL, boxR, col(dc, d), dc.yOfPrice(anchor.price));
      if (sel) drawHandles(dc, [[boxL, dc.yOfPrice(anchor.price)]]);
    },
    hit(dc, d, x, y) {
      const anchor = d.points[0];
      const seg = dc.barsInRange(anchor.time, Infinity);
      if (!seg.length) return false;
      const boxL = dc.xOfTime(anchor.time);
      const boxR = dc.xOfTime(seg[seg.length - 1].time);
      const prof = volumeProfile(seg, 24);
      if (!prof) return Math.hypot(x - boxL, y - dc.yOfPrice(anchor.price)) < HIT + 6;
      const yTop = Math.min(dc.yOfPrice(prof.hi), dc.yOfPrice(prof.lo));
      const height = Math.abs(dc.yOfPrice(prof.lo) - dc.yOfPrice(prof.hi));
      return x > Math.min(boxL, boxR) - HIT && x < Math.max(boxL, boxR) + HIT && y > yTop - HIT && y < yTop + height + HIT;
    },
  },
  // 1 click = the anchor bar. Anchored VWAP with ±1σ / ±2σ envelope bands (volume-weighted stddev of
  // typical price about the running VWAP). Body-movable (see chart.handleHit) so a drag re-anchors.
  avwapbands: {
    points: 1,
    label: "Anchored VWAP + bands",
    glyph: "Ⅴ",
    draw(dc, d, sel) {
      const anchor = d.points[0];
      const seg = dc.barsInRange(anchor.time, Infinity);
      const c = col(dc, d);
      const xA = dc.xOfTime(anchor.time);
      if (!seg.length) return;
      const totalVol = seg.reduce((s, b) => s + (b.volume ?? 0), 0);
      if (totalVol <= 0) {
        chip(dc, xA, dc.yOfPrice(seg[0].close), "AVWAP · no volume", c, "left");
        return;
      }
      const { vwap, dev } = vwapAnchoredBands(seg, anchor.time);
      const { ctx } = dc;
      const band = (mult: number, alpha: string, width: number, dash?: number[]) => {
        ctx.save();
        ctx.strokeStyle = c + alpha;
        ctx.lineWidth = width * (dc.widthScale ?? 1);
        if (dash) ctx.setLineDash(dash);
        else if (dc.dash) ctx.setLineDash(dc.dash);
        ctx.beginPath();
        let started = false;
        for (let i = 0; i < seg.length; i++) {
          if (!isFinite(vwap[i])) continue;
          const x = dc.xOfTime(seg[i].time);
          const yv = dc.yOfPrice(vwap[i] + mult * dev[i]);
          if (!started) {
            ctx.moveTo(x, yv);
            started = true;
          } else ctx.lineTo(x, yv);
        }
        ctx.stroke();
        ctx.restore();
      };
      band(2, "44", 1, [4, 3]);
      band(-2, "44", 1, [4, 3]);
      band(1, "88", 1, [3, 2]);
      band(-1, "88", 1, [3, 2]);
      band(0, "", 1.6); // the VWAP itself, full colour
      const yA = dc.yOfPrice(vwap[0]);
      ctx.save();
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(xA, yA, sel ? 4 : 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      const li = seg.length - 1;
      chip(dc, dc.xOfTime(seg[li].time), dc.yOfPrice(vwap[li]), `AVWAP ${vwap[li].toFixed(dc.decimals)} ±σ`, c, "left");
    },
    hit(dc, d, x, y) {
      const anchor = d.points[0];
      const seg = dc.barsInRange(anchor.time, Infinity);
      if (!seg.length) return false;
      const totalVol = seg.reduce((s, b) => s + (b.volume ?? 0), 0);
      if (totalVol <= 0) return Math.hypot(x - dc.xOfTime(anchor.time), y - dc.yOfPrice(seg[0].close)) < HIT + 4;
      const { vwap } = vwapAnchoredBands(seg, anchor.time);
      if (Math.hypot(x - dc.xOfTime(anchor.time), y - dc.yOfPrice(vwap[0])) < HIT + 4) return true;
      let prev: [number, number] | null = null;
      for (let i = 0; i < seg.length; i++) {
        if (!isFinite(vwap[i])) continue;
        const px = dc.xOfTime(seg[i].time);
        const py = dc.yOfPrice(vwap[i]);
        if (prev && distToSeg(x, y, prev[0], prev[1], px, py) < HIT) return true;
        prev = [px, py];
      }
      return false;
    },
  },
  // Regression channel: ordinary-least-squares line through the closes in the selected bar range,
  // with ±1 standard-deviation parallel bands. The user anchors a left and right point; the channel
  // spans the bars between them and extends no further, so it is honest about the fit window.
  regchan: {
    points: 2,
    label: "Regression channel",
    glyph: "ℝ",
    draw(dc, d, sel) {
      const a = d.points[0];
      const b = d.points[1];
      const t0 = Math.min(a.time, b.time);
      const t1 = Math.max(a.time, b.time);
      const bars = dc.barsInRange(t0, t1);
      if (bars.length < 2) return;
      const lr = linReg(bars);
      if (!lr) return;
      const c = col(dc, d);
      const n = bars.length;
      const x0 = dc.xOfTime(bars[0].time);
      const x1 = dc.xOfTime(bars[n - 1].time);
      const mid0 = lr.intercept;
      const mid1 = lr.intercept + lr.slope * (n - 1);
      const ym0 = dc.yOfPrice(mid0);
      const ym1 = dc.yOfPrice(mid1);
      const yup0 = dc.yOfPrice(mid0 + lr.std);
      const yup1 = dc.yOfPrice(mid1 + lr.std);
      const ydn0 = dc.yOfPrice(mid0 - lr.std);
      const ydn1 = dc.yOfPrice(mid1 - lr.std);
      // fill ±1 SD band
      const { ctx } = dc;
      ctx.save();
      ctx.fillStyle = c + "14";
      ctx.beginPath();
      ctx.moveTo(x0, yup0);
      ctx.lineTo(x1, yup1);
      ctx.lineTo(x1, ydn1);
      ctx.lineTo(x0, ydn0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      // band edges (dashed) + regression spine (solid)
      line(dc, x0, ydn0, x1, ydn1, c, 1, [4, 3]);
      line(dc, x0, ym0, x1, ym1, c, 1.6);
      line(dc, x0, yup0, x1, yup1, c, 1, [4, 3]);
      // R² label on the midline
      const r2 = lr.r2.toFixed(3);
      chip(dc, (x0 + x1) / 2, ym0 + (ym1 - ym0) / 2 - 10, `R² ${r2}`, c);
      if (sel) drawHandles(dc, [[x0, ym0], [x1, ym1]]);
    },
    hit(dc, d, x, y) {
      const a = d.points[0];
      const b = d.points[1];
      const t0 = Math.min(a.time, b.time);
      const t1 = Math.max(a.time, b.time);
      const bars = dc.barsInRange(t0, t1);
      if (bars.length < 2) return false;
      const lr = linReg(bars);
      if (!lr) return false;
      const n = bars.length;
      const x0 = dc.xOfTime(bars[0].time);
      const x1 = dc.xOfTime(bars[n - 1].time);
      const ym0 = dc.yOfPrice(lr.intercept);
      const ym1 = dc.yOfPrice(lr.intercept + lr.slope * (n - 1));
      return distToSeg(x, y, x0, ym0, x1, ym1) < HIT * 2;
    },
  },
};

export const DRAW_TOOLS = Object.keys(DRAW_SPECS);
