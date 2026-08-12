// Indicator maths are the one part of the engine that can be wrong *silently* — a mis-shifted
// Ichimoku span or an ADX that drifts past 100 still renders as a pretty line. These pin the
// definitions: NaN padding, the exact formulas, and the invariants each family must hold.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ichimoku, supertrend, psar, keltner, adx, atr, ema, alpha, mix, fmtCountdown, placeAxisTag } from "./util.ts";
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
