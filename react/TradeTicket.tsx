"use client";
// A trade ticket in the CHART's vocabulary — the same theme, the same button shapes, the same
// mono numerals as the plot it sits beside. Purely presentational and fully controlled: it holds
// no order state, talks to no network, and knows nothing about a broker. The host owns the state,
// the pre-trade gate and the submit; this owns the layout, the arithmetic that is pure derivation
// from the numbers on screen, and the job of never showing a figure it cannot stand behind.
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { DARK, LIGHT } from "../src/util";
import type { Theme } from "../src/types";
import { HAS_LIMIT, HAS_TIF, HAS_TRIGGER, bracketCoherent, deriveTicketRisk } from "../src/ticket";
import type { OrderType, SizeMode, TicketAccount, TicketOrder, TicketQuote, TicketRisk, TimeInForce } from "../src/ticket";

// Re-exported so a host importing the ticket does not also have to reach into the core for the
// shapes it is handed.
export type { OrderSide, OrderType, TimeInForce, SizeMode, TicketOrder, TicketQuote, TicketAccount, TicketRisk } from "../src/ticket";
export { deriveTicketRisk, bracketCoherent, EMPTY_ORDER } from "../src/ticket";

export interface TicketStatus {
  label: string;
  tone?: "good" | "bad" | "warn" | "neutral";
  title?: string;
}

/** One line of a host's pre-trade gate — a rule that passed or failed, and why. */
export interface TicketCheck {
  label: string;
  ok: boolean;
  detail?: string;
}

export interface TradeTicketProps {
  /** The order being edited. */
  order: TicketOrder;
  /** A PATCH, not a whole order — so a host can spread it onto its own state in one line. */
  onChange: (patch: Partial<TicketOrder>) => void;

  symbol: string;
  /**
   * Replaces the plain ticker with the host's own control — a searching symbol picker, a
   * contract selector. The ticket owns the row; the host owns the lookup, exactly as the chart
   * leaves fetching to the datafeed.
   */
  symbolSlot?: ReactNode;
  /** Extra controls beside the symbol — an instrument-class switch (STK · FUT), a venue. */
  symbolExtra?: ReactNode;

  quote?: TicketQuote;
  account?: TicketAccount;
  /** Host-computed risk. Omitted, the ticket derives it from the order and the quote. */
  risk?: TicketRisk | null;
  /** Cash the order is expected to consume. Omitted, derived as qty × entry. */
  estimatedCost?: number | null;

  /** Which order types this venue accepts. Defaults to market + limit. */
  orderTypes?: OrderType[];
  /** Times-in-force offered for a resting order. Defaults to day + GTC. */
  tifs?: TimeInForce[];
  /** Size modes offered. Defaults to all three. */
  sizeModes?: SizeMode[];
  qtyPresets?: number[];
  amountPresets?: number[];
  /**
   * Show the protective stop / target fields. `"auto"` (default) shows them read-only when the
   * host has filled them and hides them when it has not, which is right for a desk that brackets
   * automatically; `true` always shows them editable; `false` never shows them.
   */
  bracket?: boolean | "auto";

  /** Small pills beside the title — desk state, data source, a delay warning. */
  status?: TicketStatus[];
  /** A host's pre-trade gate. Rendered as a checklist; a failure is stated, not hidden. */
  checks?: TicketCheck[];
  /** Free-form caution under the action — "whole units only", "market closed". */
  notes?: ReactNode;

  title?: string;
  disabled?: boolean;
  busy?: boolean;
  submitLabel?: string;
  onSubmit?: () => void;
  /**
   * Replaces the submit button entirely — for a hold-to-confirm control, a two-step arm, a
   * broker's own widget. The ticket keeps the full-width slot and the side colouring around it.
   */
  submitSlot?: ReactNode;
  /** A row under the action — links to the blotter, the position, the protection settings. */
  footer?: ReactNode;

  theme?: "dark" | "light";
  themeOverride?: Partial<Theme>;
  /** Draw the card border and radius. `false` renders flush, for a ticket docked into host chrome. */
  frame?: boolean;
  /**
   * Tighter spacing, for a ticket squeezed beside a chart rather than given its own column.
   * `"auto"` measures the ticket's own box and compacts under 380px — the width it gets when a
   * `ChartWorkspace` stacks it under the chart on a phone.
   */
  compact?: boolean | "auto";
  /** ISO currency for money figures. Omitted, figures are printed as plain numbers. */
  currency?: string;
  locale?: string;
  width?: number | string;
}

