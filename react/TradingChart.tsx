"use client";
// A self-contained React binding — a self-contained trading chart: top toolbar (symbol,
// timeframe tabs, chart type, indicators, drawing tools) + left drawing rail + the OHLC legend,
// all wired to the framework-agnostic Chart engine and fed by a DataFeed. Drop it into any app.
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Chart, type Tool } from "../src/chart";
import { Icon } from "./icons";
import { ScriptEditor, type ScriptError, type ScriptPreset, type ScriptScorecard, type ScriptSweep, type SavedStrategy } from "./ScriptEditor";
import { parseScriptDraw, type ScriptRender } from "../src/script";
import { DARK, LIGHT, THEMES, THEME_NAMES, SERIES_PALETTE as IND_PALETTE, SWATCHES, CMP_COLORS, CHIP_INK } from "../src/util";
import type { Drawing } from "../src/drawings";
import type { Bar, DataFeed, IndicatorInstance, LegendValue, PriceLine, Projection, ScaleMode, SeriesType, SessionSpec, Theme, ChartMarker } from "../src/types";

// Drawings persist per symbol in localStorage, so they survive reloads + symbol switches.
const drawKey = (s: string) => `aurovie-chart-drawings:${s.toUpperCase()}`;
function loadDrawings(s: string): Drawing[] {
  try {
    return JSON.parse(localStorage.getItem(drawKey(s)) || "[]");
  } catch {
    return [];
  }
}
function saveDrawings(s: string, list: Drawing[]) {
  try {
    localStorage.setItem(drawKey(s), JSON.stringify(list));
  } catch {
    /* storage blocked — drawings just live for the session */
  }
}

// Display preferences (grid, volume, watermark, profile, …) persist as one blob, so a user who set
// the chart up the way they like gets it back on reload instead of re-toggling six switches. Unknown
// or corrupt storage falls back to the defaults rather than throwing.
type Prefs = {
  grid: boolean;
  vol: boolean;
  lastPrice: boolean;
  magnet: boolean;
  vpvr: boolean;
  sessions: boolean;
  countdown: boolean;
  watermark: boolean;
  dataWindow: boolean;
  /// Draw stop/target levels for open trades and forward suggestions. On by default: a stop you
  /// are carrying is not decoration, and a chart that hides it is the one place it matters least
  /// to be tidy.
  levels: boolean;
};
const PREFS_KEY = "aurovie-chart-prefs";
const DEFAULT_PREFS: Prefs = { grid: true, vol: true, lastPrice: true, magnet: false, vpvr: false, sessions: true, countdown: true, watermark: true, dataWindow: false, levels: true };
function loadPrefs(): Prefs {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}");
    const out = { ...DEFAULT_PREFS };
    for (const k of Object.keys(DEFAULT_PREFS) as (keyof Prefs)[]) if (typeof raw[k] === "boolean") out[k] = raw[k];
    return out;
  } catch {
    return DEFAULT_PREFS; // storage blocked or server render — the defaults are a good chart
  }
}

export interface TimeframeOption {
  label: string;
  value: string;
}
export interface TradingChartProps {
  datafeed: DataFeed;
  symbol: string;
  timeframes?: TimeframeOption[];
  resolution?: string;
  theme?: "dark" | "light";
  themeOverride?: Partial<Theme>;
  height?: number | string;
  toolbar?: boolean;
  drawingRail?: boolean;
  onProvenance?: (dataVersion: string | undefined) => void;
  onResolutionChange?: (resolution: string) => void; // user picked an interval in the toolbar → host may persist it
  indicators?: string[]; // host-seeded active indicator ids (from a grammar spec, e.g. AAPL C VWAP RSI); the user's toolbar picks then take over
  chartType?: SeriesType; // host-seeded series type (from a grammar type token); the user's toolbar picks then take over
  compareSymbols?: string[]; // host-seeded compare tickers (from a grammar VS: token, e.g. AAPL C 6M VS:TSLA); the user's toolbar Compare menu then takes over
  sr?: boolean; // draw auto support/resistance levels (pivot-based, off the real bars)
  overlay?: ReactNode; // e.g. on-chart Buy/Sell — absolutely positioned over the plot
  priceLines?: PriceLine[]; // host-supplied horizontal lines (alerts/orders/targets)
  /** Bar-anchored events (backtest fills, real executions), drawn at the price they happened. */
  markers?: ChartMarker[];
  onAxisClickPrice?: (price: number) => void; // click the price axis → create at that price
  onPriceLineRemove?: (id: string) => void; // click a price line's ✕ → remove it
  // Run a user script against the CURRENT symbol/resolution and return the host's reply. The
  // widget never fetches: the host owns auth and the base URL, exactly as the datafeed does.
  onRunScript?: (source: string) => Promise<{ draw: unknown; bars: number; error?: ScriptError | null }>;
  /**
   * The strategy library, fetched by the host. The chart never talks to
   * the network; it only renders what it is handed. Omitted or empty simply hides the picker.
   */
  scriptLibrary?: ScriptPreset[];
  /**
   * Stop / target / entry levels the HOST supplies — an open trade's protection, or a forward
   * suggestion's. Kept separate from `priceLines` (the alert book) so the ⚙ toggle can hide these
   * without touching alerts, and so a host that has neither still gets alerts.
   */
  levels?: PriceLine[];
  /**
   * Score the current strategy. Host-supplied, like `onRunScript` — the chart never fetches. When
   * a saved strategy is loaded, its id is passed too, so the host can cache the score against it.
   */
  onBacktestScript?: (source: string, savedId?: string | number) => Promise<ScriptScorecard | null>;
  /** Score across every instrument with stored history. Host-supplied, like the others. */
  onSweepScript?: (source: string) => Promise<ScriptSweep | null>;
  /**
   * The user's saved strategies — the editable layer above `scriptLibrary`. Host-persisted; the
   * chart only lists, loads, saves and deletes them through the callbacks below. Absent → the
   * editor simply shows no "Yours" section, so a host without persistence is unaffected.
   */
  savedLibrary?: SavedStrategy[];
  /** Persist edits to the loaded saved strategy. Receives the current source and that strategy's id. */
  onSaveScript?: (source: string, id: string | number) => Promise<void>;
  /** Create a NEW saved strategy from the current source under `title`; return it so the editor tracks it. */
  onSaveAsScript?: (source: string, title: string) => Promise<SavedStrategy | null>;
  /** Delete a saved strategy by id. */
  onDeleteSavedScript?: (id: string | number) => Promise<void>;
  /**
   * Mirror of the crosshair readout the widget already renders in its own legend, so a host can
   * drive chrome OUTSIDE the chart from the hovered bar (a price header that follows the scrub,
   * say). Null bar = the pointer left the plot.
   *
   * Purely an observer: the widget's legend is unaffected by whether anyone listens.
   */
  onCrosshair?: (bar: Bar | null, values: LegendValue[]) => void;
  /**
   * Host-computed series drawn with the same machinery as a user script — a model forecast, a
   * backtest equity curve, anything the host calculates rather than the engine.
   *
   * Kept separate from the script editor's output: these are the HOST's, so the widget never
   * clears them on a symbol/interval change (it cannot know whether the host has already
   * recomputed). Bar-alignment is therefore the host's responsibility — a stale series here
   * draws misaligned, exactly as a lying chart would.
   */
  scripts?: ScriptRender[];
  /**
   * Indicator ids the host does not permit (a subscription tier, a data entitlement). They stay
   * VISIBLE and listed — a lock the user can see is an upsell; a hidden feature is just absence —
   * but selecting one fires `onLockedIndicator` instead of activating it.
   */
  lockedIndicators?: string[];
  /** Fired when the user picks a locked indicator, so the host can prompt (e.g. an upgrade sheet). */
  onLockedIndicator?: (id: string) => void;
  /**
   * The exchange's trading session, driving the intraday out-of-hours shading (which the user
   * toggles in chart settings). Defaults to US equities — set it for any other venue, or the
   * shading marks the wrong bars.
   */
  session?: SessionSpec;
  /**
   * Read bar times as UTC instead of the viewer's local zone — for timestamps stored as exchange
   * wall-clock. Governs the axis, the crosshair readout and the session shading together.
   */
  utc?: boolean;
  /**
   * A forward projection drawn past the newest bar — a model cone, a scenario band.
   *
   * Cleared automatically whenever the chart loads a new series, because a projection computed
   * against one symbol/interval is meaningless against another. Pass null to remove it.
   */
  projection?: Projection | null;
  /**
   * Visible-window presets ("1M · 6M · 1Y · All"), shown as a strip in the toolbar. Pass `false` to
   * hide it, or your own list to match the history you actually serve — offering 5Y for an
   * instrument with six months of bars is a dead button.
   */
  ranges?: RangePreset[] | false;
  /**
   * An instrument identity block above the toolbar — ticker, name, sector, and whatever reference
   * stats the host actually has. Omitted entirely when absent, so a chart embedded in a page that
   * already names the instrument doesn't say it twice.
   */
  header?: InstrumentHeader;
}

/**
 * The identity of what is being charted. Every field is optional because instrument metadata is
 * never uniformly available: an index has no sector, a freshly-listed name has no 52-week range.
 * A field the host cannot fill is simply not rendered — never rendered as "—" or a zero, which
 * would state something false about the instrument.
 */
export interface InstrumentHeader {
  /** Defaults to the chart's `symbol` prop. */
  ticker?: string;
  name?: string;
  sector?: string;
  /** Reference stats: 52-week range, volume, trade count, as-of date. */
  stats?: { label?: string; value: string }[];
  /** The headline price. Ignored when `priceSlot` is given. */
  price?: { value: string; change?: string; direction?: "up" | "down" | null };
  /**
   * Replaces the rendered price block — for hosts whose ticker animates (a rolling number, a
   * flash-on-change). The widget owns the layout; the host owns the motion.
   */
  priceSlot?: ReactNode;
}

export interface RangePreset {
  label: string;
  /** Days back from the newest bar; `null` fits the whole history. */
  days: number | null;
}

const DEFAULT_RANGES: RangePreset[] = [
  { label: "1M", days: 30 },
  { label: "3M", days: 90 },
  { label: "6M", days: 180 },
  { label: "1Y", days: 365 },
  { label: "5Y", days: 1825 },
  { label: "All", days: null },
];

