import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CONTROL, DEPTH, RADIUS, bottomBarParts, SHEET, SPACE, TYPE, contrast, cx, legendExtraParts, legendLine, legendVolume, readable, themeVars } from "./ui";
import { DARK, LIGHT, THEMES } from "../src/util";

// The failure this exists to prevent: the widget paints every SELECTED control's label in
// `theme.line`, and on the built-in light theme that is gold #ebae3d on white — 1.97:1. The
// active state of every button in the toolbar was effectively invisible on a white chart, and a
// host pointing `line` at its own brand colour inherits the same bug with its own hue.
test("the accent is made readable as text on any background", () => {
  assert.ok(contrast(LIGHT.line, LIGHT.background) < 3, "precondition: the raw accent fails on white");
  for (const [name, t] of Object.entries(THEMES)) {
    if (!/^#[0-9a-f]{6}$/i.test(t.background)) continue;
    const ink = readable(t.line, t.background, 4.5);
    assert.ok(contrast(ink, t.background) >= 4.5, `${name}: accent ink is ${contrast(ink, t.background).toFixed(2)}:1`);
  }
  // An arbitrary host brand colour, not just the presets we ship.
  for (const brand of ["#ffdd00", "#00c805", "#5b3fe0", "#ff5000", "#111111"]) {
    for (const bg of ["#ffffff", "#0e0e10"]) {
      assert.ok(contrast(readable(brand, bg, 4.5), bg) >= 4.5, `${brand} on ${bg}`);
    }
  }
});

// Darkening a colour that already passes would drift every dark theme's accent for no reason.
test("a colour that already passes is returned untouched", () => {
  assert.equal(readable(DARK.line, DARK.background, 4.5), DARK.line);
  assert.equal(readable("#ffffff", "#000000", 4.5), "#ffffff");
});

test("themeVars stamps the accent in both its hue and its ink form", () => {
  const v = themeVars(LIGHT) as Record<string, string>;
  assert.equal(v["--ac-accent"], LIGHT.line, "the hue is untouched — fills and strokes still want it");
  assert.notEqual(v["--ac-accent-ink"], LIGHT.line, "the ink is the corrected one");
  assert.ok(contrast(v["--ac-accent-ink"], LIGHT.background) >= 4.5);
});

// The scales are the point of the refactor: a value off the ramp is how eleven type sizes and
// nine radii happened in the first place.
test("the scales are a grid, not a pile of literals", () => {
  for (const v of Object.values(SPACE)) assert.equal(v % 4, 0, `spacing ${v} is off the 4px grid`);
  for (const v of Object.values(CONTROL)) assert.equal(v % 4, 0, `control height ${v} is off the 4px grid`);
  const radii = Object.values(RADIUS).filter((r) => r < 100);
  assert.deepEqual([...radii].sort((a, b) => a - b), radii, "the radius ramp must ascend");
  const type = Object.values(TYPE);
  assert.deepEqual([...type].sort((a, b) => a - b), type, "the type scale must ascend");
  for (const v of type) assert.equal(v, Math.round(v), `type size ${v} is fractional — it renders as an inconsistent pixel, not half of one`);
});

test("cx drops falsy parts so a conditional class cannot print 'false'", () => {
  assert.equal(cx("ac-btn", false, null, undefined, "is-on"), "ac-btn is-on");
});

// ── The depth preset ────────────────────────────────────────────────────────────────────────
//
// `mode` is a layer of defaults beneath the individual props. The component only ever writes
// `prop ?? DEPTH[mode].thing ?? oldDefault`, so these three properties are the whole contract.

test("advanced has no opinion, so it cannot change an existing host", () => {
  // Every key absent means every `prop ?? DEPTH.advanced.x ?? default` falls through to the
  // default that existed before the preset did. A host that never passes `mode` is untouched.
  assert.deepEqual(DEPTH.advanced, {}, "advanced must stay empty — anything here is a silent breaking change");
});

test("simple strips the working chrome and keeps the chart", () => {
  const s = DEPTH.simple;
  assert.equal(s.toolbar, false);
  assert.equal(s.drawingRail, false);
  assert.equal(s.legend, "none");
  assert.equal(s.chartType, "baseline");
  // The baseline series draws no endpoint dot of its own.
  assert.equal(s.endpointMarker, true);
  // Explicit false, NOT undefined: "this view has no volume" is a different statement from
  // "the user's saved preference decides", and only one of them survives a page reload.
  assert.equal(s.volume, false, "volume must be stated, not left to the saved preference");
  assert.ok(Object.prototype.hasOwnProperty.call(s, "volume"));
});

test("simple keeps the price axis and drops only the time axis", () => {
  // A price with no scale beside it is not simpler, it is vaguer — and the range pills already
  // say which window is on screen, so the time axis is the one that can go.
  assert.deepEqual(DEPTH.simple.axes, { price: true, time: false });
});

test("an explicit prop still wins over the mode", () => {
  // The resolution the component performs, reproduced exactly: prop, then preset, then default.
  const resolve = <T,>(prop: T | undefined, preset: T | undefined, fallback: T): T =>
    prop ?? preset ?? fallback;
  assert.equal(resolve(true, DEPTH.simple.volume, false), true, "mode=simple volume -> volume on");
  assert.equal(resolve(undefined, DEPTH.simple.volume, false), false, "mode=simple alone -> volume off");
  assert.equal(resolve(undefined, DEPTH.advanced.volume, false), false, "advanced defers to the old default");
  assert.equal(resolve(false, DEPTH.simple.toolbar, true), false);
  assert.equal(resolve(true, DEPTH.simple.toolbar, true), true, "mode=simple toolbar -> toolbar back");
});


// ── Size variables (0.17) ───────────────────────────────────────────────────────────────────
//
// A host can put the widget on its own size scale through `Theme.radii` / `Theme.controlHeights`,
// and a host that passes neither must see exactly the 0.16 sizes.

test("theme radii and control heights reach the root element's style", () => {
  const v = themeVars({
    ...DARK,
    radii: { xs: "var(--radius-0)", md: 8, pill: "var(--radius-pill)" },
    controlHeights: { mini: 24, sm: "var(--control-sm)", btn: "var(--control-sm)", md: "var(--control-md)", touch: "var(--control-touch)" },
  }) as Record<string, string>;
  assert.equal(v["--ac-r-xs"], "var(--radius-0)");
  assert.equal(v["--ac-r-md"], "8px", "a number is px");
  assert.equal(v["--ac-r-pill"], "var(--radius-pill)");
  assert.equal(v["--ac-h-mini"], "24px");
  assert.equal(v["--ac-h-sm"], "var(--control-sm)");
  assert.equal(v["--ac-h-btn"], "var(--control-sm)");
  assert.equal(v["--ac-h-md"], "var(--control-md)");
  assert.equal(v["--ac-hit-touch"], "var(--control-touch)");
  assert.equal(v["--ac-r-sm"], undefined, "an entry the theme leaves out is not written");
});

test("without them no size variable is written", () => {
  for (const t of Object.values(THEMES)) {
    const keys = Object.keys(themeVars(t)).filter((k) => /^--ac-(r|h|hit)-/.test(k));
    assert.deepEqual(keys, []);
  }
});

test("every size variable in the stylesheet falls back to the 0.16 px", () => {
  const want: Record<string, number> = {
    "--ac-r-xs": 6, "--ac-r-sm": 8, "--ac-r-md": 10, "--ac-r-lg": 14, "--ac-r-xl": 16,
    "--ac-h-mini": 20, "--ac-h-xs": 24, "--ac-h-sm": 28, "--ac-h-btn": 32, "--ac-h-md": 32,
    "--ac-hit-touch": 0,
  };
  const seen = new Set<string>();
  for (const [, name, px] of SHEET.matchAll(/var\((--ac-(?:r|h|hit)-[\w-]+),\s*(\d+)px\)/g)) {
    assert.equal(Number(px), want[name], `${name} falls back to ${px}px`);
    seen.add(name);
  }
  assert.deepEqual([...seen].sort(), Object.keys(want).sort(), "each variable is used in the sheet");
  assert.doesNotMatch(SHEET, /var\(--ac-(?:r|h|hit)-[\w-]+\)/, "no size variable without a fallback");
});

// A grown touch area must never take a tap on a NEIGHBOUR's painted box: the own-box ::before
// sits a layer above every ::after.
test("under a coarse pointer each button's own box outranks a sibling's grown area", () => {
  const coarse = SHEET.slice(SHEET.indexOf("@media (pointer: coarse)"));
  assert.match(coarse, /\.ac-btn::before \{[^}]*inset: 0;[^}]*z-index: 1;/);
  assert.doesNotMatch(coarse.match(/\.ac-btn::after \{[^}]*\}/)![0], /z-index/, "the grown area stays below");
});

