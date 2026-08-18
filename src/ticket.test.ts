import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_ORDER, bracketCoherent, deriveTicketRisk } from "./ticket";
import type { TicketOrder } from "./ticket";

const order = (patch: Partial<TicketOrder>): TicketOrder => ({ ...EMPTY_ORDER, ...patch });
const QUOTE = { last: 100, bid: 99.9, ask: 100.1 };
const ACCOUNT = { equity: 100_000 };

// The rule the whole ticket hangs on: a figure whose inputs are absent is NOT a conservative
// estimate, it is a fabricated one — and it would render as the most confident number on screen.
test("reports nothing it cannot derive", () => {
  const r = deriveTicketRisk(EMPTY_ORDER, {});
  assert.equal(r.entry, null);
  assert.equal(r.qty, null);
  assert.equal(r.notional, null);
  assert.equal(r.riskAmount, null);
  assert.equal(r.riskPct, null);
  assert.equal(r.rr, null);
});

test("a market order takes its entry from the mark; a limit order takes its own price", () => {
  assert.equal(deriveTicketRisk(order({ qty: 10 }), { quote: QUOTE }).entry, 100);
  assert.equal(deriveTicketRisk(order({ type: "limit", limit: 97.5, qty: 10 }), { quote: QUOTE }).entry, 97.5);
  // A limit order with no limit typed yet falls back to the mark rather than reporting nothing —
  // the reader can still see what the size would cost while they are mid-edit.
  assert.equal(deriveTicketRisk(order({ type: "limit", qty: 10 }), { quote: QUOTE }).entry, 100);
  // A stop order prices off its TRIGGER, not off a limit it does not have.
  assert.equal(deriveTicketRisk(order({ type: "stop", stopPrice: 105, qty: 10 }), { quote: QUOTE }).entry, 105);
});

test("risk is measured to the stop, and is null without one", () => {
  const withStop = deriveTicketRisk(order({ qty: 100, stop: 95 }), { quote: QUOTE, account: ACCOUNT });
  assert.equal(withStop.riskAmount, 500);
  assert.equal(withStop.riskPct, 0.5);
  assert.equal(withStop.notional, 10_000);

  const noStop = deriveTicketRisk(order({ qty: 100 }), { quote: QUOTE, account: ACCOUNT });
  assert.equal(noStop.riskAmount, null);
  assert.equal(noStop.riskPct, null);
  assert.equal(noStop.notional, 10_000, "notional needs no stop");
});

// A short's stop sits ABOVE its entry, so a signed subtraction would report negative risk.
test("risk is unsigned, so a short is not reported as risking a negative amount", () => {
  const short = deriveTicketRisk(order({ side: "sell", qty: 100, stop: 105 }), { quote: QUOTE, account: ACCOUNT });
  assert.equal(short.riskAmount, 500);
  assert.equal(short.riskPct, 0.5);
});

test("sizing by cash rounds DOWN to whole shares", () => {
  // 1,000 / 100 is exact; 1,050 is not, and rounding up would spend money nobody budgeted.
  assert.equal(deriveTicketRisk(order({ sizeMode: "amount", amount: 1000 }), { quote: QUOTE }).qty, 10);
  assert.equal(deriveTicketRisk(order({ sizeMode: "amount", amount: 1050 }), { quote: QUOTE }).qty, 10);
  // No price to divide by → no size, rather than a size derived from a zero.
  assert.equal(deriveTicketRisk(order({ sizeMode: "amount", amount: 1000 }), {}).qty, null);
});

test("sizing by risk needs an equity AND a stop, and never exceeds the percent asked", () => {
  const sized = deriveTicketRisk(order({ sizeMode: "risk", riskPct: 1, stop: 95 }), { quote: QUOTE, account: ACCOUNT });
  assert.equal(sized.qty, 200, "1% of 100k over a 5-point stop");
  assert.equal(sized.riskAmount, 1000);
  assert.ok(sized.riskPct !== null && sized.riskPct <= 1 + 1e-9, "the rounding must never round UP into more risk than asked");

  // A stop three-tenths wide leaves a fractional share count; the floor keeps it under the cap.
  const odd = deriveTicketRisk(order({ sizeMode: "risk", riskPct: 1, stop: 99.7 }), { quote: QUOTE, account: ACCOUNT });
  assert.equal(odd.qty, 3333);
  assert.ok(odd.riskPct !== null && odd.riskPct < 1);

  assert.equal(deriveTicketRisk(order({ sizeMode: "risk", riskPct: 1 }), { quote: QUOTE, account: ACCOUNT }).qty, null, "no stop → no risk size");
  assert.equal(deriveTicketRisk(order({ sizeMode: "risk", riskPct: 1, stop: 95 }), { quote: QUOTE }).qty, null, "no equity → no risk size");
  // A stop AT the entry is a zero-width risk: the honest answer is "no size", not an infinite one.
  assert.equal(deriveTicketRisk(order({ sizeMode: "risk", riskPct: 1, stop: 100 }), { quote: QUOTE, account: ACCOUNT }).qty, null);
});

test("risk/reward is reward over risk, and needs both legs", () => {
  const r = deriveTicketRisk(order({ qty: 10, stop: 95, target: 110 }), { quote: QUOTE });
  assert.equal(r.rr, 2);
  assert.equal(deriveTicketRisk(order({ qty: 10, target: 110 }), { quote: QUOTE }).rr, null);
  assert.equal(deriveTicketRisk(order({ qty: 10, stop: 95 }), { quote: QUOTE }).rr, null);
});

// The failure the ratio cannot show: both distances are absolute, so a plan entered backwards
// produces a perfectly healthy-looking 1:2.
test("an inverted bracket is caught, and it is invisible in the ratio", () => {
  const backwards = order({ qty: 10, stop: 110, target: 95 });
  assert.equal(deriveTicketRisk(backwards, { quote: QUOTE }).rr, 0.5, "the ratio reports a number regardless");
  assert.equal(bracketCoherent(backwards, 100), false);

  assert.equal(bracketCoherent(order({ stop: 95, target: 110 }), 100), true);
  assert.equal(bracketCoherent(order({ side: "sell", stop: 105, target: 90 }), 100), true);
  assert.equal(bracketCoherent(order({ side: "sell", stop: 95, target: 110 }), 100), false);
  // Nothing to judge it against yet is not an error.
  assert.equal(bracketCoherent(order({ stop: 110 }), null), true);
});

test("a non-finite input is treated as absent, not as a number", () => {
  const r = deriveTicketRisk(order({ qty: Number.NaN, stop: Number.POSITIVE_INFINITY }), { quote: QUOTE });
  assert.equal(r.qty, null);
  assert.equal(r.stop, null);
});
