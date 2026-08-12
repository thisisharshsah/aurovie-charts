// Price-movement resampling — the chart types that drop the time axis and redraw price as fixed
// increments: Renko bricks and Point & Figure columns. Each transforms a time-ordered Bar[] into a
// NEW Bar[] whose length is driven by how far price MOVED, not by how much time passed. The engine
// then renders / autoscales / runs indicators over these synthetic bars exactly as it would candles
// (which is how TradingView computes indicators on Renko too).
import type { Bar } from "./types";
import { atr } from "./util";

// Auto box size: ATR(14) of the source rounded to a friendly 1/2/5 step, so a $324 stock gets a
// ~$2 brick and a $30 one a ~$0.20 brick. Falls back to 1% of the last price when ATR is undefined
// (too few bars) so even thin data still resamples instead of going blank.
export function autoBox(bars: Bar[]): number {
  if (!bars.length) return 1;
  const last = Math.abs(bars[bars.length - 1].close) || 1;
  let box = 0;
  const a = atr(bars, 14);
  for (let i = a.length - 1; i >= 0; i--) {
    if (!isNaN(a[i])) { box = a[i]; break; }
  }
  if (!(box > 0)) box = last * 0.01;
  const mag = Math.pow(10, Math.floor(Math.log10(box)));
  const n = box / mag;
  const nice = n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10;
  box = nice * mag;
  return box > 0 ? box : 1;
}

// Renko: a new brick every time the close moves one full `box` beyond the current brick's far edge.
// Because a brick spans [top-box, top] (or [bottom, bottom+box]), a reversal needs price to travel
// two boxes — the classic close-based Renko. Up bricks come back open<close (green), down open>close
// (red); high/low hug the body so the engine's candle math draws them wickless, i.e. as bricks.
export function computeRenko(bars: Bar[], box: number): Bar[] {
  if (bars.length < 2 || !(box > 0)) return [];
  const out: Bar[] = [];
  let top = bars[0].close;
  let bottom = bars[0].close;
  for (let i = 1; i < bars.length; i++) {
    const c = bars[i].close;
    const t = bars[i].time;
    const start = out.length;
    let guard = 0;
    while (c >= top + box && guard++ < 100000) {
      const o = top;
      const cl = top + box;
      out.push({ time: t, open: o, high: cl, low: o, close: cl, volume: 0 });
      top = cl;
      bottom = top - box;
    }
    while (c <= bottom - box && guard++ < 100000) {
      const o = bottom;
      const cl = bottom - box;
      out.push({ time: t, open: o, high: o, low: cl, close: cl, volume: 0 });
      bottom = cl;
      top = bottom + box;
    }
    // Spread this source bar's volume across the bricks it spawned — repeating the full amount on
    // every brick would inflate the volume pane (and over-report per-brick volume on hover).
    const n = out.length - start;
    if (n > 0) {
      const share = (bars[i].volume ?? 0) / n;
      for (let k = start; k < out.length; k++) out[k].volume = share;
    }
  }
  return out;
}

// A Kagi line segment in (column, price) space: vertical runs sit at one column, horizontal shoulder
// connectors span two. `yang` = the thick/bullish state (line has exceeded the prior high); !yang is
// the thin/bearish "yin". The renderer maps column→x and price→y and strokes thick-or-thin per seg.
export interface KagiSeg {
  c0: number;
  p0: number;
  c1: number;
  p1: number;
  yang: boolean;
}