const ORDER_TYPE_LABEL: Record<OrderType, string> = { market: "Market", limit: "Limit", stop: "Stop", stopLimit: "Stop limit" };
const ORDER_TYPE_HINT: Record<OrderType, string> = {
  market: "Fills immediately at the going price",
  limit: "Rests until your price trades",
  stop: "Becomes a market order once the trigger prints",
  stopLimit: "Becomes a limit order once the trigger prints",
};
const TIF_LABEL: Record<TimeInForce, string> = { day: "DAY", gtc: "GTC", ioc: "IOC", fok: "FOK" };
const TIF_HINT: Record<TimeInForce, string> = {
  day: "Good for day — expires at the close",
  gtc: "Good till cancelled — rests until you cancel it",
  ioc: "Immediate or cancel — takes what is there, drops the rest",
  fok: "Fill or kill — all of it now, or none",
};
const SIZE_LABEL: Record<SizeMode, string> = { shares: "Shares", amount: "Amount", risk: "Risk %" };

const num = (v: number | null | undefined): number | null => (typeof v === "number" && isFinite(v) ? v : null);

export function TradeTicket({
  order,
  onChange,
  symbol,
  symbolSlot,
  symbolExtra,
  quote,
  account,
  risk: riskProp,
  estimatedCost,
  orderTypes = ["market", "limit"],
  tifs = ["day", "gtc"],
  sizeModes = ["shares", "amount", "risk"],
  qtyPresets = [10, 50, 100],
  amountPresets = [500, 1000, 5000],
  bracket = "auto",
  status,
  checks,
  notes,
  title = "Order ticket",
  disabled = false,
  busy = false,
  submitLabel,
  onSubmit,
  submitSlot,
  footer,
  theme = "dark",
  themeOverride,
  frame = true,
  compact: compactProp = false,
  currency,
  locale,
  width,
}: TradeTicketProps) {
  const th: Theme = useMemo(() => ({ ...(theme === "light" ? LIGHT : DARK), ...(themeOverride ?? {}) }), [theme, themeOverride]);
  const rootRef = useRef<HTMLDivElement>(null);
  const [tight, setTight] = useState(false);
  useEffect(() => {
    if (compactProp !== "auto") return;
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setTight(e.contentRect.width > 0 && e.contentRect.width < 380));
    ro.observe(el);
    return () => ro.disconnect();
  }, [compactProp]);
  const compact = compactProp === "auto" ? tight : compactProp;
  const soft = (c: string, pct: number) => `color-mix(in srgb, ${c} ${pct}%, transparent)`;
  const buying = order.side === "buy";
  const sideColor = buying ? th.up : th.down;

  const money = useMemo(() => makeMoney(locale, currency), [locale, currency]);
  const price = useMemo(() => makeNumber(locale, 2), [locale]);
  const whole = useMemo(() => makeNumber(locale, 0), [locale]);

  const risk = riskProp !== undefined && riskProp !== null ? riskProp : deriveTicketRisk(order, { quote, account });
  const cost = estimatedCost !== undefined ? num(estimatedCost) : risk.notional;
  const showBracket = bracket === true || (bracket === "auto" && (num(order.stop) != null || num(order.target) != null));
  const failed = (checks ?? []).filter((c) => !c.ok);
  const gated = failed.length > 0;

  const gap = compact ? 8 : 10;

  // ——— shared styles, all derived from the CHART's theme so a ticket beside a plot is visibly
  // the same object rather than a second design system sharing a screen ———
  const cap: CSSProperties = { fontSize: 9.5, fontFamily: th.monoFont, textTransform: "uppercase", letterSpacing: "0.09em", color: th.text, whiteSpace: "nowrap" };
  const mono: CSSProperties = { fontFamily: th.monoFont, fontVariantNumeric: "tabular-nums" };
  const segWrap: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 2, padding: 2, borderRadius: 10, background: soft(th.text, 10), border: `1px solid ${soft(th.border, 70)}` };
  const seg = (on: boolean, tone?: string): CSSProperties => ({
    height: 26,
    padding: "0 11px",
    border: "none",
    borderRadius: 8,
    cursor: disabled ? "not-allowed" : "pointer",
    fontSize: 11.5,
    fontWeight: 700,
    fontFamily: th.font,
    letterSpacing: "0.02em",
    background: on ? soft(tone ?? th.line, 18) : "transparent",
    color: on ? (tone ?? th.line) : th.text,
    transition: "background 140ms ease, color 140ms ease",
    whiteSpace: "nowrap",
  });
  const chip: CSSProperties = { height: 22, padding: "0 8px", borderRadius: 7, border: `1px solid ${soft(th.border, 70)}`, background: "transparent", color: th.text, cursor: "pointer", fontSize: 11, fontWeight: 600, ...mono };
  const field: CSSProperties = {
    height: 32,
    width: "100%",
    minWidth: 0,
    padding: "0 10px",
    borderRadius: 9,
    border: `1px solid ${soft(th.border, 80)}`,
    background: soft(th.text, 8),
    color: th.textStrong,
    fontSize: 13.5,
    fontWeight: 600,
    ...mono,
    outline: "none",
  };
  const tile: CSSProperties = { display: "flex", flexDirection: "column", gap: 3, padding: "8px 10px", borderRadius: 10, background: soft(th.text, 7), border: `1px solid ${soft(th.border, 55)}` };

  const set = (patch: Partial<TicketOrder>) => {
    if (!disabled) onChange(patch);
  };

  return (
    <div
      ref={rootRef}
      data-aurovie-ticket
      style={{
        display: "flex",
        flexDirection: "column",
        gap,
        width,
        padding: compact ? 10 : 12,
        borderRadius: frame ? 14 : 0,
        border: frame ? `1px solid ${th.border}` : "none",
        background: th.paneBackground,
        boxShadow: frame ? "0 1px 2px rgba(0,0,0,0.2), 0 8px 28px rgba(0,0,0,0.16)" : "none",
        fontFamily: th.font,
        color: th.textStrong,
        // The side is stated by the whole card, not only by the toggle: a hairline in the side's
        // colour down the leading edge means the reader can never mistake a sell ticket for a
        // buy one at a glance, which is the mistake that costs the most.
        borderLeft: frame ? `2px solid ${soft(sideColor, 55)}` : "none",
      }}
    >
      {/* Inline styles cannot express a pseudo-class, so focus and hover live in one scoped
          block keyed on the root attribute — it cannot leak into the host page. */}
      <style>{`
        [data-aurovie-ticket] :is(button,input,select):focus-visible { outline: 2px solid currentColor; outline-offset: 1px; border-radius: 6px; }
        [data-aurovie-ticket] input::-webkit-outer-spin-button,
        [data-aurovie-ticket] input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        [data-aurovie-ticket] input[type=number] { -moz-appearance: textfield; }
        [data-aurovie-ticket] button:not(:disabled):hover { filter: brightness(1.12); }
        @media (prefers-reduced-motion: reduce) { [data-aurovie-ticket] * { transition-duration: 1ms !important; } }
      `}</style>

      {/* ——— title + desk status ——— */}
      {(title || status?.length) && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          {title && <span style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: "0.01em" }}>{title}</span>}
          <span style={{ marginLeft: "auto", display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
            {(status ?? []).map((s, i) => (
              <span
                key={`${s.label}-${i}`}
                title={s.title}
                style={{
                  ...mono,
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "2px 7px",
                  borderRadius: 999,
                  letterSpacing: "0.04em",
                  color: toneColor(s.tone, th),
                  background: soft(toneColor(s.tone, th), 14),
                  border: `1px solid ${soft(toneColor(s.tone, th), 35)}`,
                }}
              >
                {s.label}
              </span>
            ))}
          </span>
        </div>
      )}

      {/* ——— SIDE. Two buttons, full width, the chosen one filled in its own direction colour.
              Side is the single most consequential field on the ticket and it used to be the
              same size as the venue picker. ——— */}
      <div role="radiogroup" aria-label="Order side" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        {(["buy", "sell"] as const).map((s) => {
          const on = order.side === s;
          const c = s === "buy" ? th.up : th.down;
          return (
            <button
              key={s}
              role="radio"
              aria-checked={on}
              disabled={disabled}
              onClick={() => set({ side: s })}
              style={{
                height: 36,
                border: `1px solid ${on ? c : soft(th.border, 75)}`,
                borderRadius: 10,
                cursor: disabled ? "not-allowed" : "pointer",
                fontFamily: th.font,
                fontSize: 13,
                fontWeight: 800,
                letterSpacing: "0.08em",
                background: on ? c : "transparent",
                color: on ? pickInk(c) : th.text,
                boxShadow: on ? `0 4px 14px ${soft(c, 30)}` : "none",
                transition: "background 140ms ease, color 140ms ease, border-color 140ms ease",
              }}
            >
              {s === "buy" ? "BUY" : "SELL"}
            </button>
          );
        })}
      </div>

      {/* ——— instrument + the live mark ——— */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {symbolSlot ?? (
          <span style={{ ...mono, fontSize: 13, fontWeight: 700, letterSpacing: "0.04em" }}>{symbol}</span>
        )}
        {symbolExtra}
        <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "baseline", gap: 6 }}>
          {num(quote?.last) != null && (
            <span style={{ ...mono, fontSize: 17, fontWeight: 700, color: th.textStrong }}>{price(quote!.last!)}</span>
          )}
          {num(quote?.changePct) != null && (
            <span style={{ ...mono, fontSize: 11.5, fontWeight: 700, color: quote!.changePct! >= 0 ? th.up : th.down }}>
              {quote!.changePct! >= 0 ? "▲" : "▼"} {Math.abs(quote!.changePct!).toFixed(2)}%
            </span>
          )}
        </span>
      </div>

      {/* ——— order type · time in force ——— */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        {orderTypes.length > 1 && (
          <span role="radiogroup" aria-label="Order type" style={segWrap}>
            {orderTypes.map((t) => (
              <button key={t} role="radio" aria-checked={order.type === t} disabled={disabled} title={ORDER_TYPE_HINT[t]} style={seg(order.type === t)} onClick={() => set({ type: t })}>
                {ORDER_TYPE_LABEL[t]}
              </button>
            ))}
          </span>
        )}
        {HAS_TIF.includes(order.type) && tifs.length > 1 && (
          <span role="radiogroup" aria-label="Time in force" style={segWrap}>
            {tifs.map((t) => (
              <button key={t} role="radio" aria-checked={order.tif === t} disabled={disabled} title={TIF_HINT[t]} style={{ ...seg(order.tif === t), ...mono, padding: "0 9px" }} onClick={() => set({ tif: t })}>
                {TIF_LABEL[t]}
              </button>
            ))}
          </span>
        )}
      </div>

      {/* ——— SIZE ——— */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {sizeModes.length > 1 && (
          <span role="radiogroup" aria-label="Size by" style={{ ...segWrap, alignSelf: "flex-start" }}>
            {sizeModes.map((m) => (
              <button
                key={m}
                role="radio"
                aria-checked={order.sizeMode === m}
                disabled={disabled}
                title={
                  m === "shares"
                    ? "Size by number of shares"
                    : m === "amount"
                      ? "Size by cash budget — rounds DOWN to whole shares"
                      : "Size by percent of equity risked to your stop"
                }
                style={seg(order.sizeMode === m)}
                onClick={() => set({ sizeMode: m })}
              >
                {SIZE_LABEL[m]}
              </button>
            ))}
          </span>
        )}

        {order.sizeMode === "shares" && (
          <Stepper
            label="Quantity"
            value={order.qty}
            step={1}
            decimals={0}
            min={0}
            onChange={(v) => set({ qty: v })}
            presets={qtyPresets.map((n) => ({ label: String(n), value: n }))}
            th={th}
            field={field}
            chip={chip}
            cap={cap}
            disabled={disabled}
          />
        )}
        {order.sizeMode === "amount" && (
          <Stepper
            label="Budget"
            value={order.amount}
            step={100}
            decimals={0}
            min={0}
            onChange={(v) => set({ amount: v })}
            presets={amountPresets.map((n) => ({ label: n >= 1000 ? `${n / 1000}k` : String(n), value: n }))}
            th={th}
            field={field}
            chip={chip}
            cap={cap}
            disabled={disabled}
          />
        )}
        {order.sizeMode === "risk" && (
          <Stepper
            label="Risk of equity"
            suffix="%"
            value={order.riskPct}
            step={0.25}
            decimals={2}
            min={0}
            onChange={(v) => set({ riskPct: v })}
            presets={[0.25, 0.5, 1].map((n) => ({ label: `${n}%`, value: n }))}
            th={th}
            field={field}
            chip={chip}
            cap={cap}
            disabled={disabled}
          />
        )}

        {/* Sizing by cash or by risk RESOLVES to a share count, and the reader is entitled to see
            the number that will actually be sent — not to discover it on the fill. */}
        {order.sizeMode !== "shares" && (
          <span style={{ ...cap, color: th.text }}>
            {num(risk.qty) != null ? `→ ${whole(risk.qty!)} share${risk.qty === 1 ? "" : "s"}` : "→ size needs a price" + (order.sizeMode === "risk" ? " and a stop" : "")}
          </span>
        )}
      </div>

      {/* ——— price fields ——— */}
      {(HAS_TRIGGER.includes(order.type) || HAS_LIMIT.includes(order.type)) && (
        <div style={{ display: "grid", gridTemplateColumns: HAS_TRIGGER.includes(order.type) && HAS_LIMIT.includes(order.type) ? "1fr 1fr" : "1fr", gap: 6 }}>
          {HAS_TRIGGER.includes(order.type) && (
            <PriceField label="Trigger" value={order.stopPrice} onChange={(v) => set({ stopPrice: v })} th={th} field={field} cap={cap} disabled={disabled} />
          )}
          {HAS_LIMIT.includes(order.type) && (
            <PriceField label="Limit" value={order.limit} onChange={(v) => set({ limit: v })} th={th} field={field} cap={cap} disabled={disabled} />
          )}
        </div>
      )}

      {/* Snap the limit to the real top of book. NEUTRAL tone on purpose — a bid is not a gain
          and an ask is not a loss, and up/down here are reserved for direction. */}
      {HAS_LIMIT.includes(order.type) && (num(quote?.bid) != null || num(quote?.ask) != null) && (
        <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
          <span style={cap}>Book</span>
          {num(quote?.bid) != null && (
            <button style={chip} disabled={disabled} title="Set the limit to the bid" onClick={() => set({ limit: quote!.bid! })}>
              bid {price(quote!.bid!)}
            </button>
          )}
          {num(quote?.bid) != null && num(quote?.ask) != null && (
            <button style={chip} disabled={disabled} title="Set the limit to the midpoint" onClick={() => set({ limit: (quote!.bid! + quote!.ask!) / 2 })}>
              mid {price((quote!.bid! + quote!.ask!) / 2)}
            </button>
          )}
          {num(quote?.ask) != null && (
            <button style={chip} disabled={disabled} title="Set the limit to the ask" onClick={() => set({ limit: quote!.ask! })}>
              ask {price(quote!.ask!)}
            </button>
          )}
        </div>
      )}

      {/* ——— BRACKET. Stop first: it is the field the whole risk readout hangs off, and a ticket
              that lists the target above the stop puts the pleasant number first. ——— */}
      {showBracket && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          <PriceField label="Stop loss" value={order.stop} onChange={(v) => set({ stop: v })} accent={th.down} th={th} field={field} cap={cap} disabled={disabled} />
          <PriceField label="Take profit" value={order.target} onChange={(v) => set({ target: v })} accent={th.up} th={th} field={field} cap={cap} disabled={disabled} />
        </div>
      )}

      {/* A bracket entered the wrong way round — a long stopping ABOVE its entry, a short
          targeting above it. Worth stating loudly, because it is invisible in every figure
          derived from it: both distances are absolute, so the risk/reward tile reads perfectly
          healthy for a plan that would take profit at a loss. */}
      {showBracket && !bracketCoherent(order, risk.entry ?? null) && (
        <div style={{ fontSize: 11.5, lineHeight: 1.45, color: th.down, fontWeight: 600 }}>
          This bracket is inverted for a {buying ? "long" : "short"} — the stop and target sit on the wrong sides of{" "}
          {num(risk.entry) != null ? price(risk.entry!) : "the entry"}.
        </div>
      )}

      {/* ——— what it costs ——— */}
      {(num(cost) != null || num(account?.buyingPower) != null || num(account?.position) != null) && (
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap", paddingTop: 2, borderTop: `1px solid ${soft(th.border, 60)}` }}>
          {num(cost) != null && (
            <>
              <span style={cap}>Est. cost</span>
              <span style={{ ...mono, fontSize: 15, fontWeight: 700 }}>{money(cost!)}</span>
            </>
          )}
          {num(account?.buyingPower) != null && (
            <span style={{ ...mono, fontSize: 11, color: th.text }}>of {money(account!.buyingPower!)} buying power</span>
          )}
          {num(account?.position) != null && account!.position !== 0 && (
            <span style={{ ...mono, fontSize: 11, marginLeft: "auto", color: th.text }}>
              holding {whole(account!.position!)}
            </span>
          )}
        </div>
      )}

      {/* ——— RISK. The one block a hand-rolled ticket always leaves out, and the one a reader
              most needs before they press a coloured button. Every tile is omitted when its
              input is missing rather than printed as a zero. ——— */}
      {(num(risk.riskAmount) != null || num(risk.rr) != null || num(risk.notional) != null) && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(96px, 1fr))", gap: 6 }}>
          {num(risk.notional) != null && <Tile label="Notional" value={money(risk.notional!)} th={th} tile={tile} cap={cap} mono={mono} />}
          {num(risk.riskAmount) != null && (
            <Tile label="Risk / trade" value={money(risk.riskAmount!)} accent={th.down} th={th} tile={tile} cap={cap} mono={mono} />
          )}
          {num(risk.riskPct) != null && <Tile label="Risk of equity" value={`${risk.riskPct!.toFixed(2)}%`} th={th} tile={tile} cap={cap} mono={mono} />}
          {num(risk.rr) != null && (
            <Tile label="Risk / reward" value={`1 : ${risk.rr!.toFixed(2)}`} accent={risk.rr! >= 1 ? th.up : undefined} th={th} tile={tile} cap={cap} mono={mono} />
          )}
        </div>
      )}

      {/* ——— the host's pre-trade gate ——— */}
      {checks && checks.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {checks.map((c) => (
            <div key={c.label} style={{ display: "flex", alignItems: "baseline", gap: 6, fontSize: 11.5 }}>
              <span style={{ color: c.ok ? th.up : th.down, fontWeight: 800, width: 12 }}>{c.ok ? "✓" : "✕"}</span>
              <span style={{ color: c.ok ? th.text : th.textStrong }}>{c.label}</span>
              {c.detail && <span style={{ ...mono, fontSize: 10.5, color: th.text, marginLeft: "auto" }}>{c.detail}</span>}
            </div>
          ))}
        </div>
      )}

      {/* ——— the action ——— */}
      {submitSlot ?? (
        <button
          disabled={disabled || busy || gated || !onSubmit}
          onClick={onSubmit}
          style={{
            height: 40,
            width: "100%",
            border: "none",
            borderRadius: 11,
            cursor: disabled || busy || gated || !onSubmit ? "not-allowed" : "pointer",
            fontFamily: th.font,
            fontSize: 13.5,
            fontWeight: 800,
            letterSpacing: "0.02em",
            background: disabled || gated ? soft(th.text, 14) : sideColor,
            color: disabled || gated ? th.text : pickInk(sideColor),
            boxShadow: disabled || gated ? "none" : `0 6px 18px ${soft(sideColor, 30)}`,
            transition: "background 140ms ease, color 140ms ease",
          }}
        >
          {busy
            ? "Sending…"
            : gated
              ? `Blocked · ${failed[0].label}`
              : (submitLabel ??
                `Review · ${buying ? "BUY" : "SELL"}${num(risk.qty) != null ? ` ${whole(risk.qty!)}` : ""} ${symbol} @ ${
                  order.type === "market" ? "market" : num(order.limit) != null ? price(order.limit!) : ORDER_TYPE_LABEL[order.type].toLowerCase()
                }`)}
        </button>
      )}

      {notes && <div style={{ fontSize: 11, lineHeight: 1.45, color: th.text }}>{notes}</div>}
      {footer && <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 11, color: th.text }}>{footer}</div>}
    </div>
  );
}

