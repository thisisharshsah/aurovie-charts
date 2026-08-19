// Indicator maths are the one part of the engine that can be wrong *silently* — a mis-shifted
// Ichimoku span or an ADX that drifts past 100 still renders as a pretty line. These pin the
// definitions: NaN padding, the exact formulas, and the invariants each family must hold.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ichimoku, supertrend, psar, keltner, adx, atr, ema, alpha, mix, fmtCountdown, placeAxisTag, fmtAxisTime, fmtCrosshairTime, isTimeBoundary, rightMarginBars, panFloorBars, projVisibleRange, fitBarCount, visibleIndexRange, THEMES } from "./util.ts";
import type { AxisSlot } from "./util.ts";
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
