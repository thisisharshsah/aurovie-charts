// Indicator maths are the one part of the engine that can be wrong *silently* — a mis-shifted
// Ichimoku span or an ADX that drifts past 100 still renders as a pretty line. These pin the
// definitions: NaN padding, the exact formulas, and the invariants each family must hold.
import { test } from "node:test";
import assert from "node:assert/strict";
import { permEntropy, phasor, ichimoku, supertrend, psar, keltner, adx, atr, ema, alpha, mix, fmtCountdown, placeAxisTag, fmtAxisTime, fmtCrosshairTime, isTimeBoundary, rightMarginBars, panFloorBars, projVisibleRange, fitBarCount, visibleIndexRange, offsetAfterAppend, DARK, THEMES, timeGridMarks, minorGridAlpha, minorLineAlpha, sectionKey, SECTION_STEPS, candleGridAlpha, drawTimeGrid, crisp, snapLine } from "./util.ts";
import type { AxisSlot, GridCtx, TimeMark } from "./util.ts";
import type { Bar } from "./types.ts";

// A deterministic synthetic series with a real up-leg then a down-leg, so trend indicators must flip.
function series(n: number): Bar[] {
  const bars: Bar[] = [];
  let p = 100;
  for (let i = 0; i < n; i++) {
    p += i < n / 2 ? 1.2 : -1.1;
    const wob = Math.sin(i * 1.7) * 0.6;
    const open = p - wob * 0.3;
    const close = p + wob * 0.3;
    bars.push({ time: 1700000000 + i * 60, open, high: Math.max(open, close) + 0.8, low: Math.min(open, close) - 0.8, close, volume: 1000 + i * 3 });
  }
  return bars;
}

test("ichimoku lines are channel midpoints, NaN-padded to their own periods", () => {
  const b = series(80);
  const ic = ichimoku(b, 9, 26, 52);
  assert.ok(Number.isNaN(ic.conversion[7]), "conversion needs 9 bars");
  assert.ok(!Number.isNaN(ic.conversion[8]));
  assert.ok(Number.isNaN(ic.baseLine[24]), "base needs 26 bars");
  assert.ok(!Number.isNaN(ic.baseLine[25]));
  assert.ok(Number.isNaN(ic.spanB[50]), "spanB needs 52 bars");
  assert.ok(!Number.isNaN(ic.spanB[51]));
  assert.equal(ic.shift, 26, "the renderer displaces the spans by this many bars");
  const i = 40;
  let h = -Infinity,
    l = Infinity;
  for (let j = i - 8; j <= i; j++) {
    h = Math.max(h, b[j].high);
    l = Math.min(l, b[j].low);
  }
  assert.ok(Math.abs(ic.conversion[i] - (h + l) / 2) < 1e-9, "conversion = (HH + LL) / 2");
  assert.ok(Math.abs(ic.spanA[i] - (ic.conversion[i] + ic.baseLine[i]) / 2) < 1e-9, "spanA = mean(conversion, base)");
});

test("supertrend flips direction on the reversal and rides the correct side of price", () => {
  const b = series(120);
  const st = supertrend(b, 10, 3);
  const dirs = st.dir.filter((d) => d !== 0);
  assert.ok(dirs.includes(1) && dirs.includes(-1), "must show both trends on an up-then-down series");
  for (let i = 0; i < b.length; i++) {
    if (Number.isNaN(st.line[i])) continue;
    if (st.dir[i] === 1) assert.ok(st.line[i] <= b[i].high + 1e-9, `up-trend stop above bar ${i}`);
    else assert.ok(st.line[i] >= b[i].low - 1e-9, `down-trend stop below bar ${i}`);
  }
});

test("psar stays outside price on its own side and flips with the swing", () => {
  const b = series(120);
  const s = psar(b);
  assert.ok(s.dir.includes(1) && s.dir.includes(-1));
  for (let i = 2; i < b.length; i++) {
    if (Number.isNaN(s.line[i])) continue;
    if (s.dir[i] === 1) assert.ok(s.line[i] <= b[i].high + 1e-9);
    else assert.ok(s.line[i] >= b[i].low - 1e-9);
  }
});

test("keltner rails are the EMA spine ± mult·ATR", () => {
  const b = series(60);
  const k = keltner(b, 20, 2, 10);
  const spine = ema(
    b.map((x) => x.close),
    20,
  );
  const a = atr(b, 10);
  const i = 50;
  assert.ok(Math.abs(k.mid[i] - spine[i]) < 1e-9);
  assert.ok(Math.abs(k.up[i] - (spine[i] + 2 * a[i])) < 1e-9);
  assert.ok(Math.abs(k.lo[i] - (spine[i] - 2 * a[i])) < 1e-9);
});

test("adx: DIs and ADX stay in 0..100, and the dominant DI follows the leg", () => {
  const b = series(120);
  const a = adx(b, 14);
  assert.ok(a.plusDI[55] > a.minusDI[55], "+DI dominates while rising");
  assert.ok(a.minusDI[110] > a.plusDI[110], "−DI dominates while falling");
  const vals = a.adx.filter((v) => !Number.isNaN(v));
  assert.ok(vals.length > 0, "ADX must produce values");
  for (const v of vals) assert.ok(v >= 0 && v <= 100, `ADX out of range: ${v}`);
  for (const v of [...a.plusDI, ...a.minusDI].filter((x) => !Number.isNaN(x))) assert.ok(v >= 0 && v <= 100);
});