/** A labelled numeric field with − / + steppers and optional quick-set chips. */
function Stepper({
  label,
  value,
  step,
  decimals,
  min,
  suffix,
  onChange,
  presets,
  th,
  field,
  chip,
  cap,
  disabled,
}: {
  label: string;
  value: number | null;
  step: number;
  decimals: number;
  min?: number;
  suffix?: string;
  onChange: (v: number | null) => void;
  presets?: { label: string; value: number }[];
  th: Theme;
  field: CSSProperties;
  chip: CSSProperties;
  cap: CSSProperties;
  disabled: boolean;
}) {
  // The raw text, so a half-typed "1." or a cleared box is not rewritten under the cursor.
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value == null ? "" : String(value));
  const bump = (dir: number) => {
    const base = value ?? 0;
    const next = Math.max(min ?? -Infinity, Number((base + dir * step).toFixed(decimals)));
    setDraft(null);
    onChange(next);
  };
  const stepBtn: CSSProperties = { width: 32, height: 32, flexShrink: 0, borderRadius: 9, border: `1px solid ${th.border}`, background: "transparent", color: th.textStrong, cursor: disabled ? "not-allowed" : "pointer", fontSize: 15, fontWeight: 700, lineHeight: 1 };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span style={cap}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <button style={stepBtn} disabled={disabled} aria-label={`Decrease ${label}`} onClick={() => bump(-1)}>−</button>
        <span style={{ position: "relative", flex: 1, minWidth: 0, display: "flex", alignItems: "center" }}>
          <input
            type="number"
            inputMode="decimal"
            step={step}
            min={min}
            disabled={disabled}
            aria-label={label}
            value={shown}
            onChange={(e) => {
              setDraft(e.target.value);
              const v = e.target.value.trim();
              onChange(v === "" ? null : Number(v));
            }}
            onBlur={() => setDraft(null)}
            style={{ ...field, paddingRight: suffix ? 26 : 10 }}
          />
          {suffix && <span style={{ position: "absolute", right: 10, fontSize: 12, color: th.text, pointerEvents: "none", fontFamily: th.monoFont }}>{suffix}</span>}
        </span>
        <button style={stepBtn} disabled={disabled} aria-label={`Increase ${label}`} onClick={() => bump(1)}>+</button>
        {(presets ?? []).map((p) => (
          <button key={p.label} style={chip} disabled={disabled} onClick={() => { setDraft(null); onChange(p.value); }}>
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** A labelled price input. `accent` tints the label and the left edge — stop red, target green. */
function PriceField({
  label,
  value,
  onChange,
  accent,
  th,
  field,
  cap,
  disabled,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  accent?: string;
  th: Theme;
  field: CSSProperties;
  cap: CSSProperties;
  disabled: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value == null ? "" : String(value));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 0 }}>
      <span style={{ ...cap, color: accent ?? th.text }}>{label}</span>
      <input
        type="number"
        inputMode="decimal"
        step="any"
        disabled={disabled}
        aria-label={label}
        placeholder="—"
        value={shown}
        onChange={(e) => {
          setDraft(e.target.value);
          const v = e.target.value.trim();
          onChange(v === "" ? null : Number(v));
        }}
        onBlur={() => setDraft(null)}
        style={{ ...field, borderLeft: accent ? `2px solid ${accent}` : field.border, color: accent && value != null ? accent : th.textStrong }}
      />
    </div>
  );
}

