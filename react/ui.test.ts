import { test } from "node:test";
import assert from "node:assert/strict";
import { CONTROL, DEPTH, RADIUS, SPACE, TYPE, contrast, cx, readable, themeVars } from "./ui";
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

