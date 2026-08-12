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

export interface ChartOptions {
  theme?: Partial<Theme>;
  seriesType?: SeriesType;
  showVolume?: boolean;
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