test("alpha / mix convert hex exactly and fall back to color-mix for other colour syntaxes", () => {
  assert.equal(alpha("#00c805", 0.5), "rgba(0,200,5,0.5)");
  assert.equal(alpha("#fff", 1), "rgba(255,255,255,1)");
  assert.equal(alpha("oklch(0.7 0.1 140)", 0.25), "color-mix(in srgb, oklch(0.7 0.1 140) 25%, transparent)");
  assert.equal(mix("#000000", "#ffffff", 0.5), "rgb(128,128,128)");
  assert.equal(mix("#000000", "#ffffff", 0), "rgb(0,0,0)");
});

test("fmtCountdown renders mm:ss, rolls to h:mm:ss, and floors at zero", () => {
  assert.equal(fmtCountdown(59), "00:59");
  assert.equal(fmtCountdown(60), "01:00");
  assert.equal(fmtCountdown(3671), "1:01:11");
  assert.equal(fmtCountdown(-5), "00:00");
});

test("placeAxisTag: an uncontested tag keeps its exact position", () => {
  const slots: AxisSlot[] = [];
  assert.equal(placeAxisTag(100, 19, slots), 100);
  assert.equal(slots.length, 1);
});

test("placeAxisTag: the anchor keeps its slot and the level steps aside", () => {
  const slots: AxisSlot[] = [];
  const price = placeAxisTag(200, 30, slots); // live price, with a countdown sub-label
  const target = placeAxisTag(204, 19, slots, price); // a target 4px away — would have buried it
  assert.equal(price, 200, "the live price must not move");
  assert.ok(Math.abs(target - price) >= 24, `target still overlaps: ${target} vs ${price}`);
});

test("placeAxisTag: a level the market moves THROUGH swaps sides with it", () => {
  // The reorder is the point: entry sits below the market, the market rises through it, and the
  // entry row must end up above. A placement that only avoided collisions — or one that cached a
  // side — would leave the column claiming the trade is still waiting below.
  const run = (entryY: number) => {
    const slots: AxisSlot[] = [];
    const now = placeAxisTag(200, 19, slots);
    return { now, entry: placeAxisTag(entryY, 19, slots, now) };
  };
  const before = run(203); // entry 3px BELOW the live price (larger y): not reached yet
  const after = run(197); // the market has risen through it: the same entry is now ABOVE
  assert.ok(before.entry > before.now, `below before the cross: ${before.entry} vs ${before.now}`);
  assert.ok(after.entry < after.now, `above after the cross: ${after.entry} vs ${after.now}`);
});

test("placeAxisTag: a tag never crosses to the wrong side of the price", () => {
  const slots: AxisSlot[] = [];
  const price = placeAxisTag(200, 19, slots);
  const above = placeAxisTag(196, 19, slots, price); // 4px ABOVE (smaller y)
  const below = placeAxisTag(203, 19, slots, price); // 3px BELOW (larger y)
  // BOTH properties, or the test is satisfied by doing nothing: each must clear the price pill AND
  // land on the side it belongs to. Asserting only the side passes trivially when nothing moves.
  assert.ok(price - above >= 18, `must clear the price pill: ${above} vs ${price}`);
  assert.ok(below - price >= 18, `must clear the price pill: ${below} vs ${price}`);
  assert.ok(above < price, `a level above the price must stay above it: ${above} vs ${price}`);
  assert.ok(below > price, `a level below the price must stay below it: ${below} vs ${price}`);
});

test("placeAxisTag: entry, stop and target all end up readable", () => {
  // The real case: a bracket clustered around the live price, which is exactly when the old code
  // painted three opaque pills over the one that mattered.
  const slots: AxisSlot[] = [];
  const price = placeAxisTag(300, 30, slots);
  const placed = [301, 297, 304].map((y) => placeAxisTag(y, 19, slots, price));
  const all = [{ y: price, h: 30 }, ...placed.map((y) => ({ y, h: 19 }))];
  for (let i = 0; i < all.length; i++)
    for (let j = i + 1; j < all.length; j++) {
      const gap = Math.abs(all[i].y - all[j].y);
      const need = all[i].h / 2 + all[j].h / 2;
      assert.ok(gap >= need - 1, `pills ${i} and ${j} overlap: gap ${gap}, need ${need}`);
    }
  assert.equal(price, 300, "and the live price still holds its true position");
});

test("placeAxisTag: gives up rather than flinging a tag off the scale", () => {
  // A wall of claimed slots. Bounded search means it returns something near the ask, not 1000px away.
  const slots: AxisSlot[] = [];
  for (let y = 0; y < 400; y += 19) placeAxisTag(y, 19, slots);
  const at = placeAxisTag(200, 19, slots, 0);
  assert.ok(Math.abs(at - 200) <= 130, `flung too far: ${at}`);
});

