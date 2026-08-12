"use client";
// The script editor — the smallest thing that lets someone write a script, run it, and see it on
// the chart. Deliberately dependency-free: a textarea with a line-number gutter, not a code-editor
// library. This repo is dependency-light and lives on a slow volume, and the honest v1 need is
// "type some lines, get an error pointing at one of them" — which a textarea does.
//
// The gutter highlights the line an error names, because a compile error whose line you cannot
// find is barely better than no message at all.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { Theme } from "../src/types";

export interface ScriptError {
  message: string;
  line: number;
}

/** One entry of the strategy library, as the host serves it. */
export interface ScriptPreset {
  id: string;
  title: string;
  description: string;
  source: string;
  overlay?: boolean;
}

/** One half of a scored record, as the host returns it. */
export interface ScriptMetrics {
  bars: number;
  trades: number;
  win_rate: number;
  expectancy: number;
  profit_factor: number;
  payoff: number;
  total_return: number;
  cagr: number;
  sharpe: number;
  max_drawdown: number;
  exposure: number;
  /// How trades ended. Present only when the host supplies exit reasons.
  stopped_out?: number;
  took_target?: number;
  signal_exits?: number;
}

/** A strategy's scorecard. `deflated_sharpe`/`confidence` are absent under `no-evidence`. */
export interface ScriptScorecard {
  verdict: "clears-exam-one" | "below-the-bar" | "no-evidence";
  out_of_sample: ScriptMetrics;
  in_sample: ScriptMetrics;
  split_bar: number;
  deflated_sharpe?: number | null;
  confidence?: number | null;
  search_benchmark: number;
  n_trials: number;
  /** Buy-and-hold on the same bars. Absent if the host omits it. */
  benchmark?: ScriptMetrics;
  beats_hold?: boolean;
  /** Why the result came out this way. Absent if the host omits it. */
  findings?: {
    code: string;
    severity: "fatal" | "warning" | "note";
    claim: string;
    evidence: { name: string; value: number; unit: string; rendered: string }[];
  }[];
  /** What to try next. Always labelled — nothing machine-written appears unlabelled. */
  drafts?: {
    code: string;
    because: string;
    suggestion: string;
    rationale: string;
    edit_what: string | null;
    edit_snippet: string | null;
    is_draft: boolean;
  }[];
  total_cost: number;
  cost_bps_per_side: number;
  unfilled: number;
  clears_exam_one: boolean;
  /** Every fill, so the chart can show WHERE a stop fired. Absent if the host omits it. */
  fills?: { time: number; bar: number; price: number; reason: "entry" | "reverse" | "close" | "stop" | "target"; qty: number }[];
  /** Fills dropped by the payload cap — reported so a truncated overlay cannot read as complete. */
  fills_truncated?: number;
}

/** A strategy scored across MANY instruments , from the host. */
export interface ScriptSweep {
  verdict: "clears-exam-one" | "below-the-bar" | "no-evidence";
  pooled: ScriptMetrics;
  dispersion: {
    tested: number;
    traded: number;
    profitable: number;
    hit_rate: number;
    median_return: number;
    best_return: number;
    worst_return: number;
    spread: number;
    top_contribution: number;
  };
  total_trades: number;
  deflated_sharpe: number;
  search_benchmark: number;
  n_trials: number;
  span_years: number;
  cost_bps_per_side: number;
  skipped_for_history: number;
  /** Limitations that apply to this result. Rendered, not hidden — see the panel. */
  caveats: string[];
  /** Every instrument's own result, best first. The audit trail behind the dispersion figures. */
  per_symbol?: { symbol: string; bars: number; trades: number; total_return: number; max_drawdown: number }[];
}

