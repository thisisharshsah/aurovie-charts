// A host theme may hand up/down as rgba (Everest's 0.88 bodies). A drawing that appends a hex alpha
// ("rgba(...)22") makes an invalid colour the canvas silently ignores — every colour set must parse.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DRAW_SPECS, type DrawCtx } from "./drawings.ts";
import { DARK } from "./util.ts";

test("every drawing builds valid colours from a non-hex up/down", () => {
  const set: string[] = [];
  const ctx = new Proxy({} as Record<string | symbol, unknown>, {
    get: (t, k) => (k in t ? t[k] : k === "measureText" ? () => ({ width: 10 }) : () => {}),
    set: (t, k, v) => { if (k === "fillStyle" || k === "strokeStyle") set.push(v); t[k] = v; return true; },
  });
  const theme = { ...DARK, up: "rgba(0, 200, 5, 0.88)", down: "rgba(255, 90, 14, 0.88)", line: "rgb(41, 98, 255)" };
  const bar = (time: number, p: number) => ({ time, open: p, high: p + 1, low: p - 1, close: p, volume: 100 });
  const dc = {
    ctx, theme, xOfTime: (t: number) => t, yOfPrice: (p: number) => 200 - p, priceAtY: (y: number) => 200 - y, timeAtX: (x: number) => x,
    barsBetween: () => 3, barsInRange: (a: number, b: number) => [bar(a, 100), bar((a + b) / 2, 110), bar(b, 120)],
    lastPrice: 110, decimals: 2, plotW: 400, plotH: 300, widthScale: 1,
  } as unknown as DrawCtx;
  for (const [kind, spec] of Object.entries(DRAW_SPECS)) {
    const points = [{ time: 10, price: 100 }, { time: 50, price: 130 }, { time: 90, price: 90 }].slice(0, Math.max(spec.points, 2));
    spec.draw(dc, { id: 1, type: kind, points, text: "x" }, true);
  }
  assert.ok(set.length > 0);
  for (const c of set) assert.doesNotMatch(String(c), /\)[0-9a-f]+$/i, `invalid colour ${c}`);
});