const DEFAULT_TF: TimeframeOption[] = [
  { label: "1m", value: "1m" },
  { label: "5m", value: "5m" },
  { label: "15m", value: "15m" },
  { label: "1H", value: "1h" },
  { label: "4H", value: "4h" },
  { label: "1D", value: "1d" },
  { label: "1W", value: "1w" },
  { label: "1M", value: "1mo" },
];
// The interval control, TradingView-style: favourite intervals show as quick tabs; the ▾ menu groups
// the full set. Only the resolutions the host actually serves are offered (no fabricated seconds).
const TF_ORDER = ["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w", "1mo"];
const TF_SHORT: Record<string, string> = { "1m": "1m", "5m": "5m", "15m": "15m", "30m": "30m", "1h": "1H", "4h": "4H", "1d": "1D", "1w": "1W", "1mo": "1M" };
const INTERVAL_GROUPS: { label: string; items: { v: string; l: string }[] }[] = [
  { label: "Minutes", items: [{ v: "1m", l: "1 minute" }, { v: "5m", l: "5 minutes" }, { v: "15m", l: "15 minutes" }, { v: "30m", l: "30 minutes" }] },
  { label: "Hours", items: [{ v: "1h", l: "1 hour" }, { v: "4h", l: "4 hours" }] },
  { label: "Days", items: [{ v: "1d", l: "1 day" }, { v: "1w", l: "1 week" }, { v: "1mo", l: "1 month" }] },
];
const TYPES: { t: SeriesType; label: string; glyph: string }[] = [
  { t: "candles", label: "Candles", glyph: "▮" },
  { t: "hollow", label: "Hollow", glyph: "▯" },
  { t: "bars", label: "Bars", glyph: "⊢" },
  { t: "heikin", label: "Heikin Ashi", glyph: "◫" },
  { t: "line", label: "Line", glyph: "∿" },
  { t: "step", label: "Step", glyph: "⌐" },
  { t: "area", label: "Area", glyph: "◺" },
  { t: "baseline", label: "Baseline", glyph: "⇌" },
  { t: "renko", label: "Renko", glyph: "▤" },
  { t: "pnf", label: "Point & Figure", glyph: "✕" },
  { t: "kagi", label: "Kagi", glyph: "⌇" },
];
// The chart-type menu, grouped like TradingView's.
const TYPE_GROUPS: { label: string; ts: SeriesType[] }[] = [
  { label: "Bars", ts: ["candles", "hollow", "heikin", "bars"] },
  { label: "Lines", ts: ["line", "step", "area", "baseline"] },
  { label: "Price moves", ts: ["renko", "pnf", "kagi"] },
];
// Chart types that resample off the time axis and take a box/reversal size control.
const RESAMPLED: SeriesType[] = ["renko", "pnf", "kagi"];
// Swatch palette for the per-drawing colour editor.
// Line colours assigned to compared symbols, in order.
const INDS: { id: string; kind: string; inputs: number[]; pane: "price" | "separate"; label: string }[] = [
  { id: "ma50", kind: "MA", inputs: [50], pane: "price", label: "MA 50" },
  { id: "ma200", kind: "MA", inputs: [200], pane: "price", label: "MA 200" },
  { id: "ema21", kind: "EMA", inputs: [21], pane: "price", label: "EMA 21" },
  { id: "wma30", kind: "WMA", inputs: [30], pane: "price", label: "WMA 30" },
  { id: "dema21", kind: "DEMA", inputs: [21], pane: "price", label: "Double EMA 21" },
  { id: "tema21", kind: "TEMA", inputs: [21], pane: "price", label: "Triple EMA 21" },
  { id: "hma21", kind: "HMA", inputs: [21], pane: "price", label: "Hull MA 21" },
  { id: "boll", kind: "BOLL", inputs: [20, 2], pane: "price", label: "Bollinger Bands" },
  { id: "donch", kind: "DONCH", inputs: [20], pane: "price", label: "Donchian Channels" },
  { id: "kelt", kind: "KELT", inputs: [20, 2, 10], pane: "price", label: "Keltner Channels" },
  { id: "ichi", kind: "ICHI", inputs: [9, 26, 52], pane: "price", label: "Ichimoku Cloud" },
  { id: "super", kind: "SUPER", inputs: [10, 3], pane: "price", label: "Supertrend" },
  { id: "psar", kind: "PSAR", inputs: [2, 20], pane: "price", label: "Parabolic SAR" },
  { id: "vwap", kind: "VWAP", inputs: [], pane: "price", label: "VWAP" },
  { id: "rsi", kind: "RSI", inputs: [14], pane: "separate", label: "RSI 14" },
  { id: "adx", kind: "ADX", inputs: [14], pane: "separate", label: "ADX / DMI 14" },
  { id: "stoch", kind: "STOCH", inputs: [14, 3], pane: "separate", label: "Stochastic" },
  { id: "macd", kind: "MACD", inputs: [12, 26, 9], pane: "separate", label: "MACD" },
  { id: "cci", kind: "CCI", inputs: [20], pane: "separate", label: "Commodity Channel Index" },
  { id: "willr", kind: "WILLR", inputs: [14], pane: "separate", label: "Williams %R" },
  { id: "mfi", kind: "MFI", inputs: [14], pane: "separate", label: "Money Flow Index" },
  { id: "roc", kind: "ROC", inputs: [12], pane: "separate", label: "Rate of Change" },
  { id: "obv", kind: "OBV", inputs: [], pane: "separate", label: "On Balance Volume" },
  { id: "atr", kind: "ATR", inputs: [14], pane: "separate", label: "ATR 14" },
  { id: "vwma20", kind: "VWMA", inputs: [20], pane: "price", label: "Volume-Weighted MA 20" },
  { id: "pivot", kind: "PIVOT", inputs: [], pane: "price", label: "Pivot Points (daily)" },
  { id: "cmf", kind: "CMF", inputs: [20], pane: "separate", label: "Chaikin Money Flow" },
  { id: "aroon", kind: "AROON", inputs: [25], pane: "separate", label: "Aroon" },
  { id: "stochrsi", kind: "STOCHRSI", inputs: [14, 14, 3], pane: "separate", label: "Stochastic RSI" },
  { id: "mom", kind: "MOM", inputs: [10], pane: "separate", label: "Momentum" },
  { id: "trix", kind: "TRIX", inputs: [14, 9], pane: "separate", label: "TRIX" },
];
// Colours the engine assigns to indicators by order — mirrored here so the on-chart legend chips
// match the drawn lines exactly.
// Single-period kinds whose period the legend chip can step (multi-param kinds keep their defaults).
const SINGLE_PERIOD = new Set(["MA", "EMA", "WMA", "DEMA", "TEMA", "HMA", "RSI", "CCI", "WILLR", "MFI", "ROC", "ATR", "DONCH", "ADX", "VWMA", "CMF", "AROON", "MOM", "TRIX"]);
// Indicator groups for the picker, so a 25-strong list reads as a library rather than a wall.
const IND_GROUPS: { label: string; ids: string[] }[] = [
  { label: "Moving averages", ids: ["ma50", "ma200", "ema21", "wma30", "dema21", "tema21", "hma21", "vwap", "vwma20"] },
  { label: "Bands & channels", ids: ["boll", "donch", "kelt", "ichi"] },
  { label: "Trend", ids: ["super", "psar", "adx", "macd", "aroon", "pivot"] },
  { label: "Momentum", ids: ["rsi", "stoch", "stochrsi", "cci", "willr", "roc", "mom", "trix"] },
  { label: "Volume & volatility", ids: ["mfi", "cmf", "obv", "atr"] },
];
// The drawing rail as GROUPED categories (the TradingView model): each rail icon is a group
// whose fly-out lists its tools; the icon becomes the last tool used in that group.
type RailTool = { t: Tool; label: string; glyph: string };
const RAIL_GROUPS: { id: string; label: string; tools: RailTool[] }[] = [
  { id: "cursor", label: "Cursor", tools: [{ t: "cross", label: "Crosshair", glyph: "✛" }] },
  {
    id: "lines",
    label: "Lines",
    tools: [
      { t: "trend", label: "Trend line", glyph: "╱" },
      { t: "ray", label: "Ray", glyph: "↗" },
      { t: "extended", label: "Extended line", glyph: "⤢" },
      { t: "hline", label: "Horizontal line", glyph: "─" },
      { t: "vline", label: "Vertical line", glyph: "│" },
      { t: "arrow", label: "Arrow", glyph: "→" },
    ],
  },
  {
    id: "channels",
    label: "Channels & pitchforks",
    tools: [
      { t: "channel", label: "Parallel channel", glyph: "⫽" },
      { t: "pitchfork", label: "Andrews' pitchfork", glyph: "Ψ" },
      { t: "regchan", label: "Regression channel", glyph: "ℝ" },
    ],
  },
  {
    id: "shapes",
    label: "Shapes",
    tools: [
      { t: "rect", label: "Rectangle", glyph: "▭" },
      { t: "ellipse", label: "Ellipse", glyph: "◯" },
    ],
  },
  { id: "fib", label: "Fibonacci", tools: [{ t: "fib", label: "Fib retracement", glyph: "𝑓" }] },
  {
    id: "forecast",
    label: "Forecasting",
    tools: [
      { t: "longpos", label: "Long position", glyph: "L" },
      { t: "shortpos", label: "Short position", glyph: "S" },
    ],
  },
  {
    id: "volume",
    label: "Volume analysis",
    tools: [
      { t: "avwap", label: "Anchored VWAP", glyph: "V" },
      { t: "avwapbands", label: "Anchored VWAP + σ bands", glyph: "Ⅴ" },
      { t: "volprofile", label: "Volume profile (fixed range)", glyph: "▤" },
      { t: "avolprofile", label: "Anchored volume profile", glyph: "▥" },
    ],
  },
  { id: "brush", label: "Brush", tools: [{ t: "brush", label: "Brush", glyph: "✎" }] },
  { id: "text", label: "Text", tools: [{ t: "text", label: "Text", glyph: "T" }] },
  {
    id: "measure",
    label: "Measure",
    tools: [
      { t: "measure", label: "Measure", glyph: "⊹" },
      { t: "pricerange", label: "Price range", glyph: "↕" },
      { t: "daterange", label: "Date range", glyph: "↔" },
      { t: "datepricerange", label: "Date & price range", glyph: "⧉" },
    ],
  },
];
// tool id → human label, for the objects panel (a drawing's `type` is its tool id).
const TOOL_LABEL: Record<string, string> = Object.fromEntries(RAIL_GROUPS.flatMap((g) => g.tools.map((t) => [t.t, t.label])));
const DEFAULT_GUIDED_PINS = ["cross", "trend", "indicators", "replay", "settings"];
const GUIDED_PIN_CHOICES = ["cross", "trend", "indicators", "replay", "settings", "fit", "realtime", "vpvr", "datawindow", "save", "theme", "compare", "script"];

type QuickAction = { id: string; label: string; glyph: string; section: "Navigation" | "Chart" | "Analysis" | "Tools"; active?: boolean };

