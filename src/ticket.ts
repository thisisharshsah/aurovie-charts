// The trade ticket's arithmetic, with no React in it.
//
// It lives in the core rather than beside the component for two reasons. A host almost always
// needs the same figures OUTSIDE the ticket — to gate a submit, to draw the plan on the chart,
// to log what was risked — and two implementations of one calculation is exactly how a ticket
// ends up disagreeing with the chart next to it. And it is pure, so it can be tested.

export type OrderSide = "buy" | "sell";
export type OrderType = "market" | "limit" | "stop" | "stopLimit";
export type TimeInForce = "day" | "gtc" | "ioc" | "fok";
/**
 * How the size is EXPRESSED. All three resolve to a share count — `qty` stays canonical, because
 * a broker fills shares, and a ticket that submits a cash figure is hiding a rounding it did on
 * the reader's behalf.
 */
export type SizeMode = "shares" | "amount" | "risk";

/** The whole editable state of a ticket. The host holds it; the ticket renders it. */
export interface TicketOrder {
  side: OrderSide;
  type: OrderType;
  tif: TimeInForce;
  sizeMode: SizeMode;
  /** Share count. Canonical size, whatever `sizeMode` the reader is typing in. */
  qty: number | null;
  /** Cash budget, when sizing by amount. Resolved to whole shares at the entry. */
  amount: number | null;
  /** Percent of equity risked to the stop, when sizing by risk. Needs a stop to mean anything. */
  riskPct: number | null;
  /** Limit price, for a limit or stop-limit order. */
  limit: number | null;
  /** Trigger price, for a stop or stop-limit order. Distinct from the PROTECTIVE stop below. */
  stopPrice: number | null;
  /** Protective stop — where the position is wrong. Drives every risk figure on the ticket. */
  stop: number | null;
  /** Bracket target. */
  target: number | null;
}

export interface TicketQuote {
  last?: number | null;
  bid?: number | null;
  ask?: number | null;
  /** Day change, in percent. */
  changePct?: number | null;
}

export interface TicketAccount {
  /** Net liquidation — the denominator for "risk of equity". */
  equity?: number | null;
  buyingPower?: number | null;
  /** Signed position already held in this instrument. */
  position?: number | null;
}

/**
 * Everything the ticket says about what the order puts at stake.
 *
 * A field left `null` is NOT RENDERED by the ticket — never as a dash or a zero, which would
 * state something false about the trade.
 */
export interface TicketRisk {
  entry: number | null;
  stop: number | null;
  target: number | null;
  /** Shares actually being sent, after any rounding the size mode implied. */
  qty: number | null;
  notional: number | null;
  /** Cash at stake between entry and stop. */
  riskAmount: number | null;
  /** That cash as a percentage of equity. */
  riskPct: number | null;
  /** Reward ÷ risk. */
  rr: number | null;
}

/** Order types whose price is a resting LIMIT the reader sets. */
export const HAS_LIMIT: OrderType[] = ["limit", "stopLimit"];
/** Order types with a TRIGGER price. */
export const HAS_TRIGGER: OrderType[] = ["stop", "stopLimit"];
/** Only a resting order has a life to govern; a market order fills now. */
export const HAS_TIF: OrderType[] = ["limit", "stop", "stopLimit"];

/** A blank ticket — market, day, sized in shares, nothing filled in. */
export const EMPTY_ORDER: TicketOrder = {
  side: "buy",
  type: "market",
  tif: "day",
  sizeMode: "shares",
  qty: null,
  amount: null,
  riskPct: null,
  limit: null,
  stopPrice: null,
  stop: null,
  target: null,
};

const num = (v: number | null | undefined): number | null => (typeof v === "number" && isFinite(v) ? v : null);

/**
 * Work out everything derivable from the numbers already on the ticket.
 *
 * Every field comes back `null` unless the inputs for it are genuinely present. That is the whole
 * discipline: a risk figure computed against a missing stop is not a conservative estimate, it is
 * a fabricated one — and it would be the most confident-looking number on the ticket.
 */
export function deriveTicketRisk(order: TicketOrder, ctx: { quote?: TicketQuote; account?: TicketAccount } = {}): TicketRisk {
  const last = num(ctx.quote?.last);
  const limit = num(order.limit);
  const trigger = num(order.stopPrice);
  // What the position is expected to open at: the price the reader SET, if this order type sets
  // one, otherwise the live mark. A market order has no price of its own, and pretending
  // otherwise would make every figure below a fiction carrying two decimal places.
  const entry = HAS_LIMIT.includes(order.type) ? (limit ?? last) : HAS_TRIGGER.includes(order.type) ? (trigger ?? last) : last;
  const stop = num(order.stop);
  const target = num(order.target);
  const equity = num(ctx.account?.equity);

  const perShare = entry != null && stop != null ? Math.abs(entry - stop) : null;

  let qty = num(order.qty);
  if (order.sizeMode === "amount") {
    const budget = num(order.amount);
    // Whole shares, rounded DOWN — rounding up spends money the reader did not budget.
    qty = budget != null && entry != null && entry > 0 ? Math.floor(budget / entry) : null;
  } else if (order.sizeMode === "risk") {
    const pct = num(order.riskPct);
    qty = pct != null && equity != null && perShare != null && perShare > 0 ? Math.floor((equity * (pct / 100)) / perShare) : null;
  }
  if (qty != null && qty < 0) qty = 0;

  const notional = qty != null && entry != null ? qty * entry : null;
  const riskAmount = qty != null && perShare != null ? qty * perShare : null;
  const riskPct = riskAmount != null && equity != null && equity > 0 ? (riskAmount / equity) * 100 : null;
  const reward = entry != null && target != null ? Math.abs(target - entry) : null;
  const rr = reward != null && perShare != null && perShare > 0 ? reward / perShare : null;

  return { entry, stop, target, qty, notional, riskAmount, riskPct, rr };
}

/**
 * Is this bracket the right way round for the side it is on?
 *
 * A long whose target sits below its entry, or whose stop sits above it, is not a plan with a bad
 * ratio — it is a plan entered backwards, and the risk/reward figure derived from it reads
 * perfectly reasonable because both distances are absolute. Worth a host's warning.
 */
export function bracketCoherent(order: TicketOrder, entry: number | null): boolean {
  const stop = num(order.stop);
  const target = num(order.target);
  if (entry == null) return true; // nothing to judge it against yet
  const long = order.side === "buy";
  if (stop != null && (long ? stop >= entry : stop <= entry)) return false;
  if (target != null && (long ? target <= entry : target >= entry)) return false;
  return true;
}
