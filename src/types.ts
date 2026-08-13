// Public types for the charting engine. The engine is data-source-agnostic: you feed it Bars
// (via a DataFeed) and it renders. Times are UNIX SECONDS (the financial convention); the engine
// never invents a bar it wasn't given.

export interface Bar {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export type SeriesType = "candles" | "bars" | "line" | "area" | "hollow" | "baseline" | "step" | "heikin" | "renko" | "pnf" | "kagi";

// A resolution the datafeed understands (e.g. "1", "5", "60", "1D"). The engine treats it as an
// opaque token it passes back to the feed; it only infers intraday-vs-daily formatting from the
// actual bar spacing in time, never from this string.
export type Resolution = string;

export interface Theme {
  background: string;
  paneBackground: string;
  grid: string;
  border: string;
  text: string;
  textStrong: string;
  crosshair: string;
  crosshairLabelBg: string;
  crosshairLabelText: string;
  up: string;
  down: string;
  upWick: string;
  downWick: string;
  volumeUp: string;
  volumeDown: string;
  line: string;
  font: string;
  monoFont: string;
}

// A value read at the crosshair (for the legend the host renders).
export interface LegendValue {
  label: string;
  value: number | null;
  color: string;
  id?: string; // the owning indicator id on its PRIMARY entry, so the host matches by identity not colour
}

// A host-supplied horizontal line at a fixed price (alerts, orders, targets…). The engine draws it
// across the plot with a left-edge chip + a right-axis tag, tracking the price scale on zoom/pan.
/**
 * A trade plan drawn as a POSITION rather than three loose lines.
 *
 * Three dashed rules and three chips make a reader do the work: pair each level with what it
 * means, hold the entry in their head, and compute how much is at stake either way. A position
 * renders the same numbers as two SHADED ZONES — reward above the entry, risk below it (or
 * inverted on a short) — so the shape carries the answer. Whether a plan is worth taking is
 * mostly the ratio of those two areas, and the eye reads areas far faster than it reads
 * arithmetic.
 *
 * Distinct from a `longpos` DRAWING, which the user places and owns. A plan comes from the host,
 * cannot be selected or dragged, and never enters `getDrawings()` — so it cannot be nudged out
 * of agreement with the model that produced it, and clearing drawings does not clear it.
 */
export interface TradePlan {
  side: "long" | "short";
  entry: number;
  target: number;
  stop: number;
  /** Bar time the plan starts at. Omitted spans the visible width. */
  from?: number;
  /** Names the plan's author on the entry chip — a model, a strategy. */
  label?: string;
}

export interface PriceLine {
  id: string;
  price: number;
  color: string;
  label?: string; // shown in the left chip (e.g. a bell glyph)
  dashed?: boolean;
  removable?: boolean; // draw a small ✕ in the chip; clicking it fires onPriceLineRemove(id)
}

// A host-supplied event ANCHORED TO A BAR AND A PRICE — a backtest fill, a real execution.
//
// Anchored at the price it happened at, never floated above the bar. A stop that filled at 98.00
// belongs at 98.00: the whole reason to draw it is to see it against the candle that triggered it,
// and a glyph parked above the high answers a different question than the one being asked.
export interface ChartMarker {
  time: number; // bar time, epoch seconds
  price: number;
  kind: "entry" | "reverse" | "close" | "stop" | "target";
  /// Signed: positive bought, negative sold. Decides which way an entry glyph points.
  qty?: number;
  label?: string;
}

/**
 * A forward projection: values for the columns AFTER the newest bar.
 *
 * These are explicitly NOT bars, and the engine keeps them that way — they never enter the OHLC
 * readout, the bar count, indicator inputs, volume, or replay. The file-header rule that the engine
 * never invents a bar it wasn't given holds exactly because a projection is a set of columns with
 * no open, high, low or close to report.
 *
 * `mid[k]` is the k-th column past the last real bar (k = 0 is the very next one). `upper`/`lower`
 * draw an uncertainty band around it; supply both or neither. A projection is a claim about the
 * future, so it renders dashed and fading — never as a candle a reader could mistake for history.
 */
export interface Projection {
  mid: number[];
  upper?: number[];
  lower?: number[];
  /** Real timestamps per column, when the host knows the exchange calendar. Without these the
   *  crosshair says "+k" rather than inventing dates that may fall on non-trading days. */
  times?: number[];
  /** Shown in the crosshair readout, e.g. "ATR envelope". Say what produced it. */
  label?: string;
}

export interface DataFeedResult {
  bars: Bar[];
  dataVersion?: string; // provenance label the host can surface (honest sourcing)
}

export interface DataFeed {
  getBars(symbol: string, resolution: Resolution): Promise<DataFeedResult>;
  // Optional realtime: push updated/new bars; return an unsubscribe fn.
  subscribe?(symbol: string, resolution: Resolution, onTick: (bar: Bar) => void): () => void;
  searchSymbols?(query: string): Promise<{ symbol: string; description: string }[]>;
}

/**
 * An exchange's regular trading session, used to tint the bars that fall outside it.
 *
 * Every field is required to describe a real venue because there is no universal one: NEPSE trades
 * 11:00–15:00 Sunday–Thursday, Frankfurt and New York agree on neither hour nor weekend. A chart
 * that assumes one exchange's clock silently mislabels every other.
 */
export interface SessionSpec {
  /** Minutes from midnight when the regular session opens (inclusive). 09:30 → 570. */
  openMin: number;
  /** Minutes from midnight when it closes (exclusive). 16:00 → 960. */
  closeMin: number;
  /** Trading days, 0 = Sunday … 6 = Saturday. Defaults to Mon–Fri. */
  days?: number[];
  /**
   * Read each bar's clock in UTC instead of the viewer's local zone.
   *
   * Set this when bar times are exchange wall-clock stamped as UTC — a common storage convention.
   * Without it the shading is computed against whatever timezone the READER happens to sit in, so
   * the same chart shades differently in Kathmandu and New York. That is a chart that lies.
   */
  utc?: boolean;
}

/** US equities regular hours — the default only because something has to be. */
export const US_EQUITIES_SESSION: SessionSpec = { openMin: 9 * 60 + 30, closeMin: 16 * 60, days: [1, 2, 3, 4, 5] };

export interface ChartOptions {
  theme?: Partial<Theme>;
  seriesType?: SeriesType;
  showVolume?: boolean;
  /**
   * Emphasise volume bars that exceed their own moving average.
   *
   * Volume is on a price chart to answer one question — "was there anything behind this move?" —
   * and a row of equally-bright columns cannot answer it: every bar looks as important as every
   * other, and the reader is left comparing heights by eye against a baseline that is off-screen
   * for most of them. Keying brightness to the volume MA puts the answer in the ink: heavy bars
   * step forward, quiet ones recede, and the direction colour is preserved on both.
   *
   * Off by default — it changes how an existing chart reads.
   */
  volumeEmphasis?: boolean;
  /**
   * Mark the final point of a line/area/step series with a live dot.
   *
   * A line just stops at its right edge, which says nothing about whether the reader is looking
   * at the present or at a window that ends somewhere in the past. A mark on the last point says
   * "this is now" — the detail that separates a glance chart from a plotted array.
   *
   * Static, not pulsing: an animated marker means an unending frame loop per chart purely for
   * decoration, and a page carrying several of them pays that in battery for no information.
   * Drawn only when the newest bar is in view, since the last VISIBLE point is not the last
   * point once the viewport is panned into history.
   */
  endpointMarker?: boolean;
  /**
   * Draw the right price axis and the bottom time axis. `false` gives a bare plot that fills the
   * host — an embedded sparkline, a price-header "hero" chart — with the full plot area used for
   * the series instead of reserving gutters for labels.
   */
  /**
   * The axis gutters. `false` drops both so a bare plot fills the host; an object controls them
   * separately, which is what a glance chart usually wants — a price scale but no time scale,
   * since "what is it worth" survives the loss of chrome and "which Tuesday" mostly does not.
   */
  axes?: boolean | { price?: boolean; time?: boolean };
  /**
   * Respond to pan, zoom, and drawing input. `false` makes the chart read-only; the crosshair
   * still tracks the pointer, so `onCrosshair` keeps driving a host's scrub readout.
   */
  interactive?: boolean;
  /** The exchange session for intraday shading. Defaults to `US_EQUITIES_SESSION`. */
  session?: SessionSpec;
  /**
   * Read bar times as UTC rather than in the viewer's local zone — set this when your timestamps
   * are exchange wall-clock stamped as UTC.
   *
   * Governs the time axis, the crosshair readout AND the session shading, so the whole chart keeps
   * one clock. `SessionSpec.utc` can still override the shading alone, but setting it here is
   * almost always what you want: an axis and a shading that disagree about which day it is mislead
   * quietly, and only for readers in the wrong timezone.
   */
  utc?: boolean;
  // Crosshair readout → the host's legend (OHLC + each open indicator's value at that bar).
  onCrosshair?: (bar: Bar | null, values: LegendValue[]) => void;
  // Fired after any pan/zoom or data change: `atRealtime` = is the newest bar parked at the right
  // edge (drives a "go to realtime" affordance); `autoScale` = is the price scale on pure autoscale
  // (vs a manual right-axis stretch). The host may also persist the view or refresh a plan.
  onViewChange?: (v: { atRealtime: boolean; autoScale: boolean }) => void;
  // Provenance label from the last data load (host renders the honesty pill).
  onData?: (dataVersion: string | undefined, count: number) => void;
  // Fired after drawings are created / edited / deleted, so the host can persist them.
  onDrawingsChange?: () => void;
  // Fired when the selected drawing changes (or moves) — the host renders a style popover near
  // (x, y). null when nothing is selected.
  onSelectionChange?: (sel: { id: number; color?: string; width?: number; style?: "solid" | "dashed" | "dotted"; x: number; y: number } | null) => void;
  // Fired when the active tool changes (incl. the engine auto-reverting to "cross" after placing
  // a drawing), so the host's toolbar highlight stays in sync.
  onToolChange?: (tool: string) => void;
  // Fired when bar-replay state changes (armed to pick a start, or stepping) so the host can
  // render the replay control bar. null when replay is off.
  onReplay?: (state: { active: boolean; arming: boolean; index: number; total: number } | null) => void;
  // Click on the right price axis → the price at that y (host may create an alert / order there).
  onAxisClickPrice?: (price: number) => void;
  // Click a price line's ✕ → remove it (host owns the underlying object, e.g. deletes the alert).
  onPriceLineRemove?: (id: string) => void;
}

export type ScaleMode = "normal" | "log" | "percent";

// An indicator instance on the chart. `kind` selects the calc; `inputs` are its periods.
export interface IndicatorInstance {
  id: string;
  kind: string; // "MA" | "EMA" | "BOLL" | "RSI" | "MACD" | "VWAP" | ...
  inputs: number[];
  pane: "price" | "separate"; // overlay the price pane, or get a stacked pane of its own
  color?: string;
}