export interface ScriptEditorProps {
  theme: Theme;
  /** Current source. The host owns it so a draft survives the panel being closed. */
  value: string;
  onChange: (src: string) => void;
  /** Run the script. The host does the fetching; this component never talks to the network. */
  onRun: () => void;
  onClose: () => void;
  /** Set while a run is in flight, so the button can say so honestly. */
  running?: boolean;
  /** A compile/runtime failure to surface, or null. */
  error?: ScriptError | null;
  /** A short success note, e.g. "3 plots over 250 bars". */
  status?: string | null;
  /**
   * The strategy library. The HOST fetches it (this component never talks to the network) and
   * passes it down; an empty list simply hides the picker, so an offline chart still edits.
   */
  library?: ScriptPreset[];
  /** Score the current source. The host does the fetching. */
  onBacktest?: () => void;
  /** The most recent scorecard, or null. */
  scorecard?: ScriptScorecard | null;
  backtesting?: boolean;
  /** Score across the whole stored universe. The host does the fetching. */
  onSweep?: () => void;
  sweep?: ScriptSweep | null;
  sweeping?: boolean;
}

const EXAMPLE = `indicator("Squeeze", overlay = false)

// Bollinger bands inside Keltner channels — volatility coiling.
// An indicator with several parts hands them all back at once;
// name them in order and each is an ordinary series from there.
[bbUp, bbMid, bbLo] = bb(close, 20, 2)
[kcUp, kcMid, kcLo] = keltner(20, 1.5, 20)

width = (bbUp - bbLo) / kcMid
squeeze = bbUp < kcUp and bbLo > kcLo

plot(width, title = "Band width", color = color.accent)
plot(squeeze ? 0 : na, title = "Squeeze", color = color.s3, style = style.step, width = 3)
`;

