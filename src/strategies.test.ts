import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_STRATEGIES } from "../react/strategies";

// The chart ships a usable library out of the box; a consumer that renders it must be able to
// trust every entry is complete and distinct. (The scripts run/score on the host — this only
// guards the shape of the suggestion list.)
test("ships a non-empty, well-formed built-in strategy library", () => {
  assert.ok(DEFAULT_STRATEGIES.length >= 17, "expected the full built-in set");
  const ids = new Set<string>();
  for (const s of DEFAULT_STRATEGIES) {
    assert.ok(s.id && s.title && s.source, `${s.id || "?"} is missing a field`);
    assert.ok(!ids.has(s.id), `duplicate id ${s.id}`);
    ids.add(s.id);
    assert.match(s.source, /(strategy|indicator)\s*\(/, `${s.id} source has no declaration`);
    assert.equal(typeof s.overlay, "boolean");
  }
});