export function TradingChart({
  datafeed,
  symbol,
  timeframes = DEFAULT_TF,
  resolution: initialRes,
  theme = "dark",
  themeOverride,
  height = 540,
  toolbar = true,
  drawingRail = true,
  onProvenance,
  onResolutionChange,
  indicators,
  chartType,
  compareSymbols,
  sr,
  overlay,
  priceLines,
  markers,
  onAxisClickPrice,
  onPriceLineRemove,
  onRunScript,
  scriptLibrary,
  levels,
  onBacktestScript,
  onSweepScript,
  savedLibrary,
  onSaveScript,
  onSaveAsScript,
  onDeleteSavedScript,
  onCrosshair,
  scripts: hostScripts,
  lockedIndicators,
  onLockedIndicator,
  session,
  utc,
  projection,
  ranges,
  header,
}: TradingChartProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const hoveredRef = useRef(false); // pointer is over the plot → chart keyboard shortcuts are live
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; price: number } | null>(null); // right-click menu
  const [narrow, setNarrow] = useState(false); // compact layout on small screens (phones)
  const [resolution, setResolution] = useState(initialRes ?? "1d");
  const [type, setType] = useState<SeriesType>(chartType ?? "candles");
  const [tool, setTool] = useState<Tool>("cross");
  // Seed the active indicators from a host grammar spec (e.g. AAPL C VWAP RSI); a chrome-less tile with
  // no spec still shows MA50 so it never reads as an empty study list.
  // `??`, not a truthiness check on length: a host passing [] is SAYING "start clean", and the old
  // test treated that identically to passing nothing — so an explicit empty list still got MA50.
  const [active, setActive] = useState<string[]>(indicators ?? ["ma50"]);
  const [indInputs, setIndInputs] = useState<Record<string, number[]>>({}); // per-indicator period overrides
  const [indHidden, setIndHidden] = useState<string[]>([]); // active-but-hidden indicators (eye toggled off)
  const [hoverInd, setHoverInd] = useState<string | null>(null); // legend chip under the cursor
  const colorAssign = useRef<Record<string, string>>({}); // stable per-indicator colour (kept across add/remove)
  const [scaleMode, setScaleMode] = useState<ScaleMode>("normal");
  const [legend, setLegend] = useState<{ bar: Bar | null; values: LegendValue[] }>({ bar: null, values: [] });
  // The newest loaded bar, so the legend reads out the LATEST values when nothing is hovered.
  // A chart at rest showing only a ticker symbol makes the reader move the mouse to learn the
  // price it is already displaying.
  const [latest, setLatest] = useState<Bar | null>(null);
  const [selection, setSelection] = useState<{ id: number; color?: string; width?: number; style?: "solid" | "dashed" | "dotted"; x: number; y: number } | null>(null);
  const [objects, setObjects] = useState<Drawing[]>([]); // the objects-panel list (mirrors the engine's drawings)
  const [objectsOpen, setObjectsOpen] = useState(false);
  const [replay, setReplayState] = useState<{ active: boolean; arming: boolean; index: number; total: number } | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [compares, setCompares] = useState<{ symbol: string; color: string }[]>([]);
  const [cmpInput, setCmpInput] = useState("");
  const [cmpHits, setCmpHits] = useState<{ symbol: string; description: string }[]>([]);
  const [railMenu, setRailMenu] = useState<string | null>(null); // open rail group fly-out
  const [groupTool, setGroupTool] = useState<Record<string, Tool>>(() => Object.fromEntries(RAIL_GROUPS.map((g) => [g.id, g.tools[0].t])));
  const [indModal, setIndModal] = useState(false);
  const [indSearch, setIndSearch] = useState("");
  const [box, setBox] = useState(0); // Renko/P&F/Kagi box size in price; 0 = auto (ATR)
  const [boxEff, setBoxEff] = useState(0); // the effective box the engine actually used (for display)
  const [menu, setMenu] = useState<null | "type" | "ind" | "theme" | "compare" | "interval">(null);
  // bottom-right scale/nav cluster + chart-settings popover
  const [view, setView] = useState<{ atRealtime: boolean; autoScale: boolean }>({ atRealtime: true, autoScale: true });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const prefs0 = useRef<Prefs | null>(null);
  if (!prefs0.current) prefs0.current = loadPrefs();
  const p0 = prefs0.current;
  const [gridOn, setGridOn] = useState(p0.grid);
  const [showVol, setShowVol] = useState(p0.vol);
  const [priceLineOn, setPriceLineOn] = useState(p0.lastPrice);
  const [magnet, setMagnetOn] = useState(p0.magnet);
  const [vpvr, setVpvr] = useState(p0.vpvr); // visible-range volume profile
  const [sessions, setSessions] = useState(p0.sessions); // extended-hours shading (intraday)
  const [levelsOn, setLevelsOn] = useState(p0.levels); // stop/target levels from trades + suggestions
  const [countdown, setCountdown] = useState(p0.countdown); // live time-to-bar-close under the price tag
  const [watermark, setWatermarkOn] = useState(p0.watermark);
  const [dataWindow, setDataWindow] = useState(p0.dataWindow); // floating "every value at the cursor" panel
  const [shortcuts, setShortcuts] = useState(false); // keyboard help overlay
  const [scriptOpen, setScriptOpen] = useState(false);
  const [scriptSrc, setScriptSrc] = useState("");
  const [loadedSaved, setLoadedSaved] = useState<SavedStrategy | null>(null); // which saved strategy the editor is editing, if any
  const [scriptErr, setScriptErr] = useState<ScriptError | null>(null);
  const [scriptStatus, setScriptStatus] = useState<string | null>(null);
  const [scriptRunning, setScriptRunning] = useState(false);
  const [scorecard, setScorecard] = useState<ScriptScorecard | null>(null);
  const [backtesting, setBacktesting] = useState(false);
  const [sweep, setSweep] = useState<ScriptSweep | null>(null);
  const [sweeping, setSweeping] = useState(false);
  // The script EDITOR's output. Host-supplied `scripts` are merged in at render (see `allScripts`)
  // and deliberately kept out of this state: the two have different lifetimes.
  const [scripts, setScripts] = useState<ScriptRender[]>([]);
  const [loading, setLoading] = useState(true);
  // one write per change, so the chart comes back exactly as the user left it
  useEffect(() => {
    try {
      const p: Prefs = { grid: gridOn, vol: showVol, lastPrice: priceLineOn, magnet, vpvr, sessions, countdown, watermark, dataWindow, levels: levelsOn };
      localStorage.setItem(PREFS_KEY, JSON.stringify(p));
    } catch {
      /* storage blocked — the prefs just live for the session */
    }
  }, [gridOn, showVol, priceLineOn, magnet, vpvr, sessions, countdown, watermark, dataWindow, levelsOn]);
  const [favTf, setFavTf] = useState<string[]>(() => {
    try {
      const s = localStorage.getItem("aurovie-chart-fav-tf");
      if (s) { const p = JSON.parse(s); if (Array.isArray(p) && p.length) return p; }
    } catch {
      /* storage blocked */
    }
    return ["5m", "15m", "1h", "1d", "1w"];
  });
  useEffect(() => {
    try {
      localStorage.setItem("aurovie-chart-fav-tf", JSON.stringify(favTf));
    } catch {
      /* storage blocked */
    }
  }, [favTf]);
  const [themeName, setThemeName] = useState<string>(() => {
    try {
      return localStorage.getItem("aurovie-chart-theme") || "Auto";
    } catch {
      return "Auto";
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("aurovie-chart-theme", themeName);
    } catch {
      /* storage blocked */
    }
  }, [themeName]);
  const [guided, setGuided] = useState<boolean>(() => {
    try {
      return localStorage.getItem("aurovie-chart-guided") === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("aurovie-chart-guided", guided ? "1" : "0");
    } catch {
      /* storage blocked */
    }
  }, [guided]);
  const [guidedPins, setGuidedPins] = useState<string[]>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem("aurovie-chart-guided-pins") || "[]");
      return Array.isArray(raw) && raw.length ? raw.filter((x) => typeof x === "string") : DEFAULT_GUIDED_PINS;
    } catch {
      return DEFAULT_GUIDED_PINS;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("aurovie-chart-guided-pins", JSON.stringify(guidedPins));
    } catch {
      /* storage blocked */
    }
  }, [guidedPins]);
  const [dockEditOpen, setDockEditOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [cmdQuery, setCmdQuery] = useState("");
  const [cmdIndex, setCmdIndex] = useState(0);
  const [cmdFilter, setCmdFilter] = useState<"all" | "fav" | "recent">("all");
  const cmdListRef = useRef<HTMLDivElement>(null);
  const [cmdFav, setCmdFav] = useState<string[]>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem("aurovie-chart-command-favs") || "[]");
      return Array.isArray(raw) ? raw.filter((x) => typeof x === "string") : [];
    } catch {
      return [];
    }
  });
  const [cmdRecent, setCmdRecent] = useState<string[]>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem("aurovie-chart-command-recent") || "[]");
      return Array.isArray(raw) ? raw.filter((x) => typeof x === "string") : [];
    } catch {
      return [];
    }
  });
  const [cmdUsage, setCmdUsage] = useState<Record<string, number>>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem("aurovie-chart-command-usage") || "{}");
      return raw && typeof raw === "object" ? raw : {};
    } catch {
      return {};
    }
  });
  const [tipsOpen, setTipsOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem("aurovie-chart-onboarded") !== "1";
    } catch {
      return true;
    }
  });
  const symRef = useRef(symbol);
  const cmdItemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  useEffect(() => {
    try {
      localStorage.setItem("aurovie-chart-command-favs", JSON.stringify(cmdFav));
    } catch {
      /* storage blocked */
    }
  }, [cmdFav]);
  useEffect(() => {
    try {
      localStorage.setItem("aurovie-chart-command-recent", JSON.stringify(cmdRecent));
    } catch {
      /* storage blocked */
    }
  }, [cmdRecent]);
  useEffect(() => {
    try {
      localStorage.setItem("aurovie-chart-command-usage", JSON.stringify(cmdUsage));
    } catch {
      /* storage blocked */
    }
  }, [cmdUsage]);
  useEffect(() => {
    symRef.current = symbol;
  }, [symbol]);
  // The engine is created once, so route the (possibly-changing) price-line callbacks through refs.
  const axisClickRef = useRef(onAxisClickPrice);
  const removeLineRef = useRef(onPriceLineRemove);
  const crosshairRef = useRef(onCrosshair);
  useEffect(() => {
    axisClickRef.current = onAxisClickPrice;
    removeLineRef.current = onPriceLineRemove;
    crosshairRef.current = onCrosshair;
  });

  // "Auto" follows the host app (theme prop + design-token override, so it stays on-brand); a
  // named preset from THEMES takes over entirely. Persisted, so the user's pick sticks.
  const th: Theme = useMemo(
    () => (themeName === "Auto" ? { ...(theme === "light" ? LIGHT : DARK), ...(themeOverride ?? {}) } : THEMES[themeName] ?? DARK),
    [themeName, theme, themeOverride],
  );

  // Create the engine once.
  useEffect(() => {
    if (!hostRef.current) return;
    const chart = new Chart(hostRef.current, {
      theme: th,
      utc,
      session,
      onCrosshair: (bar, values) => {
        setLegend({ bar, values });
        crosshairRef.current?.(bar, values);
      },
      onViewChange: (v) => setView(v),
      onAxisClickPrice: (p) => axisClickRef.current?.(p),
      onPriceLineRemove: (id) => removeLineRef.current?.(id),
      onData: (v) => onProvenance?.(v),
      onDrawingsChange: () => {
        const ds = chartRef.current?.getDrawings() ?? [];
        saveDrawings(symRef.current, ds);
        setObjects(ds);
      },
      onSelectionChange: (s) => setSelection(s),
      onToolChange: (tl) => setTool(tl as Tool),
      onReplay: (s) => {
        setReplayState(s);
        if (!s?.active) setPlaying(false);
      },
    });
    chartRef.current = chart;
    return () => {
      chart.destroy();
      chartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Chart keyboard shortcuts — live ONLY while the pointer is over the plot (TradingView's model) and
  // never while typing, so they never fight the app's global keys (e.g. Alt+←/→ history). Plain keys
  // only: +/- zoom, ←/→ pan, F fit-all. Delete/Escape (drawings) are the engine's own, left untouched.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!hoveredRef.current || e.altKey || e.ctrlKey || e.metaKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      const c = chartRef.current;
      if (!c) return;
      switch (e.key) {
        case "+": case "=": c.zoomBy(1); break;
        case "-": case "_": c.zoomBy(-1); break;
        case "ArrowLeft": c.panBy(-3); break;
        case "ArrowRight": c.panBy(3); break;
        case "f": case "F": c.fit(); break;
        case "k": case "K": setCmdOpen((v) => !v); setCmdQuery(""); break;
        case "?": setShortcuts((s) => !s); break;
        case "d": case "D": setDataWindow((d) => !d); break;
        case "g": case "G": setGuided((v) => !v); break;
        case "Escape": setShortcuts(false); setIndModal(false); break;
        default: return;
      }
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Compact the controls when the widget is narrow (phones / small tiles) — measured, not viewport-
  // guessed, so it works in any host.
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? el.clientWidth;
      setNarrow(w > 0 && w < 560);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Theme changes flow through.
  useEffect(() => {
    chartRef.current?.setTheme(th);
  }, [th]);

  // Load (and re-load) bars on symbol / resolution change; subscribe for realtime.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    let alive = true;
    setLoading(true);
    datafeed
      .getBars(symbol, resolution)
      .then((res) => {
        if (!alive) return;
        setLoading(false);
        chart.setData(res.bars, res.dataVersion);
        setLatest(res.bars[res.bars.length - 1] ?? null);
        setBoxEff(chart.getBrickSize()); // auto box depends on the freshly loaded data
        chart.setDrawings(loadDrawings(symbol)); // restore this symbol's saved drawings
      })
      .catch(() => {
        if (!alive) return;
        setLoading(false);
        chart.setData([], undefined);
        setLatest(null);
      });
    const unsub = datafeed.subscribe?.(symbol, resolution, (bar) => {
      if (!alive) return;
      chart.update(bar);
      // A realtime tick moves the newest bar, so the at-rest legend has to follow it — otherwise
      // the resting readout freezes at the price the chart happened to load with.
      setLatest((cur) => (cur && bar.time < cur.time ? cur : bar));
    });
    return () => {
      alive = false;
      unsub?.();
    };
  }, [datafeed, symbol, resolution]);

  // Honour a host-driven resolution change AFTER mount (e.g. an MC pane's range buttons, or a masthead
  // range tab): the prop is not just an initial seed. Keyed on the prop alone so the user's own toolbar
  // picks (which set `resolution` directly) are never clobbered by an unrelated parent re-render.
  useEffect(() => {
    if (initialRes && initialRes !== resolution) setResolution(initialRes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRes]);
  // A user interval pick from the toolbar: set it AND tell the host so it can persist it to the grammar.
  const pickRes = (v: string) => {
    setResolution(v);
    onResolutionChange?.(v);
  };
  // Honour a host-changed indicator spec / chart type after mount (a grammar re-issue with different
  // tokens). Keyed on CONTENT, so a re-render carrying the same spec never clobbers the user's own
  // interactive toolbar/legend edits; only an actual spec change re-seeds.
  const indKey = indicators?.join(",");
  useEffect(() => {
    if (indicators) setActive(indicators);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indKey]);
  useEffect(() => {
    if (chartType) setType(chartType);
  }, [chartType]);
  // Seed compares from a host grammar VS: spec (e.g. AAPL C 6M VS:TSLA VS:NVDA) — the command IS the spec,
  // so (re)seed whenever the VS: spec OR the symbol changes: an undefined/empty spec CLEARS them, so
  // navigating to a symbol whose command drops VS: never leaves a stale compare from the previous command,
  // and the base symbol is excluded (no flat self-compare). Within one command (same symbol + same cmpKey)
  // the user's own Compare-menu edits persist — a range/indicator re-issue never clobbers them.
  const cmpKey = compareSymbols?.join(",");
  useEffect(() => {
    const seen = new Set([symbol.toUpperCase()]);
    const next: { symbol: string; color: string }[] = [];
    for (const s of compareSymbols ?? []) {
      const up = s.toUpperCase();
      if (seen.has(up)) continue;
      seen.add(up);
      next.push({ symbol: up, color: CMP_COLORS[next.length % CMP_COLORS.length] });
    }
    setCompares(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cmpKey, symbol]);

  // Series type + Renko/P&F/Kagi box size. Apply both, then read back the effective box the engine
  // resolved (auto = ATR-derived) for the toolbar readout.
  useEffect(() => {
    const c = chartRef.current;
    if (!c) return;
    c.setSeriesType(type);
    // setBrickSize always refits — call it only for resampled types, else it would clobber the
    // pan/zoom that setSeriesType deliberately preserves on same-count swaps (candles↔line↔…).
    if (RESAMPLED.includes(type)) c.setBrickSize(box);
    setBoxEff(c.getBrickSize());
  }, [type, box]);
  useEffect(() => chartRef.current?.setScaleMode(scaleMode), [scaleMode]);
  useEffect(() => chartRef.current?.setSR(!!sr), [sr]);
  useEffect(() => chartRef.current?.setGrid(gridOn), [gridOn]);
  useEffect(() => chartRef.current?.setVolume(showVol), [showVol]);
  useEffect(() => chartRef.current?.setLastPriceLine(priceLineOn), [priceLineOn]);
  // Markers come from two places and must not fight: whatever the host supplied, plus the fills of
  // the most recent backtest. Backtest fills are DERIVED state — clearing the scorecard clears them,
  // so a chart can never show the exits of a script that is no longer the one in the editor.
  const backtestMarkers: ChartMarker[] = useMemo(
    () =>
      (scorecard?.fills ?? []).map((f) => ({
        time: f.time,
        price: f.price,
        kind: f.reason,
        qty: f.qty,
      })),
    [scorecard],
  );
  useEffect(
    () => chartRef.current?.setMarkers([...(markers ?? []), ...backtestMarkers]),
    [markers, backtestMarkers],
  );
  // After `symbol`/`resolution` too: setData clears any projection, so re-applying only on the
  // prop's own identity would drop it on every interval change.
  useEffect(() => {
    chartRef.current?.setProjection(projection ?? null);
  }, [projection, symbol, resolution]);
  useEffect(() => chartRef.current?.setMagnet(magnet), [magnet]);
  useEffect(() => chartRef.current?.setVolumeProfileVisible(vpvr), [vpvr]);
  // Host series first, so a script the user wrote draws over them rather than under.
  const allScripts = useMemo(() => [...(hostScripts ?? []), ...scripts], [hostScripts, scripts]);
  useEffect(() => chartRef.current?.setScripts(allScripts), [allScripts]);
  // A script's plots are bar-aligned to the data they ran on, so a symbol or interval change
  // invalidates them. Dropping them is the honest move — redrawing stale series against new bars
  // would be a chart that lies.
  //
  // Only the EDITOR's scripts are dropped: host-supplied ones are the host's to invalidate, and it
  // is the only side that knows whether it has already recomputed for the new symbol.
  useEffect(() => {
    setScripts([]);
    setScriptStatus(null);
  }, [symbol, resolution]);
  useEffect(() => chartRef.current?.setSessions(sessions), [sessions]);
  useEffect(() => {
    if (session) chartRef.current?.setSession(session);
  }, [session]);
  useEffect(() => chartRef.current?.setCountdown(countdown), [countdown]);
  useEffect(() => chartRef.current?.setLoading(loading), [loading]);
  // The identity mark behind the plot follows whatever the chart is actually showing.
  useEffect(() => {
    chartRef.current?.setWatermark(watermark ? symbol.toUpperCase() : "", watermark ? (TF_SHORT[resolution] ?? resolution) : "");
  }, [watermark, symbol, resolution]);
  // The engine takes ONE array of horizontal levels, so the alert book and the stop/target levels
  // are merged here rather than in the host. The toggle gates only the levels half: hiding your
  // protection should never silently hide your alerts too.
  useEffect(() => {
    const merged = [...(priceLines ?? []), ...(levelsOn ? (levels ?? []) : [])];
    chartRef.current?.setPriceLines(merged);
  }, [priceLines, levels, levelsOn]);
  useEffect(() => chartRef.current?.setAxisAlertHint(!!onAxisClickPrice), [onAxisClickPrice]);
  // Bar-replay playback: while playing, step the replay cursor forward at the chosen speed.
  useEffect(() => {
    if (!playing || !replay?.active) return;
    const ms = speed === 4 ? 140 : speed === 2 ? 320 : 650;
    const id = setInterval(() => {
      if (!chartRef.current?.replayForward()) setPlaying(false);
    }, ms);
    return () => clearInterval(id);
  }, [playing, speed, replay?.active]);
  // Compare mode: fetch each compared symbol's bars (at the current resolution) and hand them to
  // the engine, which renders everything as % change from the window start.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (compares.length === 0) {
      chart.setCompares([]);
      return;
    }
    let alive = true;
    Promise.all(
      compares.map((c) =>
        datafeed
          .getBars(c.symbol, resolution)
          .then((r) => ({ symbol: c.symbol, color: c.color, bars: r.bars }))
          .catch(() => ({ symbol: c.symbol, color: c.color, bars: [] })),
      ),
    ).then((list) => {
      if (alive) chart.setCompares(list);
    });
    return () => {
      alive = false;
    };
  }, [compares, datafeed, resolution]);
  // Stable colours: each indicator keeps the palette colour it was first assigned (freeing it on
  // removal), so hiding/removing another indicator never recolours the rest.
  const indColors = useMemo(() => {
    const cur = { ...colorAssign.current };
    for (const id of Object.keys(cur)) if (!active.includes(id)) delete cur[id];
    const used = new Set(Object.values(cur));
    for (const id of active) {
      if (!cur[id]) {
        const free = IND_PALETTE.find((c) => !used.has(c)) ?? IND_PALETTE[Object.keys(cur).length % IND_PALETTE.length];
        cur[id] = free;
        used.add(free);
      }
    }
    colorAssign.current = cur;
    return cur;
  }, [active]);
  // The active indicators resolved with their (possibly overridden) periods, stable colour, hidden
  // flag, and a display label — drives both the engine and the on-chart legend chips.
  //
  // Locked ids are filtered here rather than only at the toggle, so an entitlement that lapses (or
  // a host that seeds a locked id via `indicators`) stops DRAWING immediately instead of leaving a
  // paid study on the chart until the user happens to toggle it.
  const activeInds = useMemo(
    () =>
      INDS.filter((d) => active.includes(d.id) && !lockedIndicators?.includes(d.id)).map((d) => {
        const inputs = indInputs[d.id] ?? d.inputs;
        const period = inputs[0];
        const adjustable = SINGLE_PERIOD.has(d.kind) && period != null;
        const label = !adjustable ? d.label : /\d/.test(d.label) ? d.label.replace(/\d+/, String(period)) : `${d.label} ${period}`;
        return { id: d.id, kind: d.kind, pane: d.pane, inputs, color: indColors[d.id] ?? IND_PALETTE[0], label, adjustable, period, hidden: indHidden.includes(d.id) };
      }),
    [active, indInputs, indColors, indHidden, lockedIndicators],
  );
  useEffect(() => {
    // hidden indicators are simply not sent to the engine (chips still list them, dimmed)
    const list: IndicatorInstance[] = activeInds.filter((d) => !d.hidden).map((d) => ({ id: d.id, kind: d.kind, inputs: d.inputs, pane: d.pane, color: d.color }));
    chartRef.current?.setIndicators(list);
  }, [activeInds]);

  // Run the current editor buffer through the host, then adapt the reply for the engine. Every
  // failure path sets a message rather than silently leaving the old drawing in place.
  const runScript = async () => {
    if (!onRunScript || scriptRunning) return;
    setScriptRunning(true);
    setScriptErr(null);
    setScriptStatus(null);
    try {
      const res = await onRunScript(scriptSrc);
      if (res.error) {
        setScriptErr(res.error);
        setScripts([]);
        return;
      }
      const parsed = parseScriptDraw(res.draw, "script:1", res.bars);
      if (!parsed) {
        // parseScriptDraw refuses a bar-count mismatch, which would render misaligned against price
        setScriptErr({ message: "the script's output did not line up with the bars on screen", line: 1 });
        setScripts([]);
        return;
      }
      setScripts([parsed]);
      const drawn = parsed.plots.filter((x) => x.display).length;
      setScriptStatus(`${drawn} plot${drawn === 1 ? "" : "s"} over ${res.bars} bars`);
    } catch (e) {
      setScriptErr({ message: e instanceof Error ? e.message : "the script could not be run", line: 1 });
      setScripts([]);
    } finally {
      setScriptRunning(false);
    }
  };

  const applyTool = (t: Tool | "clear" | "delete" | "sep") => {
    if (t === "sep") return;
    if (t === "clear") {
      chartRef.current?.clearDrawings();
      return;
    }
    if (t === "delete") {
      chartRef.current?.deleteSelected();
      return;
    }
    setTool(t);
    chartRef.current?.setTool(t);
  };
  // Turning an indicator OFF is never gated — only turning one on. A user whose entitlement lapses
  // while an indicator is active must still be able to clear it.
  const isLocked = (id: string) => !!lockedIndicators?.includes(id);
  const toggleInd = (id: string) =>
    setActive((a) => {
      if (a.includes(id)) return a.filter((x) => x !== id);
      if (isLocked(id)) {
        onLockedIndicator?.(id);
        return a;
      }
      return [...a, id];
    });
  const stepPeriod = (id: string, cur: number, dir: number) => {
    const next = Math.max(1, Math.min(500, cur + dir));
    setIndInputs((m) => ({ ...m, [id]: [next] }));
  };
  const toggleHide = (id: string) => setIndHidden((h) => (h.includes(id) ? h.filter((x) => x !== id) : [...h, id]));
  const addCompare = (sym?: string) => {
    const s = (sym ?? cmpInput).trim().toUpperCase();
    setCmpInput("");
    setCmpHits([]);
    if (!s || s === symbol.toUpperCase() || compares.some((c) => c.symbol === s)) return;
    setCompares((cs) => [...cs, { symbol: s, color: CMP_COLORS[cs.length % CMP_COLORS.length] }]);
  };
  const removeCompare = (s: string) => setCompares((cs) => cs.filter((c) => c.symbol !== s));

  // Visible-window presets. Measured back from the newest BAR, not from today: a symbol that
  // stopped trading a month ago would otherwise get an empty window for "1M".
  const rangeList = ranges === false ? [] : (ranges ?? DEFAULT_RANGES);
  const applyRange = (days: number | null) => {
    const c = chartRef.current;
    if (!c) return;
    if (days == null) c.fit();
    else c.showSince((latest?.time ?? Math.floor(Date.now() / 1000)) - days * 86400);
  };

  // Compare-box suggestions. The DATAFEED owns symbol lookup — the widget still never fetches — so a
  // feed that implements `searchSymbols` gets a picker and one that doesn't gets a plain input where
  // typing a ticker works exactly as before. Debounced, because this fires per keystroke.
  useEffect(() => {
    const q = cmpInput.trim();
    if (menu !== "compare" || !datafeed.searchSymbols || !q) {
      setCmpHits([]);
      return;
    }
    let alive = true;
    const t = setTimeout(() => {
      datafeed
        .searchSymbols!(q)
        .then((r) => alive && setCmpHits(r.slice(0, 6)))
        .catch(() => alive && setCmpHits([]));
    }, 180);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [cmpInput, menu, datafeed]);

  // Renko/P&F/Kagi box size: ± scales the (auto or current) box by 1.5×; the middle button resets to Auto.
  const stepBox = (dir: number) => {
    // Step relative to the EFFECTIVE box the engine resolved (what the readout shows) — not the raw
    // `box` state, which the engine may have shrunk to fit; else ± drifts from the displayed value.
    const base = chartRef.current?.getBrickSize() || (box > 0 ? box : boxEff) || 1;
    const next = dir > 0 ? base * 1.5 : base / 1.5;
    if (next > 0 && isFinite(next)) setBox(next);
  };
  const fmtBox = (v: number) => (v >= 100 ? v.toFixed(0) : v >= 1 ? v.toFixed(2) : v > 0 ? v.toPrecision(2) : "—");
  const toggleFav = (v: string) => setFavTf((f) => (f.includes(v) ? f.filter((x) => x !== v) : [...f, v]));
  // Export the composited canvases as a PNG the user can save/share — a faithful capture of the real bars.
  const saveImage = () => {
    const url = chartRef.current?.toDataURL();
    if (!url) return;
    try {
      const a = document.createElement("a");
      a.href = url;
      a.download = `${symbol.toUpperCase()}-${resolution}.png`;
      a.click();
    } catch {
      /* download blocked — nothing else we can honestly do */
    }
  };

  const finishOnboarding = (enableGuided = false) => {
    if (enableGuided) setGuided(true);
    setTipsOpen(false);
    try {
      localStorage.setItem("aurovie-chart-onboarded", "1");
    } catch {
      /* storage blocked */
    }
  };
  const runQuickAction = (id: string) => {
    setCmdRecent((list) => [id, ...list.filter((x) => x !== id)].slice(0, 10));
    setCmdUsage((m) => ({ ...m, [id]: (m[id] ?? 0) + 1 }));
    switch (id) {
      case "cross": applyTool("cross"); break;
      case "trend": applyTool("trend"); break;
      case "indicators": setIndModal(true); break;
      case "replay": replay ? chartRef.current?.exitReplay() : chartRef.current?.armReplay(); break;
      case "settings": setSettingsOpen((o) => !o); break;
      case "fit": chartRef.current?.fit(); break;
      case "realtime": chartRef.current?.scrollToRealtime(); break;
      case "vpvr": setVpvr((v) => !v); break;
      case "datawindow": setDataWindow((v) => !v); break;
      case "save": saveImage(); break;
      case "clearrecent": setCmdRecent([]); break;
      case "theme": setMenu((m) => (m === "theme" ? null : "theme")); break;
      case "compare": setMenu((m) => (m === "compare" ? null : "compare")); break;
      case "script": if (onRunScript) setScriptOpen((o) => !o); break;
      case "guided": setGuided((v) => !v); break;
      default: break;
    }
  };
  const quickActions: QuickAction[] = [
    { id: "cross", label: "Crosshair", glyph: "✛", section: "Tools", active: tool === "cross" },
    { id: "trend", label: "Trend line", glyph: "╱", section: "Tools", active: tool === "trend" },
    { id: "indicators", label: "Indicators", glyph: "ƒx", section: "Analysis", active: indModal },
    { id: "replay", label: "Replay", glyph: "▶", section: "Navigation", active: !!replay },
    { id: "settings", label: "Settings", glyph: "⚙", section: "Chart", active: settingsOpen },
    { id: "fit", label: "Fit all bars", glyph: "F", section: "Navigation" },
    { id: "realtime", label: "Go to realtime", glyph: "»|", section: "Navigation" },
    { id: "vpvr", label: "Volume profile", glyph: "VP", section: "Analysis", active: vpvr },
    { id: "datawindow", label: "Data window", glyph: "DW", section: "Analysis", active: dataWindow },
    { id: "save", label: "Save chart image", glyph: "⬇", section: "Chart" },
    { id: "clearrecent", label: "Clear recent actions", glyph: "⌫", section: "Navigation" },
    { id: "theme", label: "Theme menu", glyph: "◑", section: "Chart", active: menu === "theme" },
    { id: "compare", label: "Compare menu", glyph: "VS", section: "Analysis", active: menu === "compare" },
    { id: "script", label: "Script editor", glyph: "{ }", section: "Tools", active: scriptOpen },
    { id: "guided", label: guided ? "Switch to Pro mode" : "Switch to Guided mode", glyph: "G", section: "Chart" },
  ];
  const quickById = Object.fromEntries(quickActions.map((a) => [a.id, a])) as Record<string, QuickAction>;
  const visibleGuidedPins = guidedPins.filter((id) => !!quickById[id]);
  const q = cmdQuery.trim().toLowerCase();
  const commandItems = quickActions
    .filter((a) => a.label.toLowerCase().includes(q) || a.id.includes(q) || a.section.toLowerCase().includes(q))
    .filter((a) => (cmdFilter === "all" ? true : cmdFilter === "fav" ? cmdFav.includes(a.id) : cmdRecent.includes(a.id)));
  const orderedCommandItems = commandItems
    .slice()
    .sort((a, b) => {
      const af = cmdFav.includes(a.id) ? 1 : 0;
      const bf = cmdFav.includes(b.id) ? 1 : 0;
      if (af !== bf) return bf - af;
      const ar = cmdRecent.indexOf(a.id);
      const br = cmdRecent.indexOf(b.id);
      const av = ar < 0 ? 999 : ar;
      const bv = br < 0 ? 999 : br;
      if (av !== bv) return av - bv;
      const au = cmdUsage[a.id] ?? 0;
      const bu = cmdUsage[b.id] ?? 0;
      if (au !== bu) return bu - au;
      if (a.section !== b.section) return a.section.localeCompare(b.section);
      return a.label.localeCompare(b.label);
    })
    .slice(0, 20);
  const selectedCommand = orderedCommandItems[Math.max(0, Math.min(cmdIndex, Math.max(0, orderedCommandItems.length - 1)))];
  useEffect(() => {
    setCmdIndex(0);
  }, [cmdOpen, cmdQuery, cmdFilter]);
  useEffect(() => {
    if (!cmdOpen || !selectedCommand) return;
    cmdItemRefs.current[selectedCommand.id]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [cmdOpen, selectedCommand?.id]);
  const toggleCmdFav = (id: string) => setCmdFav((list) => (list.includes(id) ? list.filter((x) => x !== id) : [id, ...list]));
  const toggleGuidedPin = (id: string) => setGuidedPins((pins) => (pins.includes(id) ? pins.filter((x) => x !== id) : [...pins, id]));

  // The bar the legend reports: the hovered one, else the newest. Falling back to `latest` is what
  // keeps prices on screen when the pointer is elsewhere.
  // `values` with a null bar means the crosshair is over a PROJECTED column — there is genuinely no
  // bar there, so the at-rest fallback must not step in and reprint the newest one under a forecast.
  const overProjection = legend.bar === null && legend.values.length > 0;
  const legendBar = legend.bar ?? (overProjection ? null : latest);
  const up = legendBar ? legendBar.close >= legendBar.open : true;
  const barCol = up ? th.up : th.down;

  // ---- styles (theme-driven so the whole widget is self-consistent + reusable) ----
  // The chrome is built from three ideas: a hairline that is never pure border colour (it fades),
  // control surfaces that only appear on state (transparent at rest → tinted when active), and one
  // shared elevation ramp for every floating surface.
  const soft = (c: string, pct: number) => `color-mix(in srgb, ${c} ${pct}%, transparent)`;
  const bar: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "7px 10px",
    background: `radial-gradient(120% 90% at 50% -20%, ${soft(th.line, 8)}, transparent), linear-gradient(${soft(th.textStrong, 3)}, transparent), ${th.paneBackground}`,
    borderBottom: `1px solid ${soft(th.border, 75)}`,
    fontFamily: th.font,
    flexWrap: "wrap",
  };
  const btn = (on = false): CSSProperties => ({ display: "inline-flex", alignItems: "center", gap: 5, height: 29, padding: "0 10px", border: `1px solid ${on ? soft(th.line, 40) : soft(th.border, 65)}`, borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600, background: on ? soft(th.line, 16) : soft(th.paneBackground, 88), color: on ? th.line : th.text, boxShadow: on ? `0 3px 10px ${soft(th.line, 20)}` : "0 1px 2px rgba(0,0,0,0.08)", transition: "background 140ms ease, color 140ms ease, border-color 140ms ease, box-shadow 140ms ease", whiteSpace: "nowrap" });
  const railBtn = (on = false): CSSProperties => ({ display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, border: `1px solid ${on ? soft(th.line, 40) : soft(th.border, 65)}`, borderRadius: 8, cursor: "pointer", fontSize: 14, background: on ? soft(th.line, 16) : soft(th.paneBackground, 88), color: on ? th.line : th.text, boxShadow: on ? `0 3px 10px ${soft(th.line, 20)}` : "0 1px 2px rgba(0,0,0,0.08)", transition: "background 140ms ease, color 140ms ease, border-color 140ms ease, box-shadow 140ms ease" });
  const surface: CSSProperties = {
    background: `color-mix(in srgb, ${th.paneBackground} 94%, transparent)`,
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
    border: `1px solid ${th.border}`,
    boxShadow: `0 12px 34px rgba(0,0,0,0.45), 0 0 0 1px ${soft(th.textStrong, 4)}`,
  };
  const menuBox: CSSProperties = { position: "absolute", top: 36, zIndex: 20, borderRadius: 10, padding: 6, minWidth: 158, ...surface };
  const item = (on = false): CSSProperties => ({ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "6px 8px", border: "none", borderRadius: 6, cursor: "pointer", textAlign: "left", fontSize: 12.5, background: on ? soft(th.line, 10) : "transparent", color: on ? th.line : th.textStrong, fontFamily: th.font });
  // small pill for the bottom-right over-chart cluster (Auto / Log / % / go-to-realtime / settings)
  const legBtn: CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 15, height: 15, padding: 0, border: "none", borderRadius: 4, cursor: "pointer", fontSize: 11, lineHeight: 1, background: soft(th.text, 22), color: th.textStrong, fontFamily: th.font };
  const clusterBtn = (on = false): CSSProperties => ({ height: 23, minWidth: 23, padding: "0 7px", border: `1px solid ${on ? soft(th.line, 45) : th.border}`, borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: th.font, background: on ? `color-mix(in srgb, ${th.line} 20%, ${th.paneBackground})` : `color-mix(in srgb, ${th.paneBackground} 88%, transparent)`, backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", color: on ? th.line : th.text, display: "inline-flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.28)", transition: "background 140ms ease, color 140ms ease, border-color 140ms ease" });

  return (
    <div ref={rootRef} style={{ display: "flex", flexDirection: "column", height, background: th.background, border: `1px solid ${th.border}`, borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 2px rgba(0,0,0,0.2), 0 8px 28px rgba(0,0,0,0.16)", transition: "background 220ms ease, border-color 220ms ease" }}>
      {header && (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 14, padding: "11px 13px", borderBottom: `1px solid ${th.border}`, fontFamily: th.font }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: "0.01em", color: th.textStrong }}>{header.ticker ?? symbol}</span>
              {header.sector && <span style={{ fontSize: 11.5, color: th.line }}>{header.sector}</span>}
            </div>
            {header.name && (
              <div style={{ marginTop: 2, fontSize: 12, color: th.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{header.name}</div>
            )}
            {header.stats && header.stats.length > 0 && (
              <div style={{ marginTop: 3, display: "flex", flexWrap: "wrap", gap: "2px 10px", fontFamily: th.monoFont, fontSize: 10.5, color: th.text }}>
                {header.stats.map((s, i) => (
                  <span key={`${s.label ?? ""}${i}`}>
                    {s.label ? `${s.label} ` : ""}
                    {s.value}
                  </span>
                ))}
              </div>
            )}
          </div>
          {(header.priceSlot ?? header.price) && (
            <div style={{ textAlign: "right" }}>
              {header.priceSlot ?? (
                <>
                  <div style={{ fontFamily: th.monoFont, fontSize: 21, fontWeight: 600, lineHeight: 1.15, color: th.textStrong }}>{header.price!.value}</div>
                  {header.price!.change && (
                    <div style={{ fontFamily: th.monoFont, fontSize: 12.5, color: header.price!.direction === "down" ? th.down : th.up }}>{header.price!.change}</div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
      {toolbar && (
        <div style={bar}>
          {/* The header already names the instrument; repeating it here (and again in the
              on-canvas legend) prints the same ticker three times in one screenful. */}
          {!narrow && !header && <span style={{ fontSize: 13, fontWeight: 700, color: th.textStrong, marginRight: 4 }}>{symbol}</span>}
          <span style={{ display: "inline-flex", gap: 1, alignItems: "center" }}>
            {(narrow ? [resolution] : TF_ORDER.filter((v) => favTf.includes(v) || v === resolution)).map((v) => (
              <button key={v} style={btn(v === resolution)} onClick={() => pickRes(v)}>
                {TF_SHORT[v] ?? v}
              </button>
            ))}
            <span style={{ position: "relative" }}>
              <button style={{ ...btn(menu === "interval"), padding: "0 6px" }} title="Intervals" aria-label="Intervals" onClick={() => setMenu(menu === "interval" ? null : "interval")}>▾</button>
              {menu === "interval" && (
                <div style={menuBox}>
                  {INTERVAL_GROUPS.map((g, gi) => (
                    <div key={g.label}>
                      {gi > 0 && <div style={{ height: 1, background: th.border, margin: "4px 0" }} />}
                      <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: th.text, padding: "2px 8px 4px" }}>{g.label}</div>
                      {g.items.map((it) => (
                        <div key={it.v} style={{ display: "flex", alignItems: "center" }}>
                          <button style={{ ...item(it.v === resolution), flex: 1 }} onClick={() => { pickRes(it.v); setMenu(null); }}>{it.l}</button>
                          <button title={favTf.includes(it.v) ? "Remove from favourites" : "Add to favourites"} onClick={() => toggleFav(it.v)} style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 13, padding: "2px 6px", color: favTf.includes(it.v) ? th.line : th.text }}>
                            {favTf.includes(it.v) ? "★" : "☆"}
                          </button>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </span>
          </span>
          <span style={{ width: 1, height: 18, background: th.border, margin: "0 4px" }} />
          <span style={{ position: "relative" }}>
            <button style={btn(menu === "type")} onClick={() => setMenu(menu === "type" ? null : "type")}>
              <Icon name={type} size={16} /> {TYPES.find((x) => x.t === type)?.label} ▾
            </button>
            {menu === "type" && (
              <div style={menuBox}>
                {TYPE_GROUPS.map((g, gi) => (
                  <div key={g.label}>
                    {gi > 0 && <div style={{ height: 1, background: th.border, margin: "4px 0" }} />}
                    <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: th.text, padding: "2px 8px 4px" }}>{g.label}</div>
                    {g.ts.map((tt) => {
                      const x = TYPES.find((y) => y.t === tt)!;
                      return (
                        <button key={tt} style={item(tt === type)} onClick={() => { setType(tt); setMenu(null); }}>
                          <Icon name={tt} size={16} /> {x.label}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </span>
          {rangeList.length > 0 && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 1 }} title="Visible range">
              {rangeList.map((r) => (
                <button key={r.label} style={{ ...btn(false), padding: "0 7px" }} onClick={() => applyRange(r.days)}>
                  {r.label}
                </button>
              ))}
            </span>
          )}
          {RESAMPLED.includes(type) && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 1 }} title="Box / reversal size">
              <button style={{ ...btn(false), padding: "0 7px", fontSize: 15 }} onClick={() => stepBox(-1)} aria-label="Finer box">−</button>
              <button style={{ ...btn(box > 0), gap: 4 }} onClick={() => setBox(0)}>
                {box > 0 ? "Box" : "Auto"} {fmtBox(boxEff)}
              </button>
              <button style={{ ...btn(false), padding: "0 7px", fontSize: 15 }} onClick={() => stepBox(1)} aria-label="Coarser box">+</button>
            </span>
          )}
          <button style={btn(active.length > 0)} title="Indicators" onClick={() => setIndModal(true)}>
            <Icon name="indicators" size={15} /> Indicators{active.length ? ` (${active.length})` : ""}
          </button>
          <button style={btn(cmdOpen)} title="Command launcher (K)" onClick={() => { setCmdOpen((v) => !v); setCmdQuery(""); }}>
            K Launch
          </button>
          <button style={btn(guided)} title="Guided mode (decluttered controls)" onClick={() => setGuided((v) => !v)}>
            {guided ? "Guided" : "Pro"}
          </button>
          {!guided && onRunScript && (
            <button style={btn(scriptOpen || scripts.length > 0)} title="Write a script" onClick={() => setScriptOpen((o) => !o)}>
              <Icon name="script" size={15} /> Script{scripts.length ? " ●" : ""}
            </button>
          )}
          {!guided && <span style={{ position: "relative" }}>
            <button style={btn(menu === "compare" || compares.length > 0)} onClick={() => setMenu(menu === "compare" ? null : "compare")}>
              <Icon name="compare" size={15} /> Compare{compares.length ? ` (${compares.length})` : ""} ▾
            </button>
            {menu === "compare" && (
              <div style={menuBox}>
                <div style={{ display: "flex", gap: 4, marginBottom: compares.length ? 6 : 0 }}>
                  <input
                    value={cmpInput}
                    onChange={(e) => setCmpInput(e.target.value.toUpperCase())}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") addCompare();
                    }}
                    placeholder="Symbol…"
                    autoFocus
                    style={{ flex: 1, minWidth: 0, fontFamily: th.font, fontSize: 12, padding: "4px 6px", borderRadius: 5, border: `1px solid ${th.border}`, background: th.background, color: th.textStrong }}
                  />
                  <button onClick={() => addCompare()} style={{ ...btn(false), background: `color-mix(in srgb, ${th.line} 18%, transparent)`, color: th.line }}>
                    Add
                  </button>
                </div>
                {cmpHits.length > 0 && (
                  <div style={{ marginBottom: 6, borderBottom: `1px solid ${th.border}`, paddingBottom: 4 }}>
                    {cmpHits.map((h) => (
                      <button
                        key={h.symbol}
                        onClick={() => addCompare(h.symbol)}
                        style={{ display: "flex", alignItems: "baseline", gap: 8, width: "100%", padding: "4px 6px", border: "none", borderRadius: 5, cursor: "pointer", textAlign: "left", background: "transparent", fontFamily: th.font, fontSize: 12.5, color: th.textStrong }}
                      >
                        <span style={{ fontWeight: 700 }}>{h.symbol}</span>
                        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 11.5, color: th.text }}>
                          {h.description}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {compares.map((c) => (
                  <div key={c.symbol} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 2px", fontSize: 12.5, color: th.textStrong }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: c.color }} />
                    <span style={{ flex: 1 }}>{c.symbol}</span>
                    <button onClick={() => removeCompare(c.symbol)} title="Remove" style={{ border: "none", background: "transparent", color: th.text, cursor: "pointer", fontSize: 13 }}>
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </span>}
          <span style={{ width: 1, height: 18, background: th.border, margin: "0 4px" }} />
          {!guided && <button style={btn(!!replay)} title="Bar replay — step through history" onClick={() => (replay ? chartRef.current?.exitReplay() : chartRef.current?.armReplay())}>
            <Icon name="replay" size={13} /> Replay
          </button>}
          <span style={{ position: "relative", marginLeft: "auto" }}>
            <button style={btn(menu === "theme")} title="Chart theme" onClick={() => setMenu(menu === "theme" ? null : "theme")}>
              ◑ Theme ▾
            </button>
            {menu === "theme" && (
              <div style={{ ...menuBox, right: 0 }}>
                {["Auto", ...THEME_NAMES].map((n) => (
                  <button key={n} style={item(n === themeName)} onClick={() => { setThemeName(n); setMenu(null); }}>
                    <span style={{ width: 16 }}>{n === themeName ? "✓" : ""}</span> {n === "Auto" ? "Auto (app)" : n}
                  </button>
                ))}
              </div>
            )}
          </span>
        </div>
      )}
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {drawingRail && !narrow && !guided && (
          <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "5px 4px", background: th.paneBackground, borderRight: `1px solid ${th.border}` }}>
            {RAIL_GROUPS.map((g) => {
              const cur = groupTool[g.id] ?? g.tools[0].t;
              const isActive = g.tools.some((t) => t.t === tool);
              const multi = g.tools.length > 1;
              return (
                <span key={g.id} style={{ position: "relative" }}>
                  <button title={g.label} style={railBtn(isActive)} onClick={() => (multi ? setRailMenu(railMenu === g.id ? null : g.id) : applyTool(g.tools[0].t))}>
                    <Icon name={cur} size={17} />
                    {multi && <span style={{ position: "absolute", right: 1.5, bottom: 1, fontSize: 7, lineHeight: 1, color: th.text }}>▸</span>}
                  </button>
                  {railMenu === g.id && (
                    <div style={{ position: "absolute", left: 36, top: 0, zIndex: 25, borderRadius: 10, padding: 6, minWidth: 208, ...surface }}>
                      <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: th.text, padding: "2px 8px 6px" }}>{g.label}</div>
                      {g.tools.map((t) => (
                        <button
                          key={t.t}
                          style={item(tool === t.t)}
                          onClick={() => {
                            applyTool(t.t);
                            setGroupTool((gt) => ({ ...gt, [g.id]: t.t }));
                            setRailMenu(null);
                          }}
                        >
                          <Icon name={t.t} size={16} />
                          {t.label}
                        </button>
                      ))}
                    </div>
                  )}
                </span>
              );
            })}
            <span style={{ height: 1, background: th.border, margin: "3px 5px" }} />
            <button title="Delete selected" style={railBtn(false)} onClick={() => applyTool("delete")}>
              <Icon name="delete" size={17} />
            </button>
            <button title="Clear all drawings" style={railBtn(false)} onClick={() => applyTool("clear")}>
              <Icon name="trash" size={17} />
            </button>
            <span style={{ position: "relative" }}>
              <button
                title="Objects — manage drawings"
                style={railBtn(objectsOpen)}
                onClick={() => { setObjects(chartRef.current?.getDrawings() ?? []); setObjectsOpen((o) => !o); }}
              >
                <Icon name="objects" size={17} />
                {objects.length > 0 && <span style={{ position: "absolute", right: 0, top: 0, fontSize: 8, lineHeight: 1, fontWeight: 700, color: th.line }}>{objects.length}</span>}
              </button>
              {objectsOpen && (
                <div style={{ position: "absolute", left: 36, bottom: 0, zIndex: 25, borderRadius: 10, padding: 6, minWidth: 218, maxHeight: 320, overflowY: "auto", ...surface }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "2px 4px 6px" }}>
                    <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: th.text }}>Objects · {objects.length}</span>
                    {objects.length > 0 && (
                      <button style={{ border: "none", background: "transparent", color: th.text, cursor: "pointer", fontSize: 11, fontFamily: th.font }} onClick={() => chartRef.current?.clearDrawings()}>Clear all</button>
                    )}
                  </div>
                  {objects.length === 0 && <div style={{ color: th.text, padding: "6px 4px", fontFamily: th.font, fontSize: 12 }}>No drawings yet — pick a tool above.</div>}
                  {objects.slice().reverse().map((d) => (
                    <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 7, padding: "3px 4px", borderRadius: 5, fontFamily: th.font, fontSize: 12 }}>
                      <span style={{ color: d.color ?? th.line, display: "inline-flex", flex: "none" }}><Icon name={d.type} size={14} /></span>
                      <span style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: d.hidden ? th.text : th.textStrong, textDecoration: d.hidden ? "line-through" : "none" }}>{TOOL_LABEL[d.type] ?? d.type}</span>
                      <button title={d.hidden ? "Show" : "Hide"} onClick={() => chartRef.current?.setDrawingHidden(d.id, !d.hidden)} style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 13, color: d.hidden ? th.text : th.line, padding: "0 2px" }}>{d.hidden ? "◌" : "◉"}</button>
                      <button title="Delete" onClick={() => chartRef.current?.deleteDrawing(d.id)} style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 13, color: th.down, padding: "0 2px" }}>✕</button>
                    </div>
                  ))}
                </div>
              )}
            </span>
          </div>
        )}
        <div
          style={{ position: "relative", flex: 1, minWidth: 0 }}
          onMouseEnter={() => { hoveredRef.current = true; }}
          onMouseLeave={() => { hoveredRef.current = false; }}
          onContextMenu={(e) => {
            const rect = hostRef.current?.getBoundingClientRect();
            if (!rect) return;
            e.preventDefault();
            const price = chartRef.current?.priceAtY(e.clientY - rect.top) ?? 0;
            setMenu(null);
            setRailMenu(null);
            setSettingsOpen(false);
            setCmdOpen(false);
            setDockEditOpen(false);
            setCtxMenu({ x: e.clientX, y: e.clientY, price });
          }}
          onClick={() => {
            if (menu) setMenu(null);
            if (railMenu) setRailMenu(null);
            if (settingsOpen) setSettingsOpen(false);
            if (cmdOpen) setCmdOpen(false);
            if (dockEditOpen) setDockEditOpen(false);
            if (ctxMenu) setCtxMenu(null);
          }}
        >
          {tipsOpen && (
            <div onClick={(e) => e.stopPropagation()} style={{ position: "absolute", top: 10, right: 10, zIndex: 36, width: 290, borderRadius: 12, padding: 10, ...surface }}>
              <div style={{ color: th.textStrong, fontFamily: th.font, fontWeight: 700, fontSize: 13 }}>Quick start</div>
              <div style={{ color: th.text, fontFamily: th.font, fontSize: 12, marginTop: 6, lineHeight: 1.35 }}>Press K to launch commands, ? for shortcuts, and right-click price axis to create alerts quickly.</div>
              <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                <button style={{ ...btn(true), height: 26 }} onClick={() => finishOnboarding(true)}>Use Guided mode</button>
                <button style={{ ...btn(false), height: 26 }} onClick={() => finishOnboarding(false)}>Dismiss</button>
              </div>
            </div>
          )}
          {cmdOpen && (
            <>
              <div onClick={() => setCmdOpen(false)} style={{ position: "absolute", inset: 0, zIndex: 34, background: "rgba(0,0,0,0.3)" }} />
              <div onClick={(e) => e.stopPropagation()} style={{ position: "absolute", left: "50%", top: 52, transform: "translateX(-50%)", zIndex: 35, width: 420, maxWidth: "calc(100% - 24px)", borderRadius: 12, padding: 8, ...surface }}>
                <input
                  autoFocus
                  value={cmdQuery}
                  onChange={(e) => setCmdQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setCmdOpen(false);
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setCmdIndex((i) => Math.min(Math.max(0, orderedCommandItems.length - 1), i + 1));
                    }
                    if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setCmdIndex((i) => Math.max(0, i - 1));
                    }
                    if (e.key === "Home") {
                      e.preventDefault();
                      setCmdIndex(0);
                    }
                    if (e.key === "End") {
                      e.preventDefault();
                      setCmdIndex(Math.max(0, orderedCommandItems.length - 1));
                    }
                    if (e.key === "PageDown") {
                      e.preventDefault();
                      setCmdIndex((i) => Math.min(Math.max(0, orderedCommandItems.length - 1), i + 6));
                    }
                    if (e.key === "PageUp") {
                      e.preventDefault();
                      setCmdIndex((i) => Math.max(0, i - 6));
                    }
                    if (e.key.toLowerCase() === "f" && selectedCommand) {
                      e.preventDefault();
                      toggleCmdFav(selectedCommand.id);
                    }
                    if (e.key === "Enter" && selectedCommand) {
                      runQuickAction(selectedCommand.id);
                      setCmdOpen(false);
                    }
                  }}
                  placeholder="Run action… (type: replay, fit, compare, script). Use ↑/↓ + Enter."
                  style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 8, border: `1px solid ${th.border}`, background: th.background, color: th.textStrong, fontSize: 13, fontFamily: th.font }}
                />
                <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
                  {([
                    ["all", `All (${quickActions.length})`],
                    ["fav", `Favorites (${cmdFav.length})`],
                    ["recent", `Recent (${cmdRecent.length})`],
                  ] as const).map(([id, label]) => (
                    <button key={id} style={{ ...btn(cmdFilter === id), height: 24, padding: "0 8px", fontSize: 11.5 }} onClick={() => setCmdFilter(id)}>{label}</button>
                  ))}
                </div>
                <div ref={cmdListRef} style={{ marginTop: 8, maxHeight: 280, overflowY: "auto" }}>
                  {orderedCommandItems.length > 0 && (() => {
                    let prev = "";
                    return orderedCommandItems.map((a, i) => (
                      <div key={a.id} ref={(el) => { cmdItemRefs.current[a.id] = el; }}>
                        {a.section !== prev && (
                          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: th.text, padding: "6px 8px 4px" }}>{(prev = a.section)}</div>
                        )}
                        <button style={{ ...item(i === cmdIndex || !!a.active), justifyContent: "space-between" }} onClick={() => { runQuickAction(a.id); setCmdOpen(false); }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                            <span style={{ width: 20, color: th.text }}>{a.glyph}</span>
                            {a.label}
                          </span>
                          <span onClick={(e) => { e.stopPropagation(); toggleCmdFav(a.id); }} style={{ color: cmdFav.includes(a.id) ? th.line : th.text, fontSize: 13, padding: "0 3px" }} title="Favorite (F)">{cmdFav.includes(a.id) ? "★" : "☆"}</span>
                        </button>
                      </div>
                    ));
                  })()}
                  {orderedCommandItems.length === 0 && <div style={{ padding: "8px 10px", color: th.text, fontFamily: th.font, fontSize: 12 }}>No actions match that query.</div>}
                </div>
              </div>
            </>
          )}
          {ctxMenu && (
            <>
              <div onClick={() => setCtxMenu(null)} onContextMenu={(e) => { e.preventDefault(); setCtxMenu(null); }} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
              <div
                style={{
                  position: "fixed",
                  left: Math.min(ctxMenu.x, (typeof window !== "undefined" ? window.innerWidth : 9999) - 214),
                  top: Math.min(ctxMenu.y, (typeof window !== "undefined" ? window.innerHeight : 9999) - 320),
                  zIndex: 41,
                  borderRadius: 10,
                  padding: 5,
                  minWidth: 204,
                  fontFamily: th.font,
                  fontSize: 12,
                  ...surface,
                }}
              >
                <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: th.text, padding: "3px 8px 6px" }}>{symbol} · {ctxMenu.price.toFixed(2)}</div>
                {onAxisClickPrice && (
                  <button style={item(false)} onClick={() => { onAxisClickPrice(ctxMenu.price); setCtxMenu(null); }}>＋ Add alert at {ctxMenu.price.toFixed(2)}</button>
                )}
                <button style={item(false)} onClick={() => { chartRef.current?.resetPriceScale(); setCtxMenu(null); }}>Reset price scale</button>
                <button style={item(false)} onClick={() => { chartRef.current?.fit(); setCtxMenu(null); }}>Fit all bars</button>
                <button style={item(false)} onClick={() => { chartRef.current?.scrollToRealtime(); setCtxMenu(null); }}>Go to realtime</button>
                <div style={{ height: 1, background: th.border, margin: "4px 0" }} />
                {(["normal", "log", "percent"] as ScaleMode[]).map((m) => (
                  <button key={m} style={item(scaleMode === m)} onClick={() => { setScaleMode(m); setCtxMenu(null); }}>
                    <span style={{ width: 16, display: "inline-block", color: scaleMode === m ? th.line : th.text }}>{scaleMode === m ? "✓" : ""}</span>
                    {m === "normal" ? "Regular scale" : m === "log" ? "Logarithmic" : "Percent"}
                  </button>
                ))}
                <div style={{ height: 1, background: th.border, margin: "4px 0" }} />
                <button style={item(false)} onClick={() => { saveImage(); setCtxMenu(null); }}>Save chart image (PNG)</button>
                <button style={item(false)} onClick={() => { navigator.clipboard?.writeText(ctxMenu.price.toFixed(2)); setCtxMenu(null); }}>Copy price</button>
              </div>
            </>
          )}
          {/* legend */}
          <div style={{ position: "absolute", top: 7, left: 9, zIndex: 5, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 3, fontFamily: th.monoFont, fontSize: 11, color: th.text }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                flexWrap: "wrap",
                pointerEvents: "none",
                padding: legend.bar ? "3px 9px 3px 7px" : "2px 4px",
                borderRadius: 8,
                background: legend.bar ? `color-mix(in srgb, ${th.paneBackground} 78%, transparent)` : "transparent",
                backdropFilter: legend.bar ? "blur(7px)" : undefined,
                WebkitBackdropFilter: legend.bar ? "blur(7px)" : undefined,
                border: `1px solid ${legend.bar ? soft(th.border, 70) : "transparent"}`,
                transition: "background 160ms ease, border-color 160ms ease",
              }}
            >
              <span style={{ color: th.textStrong, fontWeight: 700, fontFamily: th.font, fontSize: 12.5, letterSpacing: "0.01em" }}>{symbol}</span>
              <span style={{ fontFamily: th.font, fontSize: 10.5, fontWeight: 600, color: th.text, background: soft(th.text, 14), borderRadius: 4, padding: "1px 5px" }}>{TF_SHORT[resolution] ?? resolution}</span>
              {legendBar && (
                <>
                  <span>O <b style={{ color: barCol }}>{legendBar.open.toFixed(2)}</b></span>
                  <span>H <b style={{ color: barCol }}>{legendBar.high.toFixed(2)}</b></span>
                  <span>L <b style={{ color: barCol }}>{legendBar.low.toFixed(2)}</b></span>
                  <span>C <b style={{ color: barCol }}>{legendBar.close.toFixed(2)}</b></span>
                  <span style={{ color: barCol, fontWeight: 700 }}>
                    {legendBar.close - legendBar.open >= 0 ? "+" : ""}
                    {(legendBar.close - legendBar.open).toFixed(2)}
                    {legendBar.open ? ` (${(((legendBar.close - legendBar.open) / legendBar.open) * 100).toFixed(2)}%)` : ""}
                  </span>
                  {legendBar.volume ? <span>Vol {fmtVol(legendBar.volume)}</span> : null}
                </>
              )}
            </div>
            {/* interactive indicator legend — hover a chip to step its period or remove it */}
            {activeInds.map((d) => {
              const val = legend.values.find((v) => v.id === d.id) ?? legend.values.find((v) => !v.id && v.color.toLowerCase() === d.color.toLowerCase());
              const hov = hoverInd === d.id;
              return (
                <div
                  key={d.id}
                  onMouseEnter={() => setHoverInd(d.id)}
                  onMouseLeave={() => setHoverInd((h) => (h === d.id ? null : h))}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    pointerEvents: "auto",
                    width: "fit-content",
                    padding: "2px 6px",
                    borderRadius: 6,
                    background: hov ? `color-mix(in srgb, ${th.paneBackground} 86%, transparent)` : "transparent",
                    backdropFilter: hov ? "blur(7px)" : undefined,
                    WebkitBackdropFilter: hov ? "blur(7px)" : undefined,
                    border: `1px solid ${hov ? soft(th.border, 70) : "transparent"}`,
                    opacity: d.hidden ? 0.45 : 1,
                    transition: "background 130ms ease, border-color 130ms ease",
                  }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: d.color, flex: "none" }} />
                  <span style={{ color: th.textStrong, fontWeight: 700, textDecoration: d.hidden ? "line-through" : "none" }}>{d.label}</span>
                  {!d.hidden && val && val.value != null && <span style={{ color: d.color, fontWeight: 700 }}>{val.value.toFixed(2)}</span>}
                  {hov && d.adjustable && !d.hidden && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 1 }}>
                      <button style={legBtn} title="Shorter period" aria-label={`${d.label} shorter period`} onClick={() => stepPeriod(d.id, d.period as number, -1)}>−</button>
                      <button style={legBtn} title="Longer period" aria-label={`${d.label} longer period`} onClick={() => stepPeriod(d.id, d.period as number, 1)}>+</button>
                    </span>
                  )}
                  {hov && (
                    <button style={legBtn} title={d.hidden ? "Show indicator" : "Hide indicator"} aria-label={`${d.hidden ? "Show" : "Hide"} ${d.label}`} onClick={() => toggleHide(d.id)}>{d.hidden ? "◌" : "◉"}</button>
                  )}
                  {hov && (
                    <button style={legBtn} title="Remove indicator" aria-label={`Remove ${d.label}`} onClick={() => toggleInd(d.id)}>✕</button>
                  )}
                </div>
              );
            })}
          </div>
          <div ref={hostRef} style={{ position: "absolute", inset: 0 }} />
          {overlay}
          {guided && (
            <div onClick={(e) => e.stopPropagation()} style={{ position: "absolute", left: 8, bottom: 28, zIndex: 7, display: "flex", alignItems: "center", gap: 5, padding: "5px 6px", borderRadius: 10, ...surface }}>
              {quickActions
                .slice()
                .sort((a, b) => (cmdUsage[b.id] ?? 0) - (cmdUsage[a.id] ?? 0))
                .filter((a) => a.id !== "guided" && a.id !== "clearrecent")
                .slice(0, 3)
                .map((a) => (
                  <button key={`rec-${a.id}`} style={clusterBtn(!!a.active)} title={`Recommended: ${a.label}`} onClick={() => runQuickAction(a.id)}>
                    {a.glyph}
                  </button>
                ))}
              {visibleGuidedPins.map((id) => {
                const a = quickById[id];
                return <button key={id} style={clusterBtn(!!a.active)} title={a.label} onClick={() => runQuickAction(id)}>{a.glyph}</button>;
              })}
              <button style={clusterBtn(dockEditOpen)} title="Customize quick dock" onClick={() => setDockEditOpen((o) => !o)}>⋯</button>
              <span style={{ marginLeft: 2, color: th.text, fontFamily: th.font, fontSize: 11, whiteSpace: "nowrap" }}>Press G for Pro mode</span>
            </div>
          )}
          {guided && dockEditOpen && (
            <div onClick={(e) => e.stopPropagation()} style={{ position: "absolute", left: 8, bottom: 68, zIndex: 21, width: 250, maxHeight: 280, overflowY: "auto", borderRadius: 10, padding: 6, ...surface }}>
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: th.text, padding: "2px 8px 6px" }}>Quick dock buttons</div>
              {GUIDED_PIN_CHOICES.map((id) => {
                const a = quickById[id];
                if (!a) return null;
                const on = guidedPins.includes(id);
                return (
                  <button key={id} style={item(on)} onClick={() => toggleGuidedPin(id)}>
                    <span style={{ width: 16, color: on ? th.line : th.text }}>{on ? "✓" : ""}</span>
                    <span style={{ width: 18, color: th.text }}>{a.glyph}</span>
                    {a.label}
                  </button>
                );
              })}
              <div style={{ height: 1, background: th.border, margin: "5px 0" }} />
              <button style={item(false)} onClick={() => setGuidedPins(DEFAULT_GUIDED_PINS)}>
                <span style={{ width: 16 }} /> Reset default pins
              </button>
            </div>
          )}
          {/* bottom-right scale + navigation cluster (over the axis corner, TradingView-style) */}
          <div onClick={(e) => e.stopPropagation()} style={{ position: "absolute", right: 70, bottom: 28, zIndex: 6, display: "flex", alignItems: "flex-end", gap: 3 }}>
            {!view.atRealtime && (
              <button style={clusterBtn(false)} title="Scroll to the latest bar" aria-label="Go to realtime" onClick={() => chartRef.current?.scrollToRealtime()}>»|</button>
            )}
            <button style={clusterBtn(vpvr)} title="Visible-range volume profile" aria-label="Visible-range volume profile" onClick={() => setVpvr((v) => !v)}>
              <Icon name="vpvr" size={13} />
            </button>
            <button style={clusterBtn(dataWindow)} title="Data window — every value at the cursor" aria-label="Data window" onClick={() => setDataWindow((v) => !v)}>
              <Icon name="datawindow" size={13} />
            </button>
            <button style={clusterBtn(!view.autoScale)} title="Reset price scale to auto" aria-label="Reset price scale" onClick={() => chartRef.current?.resetPriceScale()}>Auto</button>
            <button style={clusterBtn(scaleMode === "log")} title="Logarithmic price scale" aria-label="Logarithmic scale" onClick={() => setScaleMode((m) => (m === "log" ? "normal" : "log"))}>Log</button>
            <button style={clusterBtn(scaleMode === "percent")} title="Percent price scale" aria-label="Percent scale" onClick={() => setScaleMode((m) => (m === "percent" ? "normal" : "percent"))}>%</button>
            <span style={{ position: "relative" }}>
              <button style={clusterBtn(settingsOpen)} title="Chart settings" aria-label="Chart settings" onClick={() => setSettingsOpen((o) => !o)}>⚙</button>
              {settingsOpen && (
                <div style={{ position: "absolute", right: 0, bottom: 30, zIndex: 20, background: th.paneBackground, border: `1px solid ${th.border}`, borderRadius: 10, padding: 6, boxShadow: "0 12px 34px rgba(0,0,0,0.5)", minWidth: 226, maxHeight: 340, overflowY: "auto" }}>
                  <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: th.text, padding: "2px 8px 6px" }}>Appearance</div>
                  {(
                    [
                      ["Grid lines", gridOn, setGridOn],
                      ["Volume pane", showVol, setShowVol],
                      ["Last-price line", priceLineOn, setPriceLineOn],
                      ["Bar-close countdown", countdown, setCountdown],
                      ["Symbol watermark", watermark, setWatermarkOn],
                      ["Extended-hours shading", sessions, setSessions],
                      ["Stop / target levels", levelsOn, setLevelsOn],
                    ] as const
                  ).map(([label, val, set]) => (
                    <button key={label} style={item(false)} onClick={() => set((v) => !v)}>
                      <span style={{ width: 16, color: val ? th.line : th.text }}>{val ? "✓" : ""}</span> {label}
                    </button>
                  ))}
                  <div style={{ height: 1, background: th.border, margin: "5px 0" }} />
                  <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: th.text, padding: "2px 8px 6px" }}>Analysis</div>
                  {(
                    [
                      ["Visible-range volume profile", vpvr, setVpvr],
                      ["Data window", dataWindow, setDataWindow],
                      ["Magnet (snap to OHLC)", magnet, setMagnetOn],
                      ["Guided mode", guided, setGuided],
                    ] as const
                  ).map(([label, val, set]) => (
                    <button key={label} style={item(false)} onClick={() => set((v) => !v)}>
                      <span style={{ width: 16, color: val ? th.line : th.text }}>{val ? "✓" : ""}</span> {label}
                    </button>
                  ))}
                  <div style={{ height: 1, background: th.border, margin: "5px 0" }} />
                  <button style={item(false)} onClick={() => { chartRef.current?.resetPanes(); setSettingsOpen(false); }}>
                    <span style={{ width: 16 }} /> Reset pane heights
                  </button>
                  <button style={item(false)} onClick={() => { setShortcuts(true); setSettingsOpen(false); }}>
                    <span style={{ width: 16 }} /> Keyboard shortcuts
                  </button>
                  <button style={item(false)} onClick={() => { saveImage(); setSettingsOpen(false); }}>
                    <span style={{ width: 16 }} /> Save chart image (PNG)
                  </button>
                </div>
              )}
            </span>
          </div>
          {/* Data window — every series' value at the crosshair, the way a desk terminal reads a bar.
              Values come straight from the engine's crosshair readout, so it can only ever show what
              is actually plotted. */}
          {dataWindow && (
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                position: "absolute",
                top: 8,
                right: 8,
                zIndex: 7,
                width: 214,
                background: `color-mix(in srgb, ${th.paneBackground} 92%, transparent)`,
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
                border: `1px solid ${th.border}`,
                borderRadius: 10,
                boxShadow: "0 10px 30px rgba(0,0,0,0.4)",
                fontFamily: th.monoFont,
                fontSize: 11,
                overflow: "hidden",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 9px", borderBottom: `1px solid ${th.border}` }}>
                <span style={{ fontFamily: th.font, fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: th.text }}>Data window</span>
                <button onClick={() => setDataWindow(false)} aria-label="Close data window" style={{ border: "none", background: "transparent", color: th.text, cursor: "pointer", fontSize: 13, lineHeight: 1 }}>✕</button>
              </div>
              <div style={{ padding: "6px 9px 8px" }}>
                {!legend.bar && <div style={{ color: th.text, padding: "6px 0" }}>Hover the chart to read a bar.</div>}
                {legend.bar && (
                  <>
                    <div style={{ color: th.text, marginBottom: 5 }}>{new Date(legend.bar.time * 1000).toLocaleString()}</div>
                    {(
                      [
                        ["Open", legend.bar.open.toFixed(2), barCol],
                        ["High", legend.bar.high.toFixed(2), barCol],
                        ["Low", legend.bar.low.toFixed(2), barCol],
                        ["Close", legend.bar.close.toFixed(2), barCol],
                        ["Chg O→C", `${legend.bar.close - legend.bar.open >= 0 ? "+" : ""}${(legend.bar.close - legend.bar.open).toFixed(2)}`, legend.bar.close >= legend.bar.open ? th.up : th.down],
                        ["Chg %", `${legend.bar.open ? (((legend.bar.close - legend.bar.open) / legend.bar.open) * 100).toFixed(2) : "0.00"}%`, legend.bar.close >= legend.bar.open ? th.up : th.down],
                        ["Volume", legend.bar.volume ? fmtVol(legend.bar.volume) : "—", th.textStrong],
                      ] as const
                    ).map(([k, v, c]) => (
                      <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "1.5px 0" }}>
                        <span style={{ color: th.text }}>{k}</span>
                        <span style={{ color: c, fontWeight: 700 }}>{v}</span>
                      </div>
                    ))}
                    {legend.values.length > 0 && (
                      <>
                        <div style={{ height: 1, background: th.border, margin: "6px 0" }} />
                        {legend.values.map((v, i) => (
                          <div key={`${v.label}-${i}`} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "1.5px 0" }}>
                            <span style={{ color: th.text, display: "inline-flex", alignItems: "center", gap: 5, minWidth: 0 }}>
                              <span style={{ width: 7, height: 7, borderRadius: 2, background: v.color, flex: "none" }} />
                              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.label}</span>
                            </span>
                            <span style={{ color: th.textStrong, fontWeight: 700 }}>{v.value == null ? "—" : v.value.toFixed(2)}</span>
                          </div>
                        ))}
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
          {scriptOpen && onRunScript && (
            <ScriptEditor
              theme={th}
              value={scriptSrc}
              onChange={(src) => {
                setScriptSrc(src);
                // A result belongs to the source that produced it. Keeping either visible while the
                // script changes underneath would attribute one strategy's record to another.
                setScorecard(null);
                setSweep(null);
              }}
              onRun={runScript}
              onClose={() => setScriptOpen(false)}
              running={scriptRunning}
              error={scriptErr}
              status={scriptStatus}
              library={scriptLibrary}
              onBacktest={
                onBacktestScript
                  ? async () => {
                      setBacktesting(true);
                      try {
                        setScorecard(await onBacktestScript(scriptSrc, loadedSaved?.id));
                      } catch {
                        // the host toasts the reason; the panel simply stays empty rather than
                        // showing a stale scorecard for a script that is no longer the one on screen
                        setScorecard(null);
                      } finally {
                        setBacktesting(false);
                      }
                    }
                  : undefined
              }
              scorecard={scorecard}
              backtesting={backtesting}
              onSweep={
                onSweepScript
                  ? async () => {
                      setSweeping(true);
                      try {
                        setSweep(await onSweepScript(scriptSrc));
                      } catch {
                        setSweep(null);
                      } finally {
                        setSweeping(false);
                      }
                    }
                  : undefined
              }
              sweep={sweep}
              sweeping={sweeping}
              savedLibrary={savedLibrary}
              onSelectSaved={(sv) => {
                setScriptSrc(sv.source);
                setLoadedSaved(sv);
                setScorecard(null);
                setSweep(null);
                setScriptErr(null);
              }}
              onSave={
                loadedSaved && onSaveScript
                  ? async () => {
                      await onSaveScript(scriptSrc, loadedSaved.id);
                      // Clear "dirty" by remembering the source we just persisted.
                      setLoadedSaved((prev) => (prev ? { ...prev, source: scriptSrc } : prev));
                    }
                  : undefined
              }
              onSaveAs={
                onSaveAsScript
                  ? async (title) => {
                      const sv = await onSaveAsScript(scriptSrc, title);
                      if (sv) setLoadedSaved(sv); // now editing the newly-saved strategy
                    }
                  : undefined
              }
              onDeleteSaved={
                onDeleteSavedScript
                  ? async (id) => {
                      await onDeleteSavedScript(id);
                      setLoadedSaved((prev) => (prev && prev.id === id ? null : prev));
                    }
                  : undefined
              }
              dirty={loadedSaved ? scriptSrc !== loadedSaved.source : undefined}
            />
          )}
          {/* Keyboard shortcuts — the chart's own keys, live while the pointer is over the plot */}
          {shortcuts && (
            <>
              <div onClick={() => setShortcuts(false)} style={{ position: "absolute", inset: 0, zIndex: 32, background: "rgba(0,0,0,0.45)" }} />
              <div style={{ position: "absolute", zIndex: 33, top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 320, background: th.paneBackground, border: `1px solid ${th.border}`, borderRadius: 12, boxShadow: "0 18px 50px rgba(0,0,0,0.6)", overflow: "hidden", fontFamily: th.font }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 13px", borderBottom: `1px solid ${th.border}` }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: th.textStrong }}>Keyboard &amp; mouse</span>
                  <button onClick={() => setShortcuts(false)} style={{ border: "none", background: "transparent", color: th.text, cursor: "pointer", fontSize: 16, lineHeight: 1 }}>✕</button>
                </div>
                <div style={{ padding: "8px 13px 13px" }}>
                  {(
                    [
                      ["+ / −", "Zoom in / out"],
                      ["← / →", "Pan back / forward"],
                      ["F", "Fit all bars"],
                      ["K", "Command launcher"],
                      ["↑ / ↓ + Enter", "Select and run launcher action"],
                      ["Home / End", "Jump to first/last launcher action"],
                      ["PgUp / PgDn", "Jump 6 actions in launcher"],
                      ["F (in launcher)", "Favorite / unfavorite selected action"],
                      ["G", "Toggle Guided / Pro UI"],
                      ["Esc", "Cancel tool / deselect"],
                      ["Delete", "Remove selected drawing"],
                      ["Wheel", "Zoom around the cursor"],
                      ["Shift-wheel / two-finger", "Pan the time axis"],
                      ["Drag right axis", "Stretch the price scale"],
                      ["Drag a pane edge", "Resize that pane"],
                      ["Double-click", "Reset scale + fit"],
                      ["Right-click", "Chart context menu"],
                    ] as const
                  ).map(([k, v]) => (
                    <div key={k} style={{ display: "flex", alignItems: "center", gap: 10, padding: "3px 0", fontSize: 12.5 }}>
                      <span style={{ minWidth: 128, fontFamily: th.monoFont, fontSize: 11, color: th.line, background: `color-mix(in srgb, ${th.line} 12%, transparent)`, borderRadius: 5, padding: "3px 6px", textAlign: "center" }}>{k}</span>
                      <span style={{ color: th.textStrong }}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
          {/* per-drawing style editor — floats beside the selected drawing */}
          {selection && (
            <div
              style={{
                position: "absolute",
                left: Math.max(4, selection.x - 6),
                top: Math.max(4, selection.y - 44),
                zIndex: 8,
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "5px 7px",
                borderRadius: 10,
                ...surface,
              }}
            >
              {SWATCHES.map((c) => (
                <button
                  key={c}
                  title={c}
                  onClick={() => chartRef.current?.setDrawingColor(selection.id, c)}
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 4,
                    padding: 0,
                    cursor: "pointer",
                    background: c,
                    border: (selection.color ?? th.line).toLowerCase() === c.toLowerCase() ? `2px solid ${th.textStrong}` : `1px solid ${th.border}`,
                  }}
                />
              ))}
              <span style={{ width: 1, height: 16, background: th.border, margin: "0 2px" }} />
              {[1, 2, 3].map((w) => {
                const on = (selection.width ?? 1) === w;
                return (
                  <button
                    key={w}
                    title={`Line width ${w}`}
                    onClick={() => chartRef.current?.setDrawingWidth(selection.id, w)}
                    style={{ width: 22, height: 18, display: "flex", alignItems: "center", justifyContent: "center", border: "none", borderRadius: 4, cursor: "pointer", padding: 0, background: on ? `color-mix(in srgb, ${th.line} 20%, transparent)` : "transparent" }}
                  >
                    <span style={{ display: "block", width: 14, height: w, borderRadius: 2, background: on ? th.line : th.text }} />
                  </button>
                );
              })}
              <span style={{ width: 1, height: 16, background: th.border, margin: "0 2px" }} />
              {(["solid", "dashed", "dotted"] as const).map((st) => {
                const on = (selection.style ?? "solid") === st;
                const dash = st === "dashed" ? "3 2" : st === "dotted" ? "1.5 2" : undefined;
                return (
                  <button
                    key={st}
                    title={`Line style: ${st}`}
                    onClick={() => chartRef.current?.setDrawingStyle(selection.id, st)}
                    style={{ width: 26, height: 18, display: "flex", alignItems: "center", justifyContent: "center", border: "none", borderRadius: 4, cursor: "pointer", padding: 0, background: on ? `color-mix(in srgb, ${th.line} 20%, transparent)` : "transparent" }}
                  >
                    <svg width="18" height="8" style={{ display: "block" }}>
                      <line x1="1" y1="4" x2="17" y2="4" stroke={on ? th.line : th.text} strokeWidth="1.6" strokeDasharray={dash} strokeLinecap="round" />
                    </svg>
                  </button>
                );
              })}
              <span style={{ width: 1, height: 16, background: th.border, margin: "0 2px" }} />
              <button title="Delete drawing" onClick={() => chartRef.current?.deleteSelected()} style={{ width: 20, height: 18, border: "none", borderRadius: 4, background: "transparent", color: th.text, cursor: "pointer", fontSize: 13 }}>
                ⌫
              </button>
            </div>
          )}
          {/* Indicators — a searchable modal (the TradingView pattern), scalable to any length */}
          {indModal && (
            <>
              <div onClick={() => setIndModal(false)} style={{ position: "absolute", inset: 0, zIndex: 30, background: "rgba(0,0,0,0.4)" }} />
              <div style={{ position: "absolute", zIndex: 31, top: 12, right: 12, width: 326, maxHeight: "82%", display: "flex", flexDirection: "column", borderRadius: 12, overflow: "hidden", ...surface }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderBottom: `1px solid ${th.border}` }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: th.textStrong, fontFamily: th.font }}>Indicators</span>
                  <button onClick={() => setIndModal(false)} style={{ border: "none", background: "transparent", color: th.text, cursor: "pointer", fontSize: 16, lineHeight: 1 }}>
                    ✕
                  </button>
                </div>
                <div style={{ padding: "8px 10px", borderBottom: `1px solid ${th.border}` }}>
                  <input
                    value={indSearch}
                    onChange={(e) => setIndSearch(e.target.value)}
                    placeholder="Search…"
                    autoFocus
                    style={{ width: "100%", boxSizing: "border-box", padding: "7px 10px", borderRadius: 6, border: `1px solid ${th.border}`, background: th.background, color: th.textStrong, fontSize: 13, fontFamily: th.font }}
                  />
                </div>
                <div style={{ overflowY: "auto", padding: 6 }}>
                  {(() => {
                    const q = indSearch.trim().toLowerCase();
                    const hit = (id: string) => {
                      const d = INDS.find((x) => x.id === id);
                      return d && d.label.toLowerCase().includes(q) ? d : null;
                    };
                    // grouped by family, with anything not explicitly grouped falling into "Other" so
                    // a newly added indicator can never silently vanish from the picker
                    const grouped = new Set(IND_GROUPS.flatMap((g) => g.ids));
                    const groups = [...IND_GROUPS, { label: "Other", ids: INDS.filter((d) => !grouped.has(d.id)).map((d) => d.id) }];
                    let shown = 0;
                    const body = groups.map((g) => {
                      const items = g.ids.map(hit).filter(Boolean) as typeof INDS;
                      if (!items.length) return null;
                      shown += items.length;
                      return (
                        <div key={g.label}>
                          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: th.text, padding: "8px 10px 4px" }}>{g.label}</div>
                          {items.map((d) => {
                            const locked = isLocked(d.id);
                            const on = active.includes(d.id) && !locked;
                            return (
                              <button
                                key={d.id}
                                onClick={() => toggleInd(d.id)}
                                aria-disabled={locked}
                                title={locked ? `${d.label} — not included in your plan` : undefined}
                                style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "8px 10px", border: "none", borderRadius: 7, cursor: "pointer", textAlign: "left", fontFamily: th.font, fontSize: 13, color: locked ? th.text : th.textStrong, background: on ? `color-mix(in srgb, ${th.line} 12%, transparent)` : "transparent" }}
                              >
                                <span style={{ width: 14, textAlign: "center", color: on ? th.line : th.text }}>{locked ? "🔒" : on ? "✓" : "＋"}</span>
                                {d.label}
                              </button>
                            );
                          })}
                        </div>
                      );
                    });
                    return shown === 0 ? <div style={{ padding: 12, color: th.text, fontSize: 12.5 }}>No indicators match “{indSearch}”.</div> : body;
                  })()}
                </div>
              </div>
            </>
          )}
          {/* Bar-replay: a "click a bar" hint while arming, then a play/step control bar */}
          {replay?.arming && (
            <div style={{ position: "absolute", top: 40, left: "50%", transform: "translateX(-50%)", zIndex: 9, padding: "6px 12px", background: th.line, color: CHIP_INK, borderRadius: 8, fontSize: 12.5, fontWeight: 700, boxShadow: "0 6px 18px rgba(0,0,0,0.4)" }}>
              Click a bar to start replay
            </div>
          )}
          {replay?.active && (
            <div style={{ position: "absolute", bottom: 14, left: "50%", transform: "translateX(-50%)", zIndex: 9, display: "flex", alignItems: "center", gap: 3, padding: "5px 7px", borderRadius: 12, ...surface }}>
              {(() => {
                const cbtn = (glyph: string, title: string, onClick: () => void, on = false) => (
                  <button title={title} onClick={onClick} style={{ width: 30, height: 26, border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13, background: on ? `color-mix(in srgb, ${th.line} 18%, transparent)` : "transparent", color: on ? th.line : th.textStrong }}>
                    {glyph}
                  </button>
                );
                return (
                  <>
                    {cbtn("⏮", "Step back", () => chartRef.current?.replayBack())}
                    {cbtn(playing ? "⏸" : "▶", playing ? "Pause" : "Play", () => setPlaying((p) => !p), playing)}
                    {cbtn("⏭", "Step forward", () => chartRef.current?.replayForward())}
                    <span style={{ width: 1, height: 16, background: th.border, margin: "0 3px" }} />
                    {[1, 2, 4].map((s) => (
                      <button key={s} onClick={() => setSpeed(s)} style={{ height: 24, padding: "0 7px", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 11.5, fontWeight: 600, background: speed === s ? `color-mix(in srgb, ${th.line} 18%, transparent)` : "transparent", color: speed === s ? th.line : th.text }}>
                        {s}×
                      </button>
                    ))}
                    <span style={{ padding: "0 6px", fontSize: 11, fontFamily: th.monoFont, color: th.text }}>
                      {replay.index + 1}/{replay.total}
                    </span>
                    {cbtn("✕", "Exit replay", () => chartRef.current?.exitReplay())}
                  </>
                );
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const fmtVol = (v: number) => (v >= 1e9 ? (v / 1e9).toFixed(2) + "B" : v >= 1e6 ? (v / 1e6).toFixed(1) + "M" : v >= 1e3 ? (v / 1e3).toFixed(0) + "K" : String(Math.round(v)));