// ---- time axis -------------------------------------------------------------
// The axis shipped labelling every intraday DAY BOUNDARY with a clock time, so a NEPSE 1H chart
// read "07:00 07:00 07:00" all the way across: the session open, repeated, in the reader's
// timezone rather than the exchange's. Both halves of that are pinned here.

test("fmtAxisTime labels an intraday day-boundary with the date, not the session open", () => {
  // 2026-08-12 11:00 UTC — the first bar of a NEPSE session, stored as exchange wall-clock.
  const t = Date.UTC(2026, 7, 12, 11, 0) / 1000;
  assert.equal(fmtAxisTime(t, true, true, true), "Aug 12");
  // A tick INSIDE the day still reads as a time.
  assert.equal(fmtAxisTime(t, true, false, true), "11:00");
});

test("fmtAxisTime in UTC mode does not shift with the reader's timezone", () => {
  const t = Date.UTC(2026, 7, 12, 11, 0) / 1000;
  // The local-clock reading is whatever the host TZ says; the UTC reading is fixed. Asserting the
  // fixed one is the point — a chart must not relabel itself per reader.
  assert.equal(fmtAxisTime(t, true, false, true), "11:00");
  assert.equal(fmtCrosshairTime(t, true, true), "Aug 12 11:00");
});

test("isTimeBoundary splits intraday bars by exchange day, not the reader's day", () => {
  const open1 = Date.UTC(2026, 7, 12, 11, 0) / 1000;
  const close1 = Date.UTC(2026, 7, 12, 15, 0) / 1000;
  const open2 = Date.UTC(2026, 7, 13, 11, 0) / 1000;
  const bar = (time: number): Bar => ({ time, open: 1, high: 1, low: 1, close: 1 });
  assert.equal(isTimeBoundary(bar(open1), bar(close1), true, true), false, "same session");
  assert.equal(isTimeBoundary(bar(close1), bar(open2), true, true), true, "next session");
  assert.equal(isTimeBoundary(undefined, bar(open1), true, true), true, "first bar always breaks");
});

// ---- forward projection geometry -------------------------------------------
// A projection lives in the empty margin past the newest bar. The failure modes are geometric and
// silent: a margin that does not grow hides the forecast behind the right edge, and a pan floor
// that does not clear the margin makes it unreachable by dragging.

test("rightMarginBars grows with the projection so the cone has somewhere to live", () => {
  assert.equal(rightMarginBars(0), 6, "no projection keeps the historical 6-bar margin");
  assert.equal(rightMarginBars(20), 26);
  assert.equal(rightMarginBars(-3), 6, "a negative length cannot shrink the margin");
});

test("panFloorBars always clears the right margin", () => {
  for (const k of [0, 1, 5, 14, 20, 60, 250]) {
    assert.ok(
      panFloorBars(k) >= rightMarginBars(k),
      `a projection of ${k} columns must be reachable by panning (floor ${panFloorBars(k)} < margin ${rightMarginBars(k)})`,
    );
  }
  assert.equal(panFloorBars(0), 20, "the old fixed ceiling is preserved when there is no projection");
});

test("projVisibleRange maps on-screen columns onto projection indices", () => {
  const n = 100; // bars 0..99; projection column k sits at index n+k
  // Whole projection on screen.
  assert.deepEqual(projVisibleRange(90, 120, n, 10), [0, 9]);
  // Scrolled so only the tail is visible.
  assert.deepEqual(projVisibleRange(105, 120, n, 10), [5, 9]);
  // Clipped by the projection's own length, not by the viewport.
  assert.deepEqual(projVisibleRange(90, 130, n, 4), [0, 3]);
});

test("projVisibleRange returns an empty range rather than an inverted one", () => {
  const n = 100;
  // Viewport ends before the projection starts — the common case while panned into history.
  assert.deepEqual(projVisibleRange(10, 50, n, 10), [0, -1]);
  // No projection at all.
  assert.deepEqual(projVisibleRange(90, 120, n, 0), [0, -1]);
  // An empty range must be safe to loop over.
  const [f, l] = projVisibleRange(10, 50, n, 10);
  let iterations = 0;
  for (let k = f; k <= l; k++) iterations++;
  assert.equal(iterations, 0);
});

test("fitBarCount keeps a candle legible on a narrow plot", () => {
  // The bug: a 375px phone (≈320px plot) opened on 160 bars — 2px each.
  const phone = fitBarCount(320, 800);
  assert.ok(phone <= 50, `phone fit should be modest, got ${phone}`);
  assert.ok(320 / phone >= 6, `phone bars should stay legible, got ${320 / phone}px`);
});

test("fitBarCount leaves the desktop fit where it was", () => {
  assert.equal(fitBarCount(1200, 800), 160);
  assert.equal(fitBarCount(3000, 800), 160); // a wider monitor gets bigger bars, not more history
});

test("fitBarCount never asks for more bars than exist", () => {
  assert.equal(fitBarCount(1200, 40), 40);
  assert.equal(fitBarCount(320, 12), 12);
});

test("fitBarCount floors at a handful rather than a few giant candles", () => {
  assert.equal(fitBarCount(60, 800), 30);
});

test("fitBarCount tolerates a zero-width plot during first layout", () => {
  assert.equal(fitBarCount(0, 800), 800);
  assert.equal(fitBarCount(-10, 800), 800);
  assert.equal(fitBarCount(320, 0), 0);
});