export function ScriptEditor({
  theme: th,
  value,
  onChange,
  onRun,
  onClose,
  running,
  error,
  status,
  library,
  onBacktest,
  scorecard,
  backtesting,
  onSweep,
  sweep,
  sweeping,
}: ScriptEditorProps) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  const lines = useMemo(() => Math.max(value.split("\n").length, 12), [value]);

  // Seed an empty editor with something runnable, so the first experience is a working script
  // rather than a blank box and a guess at the syntax.
  useEffect(() => {
    if (!value) onChange(EXAMPLE);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the gutter aligned with the textarea's own scrolling.
  useEffect(() => {
    if (gutterRef.current) gutterRef.current.scrollTop = scrollTop;
  }, [scrollTop]);

  const [browsing, setBrowsing] = useState(false);
  const [showRows, setShowRows] = useState(false); // the sweep's per-instrument breakdown
  const presets = library ?? [];
  // Only the first line of the preset's prose — enough to choose by, in a list this size.
  const gist = (d: string) => (d.split("\n").find((l) => l.trim().length > 0) ?? "").trim();

  const mono = th.monoFont.replace(/^\d+(\.\d+)?px/, "12px");
  const soft = (c: string, pct: number) => `color-mix(in srgb, ${c} ${pct}%, transparent)`;

  const btn = (primary = false): CSSProperties => ({
    height: 26,
    padding: "0 11px",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 600,
    fontFamily: th.font,
    background: primary ? soft(th.line, 18) : "transparent",
    color: primary ? th.line : th.text,
  });

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "absolute",
        left: 8,
        right: 8,
        bottom: 8,
        zIndex: 12,
        display: "flex",
        flexDirection: "column",
        maxHeight: "62%",
        borderRadius: 12,
        overflow: "hidden",
        background: `color-mix(in srgb, ${th.paneBackground} 96%, transparent)`,
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        border: `1px solid ${th.border}`,
        boxShadow: "0 16px 44px rgba(0,0,0,0.5)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderBottom: `1px solid ${th.border}` }}>
        <span style={{ fontFamily: th.font, fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: th.text }}>
          Script
        </span>
        {presets.length > 0 && (
          <button
            style={{ ...btn(browsing), height: 22, padding: "0 9px", fontSize: 11 }}
            title="Load a strategy from the library"
            onClick={() => setBrowsing((b) => !b)}
          >
            {browsing ? "Close library" : `Library · ${presets.length}`}
          </button>
        )}
        <span style={{ flex: 1 }} />
        {status && !error && (
          <span style={{ fontFamily: th.monoFont, fontSize: 11, color: th.text }}>{status}</span>
        )}
        {onSweep && (
          <button
            style={btn()}
            onClick={onSweep}
            disabled={sweeping}
            title="Score this strategy across every instrument with stored history"
          >
            {sweeping ? "Sweeping…" : "Sweep"}
          </button>
        )}
        {onBacktest && (
          <button
            style={btn()}
            onClick={onBacktest}
            disabled={backtesting}
            title="Score this strategy out-of-sample, after costs"
          >
            {backtesting ? "Scoring…" : "Score"}
          </button>
        )}
        <button style={btn(true)} onClick={onRun} disabled={running} title="Run (Ctrl/Cmd + Enter)">
          {running ? "Running…" : "▶ Run"}
        </button>
        <button style={btn()} onClick={onClose} aria-label="Close editor">✕</button>
      </div>

      {browsing && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            maxHeight: 260,
            overflowY: "auto",
            background: th.background,
            borderBottom: `1px solid ${th.border}`,
          }}
        >
          <div
            style={{
              padding: "8px 12px 4px",
              fontFamily: th.font,
              fontSize: 11,
              lineHeight: 1.5,
              color: soft(th.text, 80),
            }}
          >
            Independent implementations of published techniques — a starting point to read and edit,
            not a product. Loading one replaces the editor's contents.
          </div>
          {presets.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                onChange(p.source);
                setBrowsing(false);
                taRef.current?.focus();
              }}
              title={`Load ${p.title}`}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "8px 12px",
                border: "none",
                borderTop: `1px solid ${soft(th.border, 60)}`,
                background: "transparent",
                cursor: "pointer",
                fontFamily: th.font,
              }}
            >
              <div style={{ fontSize: 12.5, fontWeight: 600, color: th.textStrong }}>{p.title}</div>
              <div style={{ fontSize: 11, lineHeight: 1.45, color: soft(th.text, 85), marginTop: 2 }}>
                {gist(p.description)}
              </div>
            </button>
          ))}
        </div>
      )}

      {sweep && !browsing && (
        <div style={{ padding: "10px 12px 12px", background: th.background, borderBottom: `1px solid ${th.border}` }}>
          {(() => {
            const s = sweep;
            // Defensive for the same reason the host reads payloads defensively: this renders
            // inside an error boundary that blanks the chart, so one absent field would cost the
            // whole view rather than one line of it.
            const d = s.dispersion ?? { tested: 0, traded: 0, profitable: 0, hit_rate: 0, median_return: 0, best_return: 0, worst_return: 0, spread: 0, top_contribution: 0 };
            const p = s.pooled ?? ({} as ScriptMetrics);
            const caveats = s.caveats ?? [];
            const rows = s.per_symbol ?? [];
            const num = (v: unknown, d2 = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d2);
            const tone =
              s.verdict === "clears-exam-one" ? th.up : s.verdict === "no-evidence" ? th.text : th.down;
            const label =
              s.verdict === "clears-exam-one"
                ? "Clears exam one"
                : s.verdict === "no-evidence"
                  ? "No evidence"
                  : "Below the bar";
            const pct = (v: number) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(0)}%`;
            const tile = (l: string, v: string) => (
              <div key={l} style={{ minWidth: 78 }}>
                <div style={{ fontFamily: mono, fontSize: 13, fontWeight: 600, color: th.textStrong, fontVariantNumeric: "tabular-nums" }}>{v}</div>
                <div style={{ fontFamily: th.font, fontSize: 10, color: soft(th.text, 85), marginTop: 1 }}>{l}</div>
              </div>
            );
            return (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{ fontFamily: th.font, fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: soft(th.text, 90) }}>
                    Universe sweep
                  </span>
                  <span
                    style={{
                      fontFamily: th.font,
                      fontSize: 10.5,
                      fontWeight: 700,
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                      color: tone,
                      border: `1px solid ${soft(tone, 45)}`,
                      background: soft(tone, 12),
                      borderRadius: 5,
                      padding: "2px 7px",
                    }}
                  >
                    {label}
                  </span>
                  <span style={{ fontFamily: th.font, fontSize: 11, color: soft(th.text, 90) }}>
                    {num(s.total_trades)} trades across {d.tested} instruments · {num(s.span_years).toFixed(1)}y
                  </span>
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 15, marginBottom: 9 }}>
                  {tile("Deflated Sharpe", num(s.deflated_sharpe).toFixed(2))}
                  {tile("Pooled return", pct(num(p.total_return)))}
                  {tile("Max drawdown", `${(num(p.max_drawdown) * 100).toFixed(1)}%`)}
                  {tile("Median name", pct(num(d.median_return)))}
                  {tile("Profitable", `${d.profitable}/${d.traded}`)}
                  {tile("Top name's share", `${(d.top_contribution * 100).toFixed(0)}%`)}
                </div>

                {/* WHICH instruments, not just how many. The dispersion numbers say 71% were
                    profitable and one name carried 24% of the profit; without the per-instrument
                    rows there is no way to check either claim, or to notice that the winners are
                    all one sector. Best and worst both shown — a list truncated to winners would
                    be the most flattering possible reading of a sweep. */}
                {rows.length > 0 && (
                  <div style={{ marginBottom: 9 }}>
                    <button
                      style={{ ...btn(showRows), height: 20, padding: "0 8px", fontSize: 10.5, marginBottom: showRows ? 5 : 0 }}
                      onClick={() => setShowRows((v) => !v)}
                    >
                      {showRows ? "Hide instruments" : `Show all ${rows.length} instruments`}
                    </button>
                    {showRows && (
                      <div style={{ maxHeight: 150, overflowY: "auto", border: `1px solid ${soft(th.border, 70)}`, borderRadius: 6 }}>
                        {rows.map((r, i) => (
                          <div
                            key={r.symbol}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              padding: "3px 8px",
                              borderTop: i === 0 ? "none" : `1px solid ${soft(th.border, 45)}`,
                              fontFamily: mono,
                              fontSize: 11,
                              fontVariantNumeric: "tabular-nums",
                            }}
                          >
                            <span style={{ width: 62, color: th.textStrong }}>{r.symbol}</span>
                            <span style={{ width: 62, textAlign: "right", color: r.total_return >= 0 ? th.up : th.down }}>
                              {pct(num(r.total_return))}
                            </span>
                            <span style={{ width: 58, textAlign: "right", color: soft(th.text, 85) }}>
                              −{(num(r.max_drawdown) * 100).toFixed(0)}%
                            </span>
                            <span style={{ width: 46, textAlign: "right", color: soft(th.text, 85) }}>
                              {r.trades}t
                            </span>
                            <span style={{ flex: 1, textAlign: "right", color: soft(th.text, 60), fontSize: 10 }}>
                              {r.bars} bars
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* The caveats are the point of a pooled figure, not a footnote to it. */}
                {caveats.length > 0 && (
                  <div
                    style={{
                      fontFamily: th.font,
                      fontSize: 10.5,
                      lineHeight: 1.55,
                      color: soft(th.text, 92),
                      borderLeft: `2px solid ${soft(th.down, 55)}`,
                      paddingLeft: 9,
                    }}
                  >
                    {caveats.map((c, i) => (
                      <div key={i} style={{ marginBottom: i === caveats.length - 1 ? 0 : 4 }}>
                        {c}
                      </div>
                    ))}
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}

      {scorecard && !browsing && (
        <div style={{ padding: "10px 12px 12px", background: th.background, borderBottom: `1px solid ${th.border}` }}>
          {(() => {
            const sc = scorecard;
            const o = sc.out_of_sample;
            const is = sc.in_sample;
            // Status colour ALWAYS travels with the word — never colour alone.
            const verdict =
              sc.verdict === "clears-exam-one"
                ? { label: "Clears exam one", tone: th.up, note: "earns a paper burn-in — not capital" }
                : sc.verdict === "no-evidence"
                  ? { label: "No evidence", tone: th.text, note: "no completed out-of-sample trade — untested, not disproven" }
                  : { label: "Below the bar", tone: th.down, note: "real out-of-sample trades, not good enough" };
            const pct = (v: number) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(2)}%`;
            const num = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : "—");
            // Tabular figures in the tile ROW so the columns line up; the hero keeps
            // proportional figures, which is what a large standalone number wants.
            const tile = (label: string, val: string) => (
              <div key={label} style={{ minWidth: 74 }}>
                <div style={{ fontFamily: mono, fontSize: 13.5, fontWeight: 600, color: th.textStrong, fontVariantNumeric: "tabular-nums" }}>
                  {val}
                </div>
                <div style={{ fontFamily: th.font, fontSize: 10, color: soft(th.text, 85), marginTop: 1 }}>{label}</div>
              </div>
            );
            return (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span
                    style={{
                      fontFamily: th.font,
                      fontSize: 10.5,
                      fontWeight: 700,
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                      color: verdict.tone,
                      border: `1px solid ${soft(verdict.tone, 45)}`,
                      background: soft(verdict.tone, 12),
                      borderRadius: 5,
                      padding: "2px 7px",
                    }}
                  >
                    {verdict.label}
                  </span>
                  <span style={{ fontFamily: th.font, fontSize: 11, color: soft(th.text, 90) }}>{verdict.note}</span>
                </div>

                {/* Exactly one hero figure, and it is the OUT-OF-SAMPLE return. */}
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 9 }}>
                  <div style={{ fontFamily: th.font, fontSize: 30, fontWeight: 600, lineHeight: 1.05, color: o.trades > 0 ? (o.total_return >= 0 ? th.up : th.down) : th.text }}>
                    {o.trades > 0 ? pct(o.total_return) : "—"}
                  </div>
                  <div style={{ fontFamily: th.font, fontSize: 11, color: soft(th.text, 90) }}>
                    Out-of-sample return · {o.trades} closed {o.trades === 1 ? "trade" : "trades"} over {o.bars} bars
                  </div>
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginBottom: 9 }}>
                  {tile("Sharpe", num(o.sharpe))}
                  {tile("Max drawdown", `${(o.max_drawdown * 100).toFixed(1)}%`)}
                  {tile("Expectancy", `${(o.expectancy * 100).toFixed(2)}%`)}
                  {tile("Profit factor", num(o.profit_factor))}
                  {tile("Exposure", `${(o.exposure * 100).toFixed(0)}%`)}
                  {tile("Win rate", `${(o.win_rate * 100).toFixed(0)}%`)}
                </div>

                {(() => {
                  // WHY. Every claim carries the numbers it rests on, so a reader can check the
                  // sentence rather than trust it — the host's whole acceptance test is that no
                  // factual sentence is an orphan. Fatal first: someone scanning this is looking
                  // for what disqualifies the result.
                  const fs = sc.findings ?? [];
                  if (!fs.length) return null;
                  // Fatal and warning share the loss hue at different weights — one colour, one meaning
                  // (the one-colour rule). A third hue for "warning" would make the palette say two things.
                  const tone = (sev: string) => (sev === "fatal" ? th.down : sev === "warning" ? soft(th.down, 80) : soft(th.text, 75));
                  return (
                    <div style={{ marginBottom: 9 }}>
                      {fs.map((f) => (
                        <div key={f.code} style={{ fontFamily: th.font, fontSize: 10.5, lineHeight: 1.6, marginBottom: 4 }}>
                          <span style={{ color: tone(f.severity), fontWeight: 600, textTransform: "uppercase", fontSize: 9 }}>
                            {f.severity}
                          </span>{" "}
                          <span style={{ color: soft(th.text, 92) }}>{f.claim}</span>
                          {f.evidence.length > 0 && (
                            <span style={{ color: soft(th.text, 65) }}>
                              {"  "}
                              {f.evidence.map((e) => `${e.name.replace(/_/g, " ")} ${e.rendered}`).join(" · ")}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {(() => {
                  // WHAT DOING NOTHING EARNED, on the same bars, under the same costs. Shown next
                  // to the headline because a return without it is unreadable: a long-biased
                  // strategy in a rising market inherits the market's result, and "+464%" reads as
                  // a triumph until you learn that holding returned +7,282% over the same window.
                  const b = sc.benchmark;
                  if (!b || o.trades === 0) return null;
                  const won = sc.beats_hold === true;
                  return (
                    <div style={{ fontFamily: th.font, fontSize: 10.5, lineHeight: 1.6, color: soft(th.text, 85), marginBottom: 7 }}>
                      Buy and hold, same bars ·{" "}
                      <span style={{ color: soft(th.text, 95) }}>{pct(b.total_return)} return</span>
                      {" · "}
                      <span style={{ color: soft(th.text, 95) }}>Sharpe {num(b.sharpe)}</span>
                      {" — "}
                      <span style={{ color: won ? th.up : th.down, fontWeight: 600 }}>
                        {won ? "this strategy beats it" : "this strategy LOSES to it"}
                      </span>
                      {!won && (
                        <span style={{ color: soft(th.text, 75) }}>
                          {" "}· doing nothing was better per unit of risk, so exam one is not cleared however good the Sharpe looks.
                        </span>
                      )}
                    </div>
                  );
                })()}

                {(() => {
                  // HOW the trades ended. A stop that is armed but never touched is a stop that did
                  // nothing, and the difference decides whether the protective level IS the strategy
                  // or is decoration. Rendered only when the record actually carries the breakdown,
                  // so an older host shows nothing rather than three confident zeros.
                  const st = o.stopped_out, tg = o.took_target, sg = o.signal_exits;
                  if (st == null || tg == null || sg == null || o.trades === 0) return null;
                  const share = (n: number) => `${((n / o.trades) * 100).toFixed(0)}%`;
                  return (
                    <div style={{ fontFamily: th.font, fontSize: 10.5, lineHeight: 1.6, color: soft(th.text, 85), marginBottom: 7 }}>
                      How trades ended ·{" "}
                      <span style={{ color: st > 0 ? th.down : soft(th.text, 70) }}>{st} stopped out ({share(st)})</span>
                      {" · "}
                      <span style={{ color: tg > 0 ? th.up : soft(th.text, 70) }}>{tg} hit target ({share(tg)})</span>
                      {" · "}
                      <span>{sg} on signal ({share(sg)})</span>
                      {st === 0 && tg === 0 && (
                        <span style={{ color: soft(th.text, 70) }}>
                          {" "}— no protective level was ever touched, so the stop changed nothing here.
                        </span>
                      )}
                    </div>
                  );
                })()}

                {(() => {
                  // "BELOW THE BAR" IS THE NORMAL ANSWER, and saying so is not softening the
                  // verdict — it is the context that makes the verdict readable. Across the shipped
                  // library over 20 years and 325 instruments, two of seventeen beat buy-and-hold,
                  // both by margins indistinguishable from noise. A user seeing their first
                  // "below-the-bar" without that concludes the tool is broken; a user who knows it
                  // concludes what the number actually says.
                  //
                  // Shown only on a NEGATIVE verdict. Printing it beside a pass would read as
                  // undermining a result the scorer just certified.
                  if (sc.verdict === "clears-exam-one" || o.trades === 0) return null;
                  return (
                    <div style={{ fontFamily: th.font, fontSize: 10, lineHeight: 1.6, color: soft(th.text, 62), marginBottom: 7 }}>
                      Most strategies land here. Of the seventeen in this library, two beat buy-and-hold
                      over twenty years — both by margins indistinguishable from noise. A negative
                      verdict is the usual outcome of an honest test, not a fault in the strategy or
                      the test.
                    </div>
                  );
                })()}

                {(() => {
                  // WHAT TO TRY NEXT. Labelled DRAFT on every entry, because these are proposals
                  // about a future that has not happened — no evidence can make one true in
                  // advance, and the design rule is explicit that nothing machine-written appears unlabelled.
                  // Each cites the finding it answers, so the chain is followable: this number,
                  // therefore this observation, therefore this experiment.
                  const ds = sc.drafts ?? [];
                  if (!ds.length) return null;
                  return (
                    <div style={{ marginBottom: 9, paddingTop: 7, borderTop: `1px solid ${soft(th.text, 15)}` }}>
                      {ds.map((d) => (
                        <div key={d.code} style={{ fontFamily: th.font, fontSize: 10.5, lineHeight: 1.6, marginBottom: 6 }}>
                          <span
                            style={{
                              color: th.background,
                              background: soft(th.text, 55),
                              fontSize: 8.5,
                              fontWeight: 700,
                              padding: "1px 4px",
                              borderRadius: 2,
                              letterSpacing: 0.4,
                            }}
                          >
                            DRAFT
                          </span>{" "}
                          <span style={{ color: soft(th.text, 92) }}>{d.suggestion}</span>{" "}
                          <span style={{ color: soft(th.text, 62) }}>{d.rationale}</span>
                          {d.edit_snippet && (
                            <pre
                              style={{
                                margin: "4px 0 0",
                                padding: 6,
                                background: soft(th.text, 8),
                                borderRadius: 3,
                                fontSize: 10,
                                whiteSpace: "pre-wrap",
                                color: soft(th.text, 80),
                              }}
                            >
                              {d.edit_what ? `// ${d.edit_what}\n` : ""}
                              {d.edit_snippet}
                            </pre>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })()}

                <div style={{ fontFamily: th.font, fontSize: 10.5, lineHeight: 1.6, color: soft(th.text, 85) }}>
                  <div>
                    {sc.deflated_sharpe == null
                      ? `Nothing to deflate — the out-of-sample half never traded.`
                      : `Deflated Sharpe ${num(sc.deflated_sharpe)} · had to clear ${num(sc.search_benchmark, 3)} because ${sc.n_trials} strategies were tried${
                          sc.confidence == null ? "" : ` · confidence ${(sc.confidence * 100).toFixed(0)}%`
                        }`}
                  </div>
                  <div>
                    Costs charged {(sc.total_cost * 100).toFixed(3)}% of the account at {sc.cost_bps_per_side}bp per side
                    {sc.unfilled > 0 ? ` · ${sc.unfilled} order signalled on the last bar never filled` : ""}
                  </div>
                  <div style={{ color: soft(th.text, 65) }}>
                    In-sample, for contrast only: {pct(is.total_return)}, Sharpe {num(is.sharpe)} over {is.bars} bars.
                    A wide gap to the figure above is the strategy telling you it was fitted.
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      )}

      <div style={{ display: "flex", flex: 1, minHeight: 0, background: th.background }}>
        <div
          ref={gutterRef}
          style={{
            overflow: "hidden",
            padding: "8px 0",
            width: 40,
            flex: "none",
            textAlign: "right",
            fontFamily: mono,
            fontSize: 12,
            lineHeight: "18px",
            color: soft(th.text, 70),
            borderRight: `1px solid ${th.border}`,
            userSelect: "none",
          }}
        >
          {Array.from({ length: lines }, (_, i) => {
            const bad = error && error.line === i + 1;
            return (
              <div
                key={i}
                style={{
                  padding: "0 7px 0 0",
                  background: bad ? soft(th.down, 22) : "transparent",
                  color: bad ? th.down : undefined,
                  fontWeight: bad ? 700 : undefined,
                }}
              >
                {i + 1}
              </div>
            );
          })}
        </div>
        <textarea
          ref={taRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onScroll={(e) => setScrollTop((e.target as HTMLTextAreaElement).scrollTop)}
          onKeyDown={(e) => {
            // Ctrl/Cmd+Enter runs. Everything else must stay inside the textarea — the chart's own
            // global key handler only guards INPUT/TEXTAREA/SELECT by tag, so stopping propagation
            // here is what keeps Backspace from reaching the engine and deleting a drawing.
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              onRun();
            }
            if (e.key === "Tab") {
              e.preventDefault();
              const t = e.currentTarget;
              const [a, b] = [t.selectionStart, t.selectionEnd];
              const next = value.slice(0, a) + "    " + value.slice(b);
              onChange(next);
              requestAnimationFrame(() => t.setSelectionRange(a + 4, a + 4));
            }
            e.stopPropagation();
          }}
          spellCheck={false}
          autoComplete="off"
          style={{
            flex: 1,
            minWidth: 0,
            resize: "none",
            border: "none",
            outline: "none",
            padding: "8px 10px",
            background: "transparent",
            color: th.textStrong,
            fontFamily: mono,
            fontSize: 12,
            lineHeight: "18px",
            tabSize: 4,
          }}
        />
      </div>

      {error && (
        <div
          style={{
            padding: "7px 10px",
            borderTop: `1px solid ${th.border}`,
            background: soft(th.down, 12),
            color: th.down,
            fontFamily: th.monoFont,
            fontSize: 11.5,
          }}
        >
          line {error.line}: {error.message}
        </div>
      )}
    </div>
  );
}