function Tile({ label, value, accent, th, tile, cap, mono }: { label: string; value: string; accent?: string; th: Theme; tile: CSSProperties; cap: CSSProperties; mono: CSSProperties }) {
  return (
    <div style={{ ...tile, borderLeft: accent ? `2px solid ${accent}` : (tile.border as string) }}>
      <span style={cap}>{label}</span>
      <span style={{ ...mono, fontSize: 14.5, fontWeight: 700, color: accent ?? th.textStrong }}>{value}</span>
    </div>
  );
}

function toneColor(tone: TicketStatus["tone"], th: Theme): string {
  switch (tone) {
    case "good": return th.up;
    case "bad": return th.down;
    case "warn": return th.entry ?? th.line;
    default: return th.text;
  }
}

/**
 * Black or white ink on a filled swatch, whichever the fill can actually carry.
 *
 * A BUY button filled with the theme's green and lettered in the theme's ink is unreadable on a
 * light preset and merely poor on a dark one — the fill is chosen for the chart, not for text.
 */
function pickInk(bg: string): string {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(bg.trim());
  if (!m) return "#000";
  let hex = m[1];
  if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L > 0.42 ? "#000" : "#fff";
}

function makeMoney(locale: string | undefined, currency: string | undefined) {
  const fmt = new Intl.NumberFormat(locale, currency ? { style: "currency", currency, maximumFractionDigits: 2 } : { maximumFractionDigits: 2 });
  return (v: number) => fmt.format(v);
}
function makeNumber(locale: string | undefined, decimals: number) {
  const fmt = new Intl.NumberFormat(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return (v: number) => fmt.format(v);
}