// Kagi: a continuous line that extends with price, turns (a horizontal step to a new column, then a
// vertical run) only when price reverses by `box` from the current extreme, and switches thickness at
// the moment it crosses the prior shoulder — thick "yang" once it breaks the previous high, thin
// "yin" once it breaks the previous low. Returns render segments + one display bar per column (its
// vertical span) so autoscale + crosshair behave like any series.
export function computeKagi(bars: Bar[], box: number): { bars: Bar[]; segs: KagiSeg[] } {
  if (bars.length < 2 || !(box > 0)) return { bars: [], segs: [] };
  const closes = bars.map((b) => b.close);
  const times = bars.map((b) => b.time);
  // 1) extract the turning extremes (peaks/troughs) with the box-reversal rule.
  const startPrice = closes[0];
  const peaks: { price: number; dir: 1 | -1; time: number }[] = [];
  let dir: 0 | 1 | -1 = 0;
  let last = closes[0];
  let lastTime = times[0];
  for (let i = 1; i < closes.length; i++) {
    const p = closes[i];
    const t = times[i];
    if (dir === 0) {
      if (p >= last + box) { dir = 1; last = p; lastTime = t; }
      else if (p <= last - box) { dir = -1; last = p; lastTime = t; }
    } else if (dir === 1) {
      if (p > last) { last = p; lastTime = t; }
      else if (p <= last - box) { peaks.push({ price: last, dir: 1, time: lastTime }); dir = -1; last = p; lastTime = t; }
    } else {
      if (p < last) { last = p; lastTime = t; }
      else if (p >= last + box) { peaks.push({ price: last, dir: -1, time: lastTime }); dir = 1; last = p; lastTime = t; }
    }
  }
  peaks.push({ price: last, dir: dir === 0 ? 1 : dir, time: lastTime });
  // 2) build columns, render segments, and the yin/yang thickness (flips at a prior-shoulder cross).
  const segs: KagiSeg[] = [];
  const outBars: Bar[] = [];
  let prevLevel = startPrice;
  let prevHigh: number | null = null;
  let prevLow: number | null = null;
  let yang = peaks[0].dir === 1;
  for (let k = 0; k < peaks.length; k++) {
    const dirK = peaks[k].dir;
    const end = peaks[k].price;
    if (k > 0) segs.push({ c0: k - 1, p0: prevLevel, c1: k, p1: prevLevel, yang }); // shoulder connector
    let flip: { level: number; yang: boolean } | null = null;
    if (dirK === 1 && prevHigh != null && prevLevel < prevHigh && prevHigh < end) flip = { level: prevHigh, yang: true };
    else if (dirK === -1 && prevLow != null && end < prevLow && prevLow < prevLevel) flip = { level: prevLow, yang: false };
    if (flip) {
      segs.push({ c0: k, p0: prevLevel, c1: k, p1: flip.level, yang });
      segs.push({ c0: k, p0: flip.level, c1: k, p1: end, yang: flip.yang });
      yang = flip.yang;
    } else {
      segs.push({ c0: k, p0: prevLevel, c1: k, p1: end, yang });
    }
    outBars.push({ time: peaks[k].time, open: prevLevel, close: end, high: Math.max(prevLevel, end), low: Math.min(prevLevel, end) });
    if (dirK === 1) prevHigh = end; else prevLow = end;
    prevLevel = end;
  }
  return { bars: outBars, segs };
}

// A Point & Figure column: a run of X's (dir +1, price rising) or O's (dir -1, falling), stored as
// an inclusive box-level range [lo, hi] plus the time of the bar that last extended it.
export interface PnfCol {
  dir: 1 | -1;
  lo: number; // lowest box level (integer, price = lo*box)
  hi: number; // highest box level (integer, cell tops at (hi+1)*box)
  time: number;
  volume?: number;
}

// Point & Figure: quantise price to integer box levels; extend the current column while price keeps
// going its way (X uses the high, O uses the low), and start a new opposite column only when price
// reverses by `reversal` boxes (classic 3). Returns both the column meta (for the X/O renderer) and
// price-unit display bars (open/close = column ends) so autoscale + crosshair work like any series.
export function computePnf(bars: Bar[], box: number, reversal: number): { bars: Bar[]; cols: PnfCol[] } {
  if (bars.length < 1 || !(box > 0)) return { bars: [], cols: [] };
  const q = (p: number) => Math.floor(p / box);
  const cols: PnfCol[] = [];
  let dir: 1 | -1 = 1;
  let top = q(bars[0].high);
  let bot = q(bars[0].low);
  if (top < bot) top = bot;
  let time = bars[0].time;
  for (let i = 1; i < bars.length; i++) {
    const h = q(bars[i].high);
    const l = q(bars[i].low);
    const t = bars[i].time;
    if (dir === 1) {
      if (h > top) { top = h; time = t; }
      else if (l <= top - reversal) {
        cols.push({ dir: 1, lo: bot, hi: top, time });
        dir = -1; top = top - 1; bot = l; time = t;
      }
    } else {
      if (l < bot) { bot = l; time = t; }
      else if (h >= bot + reversal) {
        cols.push({ dir: -1, lo: bot, hi: top, time });
        dir = 1; bot = bot + 1; top = h; time = t;
      }
    }
  }
  cols.push({ dir, lo: bot, hi: top, time });
  const outBars: Bar[] = cols.map((c) => {
    const loP = c.lo * box;
    const hiP = (c.hi + 1) * box;
    return { time: c.time, open: c.dir === 1 ? loP : hiP, high: hiP, low: loP, close: c.dir === 1 ? hiP : loP };
  });
  return { bars: outBars, cols };
}