test("visibleIndexRange returns an inverted range for an empty series", () => {
  // The crash this pins: clamping into [0, n-1] with n === 0 gives -1 for BOTH ends, which every
  // `for (i = f; i <= l)` in the engine reads as one bar at index -1 — and `src[-1].low` throws.
  const [f, l] = visibleIndexRange(0, 0, 5);
  assert.ok(l < f, "empty range must be inverted so loops run zero times");
  let iterations = 0;
  for (let i = f; i <= l; i++) iterations++;
  assert.equal(iterations, 0);
});

test("visibleIndexRange clamps both ends into the series", () => {
  assert.deepEqual(visibleIndexRange(10, -4, 99), [0, 9]);
  assert.deepEqual(visibleIndexRange(10, 2, 7), [2, 7]);
  assert.deepEqual(visibleIndexRange(1, 0, 0), [0, 0]);
});

// ---- theme legibility ------------------------------------------------------
// A CONTRAST FLOOR, not a taste check.
//
// Every preset shipped a grid between 1.13:1 and 1.28:1 against its own background, and a
// hairline under about 1.35:1 is not a faint line — it is no line at all. The plot read as a
// void: nothing to place a candle against and no sense of where the chart surface even was. The
// failure is invisible to the person editing the palette, because they are picking colours next
// to each other rather than measuring one on the other, which is why it survived nine themes.
const srgb = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  return 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