// The inline styles carry their own fallbacks; a later edit must not move a standalone size.
test("inline size fallbacks in the components stay on the 0.16 px", () => {
  const want: Record<string, number> = { "--ac-r-xs": 6, "--ac-r-sm": 8, "--ac-r-md": 10, "--ac-r-lg": 14, "--ac-r-xl": 16, "--ac-h-mini": 20, "--ac-h-xs": 24, "--ac-h-sm": 28, "--ac-h-btn": 32, "--ac-h-md": 32 };
  // Two sites kept their old off-scale px on purpose (onboarding pill, desktop realtime chip).
  const offScale = new Set(["--ac-h-sm 26", "--ac-h-xs 23"]);
  for (const f of ["TradingChart.tsx", "TradeTicket.tsx", "ScriptEditor.tsx"]) {
    const src = readFileSync(new URL(f, import.meta.url), "utf8");
    for (const [, name, px] of src.matchAll(/var\((--ac-(?:r|h|hit)-[\w-]+),\s*(\d+)px\)/g))
      assert.ok(Number(px) === want[name] || offScale.has(`${name} ${px}`), `${f}: ${name} falls back to ${px}px`);
  }
});

// The legend's V: compact, and an unknown (absent, NaN, or the 0 volume-less feeds send) is a dash.
test("legend volume is compact and never a confident zero", () => {
  assert.equal(legendVolume(undefined), "\u2014");
  assert.equal(legendVolume(null), "\u2014");
  assert.equal(legendVolume(NaN), "\u2014");
  assert.equal(legendVolume(0), "\u2014");
  assert.equal(legendVolume(999), "999");
  assert.equal(legendVolume(1_000), "1K");
  assert.equal(legendVolume(870_000), "870K");
  assert.equal(legendVolume(41_200_000), "41.2M");
  assert.equal(legendVolume(1.25e9), "1.25B");
  assert.equal(legendVolume(999.6), "1K");
  assert.equal(legendVolume(999_999), "1.0M");
  assert.equal(legendVolume(999_960_000), "1.00B");
  assert.equal(legendVolume(0.042), "0.042");
});