test("every theme's grid and border are actually visible on their own background", () => {
  for (const [name, t] of Object.entries(THEMES)) {
    // Only the hex presets are measurable here; a host override may legitimately use any syntax.
    if (!/^#[0-9a-f]{6}$/i.test(t.background)) continue;
    const grid = contrast(t.grid, t.background);
    const border = contrast(t.border, t.background);
    assert.ok(grid >= 1.4, `${name}: grid is ${grid.toFixed(2)}:1 against its background — below the 1.4 floor`);
    assert.ok(border >= 1.65, `${name}: border is ${border.toFixed(2)}:1 against its background — below the 1.65 floor`);
    // …and still SECONDARY to the series. A grid that competes with the candles is its own bug.
    assert.ok(grid <= 2.2, `${name}: grid is ${grid.toFixed(2)}:1 — loud enough to compete with the bars`);
    assert.ok(border >= grid, `${name}: chrome hairlines must not be fainter than the grid`);
  }
});

test("timeGridMarks: a zoomed-in session with no section breaks still gets vertical rules", () => {
  const marks = timeGridMarks(100, 160, 12, () => false, () => 0, SECTION_STEPS.intraday);
  assert.ok(marks.length >= 5, `got ${marks.length}`);
  assert.ok(marks.every((m) => !m.major));
});

test("timeGridMarks: panning never moves a mark — positions do not depend on the first visible bar", () => {
  const isB = (i: number) => i % 78 === 0;
  const key = (i: number) => Math.floor(i / 78);
  const a = timeGridMarks(100, 400, 3, isB, key, SECTION_STEPS.intraday).map((m) => m.i);
  const b = timeGridMarks(137, 437, 3, isB, key, SECTION_STEPS.intraday).map((m) => m.i);
  const overlap = (xs: number[]) => xs.filter((i) => i >= 137 && i <= 400);
  assert.deepEqual(overlap(a), overlap(b));
});

test("timeGridMarks: zooming out thins crowded section breaks by a calendar stride", () => {
  // Monthly breaks every 21 bars at 1px/bar = 21px apart: needs every 3rd month to clear 54px.
  const isB = (i: number) => i % 21 === 0;
  const key = (i: number) => i / 21;
  const marks = timeGridMarks(0, 500, 1, isB, key, SECTION_STEPS.daily);
  assert.ok(marks.every((m) => m.major), "no minors between thinned sections");
  for (const m of marks) assert.equal((m.i / 21) % 3, 0);
});

test("timeGridMarks: in-between marks fade in continuously as the gap opens", () => {
  const at = (bs: number) => timeGridMarks(0, 400, bs, () => false, () => 0, SECTION_STEPS.intraday);
  // Either side of the stride change (8 bars × 6.75px = 54px) the visible set is identical:
  // the new odd multiples of 8 exist, but at ~zero alpha — nothing pops in.
  assert.deepEqual(at(6.74).map((m) => m.i), at(6.76).map((m) => m.i));
  const wide = at(10);
  assert.ok(wide.length > at(6.76).length);
  assert.ok(wide.every((m) => m.alpha > 0.9));
});

test("minorGridAlpha ramps from invisible to full across one nice-step interval", () => {
  assert.equal(minorGridAlpha(44), 0);
  assert.equal(minorGridAlpha(80), 1);
  assert.ok(minorGridAlpha(60) > 0 && minorGridAlpha(60) < 1);
});

test("sectionKey counts consecutive days and months", () => {
  const d1 = Date.UTC(2026, 0, 31, 15) / 1000;
  const d2 = Date.UTC(2026, 1, 1, 15) / 1000;
  assert.equal(sectionKey(d2, true, true) - sectionKey(d1, true, true), 1);
  assert.equal(sectionKey(d2, false, true) - sectionKey(d1, false, true), 1);
});

// A live chart parked at the right edge must follow a new bar; one scrolled into history must not jump.
test("a new bar shifts a view at the right edge by one bar, and leaves a scrolled-back view put", () => {
  const spacing = 8, tol = 24, edge = -400;
  assert.equal(offsetAfterAppend(edge, edge, tol, 1, spacing), edge - spacing, "at the edge: follows");
  assert.equal(offsetAfterAppend(edge + 10, edge, tol, 1, spacing), edge + 10 - spacing, "near the edge: follows");
  assert.equal(offsetAfterAppend(edge + 200, edge, tol, 1, spacing), edge + 200, "scrolled back: stays put");
  assert.equal(offsetAfterAppend(edge, edge, tol, 0, spacing), edge, "an in-place tick: no shift");
});

// The wiring: Chart.update must apply the shift. A bare Chart (no DOM) with layout and drawing stubbed.
test("Chart.update follows a new bar at the right edge, and leaves a scrolled-back view put", async () => {
  const { Chart } = await import("./chart.ts");
  const b = (time: number): Bar => ({ time, open: 1, high: 1, low: 1, close: 1, volume: 1 });
  const chartAt = (offset: number, dragging: object | null = null) => {
    const c = Object.assign(Object.create(Chart.prototype), {
      rawBars: [b(1), b(2)], bars: [] as Bar[], replayTo: null, barSpacing: 8, offset, dragging, zoomAnchor: null,
      plotW: () => 800, rightMarginPx: () => 0, recompute() {}, requestDraw() {},
      rebuildSeries() { this.bars = [...this.rawBars]; },
    });
    c.rebuildSeries();
    return c as { update(bar: Bar): void; offset: number };
  };
  const edge = 800 - 8; // plotW - rightMargin - (n - 1) * spacing, with n = 2
  const live = chartAt(edge);
  live.update(b(3));
  assert.equal(live.offset, edge - 8, "at the edge: follows");
  const back = chartAt(edge + 200);
  back.update(b(3));
  assert.equal(back.offset, edge + 200, "scrolled back: stays put");
  const held = chartAt(edge, { startOffset: edge });
  held.update(b(3));
  assert.equal(held.offset, edge, "mid-drag: the drag owns the offset");
});

// ---- permutation entropy + phasor (0.18.0) ---------------------------------------------------
// A deterministic noisy walk (LCG), so the no-repaint tests run on data with every pattern in it.
function walk(n: number): number[] {
  let s = 12345;
  let p = 100;
  return Array.from({ length: n }, (_, i) => {
    s = (s * 1103515245 + 12345) % 2147483648;
    p += (s / 2147483648 - 0.5) * 2 + Math.sin(i / 4);
    return p;
  });
}
const same = (a: number, b: number) => Object.is(a, b) || a === b;

test("permEntropy: a monotone or flat series is 0, and there is no value before window+m-1 closes", () => {
  const up = Array.from({ length: 50 }, (_, i) => 100 + i);
  const e = permEntropy(up, 3, 30);
  assert.ok(Number.isNaN(e[30]), "31 closes < 30+3-1: a gap, never 0");
  assert.equal(e[31], 0);
  assert.ok(e.slice(31).every((v) => v === 0));
  const down = permEntropy(up.map((v) => -v), 3, 30);
  assert.equal(down[49], 0);
  // ties rank by time: a flat run is the rising pattern, one pattern only → 0
  assert.equal(permEntropy(new Array(40).fill(7), 3, 30)[39], 0);
  // 5,5,6 and 5,6,6 are both "rising" under the time rule; ranking ties the other way splits them
  assert.equal(permEntropy([5, 5, 6, 6], 3, 2)[3], 0);
});

test("permEntropy: all six order-3 patterns equally often is exactly 1", () => {
  // the cyclic triples of 0,1,4,3,2,5 are the six distinct orderings, so any 30 consecutive
  // patterns hold each one five times
  const cyc = [0, 1, 4, 3, 2, 5];
  const src = Array.from({ length: 60 }, (_, i) => cyc[i % 6]);
  const e = permEntropy(src, 3, 30);
  for (let i = 31; i < 60; i++) assert.ok(Math.abs(e[i] - 1) < 1e-12, `bar ${i}: ${e[i]}`);
  // a window of 3 sees 3 of 6 patterns once each: log 3 / log 6
  assert.ok(Math.abs(permEntropy(src, 3, 3)[10] - Math.log(3) / Math.log(6)) < 1e-12);
});

test("NO REPAINT: entropy and phasor on bars[0..n] equal the same indices on bars[0..n+k]", () => {
  const full = walk(260);
  const n = 200;
  const short = full.slice(0, n);
  const eA = permEntropy(short, 3, 30);
  const eB = permEntropy(full, 3, 30);
  const pA = phasor(short, 20, 20);
  const pB = phasor(full, 20, 20);
  for (let i = 0; i < n; i++) {
    assert.ok(same(eA[i], eB[i]), `entropy repainted bar ${i}`);
    for (const k of ["i", "q", "amp", "phase"] as const) assert.ok(same(pA[k][i], pB[k][i]), `phasor ${k} repainted bar ${i}`);
  }
  assert.ok(!Number.isNaN(eA[n - 1]) && !Number.isNaN(pA.phase[n - 1]), "the compared tail is real values, not gaps");
});

test("phasor recovers the phase of a pure cosine within 0.05 rad after warm-up", () => {
  // close = 100 + cos(wt), period 20. The EMA detrend leaves x = Re((1 - H(w)) e^{iwt}) with
  // H(w) = k / (1 - (1-k) e^{-iw}), a fixed phase lead arg(1 - H); the FIR's lag puts z at t-3.
  const T = 20, w = (2 * Math.PI) / T, k = 2 / (20 + 1);
  const src = Array.from({ length: 400 }, (_, t) => 100 + Math.cos(w * t));
  const ph = phasor(src, 20, 20).phase;
  assert.ok(Number.isNaN(ph[24]) && !Number.isNaN(ph[25]), "first value at t = emaP + 5");
  const dr = 1 - (1 - k) * Math.cos(w), di = (1 - k) * Math.sin(w), d2 = dr * dr + di * di;
  const lead = Math.atan2(k * di / d2, 1 - (k * dr) / d2);
  let worst = 0;
  for (let t = 100; t < 400; t++) {
    const exp = w * (t - 3) + lead;
    worst = Math.max(worst, Math.abs(Math.atan2(Math.sin(ph[t] - exp), Math.cos(ph[t] - exp))));
  }
  assert.ok(worst < 0.05, `worst phase error ${worst} rad`);
});

test("phasor off its tuned period (cycle 30, period 20, EMA 10) still advances by w per bar", () => {
  // off period the FIR gain is not 1 and the circle flattens to an ellipse, so a single step may
  // be off w (measured worst 0.079 rad), but every step still advances and the mean step is w
  const w = (2 * Math.PI) / 30;
  const ph = phasor(Array.from({ length: 400 }, (_, t) => 100 + Math.cos(w * t)), 20, 10).phase;
  let sum = 0;
  for (let t = 100; t < 400; t++) {
    const d = Math.atan2(Math.sin(ph[t] - ph[t - 1]), Math.cos(ph[t] - ph[t - 1]));
    assert.ok(Math.abs(d - w) < 0.1, `bar ${t}: step ${d}`);
    sum += d;
  }
  assert.ok(Math.abs(sum / 300 - w) < 1e-6, `mean step ${sum / 300}`);
});

test("phasor and permEntropy refuse invalid inputs with gaps, never numbers", () => {
  const src = walk(80);
  for (const [per, eP] of [[20, 2.5], [0, 20], [-3, 20], [20, 1], [20.5, 20]]) assert.ok(phasor(src, per, eP).phase.every(Number.isNaN), `phasor(${per}, ${eP})`);
  for (const [m, win] of [[6, 30], [1, 30], [3, 0], [3, 2.5]]) assert.ok(permEntropy(src, m, win).every(Number.isNaN), `permEntropy(${m}, ${win})`);
});

test("a forming-candle tick changes only the last value of entropy and phasor", () => {
  // the same forming bar ticks from above its two predecessors to below them, so its pattern changes
  const base = walk(120);
  const hi = Math.max(base[117], base[118]);
  const lo = Math.min(base[117], base[118]);
  const src = [...base.slice(0, -1), hi + 2];
  const ticked = [...base.slice(0, -1), lo - 2];
  const [eA, eB] = [permEntropy(src, 3, 30), permEntropy(ticked, 3, 30)];
  const [pA, pB] = [phasor(src, 20, 20), phasor(ticked, 20, 20)];
  for (let i = 0; i < 119; i++) {
    assert.ok(same(eA[i], eB[i]), `entropy bar ${i} moved`);
    assert.ok(same(pA.phase[i], pB.phase[i]) && same(pA.amp[i], pB.amp[i]), `phasor bar ${i} moved`);
  }
  assert.notEqual(eA[119], eB[119], "the tick reaches the last entropy value");
  assert.notEqual(pA.phase[119], pB.phase[119], "the tick reaches the last phase");
});

// `Theme.minorGrid: false` is the pre-0.16 grid: no in-between lines on either axis. Absent or
// true keeps today's 0.55 × fade, so every other host's grid is unchanged.
test("minorLineAlpha: minors at 0.55 of their fade by default, none with minorGrid false", () => {
  assert.equal(minorLineAlpha(DARK, 1), 0.55);
  assert.equal(minorLineAlpha({ minorGrid: true }, 0.5), 0.275);
  assert.equal(minorLineAlpha({ ...DARK, minorGrid: false }, 1), 0);
  assert.equal(DARK.minorGrid, undefined);
});

// ---- Theme.candleGrid (0.21): a line per candle as you zoom in --------------------------------

// A canvas that logs what it is asked to stroke: one entry per stroke(), with its alpha and xs.
function fakeCtx() {
  const strokes: { alpha: number; xs: number[]; width: number }[] = [];
  let xs: number[] = [];
  const log: string[] = [];
  const ctx = {
    strokeStyle: "" as string,
    lineWidth: 1,
    globalAlpha: 1,
    save: () => log.push("save"),
    restore: () => log.push("restore"),
    beginPath: () => { xs = []; log.push("begin"); },
    moveTo: (x: number, y: number) => { xs.push(x); log.push(`m${x},${y}`); },
    lineTo: (x: number, y: number) => log.push(`l${x},${y}`),
    stroke: () => { strokes.push({ alpha: ctx.globalAlpha, xs, width: ctx.lineWidth }); log.push(`s${ctx.globalAlpha}/${ctx.lineWidth}/${ctx.strokeStyle}`); },
  };
  return { ctx: ctx as unknown as GridCtx, strokes, log };
}
const CG = { grid: "#888", candleGrid: true };
const noBreaks = (f: number, l: number, bs: number) => timeGridMarks(f, l, bs, () => false, () => 0, SECTION_STEPS.intraday);
// bar -> drawn alpha. x(i) = 100·i so every line maps back to its bar exactly.
function drawn(bs: number, f = 0, l = 400, t: Parameters<typeof drawTimeGrid>[1] = CG) {
  const { ctx, strokes } = fakeCtx();
  drawTimeGrid(ctx, t, noBreaks(f, l, bs), f, l, bs, (i) => i * 100, 1e9, 100);
  const out = new Map<number, number>();
  for (const s of strokes) for (const x of s.xs) out.set(Math.round(x / 100), s.alpha);
  return { out, strokes };
}

test("candleGridAlpha: continuous — no step anywhere along the zoom", () => {
  for (const L of [1, 2, 4, 8])
    for (let bs = 0.5; bs < 200; bs += 0.01) {
      const d = Math.abs(candleGridAlpha(L, bs + 0.01) - candleGridAlpha(L, bs));
      assert.ok(d < 0.002, `stride ${L} jumps ${d} at bar spacing ${bs}`);
    }
});

test("candleGridAlpha: never fades out as you zoom in, and coarser strides lead finer ones", () => {
  for (const L of [1, 2, 4, 8])
    for (let bs = 0.5; bs < 200; bs += 0.05) {
      assert.ok(candleGridAlpha(L, bs + 0.05) >= candleGridAlpha(L, bs), `stride ${L} dims at ${bs}`);
      if (L > 1) assert.ok(candleGridAlpha(L, bs) >= candleGridAlpha(L / 2, bs));
    }
});

test("candleGridAlpha: per-candle lines at full minor strength zoomed in, none zoomed out", () => {
  assert.equal(candleGridAlpha(1, 40), 0.55);
  assert.equal(candleGridAlpha(1, 120), 0.55);
  assert.equal(candleGridAlpha(1, 8), 0);
  assert.equal(candleGridAlpha(8, 4), 0, "the gate holds the whole ladder off below 4px candles");
  assert.ok(candleGridAlpha(1, 20) > 0 && candleGridAlpha(1, 20) < 0.55);
  assert.equal(candleGridAlpha(16, 40), candleGridAlpha(8, 40), "strides past 8 hold stride 8's alpha");
});

test("drawTimeGrid candleGrid: every bar carries a line when zoomed in, only the default grid zoomed out", () => {
  const near = drawn(40).out;
  for (let i = 1; i <= 400; i++) assert.ok(near.has(i), `bar ${i} has no line at 40px`);
  // zoomed out the ladder is gated off: what is drawn is what the default grid draws
  const far = fakeCtx(), def = fakeCtx();
  const marks = noBreaks(0, 4000, 2);
  drawTimeGrid(far.ctx, CG, marks, 0, 4000, 2, (i) => i * 2, 1e9, 100);
  drawTimeGrid(def.ctx, { grid: "#888" }, marks, 0, 4000, 2, (i) => i * 2, 1e9, 100);
  const bars = (s: typeof far.strokes) => s.flatMap((k) => k.xs).map((x) => Math.round(x / 2)).sort((a, b) => a - b);
  assert.deepEqual(bars(far.strokes), bars(def.strokes));
});

test("drawTimeGrid candleGrid: nested strides — zooming never moves a line, only adds or fades it", () => {
  let prev: Set<number> | null = null;
  for (let bs = 3; bs <= 60; bs++) {
    const { out } = drawn(bs);
    for (const [i] of out) assert.ok(Number.isInteger(i));
    const bars = new Set(out.keys());
    if (prev) for (const i of prev) assert.ok(bars.has(i), `bar ${i}'s line vanished zooming in to ${bs}px`);
    prev = bars;
  }
  // panning: the same bars carry the same lines wherever the view starts
  const a = drawn(12, 0, 400).out, b = drawn(12, 37, 437).out;
  for (let i = 37; i <= 400; i++) assert.equal(a.get(i), b.get(i), `bar ${i} changed under a pan`);
});

test("drawTimeGrid candleGrid: a bar's drawn alpha moves smoothly with the zoom, never pops", () => {
  for (const i of [1, 2, 3, 4, 6, 8, 12, 16, 24, 33, 64]) {
    let last = drawn(1).out.get(i) ?? 0;
    for (let bs = 1.005; bs < 120; bs *= 1.005) { // a wheel notch scales the zoom, so step by ratio
      const a = drawn(bs, 0, 70).out.get(i) ?? 0;
      assert.ok(Math.abs(a - last) <= 0.05, `bar ${i}: ${last} -> ${a} at ${bs}px`);
      assert.ok(a >= last - 1e-9, `bar ${i} dims zooming in at ${bs}px`);
      last = a;
    }
  }
});

test("drawTimeGrid candleGrid: bounded strokes, one path per alpha, majors last on top", () => {
  const isB = (i: number) => i % 78 === 0;
  for (const bs of [0.3, 2, 5, 9, 14, 25, 40, 80]) {
    const l = 100000;
    const marks = timeGridMarks(0, l, bs, isB, (i) => Math.floor(i / 78), SECTION_STEPS.intraday);
    const { ctx, strokes } = fakeCtx();
    drawTimeGrid(ctx, CG, marks, 0, l, bs, (i) => i * bs, 1e9, 100);
    assert.ok(strokes.length <= 33, `${strokes.length} strokes at ${bs}px`);
    assert.equal(strokes[strokes.length - 1].alpha, 1, "majors go last");
    assert.equal(new Set(strokes.map((s) => s.alpha)).size, strokes.length, "one stroke per alpha");
  }
});

test("drawTimeGrid candleGrid: lines sit on the device pixel grid at any devicePixelRatio", () => {
  for (const dpr of [1, 1.5, 2, 3]) {
    const { ctx, strokes } = fakeCtx();
    drawTimeGrid(ctx, CG, noBreaks(0, 50, 23.37), 0, 50, 23.37, (i) => i * 23.37, 1e9, 100, dpr);
    const lw = strokes[0].width * dpr;
    assert.equal(Math.round(lw), lw);
    for (const s of strokes) for (const x of s.xs) assert.ok(Math.abs(x * dpr - lw / 2 - Math.round(x * dpr - lw / 2)) < 1e-9, `blurry at dpr ${dpr}: ${x}`);
  }
});

test("snapLine: the wick's column — equal to crisp() at 1×, 2× and 3×", () => {
  for (let v = -20; v < 200; v += 0.037)
    for (const dpr of [1, 2, 3]) assert.ok(Math.abs(snapLine(v, dpr) - crisp(v)) < 1e-9, `${v} at ${dpr}×: ${snapLine(v, dpr)} vs ${crisp(v)}`);
  for (let v = 0; v < 50; v += 0.037) assert.ok(Math.abs(snapLine(v, 1.5) - crisp(v)) <= 0.5 / 1.5 + 1e-9);
});

test("drawTimeGrid candleGrid: no gap beside a section break — bar 16 is never fainter than bar 17", () => {
  const isB = (i: number) => i === 15 || i === 47;
  const key = (i: number) => (i < 15 ? 0 : i < 47 ? 1 : 2);
  const at = (bs: number) => {
    const { ctx, strokes } = fakeCtx();
    drawTimeGrid(ctx, CG, timeGridMarks(0, 80, bs, isB, key, SECTION_STEPS.intraday), 0, 80, bs, (i) => i * 100, 1e9, 100);
    const out = new Map<number, number>();
    for (const s of strokes) for (const x of s.xs) out.set(Math.round(x / 100), s.alpha);
    return out;
  };
  const near = at(40);
  for (let i = 1; i <= 80; i++) if (!isB(i)) assert.ok((near.get(i) ?? 0) >= candleGridAlpha(1, 40) - 1 / 64, `bar ${i} at ${near.get(i)}`);
  for (let bs = 3; bs <= 60; bs += 0.5) {
    const out = at(bs);
    for (const [c, f] of [[16, 17], [48, 49], [32, 33]]) assert.ok((out.get(c) ?? 0) >= (out.get(f) ?? 0), `bar ${c} fainter than ${f} at ${bs}px`);
  }
});

test("drawTimeGrid without candleGrid strokes exactly what 0.20 did", () => {
  const ref = (ctx: GridCtx, t: { grid: string; minorGrid?: boolean }, marks: TimeMark[], x: (i: number) => number, pw: number, h: number) => {
    ctx.save();
    ctx.strokeStyle = t.grid;
    ctx.lineWidth = 1;
    for (const m of marks) {
      const px = x(m.i);
      if (px < 0 || px > pw) continue;
      ctx.globalAlpha = m.major ? 1 : minorLineAlpha(t, m.alpha);
      ctx.beginPath();
      ctx.moveTo(crisp(px), 0);
      ctx.lineTo(crisp(px), h);
      ctx.stroke();
    }
    ctx.restore();
  };
  const isB = (i: number) => i % 78 === 0;
  for (const t of [{ grid: "#888" }, { grid: "#888", minorGrid: false }, { grid: "#888", candleGrid: false }])
    for (const bs of [0.7, 3, 12, 40, 90]) {
      const marks = timeGridMarks(100, 900, bs, isB, (i) => Math.floor(i / 78), SECTION_STEPS.intraday);
      const x = (i: number) => (i - 100) * bs - 13.3;
      const a = fakeCtx(), b = fakeCtx();
      drawTimeGrid(a.ctx, t, marks, 100, 900, bs, x, 800, 300, 2);
      ref(b.ctx, t, marks, x, 800, 300);
      assert.deepEqual(a.log, b.log);
    }
});