// Host figures (Today, YTD) print as given; an unknown is a neutral dash whatever its tone.
test("legend extras print the host's text, a null as an em dash, tone as theme ink", () => {
  assert.deepEqual(legendExtraParts(undefined), []);
  assert.deepEqual(
    legendExtraParts([
      { label: "Today", value: "+1.24%", tone: "up" },
      { label: "YTD", value: null, tone: "down" },
      { label: "Prev", value: "-0.50%", tone: "down" },
      { label: "Note", value: "flat" },
    ]),
    [
      { label: "Today", text: "+1.24%", color: "var(--ac-up-ink)" },
      { label: "YTD", text: "\u2014", color: "var(--ac-text)" },
      { label: "Prev", text: "-0.50%", color: "var(--ac-down-ink)" },
      { label: "Note", text: "flat", color: "var(--ac-ink)" },
    ],
  );
});

const ll = (o: Partial<Parameters<typeof legendLine>[0]> = {}) =>
  legendLine({ mode: "auto", ohlcSeries: true, seriesVolume: true, volume: 1e6, extras: 0, simple: false, ...o });

// Owner decision 2026-10-12: the bar's own change drops out while host extras share the line.
test("legend line hides the bar's own change only while host extras are shown", () => {
  assert.equal(ll().barChange, true);
  assert.equal(ll({ extras: 2 }).barChange, false);
  assert.equal(ll({ ohlcSeries: false, extras: 1 }).barChange, false);
  assert.equal(ll({ mode: "ohlc", ohlcSeries: false }).barChange, true);
  // ...and the JSX actually gates the change span on it.
  const src = readFileSync(new URL("TradingChart.tsx", import.meta.url), "utf8");
  assert.match(src, /\{line\.barChange && \(\s*<span[^>]*>\s*\{legendBar\.close - legendBar\.open/);
  assert.match(src, /\{line\.chip && \(/);
});

// "auto": OHLC series get O H L C V (V dash when absent); close-based get price plus V when the SERIES has volume.
test("auto legend prints V on close-based series when the series has volume", () => {
  assert.deepEqual(ll({ volume: 41_200_000 }), { shows: "ohlc", volume: "41.2M", barChange: true, chip: true });
  assert.equal(ll({ volume: 0, seriesVolume: false }).volume, "\u2014");
  assert.equal(ll({ ohlcSeries: false, volume: 41_200_000 }).volume, "41.2M");
  // A stock line with a zero (halted / forming) hovered bar keeps V, as a dash, so V does not blink.
  assert.equal(ll({ ohlcSeries: false, volume: 0 }).volume, "\u2014");
  assert.equal(ll({ ohlcSeries: false, volume: undefined }).volume, "\u2014");
  // An index line (no volume anywhere) prints no V at all.
  assert.equal(ll({ ohlcSeries: false, seriesVolume: false, volume: 0 }).volume, null);
  assert.equal(ll({ mode: "price", volume: 41_200_000 }).volume, null);
  assert.equal(ll({ mode: "ohlc", ohlcSeries: false, seriesVolume: false, volume: undefined }).volume, "\u2014");
  assert.equal(ll({ mode: "none" }).shows, "none");
});

// Simple charts: an explicit readout (for Today/YTD extras) never brings the symbol/TF chip back.
test("simple charts print the legend readout without the symbol and interval chip", () => {
  assert.deepEqual(ll({ simple: true, ohlcSeries: false, extras: 2 }), { shows: "price", volume: "1.0M", barChange: false, chip: false });
  assert.equal(ll({ simple: false }).chip, true);
  assert.equal(ll({ mode: "none" }).chip, false);
});

// `controls="ranges"`: the range strip stays, the zoom cluster and the scale/tool switches go.
// The boolean values keep their meaning, so no other host's bar changes.
test("bottomBarParts: ranges keeps the strip and drops the tools; booleans unchanged", () => {
  assert.deepEqual(bottomBarParts(true), { ranges: true, tools: true });
  assert.deepEqual(bottomBarParts(false), { ranges: false, tools: false });
  assert.deepEqual(bottomBarParts("ranges"), { ranges: true, tools: false });
});

// Wiring, not just the helpers: reverting a call site must fail the suite.
test("0.20 wiring: the bar gates its tools on barParts, presets keep minorGrid, chart.ts fades minors on both axes", () => {
  const tc = readFileSync(new URL("TradingChart.tsx", import.meta.url), "utf8");
  assert.match(tc, /const barParts = bottomBarParts\(controls\)/);
  assert.match(tc, /\{barParts\.ranges && rangeList\.length > 0 && \(/);
  assert.match(tc, /\{barParts\.tools && !compact && \(/);
  assert.match(tc, /\{!barParts\.tools \? null : compact \?/);
  assert.match(tc, /THEMES\[themeName\][^\n]*minorGrid: themeOverride\?\.minorGrid/);
  const chart = readFileSync(new URL("../src/chart.ts", import.meta.url), "utf8");
  assert.equal(chart.match(/minorLineAlpha\(t, /g)?.length, 2);
});
