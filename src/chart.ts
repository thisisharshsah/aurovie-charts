import { US_EQUITIES_SESSION, type Bar, type ChartMarker, type ChartOptions, type IndicatorInstance, type LegendValue, type PriceLine, type Projection, type ScaleMode, type SeriesType, type SessionSpec, type Theme } from "./types";
import { DRAW_SPECS, type Drawing, type DrawCtx, type Point } from "./drawings";
import { autoBox, computeRenko, computePnf, computeKagi, type PnfCol, type KagiSeg } from "./resample";
import { scriptColor, type ScriptRender } from "./script";
import {
  DARK,
  clamp,
  crisp,
  niceTicks,
  priceDecimals,
  fmtPrice,
  fmtVolume,
  medianSpacingSec,
  fmtAxisTime,
  fmtCrosshairTime,
  fmtCountdown,
  isTimeBoundary,
  rightMarginBars,
  panFloorBars,
  fitBarCount,
  projVisibleRange,
  alpha,
  mix,
  roundRectPath,
  sma,
  ema,
  bollinger,
  rsi,
  macd,
  vwap,
  wma,
  stochastic,
  atr,
  dema,
  tema,
  hma,
  donchian,
  cci,
  williamsR,
  obv,
  roc,
  mfi,
  ichimoku,
  supertrend,
  psar,
  keltner,
  adx,
  vwma,
  cmf,
  aroon,
  stochRsi,
  momentum,
  trix,
  pivotPoints,
  volumeProfile,
  type VolumeProfile,
  SERIES_PALETTE as PALETTE,
  SIGNAL_COLOR,
  placeAxisTag,
} from "./util";

const RIGHT_AXIS_W = 64;
/// How far a left chip may be nudged from its own line before it is dropped instead. About
/// one and a half chip heights: enough to separate a couple of neighbours, not enough to
/// build a column that no longer points at anything.
const MAX_CHIP_OFFSET = 28;
const BOTTOM_AXIS_H = 22;
const MIN_BAR_SPACING = 1.5;
const MAX_BAR_SPACING = 64;

type PlotLine = { values: number[]; color: string; width: number; dash?: number[] };
// A two-line band the renderer fills between (Ichimoku's kumo, a Keltner/Bollinger envelope). `shift`
// displaces it forward in bars — the Ichimoku cloud is plotted 26 bars AHEAD of the bar it was
// computed from, which is the whole point of a leading study.
type BandFill = { a: number[]; b: number[]; upColor: string; downColor: string; shift?: number; opacity?: number };
// A per-bar directional series: Supertrend draws it as a colour-flipping stair, PSAR as dots.
type DirSeries = { values: number[]; dirs: number[]; up: string; down: string; mode: "line" | "dots" };
interface Overlay {
  id: string;
  kind: string;
  inputs: number[];
  color: string;
  lines: PlotLine[];
  fills?: BandFill[];
  dir?: DirSeries;
  shiftLines?: { values: number[]; color: string; width: number; shift: number; dash?: number[] }[]; // displaced plain lines (Ichimoku's lagging span)
  legend(i: number): LegendValue[];
}
interface Study {
  id: string;
  kind: string;
  inputs: number[];
  color: string;
  data: {
    rsi?: number[];
    macd?: ReturnType<typeof macd>;
    stoch?: { k: number[]; d: number[] };
    atr?: number[];
    // generic single-line studies (CCI / Williams %R / OBV / ROC / MFI …)
    line?: number[];
    lines?: PlotLine[]; // multi-line studies (ADX/DMI) — autoscaled together
    levels?: number[]; // dashed reference levels
    srange?: [number, number]; // fixed y-range (else autoscale)
    symmetric?: boolean; // autoscale symmetric about zero
  };
  legend(i: number): LegendValue[];
}
interface Pane {
  kind: "price" | "volume" | "study";
  key: string; // stable identity for per-pane height overrides ("price" | "volume" | the study id)
  top: number;
  height: number;
  min: number;
  max: number;
  base?: number; // first-visible close (for percent-scale labels)
  study?: Study;
}
export type Tool = "cross" | "hline" | "vline" | "trend" | "ray" | "extended" | "rect" | "ellipse" | "fib" | "channel" | "pitchfork" | "arrow" | "brush" | "measure" | "text" | "longpos" | "shortpos" | "pricerange" | "daterange" | "datepricerange" | "avwap" | "volprofile" | "avwapbands" | "avolprofile" | "regchan";


// The engine. Frame-agnostic: `new Chart(el, opts)`, feed it `setData(bars)`, drive it with the
// mouse. No React, no dependencies — just a canvas.
export class Chart {
  private host: HTMLElement;
  private base: HTMLCanvasElement;
  private overlay: HTMLCanvasElement;
  private bctx: CanvasRenderingContext2D;
  private octx: CanvasRenderingContext2D;
  private ro: ResizeObserver | null = null;

  private w = 0;
  private h = 0;
  private dpr = 1;

  private rawBars: Bar[] = []; // the source time bars; `bars` is derived from these
  private bars: Bar[] = []; // the DISPLAY series (= rawBars, or Renko bricks / P&F columns)
  private haBars: Bar[] = []; // Heikin-Ashi transform of `bars`, recomputed on data change
  private pnfCols: PnfCol[] = []; // Point & Figure column meta, parallel to `bars` when seriesType==="pnf"
  private kagiSegs: KagiSeg[] = []; // Kagi render segments (column/price space) when seriesType==="kagi"
  private brickSize = 0; // Renko/P&F box size in price; 0 = auto (ATR-derived)
  private boxEff = 1; // the effective box size actually used to resample
  private pnfReversal = 3; // Point & Figure reversal, in boxes (classic 3)
  private replayTo: number | null = null; // bar-replay: render only bars 0..replayTo when set
  private replayArming = false; // waiting for the user to click a start bar
  private seriesType: SeriesType = "candles";
  private showVolume = true;
  private gridOn = true; // grid lines (axis labels stay regardless)
  private lastPriceOn = true; // dashed last-price line + axis tag
  private atRealtime = true; // is the newest bar parked at the right edge? (drives "go to realtime")
  private lastAutoScale = true; // last-reported price-scale-auto state (to gate onViewChange)
  private magnet = false; // magnet mode: snap drawing anchors + the crosshair to the nearest OHLC
  private priceLines: PriceLine[] = []; // host-supplied horizontal lines (alerts/orders/targets)
  private markers: ChartMarker[] = []; // host-supplied bar-anchored events (fills)
  // Right-axis pill slots claimed this frame, so opaque tags can't bury one another. Cleared per draw.
  private axisSlots: { y0: number; y1: number }[] = [];
  // Separate from `axisSlots`: the left chips and the right pills are two independent
  // columns, so a chip must not be pushed aside by a pill it can never overlap.
  private chipSlots: { y0: number; y1: number }[] = [];
  private lastPriceY: number | null = null; // what level tags step away from
  private srOn = false; // auto support/resistance overlay (pivot levels off the real bars)
  private srCache: { key: string; levels: { price: number; kind: "s" | "r" }[] } = { key: "", levels: [] };
  private priceLineHits: { id: string; x: number; y: number; w: number; h: number }[] = []; // ✕ hit rects
  private axisHint = false; // show a "＋ alert" hint when hovering the price axis (host has create wired)
  private axisHoverY: number | null = null; // y of the cursor over the price axis (for the hint)
  private theme: Theme;
  private opts: ChartOptions;
  // --- premium chrome -----------------------------------------------------
  private watermark = ""; // faint symbol/interval behind the plot (empty = off)
  private watermarkSub = "";
  private loading = false; // datafeed in flight → skeleton shimmer instead of an empty pane
  private shimmer = 0; // shimmer phase while loading
  private countdownOn = true; // live "time to bar close" under the last-price tag (intraday only)
  private clockTimer: ReturnType<typeof setInterval> | null = null;
  private sessionsOn = true; // shade extended-hours columns on intraday charts
  private vpvrOn = false; // visible-range volume profile on the price pane
  private vpvrCache: { key: string; vp: VolumeProfile | null } = { key: "", vp: null };
  // Per-pane height overrides in px, set by dragging a pane separator (key = Pane.key). Absent =
  // the proportional default. The price pane is always the remainder.
  private paneH: Record<string, number> = {};
  private paneDrag: { key: string; startY: number; startH: number; aboveKey: string | null; startAboveH: number; othersH: number } | null = null;
  private paneHover: number | null = null; // index of the separator under the cursor (resize affordance)
  // Derived-per-dataset caches. Everything here is a pure function of `bars`, so it is rebuilt on data
  // change and NEVER recomputed inside the rAF loop — a pan must not allocate per bar per frame.
  private spacingSec = 86400; // median bar spacing (drives the bar-close countdown)
  private volMa: number[] = []; // volume moving average drawn across the volume pane
  private extHours: boolean[] = []; // per-bar "outside the exchange session" flag for session shading
  private session: SessionSpec = US_EQUITIES_SESSION;
  private utc = false; // read bar times in UTC (exchange wall-clock storage) rather than local
  private projection: Projection | null = null; // forward columns past the newest bar (never bars)
  // Axis gutters, zeroed by `axes: false` so a bare plot fills the host.
  private axisW = RIGHT_AXIS_W;
  private axisH = BOTTOM_AXIS_H;
  private interactive = true;

  private barSpacing = 8;
  private offset = 0; // x of bar index 0's centre
  private intraday = false;
  private decimals = 2;
  private scaleMode: ScaleMode = "normal";
  private priceZoom = 1; // manual price-scale stretch (right-axis drag); 1 = pure autoscale

  // The rendered arrays are the CONCATENATION of two independent sources: built-in indicators and
  // user scripts. Keeping the sources separate is what lets setIndicators() and setScripts() each
  // re-seed without silently dropping the other's series.
  private overlays: Overlay[] = [];
  private studies: Study[] = [];
  private indOverlays: Overlay[] = [];
  private indStudies: Study[] = [];
  private scrOverlays: Overlay[] = [];
  private scrStudies: Study[] = [];
  private compares: { symbol: string; color: string; bars: Bar[] }[] = [];
  private panes: Pane[] = [];

  private cross: { x: number; y: number } | null = null;
  private dragging: null | { startX: number; startOffset: number; moved: boolean; lastX: number; vel: number } = null;
  private tool: Tool = "cross";
  private drawings: Drawing[] = [];
  private drafting: { type: string; points: Point[] } | null = null;
  private brushing: Point[] | null = null; // freehand stroke being drawn (drag-collected)
  private selected: number | null = null;
  private dragHandle: { id: number; idx: number } | null = null;
  private dragBody: { id: number; startPts: Point[]; startIdx: number; startPrice: number } | null = null;
  private axisDrag: { startY: number; startZoom: number; moved: boolean } | null = null;
  private pointers = new Map<number, { x: number; y: number }>(); // live pointers (for multi-touch pinch)
  private pinch: { startDist: number; startSpacing: number; anchorIndex: number } | null = null;
  private nextId = 1;
  // --- animation state (the smooth, premium feel) ---
  // The price scale glides: dispMin/dispMax are the RENDERED range, eased toward the visible
  // target each frame. Zoom eases barSpacing toward tBarSpacing pivoting on zoomAnchor. A flick
  // leaves `momentum` that decays with friction. All driven by one rAF tick loop.
  private tBarSpacing = 8;
  private zoomAnchor: { x: number; index: number } | null = null;
  private momentum = 0;
  private dispMin = NaN;
  private dispMax = NaN;
  private raf = 0;

  constructor(host: HTMLElement, opts: ChartOptions = {}) {
    this.host = host;
    this.opts = opts;
    this.theme = { ...DARK, ...(opts.theme ?? {}) };
    this.seriesType = opts.seriesType ?? "candles";
    this.showVolume = opts.showVolume ?? true;
    this.utc = opts.utc ?? false;
    // One clock for the whole chart: the session inherits `utc` unless it names its own, so an axis
    // and a shading can never disagree about which day a bar belongs to.
    const s = opts.session ?? US_EQUITIES_SESSION;
    this.session = s.utc === undefined ? { ...s, utc: this.utc } : s;
    if (opts.axes === false) {
      this.axisW = 0;
      this.axisH = 0;
    }
    this.interactive = opts.interactive !== false;
    host.style.position = host.style.position || "relative";
    host.style.userSelect = "none";
    host.style.touchAction = "none";
    this.base = this.mkCanvas(1);
    this.overlay = this.mkCanvas(2);
    this.bctx = this.base.getContext("2d")!;
    this.octx = this.overlay.getContext("2d")!;
    this.attach();
    this.resize();
    // One slow heartbeat drives the live bar-close countdown and the loading shimmer — the rAF loop
    // only runs while something is moving, so without this the countdown would freeze between ticks.
    if (typeof setInterval !== "undefined") {
      this.clockTimer = setInterval(() => {
        if (!this.loading && this.countdownOn && this.intraday && this.lastPriceOn && this.bars.length && this.replayTo == null) this.requestDraw();
      }, 1000);
    }
  }

  private mkCanvas(z: number): HTMLCanvasElement {
    const c = document.createElement("canvas");
    c.style.position = "absolute";
    c.style.inset = "0";
    c.style.width = "100%";
    c.style.height = "100%";
    c.style.zIndex = String(z);
    if (z === 2) c.style.cursor = "crosshair";
    this.host.appendChild(c);
    return c;
  }

  // ---- public API ---------------------------------------------------------
  // Composite the two stacked canvases (base candles/grid + overlay crosshair/drawings) into one PNG
  // data URL — a faithful capture of exactly the rendered pixels of the real served bars. The theme
  // background is painted first so transparent regions don't export as checkerboard.
  toDataURL(): string {
    const w = this.base.width;
    const h = this.base.height;
    if (!w || !h) return "";
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const cx = c.getContext("2d");
    if (!cx) return "";
    cx.fillStyle = this.theme.background;
    cx.fillRect(0, 0, w, h);
    cx.drawImage(this.base, 0, 0);
    cx.drawImage(this.overlay, 0, 0);
    return c.toDataURL("image/png");
  }

  setData(bars: Bar[], dataVersion?: string) {
    this.rawBars = bars.slice().sort((a, b) => a.time - b.time);
    this.intraday = medianSpacingSec(this.rawBars) < 86000;
    // snap the animated state to the fresh dataset (no eerie ease from the old symbol's prices)
    this.dispMin = NaN;
    this.dispMax = NaN;
    this.priceZoom = 1;
    this.momentum = 0;
    this.zoomAnchor = null;
    if (this.replayTo != null || this.replayArming) {
      this.replayTo = null;
      this.replayArming = false;
      this.emitReplay();
    }
    // A new series invalidates any projection: it was computed against the old bars.
    this.projection = null;
    this.rebuildSeries();
    this.recompute();
    this.fitContent();
    this.opts.onData?.(dataVersion, this.rawBars.length);
    this.emitViewChange();
    this.requestDraw();
  }
  // Merge a realtime bar (same last timestamp → update; newer → append), then re-derive the display
  // series (a Renko tick can spawn new bricks, a P&F tick can open a new column).
  update(bar: Bar) {
    const n = this.rawBars.length;
    if (n === 0) return;
    const last = this.rawBars[n - 1];
    if (bar.time === last.time) this.rawBars[n - 1] = bar;
    else if (bar.time > last.time) this.rawBars.push(bar);
    else return;
    this.rebuildSeries();
    this.recompute();
    this.requestDraw();
  }
  // Derive the DISPLAY series from the raw time bars for the current type. Time-based types (candles,
  // line, Heikin-Ashi, …) pass through; Renko/P&F resample so `bars` becomes bricks/columns and every
  // downstream reader (draw, autoscale, indicators, crosshair, time axis) operates on them for free.
  private rebuildSeries() {
    const st = this.seriesType;
    if (st === "renko" || st === "pnf" || st === "kagi") {
      let box = this.brickSize > 0 ? this.brickSize : autoBox(this.rawBars);
      let bars: Bar[] = [];
      let cols: PnfCol[] = [];
      let segs: KagiSeg[] = [];
      // A single P&F column / Kagi run is a valid chart (a clean monotonic trend). Only Renko needs
      // >=2 bricks to read as a staircase — so require 2 for Renko, 1 for P&F/Kagi.
      const min = st === "renko" ? 2 : 1;
      // If the box is so large it yields no movement, shrink until the series has shape (or give up).
      for (let tries = 0; tries < 8; tries++) {
        if (st === "renko") { bars = computeRenko(this.rawBars, box); }
        else if (st === "pnf") { const r = computePnf(this.rawBars, box, this.pnfReversal); bars = r.bars; cols = r.cols; }
        else { const r = computeKagi(this.rawBars, box); bars = r.bars; segs = r.segs; }
        if (bars.length >= min || box <= 0) break;
        box /= 2;
      }
      this.boxEff = box;
      if (bars.length >= min) {
        this.bars = bars;
        this.pnfCols = cols;
        this.kagiSegs = segs;
      } else {
        // resampling couldn't produce a series (flat data) — fall back to the raw bars, drawn plainly
        this.bars = this.rawBars.slice();
        this.pnfCols = [];
        this.kagiSegs = [];
      }
    } else {
      this.bars = this.rawBars;
      this.pnfCols = [];
      this.kagiSegs = [];
    }
  }
  setSeriesType(t: SeriesType) {
    if (t === this.seriesType) return;
    const prevN = this.bars.length;
    this.seriesType = t;
    this.rebuildSeries();
    this.recompute();
    // any change in bar count (time↔Renko, Renko↔P&F) needs a refit so the series fills the plot;
    // same-count swaps (candles↔Heikin↔line) keep the user's pan/zoom
    if (this.bars.length !== prevN) this.fitContent();
    this.requestDraw();
  }
  // Renko/P&F box size in price units (0 = auto). The host's box control calls this.
  setBrickSize(px: number) {
    this.brickSize = px > 0 ? px : 0;
    this.rebuildSeries();
    this.recompute();
    this.fitContent();
    this.requestDraw();
  }
  getBrickSize() {
    return this.boxEff;
  }
  setTheme(t: Partial<Theme>) {
    this.theme = { ...this.theme, ...t };
    // Some indicators bake theme colours into their series at compute time (Ichimoku's two-tone
    // cloud, Supertrend's flip colours, ADX's ±DI) — recompute so a theme flip repaints them too.
    if (this.overlays.length || this.studies.length) this.recompute();
    this.requestDraw();
  }
  setTool(t: Tool) {
    this.tool = t;
    // brush is placed by DRAG, not clicks, so it uses `brushing` rather than click-drafting
    this.drafting = t !== "cross" && t !== "brush" && DRAW_SPECS[t] ? { type: t, points: [] } : null;
    this.brushing = null;
    if (t !== "cross") {
      this.selected = null;
      this.emitSelection();
    }
    this.overlay.style.cursor = t === "cross" ? "crosshair" : "copy";
    this.opts.onToolChange?.(t);
    this.requestDraw();
  }
  // Revert to the crosshair after placing a drawing WITHOUT clearing the selection, so the new
  // drawing stays selected (its style popover shows) and the toolbar highlight resets.
  private revertToCross() {
    this.tool = "cross";
    this.drafting = null;
    this.brushing = null;
    this.overlay.style.cursor = "crosshair";
    this.opts.onToolChange?.("cross");
  }
  // Recolor the selected (or any) drawing — the host's style popover calls this.
  setDrawingColor(id: number, color: string) {
    const d = this.drawings.find((dd) => dd.id === id);
    if (d) {
      d.color = color;
      this.changed();
      this.emitSelection();
      this.requestDraw();
    }
  }
  setDrawingWidth(id: number, width: number) {
    const d = this.drawings.find((dd) => dd.id === id);
    if (d) {
      d.width = width;
      this.changed();
      this.emitSelection();
      this.requestDraw();
    }
  }
  setDrawingStyle(id: number, style: "solid" | "dashed" | "dotted") {
    const d = this.drawings.find((dd) => dd.id === id);
    if (d) {
      d.style = style;
      this.changed();
      this.emitSelection();
      this.requestDraw();
    }
  }
  // Objects-panel controls: hide/show a drawing (kept in the list, skipped in draw + hit-test) and
  // delete a specific one by id (deleteSelected only removes the SELECTED one).
  setDrawingHidden(id: number, hidden: boolean) {
    const d = this.drawings.find((dd) => dd.id === id);
    if (d) {
      d.hidden = hidden;
      if (hidden && this.selected === id) this.selected = null;
      this.changed();
      this.requestDraw();
    }
  }
  deleteDrawing(id: number) {
    const n = this.drawings.length;
    this.drawings = this.drawings.filter((d) => d.id !== id);
    if (this.drawings.length !== n) {
      if (this.selected === id) this.selected = null;
      this.changed();
      this.requestDraw();
    }
  }
  // Tell the host which drawing is selected + where (screen px of its first anchor) + its color,
  // so it can float a style editor beside it. Fires null when the selection clears.
  private emitSelection() {
    if (!this.opts.onSelectionChange) return;
    const d = this.selected == null ? null : this.drawings.find((dd) => dd.id === this.selected);
    if (!d || !this.panes.length) {
      this.opts.onSelectionChange(null);
      return;
    }
    const p0 = d.points[0];
    const x = clamp(this.x(this.idxOfTime(p0.time)), 0, this.plotW());
    const y = clamp(this.priceToY(this.panes[0], p0.price), 0, this.plotH());
    this.opts.onSelectionChange({ id: d.id, color: d.color, width: d.width ?? 1, style: d.style ?? "solid", x, y });
  }
  // Time → x pixel, interpolated between bars (so fractional-time brush points stay smooth).
  private xAtTime(t: number): number {
    const i = this.idxOfTime(t);
    const b0 = this.bars[i];
    const b1 = this.bars[i + 1];
    if (b0 && b1 && t > b0.time && b1.time > b0.time) return this.x(i + (t - b0.time) / (b1.time - b0.time));
    return this.x(i);
  }
  // The cursor's time interpolated between bars (sub-bar precision) — for the freehand brush.
  private interpTime(x: number): number {
    const fi = this.indexAt(x);
    const i = clamp(Math.floor(fi), 0, this.bars.length - 1);
    const b0 = this.bars[i];
    const b1 = this.bars[i + 1];
    if (b1) return b0.time + (b1.time - b0.time) * clamp(fi - i, 0, 1);
    return b0?.time ?? 0;
  }
  clearDrawings() {
    this.drawings = [];
    this.drafting = null;
    this.selected = null;
    this.emitSelection();
    this.changed();
    this.requestDraw();
  }
  deleteSelected() {
    if (this.selected == null) return;
    this.drawings = this.drawings.filter((d) => d.id !== this.selected);
    this.selected = null;
    this.emitSelection();
    this.changed();
    this.requestDraw();
  }
  private changed() {
    this.opts.onDrawingsChange?.();
  }
  // Serialize / restore drawings (the host persists them per symbol).
  getDrawings(): Drawing[] {
    return this.drawings.map((d) => ({ ...d, points: d.points.map((p) => ({ ...p })) }));
  }
  setDrawings(list: Drawing[]) {
    this.drawings = (list ?? []).map((d) => ({ ...d, points: d.points.map((p) => ({ ...p })) }));
    this.nextId = this.drawings.reduce((m, d) => Math.max(m, d.id), 0) + 1;
    this.selected = null;
    this.emitSelection();
    this.requestDraw();
  }
  // Price-scale mode for the price pane: linear, logarithmic, or percent-from-left-edge.
  setScaleMode(m: ScaleMode) {
    this.scaleMode = m;
    this.requestDraw();
  }
  getScaleMode() {
    return this.scaleMode;
  }
  // Compare mode: overlay other symbols' series. Everything renders as % change from the visible
  // window's start (the TradingView convention), so different price levels are comparable. The
  // host fetches the compare bars (via its datafeed) and hands them in here.
  setCompares(list: { symbol: string; color?: string; bars: Bar[] }[]) {
    this.compares = list.map((c, i) => ({ symbol: c.symbol, color: c.color ?? PALETTE[i % PALETTE.length], bars: c.bars.slice().sort((a, b) => a.time - b.time) }));
    this.requestDraw();
  }
  private get comparing() {
    return this.compares.length > 0;
  }
  // Effective bar count — capped at the replay cursor when bar-replay is active, so everything
  // (visible range, autoscale, last-price, crosshair) treats the data as ending there.
  private n() {
    return this.replayTo != null ? Math.min(this.replayTo + 1, this.bars.length) : this.bars.length;
  }
  // ---- bar replay ---------------------------------------------------------
  armReplay() {
    if (!this.bars.length) return;
    this.replayArming = true;
    this.overlay.style.cursor = "pointer";
    this.emitReplay();
  }
  exitReplay() {
    this.replayTo = null;
    this.replayArming = false;
    this.overlay.style.cursor = this.tool === "cross" ? "crosshair" : "copy";
    this.emitReplay();
    this.requestDraw();
  }
  replayForward(): boolean {
    if (this.replayTo == null || this.replayTo >= this.bars.length - 1) return false;
    this.replayTo++;
    this.keepReplayVisible();
    this.emitReplay();
    this.requestDraw();
    return this.replayTo < this.bars.length - 1;
  }
  replayBack() {
    if (this.replayTo == null || this.replayTo <= 1) return;
    this.replayTo--;
    this.emitReplay();
    this.requestDraw();
  }
  private setReplayAt(index: number) {
    this.replayTo = clamp(index, 1, this.bars.length - 1);
    this.replayArming = false;
    this.overlay.style.cursor = this.tool === "cross" ? "crosshair" : "copy";
    this.emitReplay();
    this.requestDraw();
  }
  private keepReplayVisible() {
    if (this.replayTo == null) return;
    const xr = this.x(this.replayTo);
    if (xr > this.plotW() * 0.92 || xr < this.plotW() * 0.15) this.offset = this.plotW() * 0.72 - this.replayTo * this.barSpacing;
  }
  private emitReplay() {
    const off = this.replayTo == null && !this.replayArming;
    this.opts.onReplay?.(off ? null : { active: this.replayTo != null, arming: this.replayArming, index: this.replayTo ?? 0, total: this.bars.length });
  }
  // A compare series' close at (or just before) a given time — forward-filled by binary search.
  private compareCloseAt(bars: Bar[], time: number): number {
    if (!bars.length) return 0;
    let lo = 0,
      hi = bars.length - 1;
    if (time < bars[0].time) return 0;
    while (lo < hi) {
      const m = (lo + hi + 1) >> 1;
      if (bars[m].time <= time) lo = m;
      else hi = m - 1;
    }
    return bars[lo].close;
  }
  fit() {
    this.fitContent();
    this.requestDraw();
  }
  /**
   * Zoom the visible window to [fromTime, newest bar] — what a "1M / 6M / 1Y" range button does.
   *
   * Resolved against the bars' OWN timestamps rather than a bar count: exchanges close for
   * holidays and thin names skip days entirely, so "six months" is never a fixed number of bars.
   * A count-based range would show a different span for a liquid name than an illiquid one.
   */
  showSince(fromTime: number) {
    const pw = this.plotW();
    if (!this.bars.length || pw <= 0) return;
    let first = this.bars.findIndex((b) => b.time >= fromTime);
    if (first < 0) first = 0; // window starts before the history we hold → show all of it
    const count = Math.max(2, this.n() - first);
    this.barSpacing = clamp(pw / count, MIN_BAR_SPACING, MAX_BAR_SPACING);
    this.tBarSpacing = this.barSpacing;
    this.zoomAnchor = null;
    this.momentum = 0;
    this.offset = pw - this.barSpacing * this.rightMarginBars() - (this.n() - 1) * this.barSpacing;
    this.decimals = this.deriveDecimals();
    this.requestDraw();
  }
  getSeriesType() {
    return this.seriesType;
  }
  setVolume(on: boolean) {
    this.showVolume = on;
    this.requestDraw();
  }
  setGrid(on: boolean) {
    this.gridOn = on;
    this.requestDraw();
  }
  setLastPriceLine(on: boolean) {
    this.lastPriceOn = on;
    this.requestDraw();
  }
  setMagnet(on: boolean) {
    this.magnet = on;
    this.requestDraw();
  }
  setPriceLines(lines: PriceLine[]) {
    this.priceLines = lines;
    this.requestDraw();
  }

  setMarkers(markers: ChartMarker[]) {
    this.markers = markers;
    this.requestDraw();
  }
  /**
   * Set (or clear, with null) the forward projection drawn past the newest bar.
   *
   * The host owns invalidation while the projection is on screen, but a new DATA SET always clears
   * it: bars for a different symbol or interval make any existing projection a claim about the
   * wrong series, and silently redrawing it against them would be a chart that lies.
   */
  setProjection(p: Projection | null) {
    this.projection = p && p.mid.length ? p : null;
    this.requestDraw();
  }
  /**
   * Is a projection currently drawable? Off during replay (the future is the thing being hidden),
   * while comparing (the scale is percent-from-left-edge, so an absolute price cone is meaningless),
   * and on the resampled types, whose columns are not time — a Renko brick is a price move, so
   * "the next column" has no forward meaning.
   */
  private projActive(): boolean {
    if (!this.projection || !this.bars.length) return false;
    if (this.replayTo != null || this.replayArming) return false;
    if (this.comparing) return false;
    return this.seriesType !== "renko" && this.seriesType !== "pnf" && this.seriesType !== "kagi";
  }
  /** How many projected columns exist (0 when none is drawable). */
  private projLen(): number {
    return this.projActive() ? this.projection!.mid.length : 0;
  }
  setSR(on: boolean) {
    this.srOn = on;
    this.requestDraw();
  }
  // Auto support/resistance: pivot highs/lows off the REAL bars (genuine swing extremes, never
  // advice), clustered into levels and scored by how many pivots touched each. Cached on the bar set so
  // it recomputes only when data changes, not every frame.
  private supportResistance(): { price: number; kind: "s" | "r" }[] {
    const bars = this.rawBars;
    if (bars.length < 20) return [];
    const key = `${bars.length}:${bars[bars.length - 1].time}`;
    if (this.srCache.key === key) return this.srCache.levels;
    const k = 4; // pivot lookaround
    const piv: number[] = [];
    for (let i = k; i < bars.length - k; i++) {
      let hi = true;
      let lo = true;
      for (let j = i - k; j <= i + k; j++) {
        if (bars[j].high > bars[i].high) hi = false;
        if (bars[j].low < bars[i].low) lo = false;
      }
      if (hi) piv.push(bars[i].high);
      if (lo) piv.push(bars[i].low);
    }
    const last = bars[bars.length - 1].close;
    const tol = Math.max(1e-9, last * 0.005); // merge pivots within 0.5%
    piv.sort((a, b) => a - b);
    const clusters: { sum: number; n: number }[] = [];
    for (const p of piv) {
      const c = clusters[clusters.length - 1];
      if (c && p - c.sum / c.n <= tol) {
        c.sum += p;
        c.n++;
      } else clusters.push({ sum: p, n: 1 });
    }
    const levels = clusters
      .map((c) => ({ price: c.sum / c.n, n: c.n }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 6)
      .map((c) => ({ price: c.price, kind: (c.price >= last ? "r" : "s") as "s" | "r" }));
    this.srCache = { key, levels };
    return levels;
  }
  private drawSR(ctx: CanvasRenderingContext2D, p: Pane) {
    if (!this.srOn || this.scaleMode === "percent") return;
    const levels = this.supportResistance();
    if (!levels.length) return;
    const pw = this.plotW();
    ctx.font = this.theme.monoFont;
    for (const lv of levels) {
      const y = this.priceToY(p, lv.price);
      if (y < p.top + 2 || y > p.top + p.height - 2) continue;
      const c = lv.kind === "r" ? this.theme.down : this.theme.up;
      ctx.strokeStyle = c;
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.moveTo(0, crisp(y));
      ctx.lineTo(pw, crisp(y));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      // small left chip: S / R + price
      const text = `${lv.kind === "r" ? "R" : "S"} ${fmtPrice(lv.price, this.decimals)}`;
      const w = ctx.measureText(text).width + 12;
      ctx.fillStyle = c;
      roundRectPath(ctx, 3, y - 8.5, w, 17, 4);
      ctx.fill();
      ctx.fillStyle = this.onFill(c);
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(text, 9, y + 0.5);
    }
  }
  setAxisAlertHint(on: boolean) {
    this.axisHint = on;
  }
  // ---- premium chrome -----------------------------------------------------
  // The faint identity mark behind the plot (symbol + interval), the way a pro terminal stamps its
  // canvas. Empty string turns it off.
  setWatermark(main: string, sub = "") {
    this.watermark = main;
    this.watermarkSub = sub;
    this.requestDraw();
  }
  // Datafeed in flight → draw a shimmering skeleton instead of a bare "No data" (which would be a
  // lie while bars are still loading).
  setLoading(on: boolean) {
    if (this.loading === on) return;
    this.loading = on;
    this.requestDraw();
  }
  setCountdown(on: boolean) {
    this.countdownOn = on;
    this.requestDraw();
  }
  setSessions(on: boolean) {
    this.sessionsOn = on;
    this.requestDraw();
  }
  /** Point the session shading at a different exchange (see `SessionSpec`). */
  setSession(s: SessionSpec) {
    this.session = s;
    this.deriveSeriesCaches();
    this.requestDraw();
  }
  // Visible-range volume profile: volume-by-price for exactly the bars on screen, drawn against the
  // right edge with its point-of-control and 70% value area. Recomputed as you pan/zoom.
  setVolumeProfileVisible(on: boolean) {
    this.vpvrOn = on;
    this.requestDraw();
  }
  getVolumeProfileVisible() {
    return this.vpvrOn;
  }
  // Drop every manual pane-height override back to the proportional defaults.
  resetPanes() {
    this.paneH = {};
    this.requestDraw();
  }
  // Magnet mode: snap a price (from a cursor y at column x) to the nearest OHLC of that bar, so
  // drawings anchor exactly to a high/low/open/close. Off → the raw price under the cursor.
  private snapPrice(x: number, y: number): number {
    const price = this.panes[0];
    const raw = this.yToPrice(price, y);
    if (!this.magnet || !this.bars.length) return raw;
    const b = this.ohlcSrc()[clamp(Math.round(this.indexAt(x)), 0, this.n() - 1)];
    if (!b) return raw;
    let best = raw;
    let bestDy = Infinity;
    for (const c of [b.open, b.high, b.low, b.close]) {
      const dy = Math.abs(this.priceToY(price, c) - y);
      if (dy < bestDy) { bestDy = dy; best = c; }
    }
    return best;
  }
  // "Auto" — drop the manual right-axis stretch and return to pure autoscale (the tick loop eases it).
  resetPriceScale() {
    this.priceZoom = 1;
    this.requestDraw();
    this.emitViewChange();
  }
  // Scroll the newest bar back to its default parking spot at the right edge (keeps the zoom level).
  scrollToRealtime() {
    const pw = this.plotW();
    this.offset = pw - this.barSpacing * this.rightMarginBars() - (this.n() - 1) * this.barSpacing;
    this.momentum = 0;
    this.requestDraw();
    this.emitViewChange();
  }
  // Keyboard/programmatic zoom — mirrors the wheel zoom (eased via the tick loop), pivoting on the
  // plot centre unless a screen-x is given. dir > 0 zooms IN (wider bars), dir < 0 zooms OUT.
  zoomBy(dir: number, centerX?: number) {
    const x = centerX ?? this.plotW() / 2;
    const base = this.zoomAnchor ? this.tBarSpacing : this.barSpacing;
    this.tBarSpacing = clamp(base * Math.exp(dir * 0.32), MIN_BAR_SPACING, MAX_BAR_SPACING);
    this.zoomAnchor = { x, index: this.indexAt(x) };
    this.momentum = 0;
    this.requestDraw();
    this.emitViewChange();
  }
  // Keyboard/programmatic pan — shift the view by `bars` bar-widths. Positive = toward newer (right).
  panBy(bars: number) {
    this.offset = this.clampOffset(this.offset - bars * this.barSpacing);
    this.zoomAnchor = null;
    this.momentum = 0;
    this.requestDraw();
    this.emitViewChange();
  }
  // Price at a screen-y in the PRICE pane — for a right-click "add alert here" context menu.
  priceAtY(y: number): number {
    return this.yToPrice(this.panes[0], y);
  }
  // Report view state (is the last bar parked at the right? is the price scale on auto?) to the host,
  // but only when `atRealtime` actually flips — so panning doesn't spam the host every frame.
  private emitViewChange() {
    const pw = this.plotW();
    if (pw <= 0 || !this.n()) return;
    const realtimeOffset = pw - this.barSpacing * this.rightMarginBars() - (this.n() - 1) * this.barSpacing;
    const at = Math.abs(this.offset - realtimeOffset) < this.barSpacing * 3;
    const auto = this.priceZoom === 1;
    // Only notify the host when a button state actually FLIPS — otherwise a pan/zoom would re-render
    // the whole React widget on every pointer move / wheel event and visibly stutter the gesture.
    if (at === this.atRealtime && auto === this.lastAutoScale) return;
    this.atRealtime = at;
    this.lastAutoScale = auto;
    this.opts.onViewChange?.({ atRealtime: at, autoScale: auto });
  }

  // Indicators: add/remove by instance. Overlays ride the price pane; studies get a pane.
  setIndicators(list: IndicatorInstance[]) {
    this.indOverlays = [];
    this.indStudies = [];
    list.forEach((ind, i) => {
      const color = ind.color ?? PALETTE[i % PALETTE.length];
      if (ind.pane === "separate" || ind.kind === "RSI" || ind.kind === "MACD") {
        this.indStudies.push({ id: ind.id, kind: ind.kind, inputs: ind.inputs, color, data: {}, legend: () => [] });
      } else {
        this.indOverlays.push({ id: ind.id, kind: ind.kind, inputs: ind.inputs, color, lines: [], legend: () => [] });
      }
    });
    this.mergeSeries();
    this.recompute();
    this.requestDraw();
  }

  // User-authored SCRIPTS. Their values are already computed (on the server, or in WASM), so they
  // are adapted straight onto the same Overlay/Study machinery the built-in indicators use — which
  // means autoscale, pane allocation, clipping, the crosshair legend and pane resizing all apply
  // with no rendering code of their own. `recompute()` leaves them untouched because its dispatch
  // is an if/else over known indicator kinds and "SCRIPT" matches none of them.
  setScripts(list: ScriptRender[]) {
    this.scrOverlays = [];
    this.scrStudies = [];
    for (const s of list) {
      const shown = s.plots.map((p, i) => ({ p, values: s.series[i] })).filter((x) => x.p.display);
      if (!shown.length) continue;
      const lines: PlotLine[] = shown.map(({ p, values }) => ({ values, color: scriptColor(this.theme, p.color), width: p.width }));
      const legend = (i: number) =>
        shown.map(({ p, values }, k) => ({
          label: shown.length === 1 ? s.title : `${s.title} · ${p.title}`,
          value: valAt(values, i),
          color: lines[k].color,
        }));
      if (s.overlay) {
        this.scrOverlays.push({ id: s.id, kind: "SCRIPT", inputs: [], color: lines[0].color, lines, legend });
      } else {
        this.scrStudies.push({
          id: s.id,
          kind: "SCRIPT",
          inputs: [],
          color: lines[0].color,
          data: { lines },
          legend,
        });
      }
    }
    this.mergeSeries();
    this.requestDraw();
  }

  /// Indicators and scripts share the render arrays; keeping their sources separate means
  /// re-seeding one can never drop the other.
  private mergeSeries() {
    this.overlays = [...this.indOverlays, ...this.scrOverlays];
    this.studies = [...this.indStudies, ...this.scrStudies];
  }

  destroy() {
    this.ro?.disconnect();
    if (this.clockTimer) clearInterval(this.clockTimer);
    if (this.raf) cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.resize);
    window.removeEventListener("pointerup", this.onUp);
    window.removeEventListener("pointercancel", this.onUp);
    window.removeEventListener("keydown", this.onKey);
    this.base.remove();
    this.overlay.remove();
  }

  // ---- sizing -------------------------------------------------------------
  private attach() {
    // The crosshair pair (move/leave) is always live: a read-only chart still has to answer "what
    // was the price here", which is the whole point of embedding one. Everything that MUTATES the
    // view — drag-pan, wheel-zoom, double-click, keyboard nav — is what `interactive: false` drops.
    this.overlay.addEventListener("pointermove", this.onMove);
    this.overlay.addEventListener("pointerleave", this.onLeave);
    if (this.interactive) {
      this.overlay.addEventListener("pointerdown", this.onDown);
      window.addEventListener("pointerup", this.onUp);
      window.addEventListener("pointercancel", this.onUp);
      this.overlay.addEventListener("wheel", this.onWheel, { passive: false });
      this.overlay.addEventListener("dblclick", this.onDbl);
      window.addEventListener("keydown", this.onKey);
    }
    // A non-interactive chart must not swallow the page's scroll gesture: with no pan to perform,
    // `touch-action: none` would just make the surrounding list feel dead under the finger.
    if (!this.interactive) this.host.style.touchAction = "";
    if (typeof ResizeObserver !== "undefined") {
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(this.host);
    }
    window.addEventListener("resize", this.resize);
  }
  private resize = () => {
    const r = this.host.getBoundingClientRect();
    this.dpr = window.devicePixelRatio || 1;
    this.w = Math.max(0, Math.floor(r.width));
    this.h = Math.max(0, Math.floor(r.height));
    for (const c of [this.base, this.overlay]) {
      c.width = Math.floor(this.w * this.dpr);
      c.height = Math.floor(this.h * this.dpr);
    }
    this.requestDraw();
  };
  private plotW() {
    return this.w - this.axisW;
  }
  /**
   * Empty columns kept to the right of the newest bar, in bar widths.
   *
   * Was a bare `6` repeated at four call sites that all had to agree. A projection has to fit in
   * this gap, so it widens the margin to hold its columns plus breathing room — otherwise "go to
   * realtime" would park the newest bar at the edge with the forecast off-screen.
   */
  private rightMarginBars(): number {
    return rightMarginBars(this.projLen());
  }
  private plotH() {
    return this.h - this.axisH;
  }

  // ---- scales -------------------------------------------------------------
  private x(i: number) {
    return this.offset + i * this.barSpacing;
  }
  private indexAt(px: number) {
    return (px - this.offset) / this.barSpacing;
  }
  // Source-index range for a series displaced by `shift` bars. Unlike visible(), the COLUMN range is
  // taken unclamped — a leading span belongs in the empty right margin past the newest bar, which is
  // the whole point of a leading study, so source indices up to n-1 must stay in range.
  private shiftedRange(shift: number): [number, number] {
    const n = this.n();
    if (n <= 0) return [0, -1];
    const c0 = Math.floor(this.indexAt(0)) - shift;
    const c1 = Math.ceil(this.indexAt(this.plotW())) - shift;
    return [clamp(c0, 0, n - 1), clamp(c1, 0, n - 1)];
  }
  /**
   * Every finite projection value in a column currently on screen.
   *
   * Returns nothing when no projection is drawable, so autoscale is untouched in the common case
   * (an empty result cannot widen a range).
   */
  private projVisibleValues(): number[] {
    const K = this.projLen();
    if (K === 0) return [];
    const p = this.projection!;
    const n = this.n();
    const [first, last] = projVisibleRange(Math.floor(this.indexAt(0)), Math.ceil(this.indexAt(this.plotW())), n, K);
    const out: number[] = [];
    for (let k = first; k <= last; k++) {
      for (const arr of [p.mid, p.upper, p.lower]) {
        const v = arr?.[k];
        if (v != null && isFinite(v)) out.push(v);
      }
    }
    return out;
  }
  private visible(): [number, number] {
    // Clamp BOTH ends into [0, n-1]: when the series is scrolled fully off-screen (reachable at high
    // zoom where <20 bars fit), an unclamped `first` runs past end-of-data and the out-of-loop
    // this.bars[f] reads (compare base, baseline base) crash the rAF tick and freeze the chart.
    const n = this.n();
    const first = clamp(Math.floor(this.indexAt(0)), 0, n - 1);
    const last = clamp(Math.ceil(this.indexAt(this.plotW())), 0, n - 1);
    return [first, last];
  }
  private fitContent() {
    const pw = this.plotW();
    if (this.bars.length === 0 || pw <= 0) return;
    const target = fitBarCount(pw, this.n());
    this.barSpacing = clamp(pw / target, MIN_BAR_SPACING, MAX_BAR_SPACING);
    this.tBarSpacing = this.barSpacing;
    this.zoomAnchor = null;
    this.momentum = 0;
    const rightMargin = this.barSpacing * this.rightMarginBars();
    this.offset = pw - rightMargin - (this.n() - 1) * this.barSpacing;
    this.decimals = this.deriveDecimals();
  }
  private deriveDecimals() {
    if (!this.bars.length) return 2;
    let mn = Infinity,
      mx = -Infinity;
    for (const b of this.bars) {
      mn = Math.min(mn, b.low);
      mx = Math.max(mx, b.high);
    }
    return priceDecimals(mx - mn);
  }

  // ---- layout + autoscale -------------------------------------------------
  // The price pane's TARGET range for the current visible window (low/high of bars + overlay
  // values, then the manual priceZoom stretch). The tick loop eases dispMin/dispMax toward this.
  private priceTarget(): { min: number; max: number } {
    const [f, l] = this.visible();
    let mn = Infinity,
      mx = -Infinity;
    // compare mode: the scale is % change from the window start, across main + every compare
    if (this.comparing) {
      const add = (v: number) => {
        if (v < mn) mn = v;
        if (v > mx) mx = v;
      };
      const mainBase = this.bars[f].close;
      if (mainBase > 0) for (let i = f; i <= l; i++) add((this.bars[i].close / mainBase - 1) * 100);
      for (const c of this.compares) {
        const base = this.compareCloseAt(c.bars, this.bars[f].time);
        if (base <= 0) continue;
        for (let i = f; i <= l; i++) {
          const cc = this.compareCloseAt(c.bars, this.bars[i].time);
          if (cc > 0) add((cc / base - 1) * 100);
        }
      }
      if (!isFinite(mn) || !isFinite(mx) || mn === mx) {
        mn = -1;
        mx = 1;
      }
      if (this.priceZoom !== 1) {
        const c2 = (mn + mx) / 2;
        const hh = ((mx - mn) / 2) * this.priceZoom;
        mn = c2 - hh;
        mx = c2 + hh;
      }
      return { min: mn, max: mx };
    }
    const src = this.ohlcSrc();
    for (let i = f; i <= l; i++) {
      mn = Math.min(mn, src[i].low);
      mx = Math.max(mx, src[i].high);
    }
    for (const o of this.overlays)
      for (const ln of o.lines)
        for (let i = f; i <= l; i++) {
          const v = ln.values[i];
          if (!isNaN(v)) {
            mn = Math.min(mn, v);
            mx = Math.max(mx, v);
          }
        }
    // Displaced series (Ichimoku's cloud + spans + chikou) are DRAWN, so they must also be SCALED —
    // scanned over exactly the source indices their renderer will visit, or the cloud would float
    // outside the pane. Same helper both sides, so the two can never disagree.
    for (const o of this.overlays) {
      const scan = (vals: number[], shift: number) => {
        const [a, b] = this.shiftedRange(shift);
        for (let i = a; i <= b; i++) {
          const v = vals[i];
          if (!isNaN(v)) {
            mn = Math.min(mn, v);
            mx = Math.max(mx, v);
          }
        }
      };
      for (const fl of o.fills ?? []) {
        if (!fl.shift) continue; // un-shifted bands hug lines already scanned above
        scan(fl.a, fl.shift);
        scan(fl.b, fl.shift);
      }
      for (const sl of o.shiftLines ?? []) scan(sl.values, sl.shift);
    }
    // The projection lives past the newest bar, so `visible()` (clamped to n-1) never sees it. Scan
    // exactly the columns the renderer will paint — the same discipline the shifted studies above
    // follow — or the cone silently draws outside the price scale.
    for (const v of this.projVisibleValues()) {
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
    if (!isFinite(mn) || !isFinite(mx)) {
      mn = 0;
      mx = 1;
    }
    if (this.priceZoom !== 1) {
      const c2 = (mn + mx) / 2;
      const hh = ((mx - mn) / 2) * this.priceZoom;
      mn = c2 - hh;
      mx = c2 + hh;
    }
    return { min: mn, max: mx };
  }
  private layout() {
    const pw = this.plotW();
    const ph = this.plotH();
    const [f, l] = this.visible();
    const panes: Pane[] = [];
    // Keep price at ≥40% but never let the volume + study panes push the total past the plot (which
    // would overflow the time axis) — shrink them proportionally into the budget above the floor.
    // A pane the user has dragged carries an explicit height (paneH), which still respects the budget.
    let studyH = this.studies.map((s) => this.paneH[s.id] ?? clamp(ph * 0.24, 70, 150));
    let volH = this.showVolume ? (this.paneH.volume ?? clamp(ph * 0.16, 40, 110)) : 0;
    const extra = volH + studyH.reduce((a, b) => a + b, 0);
    const budget = ph * 0.72;
    if (extra > budget && extra > 0) {
      const k = budget / extra;
      volH = Math.round(volH * k);
      studyH = studyH.map((hh) => Math.round(hh * k));
    }
    const priceH = ph - volH - studyH.reduce((a, b) => a + b, 0);
    let y = 0;
    // price pane — the RENDERED range is the eased dispMin/dispMax (snapped on first paint), so
    // the y-axis GLIDES toward the visible target instead of jumping (see the tick loop).
    if (isNaN(this.dispMin)) {
      const t = this.priceTarget();
      this.dispMin = t.min;
      this.dispMax = t.max;
    }
    panes.push({ kind: "price", key: "price", top: y, height: priceH, min: this.dispMin, max: this.dispMax, base: this.bars[f]?.close });
    y += priceH;
    // volume pane
    if (this.showVolume) {
      let vmax = 0;
      for (let i = f; i <= l; i++) vmax = Math.max(vmax, this.bars[i].volume ?? 0);
      panes.push({ kind: "volume", key: "volume", top: y, height: volH, min: 0, max: vmax || 1 });
      y += volH;
    }
    // study panes
    this.studies.forEach((s, k) => {
      let smn = Infinity,
        smx = -Infinity;
      if (s.kind === "RSI" || s.kind === "STOCH") {
        smn = 0;
        smx = 100;
      } else if (s.kind === "ATR" && s.data.atr) {
        for (let i = f; i <= l; i++) {
          const v = s.data.atr[i];
          if (!isNaN(v)) {
            smn = Math.min(smn, v);
            smx = Math.max(smx, v);
          }
        }
        smn = Math.min(smn, 0);
      } else if (s.kind === "MACD" && s.data.macd) {
        for (let i = f; i <= l; i++) {
          for (const v of [s.data.macd.line[i], s.data.macd.signal[i], s.data.macd.hist[i]]) {
            if (!isNaN(v)) {
              smn = Math.min(smn, v);
              smx = Math.max(smx, v);
            }
          }
        }
        const a = Math.max(Math.abs(smn), Math.abs(smx)) || 1;
        smn = -a;
        smx = a;
      } else if (s.data.line || s.data.lines) {
        if (s.data.srange) {
          smn = s.data.srange[0];
          smx = s.data.srange[1];
        } else {
          const series = s.data.lines ? s.data.lines.map((ln) => ln.values) : [s.data.line!];
          for (const vals of series)
            for (let i = f; i <= l; i++) {
              const v = vals[i];
              if (!isNaN(v)) {
                smn = Math.min(smn, v);
                smx = Math.max(smx, v);
              }
            }
          if (s.data.symmetric) {
            const a = Math.max(Math.abs(smn), Math.abs(smx)) || 1;
            smn = -a;
            smx = a;
          }
        }
      }
      if (!isFinite(smn)) {
        smn = 0;
        smx = 1;
      }
      panes.push({ kind: "study", key: s.id, top: y, height: studyH[k], min: smn, max: smx, study: s });
      y += studyH[k];
    });
    this.panes = panes;
    return { pw, ph };
  }
  private logOn(p: Pane) {
    return this.scaleMode === "log" && p.kind === "price" && p.min > 0;
  }
  private priceToY(p: Pane, price: number) {
    const m = p.kind === "price" ? 0.08 : 0.12;
    const top = p.top + p.height * m;
    const bot = p.top + p.height * (1 - m);
    let t: number;
    if (this.logOn(p)) {
      const lmin = Math.log(p.min);
      t = (Math.log(Math.max(price, 1e-9)) - lmin) / (Math.log(p.max) - lmin || 1);
    } else {
      t = (price - p.min) / (p.max - p.min || 1);
    }
    return bot - t * (bot - top);
  }
  private yToPrice(p: Pane, y: number) {
    const m = p.kind === "price" ? 0.08 : 0.12;
    const top = p.top + p.height * m;
    const bot = p.top + p.height * (1 - m);
    const t = (bot - y) / (bot - top || 1);
    if (this.logOn(p)) {
      const lmin = Math.log(p.min);
      return Math.exp(lmin + t * (Math.log(p.max) - lmin));
    }
    return p.min + t * (p.max - p.min);
  }
  private paneAt(y: number): Pane {
    for (const p of this.panes) if (y >= p.top && y <= p.top + p.height) return p;
    return this.panes[0];
  }
  // Index of the pane whose TOP edge the cursor is on (a draggable separator), or null. Never the
  // first pane — the plot's own top edge isn't a separator.
  private hitSeparator(x: number, y: number): number | null {
    if (x > this.plotW()) return null;
    for (let i = 1; i < this.panes.length; i++) if (Math.abs(y - this.panes[i].top) <= 4) return i;
    return null;
  }

  // Heikin-Ashi: a smoothed candle where each bar's body is derived from the previous HA bar.
  // Display-only (the crosshair legend still reads the REAL OHLC); recomputed with the data.
  private computeHA() {
    const n = this.bars.length;
    const ha: Bar[] = new Array(n);
    for (let i = 0; i < n; i++) {
      const b = this.bars[i];
      const close = (b.open + b.high + b.low + b.close) / 4;
      const open = i === 0 ? (b.open + b.close) / 2 : (ha[i - 1].open + ha[i - 1].close) / 2;
      ha[i] = { time: b.time, open, high: Math.max(b.high, open, close), low: Math.min(b.low, open, close), close, volume: b.volume };
    }
    this.haBars = ha;
  }
  // The OHLC source for the current series type (Heikin-Ashi swaps in the transformed bars).
  private ohlcSrc(): Bar[] {
    return this.seriesType === "heikin" && this.haBars.length === this.bars.length ? this.haBars : this.bars;
  }

  // ---- indicators ---------------------------------------------------------
  // Everything that is a pure function of the display series, computed ONCE per data change.
  private deriveSeriesCaches() {
    this.spacingSec = medianSpacingSec(this.rawBars);
    const vols = this.bars.map((b) => b.volume ?? 0);
    this.volMa = this.bars.length >= 4 ? sma(vols, Math.min(20, Math.max(2, Math.floor(this.bars.length / 3)))) : [];
    // Anything outside the configured exchange session is extended hours. Read in UTC when the host
    // says its bar times are exchange wall-clock stamped as UTC — otherwise the shading would be
    // computed in the READER's timezone and move from one viewer to the next.
    const s = this.session;
    const days = s.days ?? [1, 2, 3, 4, 5];
    this.extHours = this.intraday
      ? this.bars.map((b) => {
          const d = new Date(b.time * 1000);
          const mins = s.utc ? d.getUTCHours() * 60 + d.getUTCMinutes() : d.getHours() * 60 + d.getMinutes();
          const day = s.utc ? d.getUTCDay() : d.getDay();
          return !days.includes(day) || mins < s.openMin || mins >= s.closeMin;
        })
      : [];
  }
  private recompute() {
    this.computeHA();
    this.deriveSeriesCaches();
    const closes = this.bars.map((b) => b.close);
    for (const o of this.overlays) {
      if (o.kind === "MA") {
        const p = o.inputs[0] ?? 50;
        const v = sma(closes, p);
        o.lines = [{ values: v, color: o.color, width: 1.4 }];
        o.legend = (i) => [{ label: `MA${p}`, value: valAt(v, i), color: o.color }];
      } else if (o.kind === "EMA") {
        const p = o.inputs[0] ?? 21;
        const v = ema(closes, p);
        o.lines = [{ values: v, color: o.color, width: 1.4 }];
        o.legend = (i) => [{ label: `EMA${p}`, value: valAt(v, i), color: o.color }];
      } else if (o.kind === "VWAP") {
        const v = vwap(this.bars);
        o.lines = [{ values: v, color: o.color, width: 1.4 }];
        o.legend = (i) => [{ label: "VWAP", value: valAt(v, i), color: o.color }];
      } else if (o.kind === "WMA") {
        const p = o.inputs[0] ?? 30;
        const v = wma(closes, p);
        o.lines = [{ values: v, color: o.color, width: 1.4 }];
        o.legend = (i) => [{ label: `WMA${p}`, value: valAt(v, i), color: o.color }];
      } else if (o.kind === "DEMA") {
        const p = o.inputs[0] ?? 21;
        const v = dema(closes, p);
        o.lines = [{ values: v, color: o.color, width: 1.4 }];
        o.legend = (i) => [{ label: `DEMA${p}`, value: valAt(v, i), color: o.color }];
      } else if (o.kind === "TEMA") {
        const p = o.inputs[0] ?? 21;
        const v = tema(closes, p);
        o.lines = [{ values: v, color: o.color, width: 1.4 }];
        o.legend = (i) => [{ label: `TEMA${p}`, value: valAt(v, i), color: o.color }];
      } else if (o.kind === "HMA") {
        const p = o.inputs[0] ?? 21;
        const v = hma(closes, p);
        o.lines = [{ values: v, color: o.color, width: 1.4 }];
        o.legend = (i) => [{ label: `HMA${p}`, value: valAt(v, i), color: o.color }];
      } else if (o.kind === "DONCH") {
        const p = o.inputs[0] ?? 20;
        const d = donchian(this.bars, p);
        o.lines = [
          { values: d.up, color: o.color, width: 1 },
          { values: d.mid, color: o.color, width: 1, dash: [3, 3] },
          { values: d.lo, color: o.color, width: 1 },
        ];
        o.fills = [{ a: d.up, b: d.lo, upColor: o.color, downColor: o.color, opacity: 0.06 }];
        o.legend = (i) => [{ label: `Donchian${p}`, value: valAt(d.mid, i), color: o.color }];
      } else if (o.kind === "BOLL") {
        const p = o.inputs[0] ?? 20;
        const b = bollinger(closes, p, o.inputs[1] ?? 2);
        o.lines = [
          { values: b.up, color: o.color, width: 1 },
          { values: b.mid, color: o.color, width: 1, dash: [3, 3] },
          { values: b.lo, color: o.color, width: 1 },
        ];
        o.fills = [{ a: b.up, b: b.lo, upColor: o.color, downColor: o.color, opacity: 0.07 }];
        o.legend = (i) => [{ label: `BB${p}`, value: valAt(b.mid, i), color: o.color }];
      } else if (o.kind === "KELT") {
        const p = o.inputs[0] ?? 20;
        const k = keltner(this.bars, p, o.inputs[1] ?? 2, o.inputs[2] ?? 10);
        o.lines = [
          { values: k.up, color: o.color, width: 1 },
          { values: k.mid, color: o.color, width: 1.2, dash: [3, 3] },
          { values: k.lo, color: o.color, width: 1 },
        ];
        o.fills = [{ a: k.up, b: k.lo, upColor: o.color, downColor: o.color, opacity: 0.07 }];
        o.legend = (i) => [{ label: `Keltner${p}`, value: valAt(k.mid, i), color: o.color }];
      } else if (o.kind === "ICHI") {
        // Ichimoku: the cloud is the spans displaced FORWARD (leading), the lagging span the close
        // displaced BACKWARD — so both are plotted off their own bar index, not the current one.
        const [cp, bp, sp] = [o.inputs[0] ?? 9, o.inputs[1] ?? 26, o.inputs[2] ?? 52];
        const ic = ichimoku(this.bars, cp, bp, sp);
        o.lines = [
          { values: ic.conversion, color: this.theme.up, width: 1.2 },
          { values: ic.baseLine, color: this.theme.down, width: 1.2 },
        ];
        o.fills = [{ a: ic.spanA, b: ic.spanB, upColor: this.theme.up, downColor: this.theme.down, shift: ic.shift, opacity: 0.13 }];
        o.shiftLines = [
          { values: ic.spanA, color: this.theme.up, width: 1, shift: ic.shift },
          { values: ic.spanB, color: this.theme.down, width: 1, shift: ic.shift },
          { values: ic.lagging, color: o.color, width: 1, shift: -ic.shift, dash: [4, 3] },
        ];
        o.legend = (i) => [
          { label: "Ichimoku", value: valAt(ic.conversion, i), color: o.color },
          { label: "base", value: valAt(ic.baseLine, i), color: this.theme.down },
        ];
      } else if (o.kind === "SUPER") {
        const p = o.inputs[0] ?? 10;
        const m = o.inputs[1] ?? 3;
        const st = supertrend(this.bars, p, m);
        o.lines = [{ values: st.line, color: o.color, width: 0 }]; // width 0 = autoscale-only, drawn by `dir`
        o.dir = { values: st.line, dirs: st.dir, up: this.theme.up, down: this.theme.down, mode: "line" };
        o.legend = (i) => [{ label: `Supertrend ${p}·${m}`, value: valAt(st.line, i), color: st.dir[i] === -1 ? this.theme.down : this.theme.up }];
      } else if (o.kind === "PSAR") {
        const s = psar(this.bars, o.inputs[0] ? o.inputs[0] / 100 : 0.02, o.inputs[1] ? o.inputs[1] / 100 : 0.2);
        o.lines = [{ values: s.line, color: o.color, width: 0 }];
        o.dir = { values: s.line, dirs: s.dir, up: this.theme.up, down: this.theme.down, mode: "dots" };
        o.legend = (i) => [{ label: "PSAR", value: valAt(s.line, i), color: s.dir[i] === -1 ? this.theme.down : this.theme.up }];
      } else if (o.kind === "VWMA") {
        const p = o.inputs[0] ?? 20;
        const v = vwma(this.bars, p);
        o.lines = [{ values: v, color: o.color, width: 1.4 }];
        o.legend = (i) => [{ label: `VWMA${p}`, value: valAt(v, i), color: o.color }];
      } else if (o.kind === "PIVOT") {
        if (this.intraday) {
          const pv = pivotPoints(this.bars);
          o.lines = [
            { values: pv.pp, color: o.color, width: 1.3, dash: [5, 3] },
            { values: pv.r1, color: this.theme.down, width: 1, dash: [3, 3] },
            { values: pv.r2, color: alpha(this.theme.down, 0.65), width: 1, dash: [3, 3] },
            { values: pv.s1, color: this.theme.up, width: 1, dash: [3, 3] },
            { values: pv.s2, color: alpha(this.theme.up, 0.65), width: 1, dash: [3, 3] },
          ];
          o.legend = (i) => [{ label: `Pivot ${isNaN(pv.pp[i]) ? "\u2014" : fmtPrice(pv.pp[i], this.decimals)}`, value: pv.pp[i], color: o.color }];
        } else {
          o.lines = [];
          o.legend = () => [{ label: "Pivot (intraday only)", value: NaN, color: o.color }];
        }
      }
    }
    for (const s of this.studies) {
      if (s.kind === "RSI") {
        const p = s.inputs[0] ?? 14;
        s.data = { rsi: rsi(closes, p) };
        s.legend = (i) => [{ label: `RSI${p}`, value: valAt(s.data.rsi!, i), color: s.color }];
      } else if (s.kind === "MACD") {
        const m = macd(closes, s.inputs[0] ?? 12, s.inputs[1] ?? 26, s.inputs[2] ?? 9);
        s.data = { macd: m };
        s.legend = (i) => [
          { label: "MACD", value: valAt(m.line, i), color: s.color },
          { label: "signal", value: valAt(m.signal, i), color: SIGNAL_COLOR },
        ];
      } else if (s.kind === "STOCH") {
        const st = stochastic(this.bars, s.inputs[0] ?? 14, s.inputs[1] ?? 3);
        s.data = { stoch: st };
        s.legend = (i) => [
          { label: "%K", value: valAt(st.k, i), color: s.color },
          { label: "%D", value: valAt(st.d, i), color: SIGNAL_COLOR },
        ];
      } else if (s.kind === "ATR") {
        const p = s.inputs[0] ?? 14;
        const v = atr(this.bars, p);
        s.data = { atr: v };
        s.legend = (i) => [{ label: `ATR${p}`, value: valAt(v, i), color: s.color }];
      } else if (s.kind === "CCI") {
        const p = s.inputs[0] ?? 20;
        const v = cci(this.bars, p);
        s.data = { line: v, levels: [-100, 0, 100], symmetric: true };
        s.legend = (i) => [{ label: `CCI${p}`, value: valAt(v, i), color: s.color }];
      } else if (s.kind === "WILLR") {
        const p = s.inputs[0] ?? 14;
        const v = williamsR(this.bars, p);
        s.data = { line: v, levels: [-20, -80], srange: [-100, 0] };
        s.legend = (i) => [{ label: `%R${p}`, value: valAt(v, i), color: s.color }];
      } else if (s.kind === "OBV") {
        const v = obv(this.bars);
        s.data = { line: v };
        s.legend = (i) => [{ label: "OBV", value: valAt(v, i), color: s.color }];
      } else if (s.kind === "ROC") {
        const p = s.inputs[0] ?? 12;
        const v = roc(closes, p);
        s.data = { line: v, levels: [0], symmetric: true };
        s.legend = (i) => [{ label: `ROC${p}`, value: valAt(v, i), color: s.color }];
      } else if (s.kind === "MFI") {
        const p = s.inputs[0] ?? 14;
        const v = mfi(this.bars, p);
        s.data = { line: v, levels: [20, 80], srange: [0, 100] };
        s.legend = (i) => [{ label: `MFI${p}`, value: valAt(v, i), color: s.color }];
      } else if (s.kind === "ADX") {
        // ADX is trend STRENGTH; ±DI carry the direction, so they wear the up/down colours and ADX
        // itself stays neutral in the indicator's own colour. 25 is the conventional trend threshold.
        const p = s.inputs[0] ?? 14;
        const a = adx(this.bars, p);
        // Autoscaled, not pinned: ADX and ±DI are 0–100 series that usually live in 10–40, and a
        // strong leg can push ADX to the top of the range — a fixed window would either waste the
        // pane or let the line run out of it.
        s.data = {
          lines: [
            { values: a.plusDI, color: this.theme.up, width: 1.2 },
            { values: a.minusDI, color: this.theme.down, width: 1.2 },
            { values: a.adx, color: s.color, width: 1.6 },
          ],
          levels: [25],
        };
        s.legend = (i) => [
          { label: `ADX${p}`, value: valAt(a.adx, i), color: s.color },
          { label: "+DI", value: valAt(a.plusDI, i), color: this.theme.up },
          { label: "−DI", value: valAt(a.minusDI, i), color: this.theme.down },
        ];
      } else if (s.kind === "CMF") {
        const p = s.inputs[0] ?? 20;
        const v = cmf(this.bars, p);
        s.data = { line: v, levels: [0], symmetric: true };
        s.legend = (i) => [{ label: `CMF${p}`, value: valAt(v, i), color: s.color }];
      } else if (s.kind === "AROON") {
        const p = s.inputs[0] ?? 25;
        const a = aroon(this.bars, p);
        s.data = {
          lines: [
            { values: a.up, color: this.theme.up, width: 1.2 },
            { values: a.down, color: this.theme.down, width: 1.2 },
          ],
          levels: [50],
          srange: [0, 100],
        };
        s.legend = (i) => [
          { label: "Aroon Up", value: valAt(a.up, i), color: this.theme.up },
          { label: "Aroon Dn", value: valAt(a.down, i), color: this.theme.down },
        ];
      } else if (s.kind === "STOCHRSI") {
        const [rsiP, stochP, dP] = [s.inputs[0] ?? 14, s.inputs[1] ?? 14, s.inputs[2] ?? 3];
        const sr = stochRsi(this.bars, rsiP, stochP, 3, dP);
        s.data = {
          lines: [
            { values: sr.k, color: s.color, width: 1.3 },
            { values: sr.d, color: SIGNAL_COLOR, width: 1.3 },
          ],
          levels: [20, 80],
          srange: [0, 100],
        };
        s.legend = (i) => [
          { label: "StochRSI K", value: valAt(sr.k, i), color: s.color },
          { label: "D", value: valAt(sr.d, i), color: SIGNAL_COLOR },
        ];
      } else if (s.kind === "MOM") {
        const p = s.inputs[0] ?? 10;
        const v = momentum(closes, p);
        s.data = { line: v, levels: [0], symmetric: true };
        s.legend = (i) => [{ label: `Mom${p}`, value: valAt(v, i), color: s.color }];
      } else if (s.kind === "TRIX") {
        const p = s.inputs[0] ?? 14;
        const sigP = s.inputs[1] ?? 9;
        const tx = trix(closes, p);
        const sig = tx.signal(sigP);
        s.data = {
          lines: [
            { values: tx.line, color: s.color, width: 1.4 },
            { values: sig, color: SIGNAL_COLOR, width: 1, dash: [4, 3] },
          ],
          levels: [0],
          symmetric: true,
        };
        s.legend = (i) => [
          { label: `TRIX${p}`, value: valAt(tx.line, i), color: s.color },
          { label: "sig", value: valAt(sig, i), color: SIGNAL_COLOR },
        ];
      }
    }
  }

  // ---- draw ---------------------------------------------------------------
  private requestDraw() {
    if (!this.raf) this.raf = requestAnimationFrame(this.tick);
  }
  // The single animation driver: advance eased zoom, pan momentum, and the gliding price scale,
  // draw, and reschedule only while something is still moving (idle → no frames). This is what
  // gives the chart its smooth, premium feel.
  private tick = () => {
    this.raf = 0;
    let busy = false;
    // The loading skeleton breathes — but ONLY while it is the thing on screen. A symbol switch sets
    // loading while the previous symbol's bars are still drawn; animating then would repaint the whole
    // chart every frame for the length of the fetch (forever, if a datafeed promise never settles).
    if (this.loading && !this.bars.length) {
      this.shimmer += 0.07;
      busy = true;
    }
    // eased zoom — barSpacing glides to its target while the point under the cursor stays put
    if (this.zoomAnchor) {
      const ds = this.tBarSpacing - this.barSpacing;
      if (Math.abs(ds) > 0.03) {
        this.barSpacing += ds * 0.35;
        busy = true;
      } else {
        this.barSpacing = this.tBarSpacing;
      }
      this.offset = this.zoomAnchor.x - this.zoomAnchor.index * this.barSpacing;
      if (!busy) this.zoomAnchor = null;
    }
    // flick-to-scroll momentum, decaying with friction
    if (this.momentum && !this.dragging) {
      this.offset = this.clampOffset(this.offset + this.momentum);
      this.momentum *= 0.9;
      if (Math.abs(this.momentum) < 0.15) this.momentum = 0;
      else busy = true;
    }
    // the gliding price scale — dispMin/dispMax ease toward the current visible target
    if (this.bars.length) {
      const t = this.priceTarget();
      if (isNaN(this.dispMin)) {
        this.dispMin = t.min;
        this.dispMax = t.max;
      } else {
        const dn = t.min - this.dispMin;
        const dx = t.max - this.dispMax;
        const span = this.dispMax - this.dispMin || 1;
        if (Math.abs(dn) > span * 0.001 || Math.abs(dx) > span * 0.001) {
          this.dispMin += dn * 0.22;
          this.dispMax += dx * 0.22;
          busy = true;
        } else {
          this.dispMin = t.min;
          this.dispMax = t.max;
        }
      }
    }
    this.draw();
    this.drawOverlay();
    if (busy) this.raf = requestAnimationFrame(this.tick);
  };
  private setup(ctx: CanvasRenderingContext2D) {
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
  }
  private draw() {
    const ctx = this.bctx;
    this.setup(ctx);
    const t = this.theme;
    ctx.fillStyle = t.background;
    ctx.fillRect(0, 0, this.w, this.h);
    if (!this.bars.length) {
      if (this.loading) this.drawSkeleton(ctx);
      else this.drawEmpty(ctx);
      return;
    }
    const { pw } = this.layout();
    const [f, l] = this.visible();
    // the identity mark sits behind everything, so no data ever hides under it
    this.drawWatermark(ctx);
    // intraday extended-hours shading, under the grid
    this.drawSessions(ctx, f, l, pw);
    // price-pane grid + right axis
    for (const p of this.panes) this.drawGridAndAxis(ctx, p, pw);
    if (this.axisH > 0) this.drawTimeAxis(ctx, f, l, pw);
    // the hovered bar's column, tinted across every pane — a modern chart tracks the cursor
    this.drawHoverColumn(ctx, pw);
    // series on price pane — compare mode renders % lines; otherwise the chosen series + overlays
    const price = this.panes[0];
    if (this.comparing) {
      this.drawComparePane(ctx, price, f, l);
    } else {
      // Everything plotted in price units is clipped to the price pane. Displaced or slow-to-converge
      // series (an Ichimoku cloud, a Keltner rail) can legitimately sit outside the autoscaled range
      // for a frame or two while the scale eases — without this they would paint over the volume and
      // study panes below.
      this.clipPane(ctx, price, () => {
        // band fills go UNDER the candles (Ichimoku's cloud, Bollinger/Keltner envelopes)
        for (const o of this.overlays) for (const fl of o.fills ?? []) this.drawBandFill(ctx, price, fl);
        this.drawSeries(ctx, price, f, l);
        for (const o of this.overlays) {
          for (const ln of o.lines) if (ln.width > 0) this.drawLine(ctx, price, ln, f, l);
          for (const sl of o.shiftLines ?? []) this.drawShiftedLine(ctx, price, sl);
          if (o.dir) this.drawDirSeries(ctx, price, o.dir, f, l);
        }
        // Inside the price-pane clip, like everything else plotted in price units.
        this.drawProjection(ctx, price);
      });
    }
    // volume + studies
    for (const p of this.panes) {
      if (p.kind === "volume") this.drawVolume(ctx, p, f, l);
      if (p.kind === "study" && p.study) this.drawStudy(ctx, p, f, l);
    }
    // last-price line + drawings are in PRICE units, so they don't apply in % compare mode
    if (!this.comparing) {
      if (this.vpvrOn) this.drawVpvr(ctx, price, f, l);
      this.axisSlots = [];
      this.chipSlots = [];
      this.lastPriceY = null;
      const paintLastPriceTag = this.lastPriceOn ? this.drawLastPrice(ctx, price) : null;
      this.drawSR(ctx, price);
      this.drawPriceLines(ctx, price);
      this.drawMarkers(ctx, price);
      this.drawOverlayAxisTags(ctx, price);
      // Last, and therefore on top. The live price outranks every level on the axis.
      paintLastPriceTag?.();
      this.drawDrawings(ctx);
    }
    // pane separators (with a grip on hover/drag — they're draggable) + frame
    for (let i = 1; i < this.panes.length; i++) {
      const p = this.panes[i];
      const hot = this.paneHover === i || this.paneDrag?.key === p.key;
      ctx.strokeStyle = hot ? t.line : t.border;
      ctx.lineWidth = hot ? 1.6 : 1;
      ctx.beginPath();
      ctx.moveTo(0, crisp(p.top));
      ctx.lineTo(pw, crisp(p.top));
      ctx.stroke();
      if (hot) {
        // three dots at the centre — the universal "drag me" affordance
        ctx.fillStyle = t.line;
        for (const dx of [-7, 0, 7]) {
          ctx.beginPath();
          ctx.arc(pw / 2 + dx, p.top, 1.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.strokeStyle = t.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(crisp(pw), 0);
    ctx.lineTo(crisp(pw), this.plotH());
    ctx.moveTo(0, crisp(this.plotH()));
    ctx.lineTo(this.w, crisp(this.plotH()));
    ctx.stroke();
  }

  // The empty + loading states. A chart with no bars yet should look deliberate, not broken: while
  // the feed is in flight we shimmer a skeleton of the shape that's coming; only once it settles with
  // nothing do we say so plainly.
  private drawEmpty(ctx: CanvasRenderingContext2D) {
    const t = this.theme;
    const cx = this.plotW() / 2;
    const cy = this.plotH() / 2;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = alpha(t.text, 0.5);
    ctx.font = t.font;
    ctx.fillText("No data for this symbol / interval", cx, cy + 2);
  }
  private drawSkeleton(ctx: CanvasRenderingContext2D) {
    const t = this.theme;
    const pw = this.plotW();
    const ph = this.plotH();
    const n = Math.max(8, Math.floor(pw / 14));
    const phase = this.shimmer;
    for (let i = 0; i < n; i++) {
      // a deterministic pseudo-random skyline (never a claim about data — it's visibly a placeholder)
      const s = Math.sin(i * 12.9898) * 43758.5453;
      const r = s - Math.floor(s);
      const s2 = Math.sin(i * 78.233) * 12345.6789;
      const r2 = s2 - Math.floor(s2);
      const bh = ph * (0.12 + r * 0.34);
      const top = ph * 0.22 + r2 * (ph * 0.34);
      const wave = 0.5 + 0.5 * Math.sin(phase + i * 0.22);
      ctx.fillStyle = alpha(t.text, 0.05 + wave * 0.07);
      const x = 10 + i * 14;
      ctx.fillRect(x, top, 8, bh);
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = alpha(t.text, 0.75);
    ctx.font = t.font;
    ctx.fillText("Loading bars…", pw / 2, ph / 2);
  }

  // Faint symbol + interval stamped behind the plot — the mark a pro terminal leaves on its canvas.
  private drawWatermark(ctx: CanvasRenderingContext2D) {
    if (!this.watermark) return;
    const pw = this.plotW();
    const p = this.panes[0];
    if (!p) return;
    const cx = pw / 2;
    const cy = p.top + p.height / 2;
    const size = clamp(pw * 0.16, 26, 84);
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = alpha(this.theme.textStrong, 0.055);
    ctx.font = `700 ${Math.round(size)}px ${this.theme.font.replace(/^[\d.]+px\s*/, "")}`;
    ctx.fillText(this.watermark, cx, cy - size * 0.28);
    if (this.watermarkSub) {
      ctx.fillStyle = alpha(this.theme.textStrong, 0.04);
      ctx.font = `600 ${Math.round(size * 0.34)}px ${this.theme.font.replace(/^[\d.]+px\s*/, "")}`;
      ctx.fillText(this.watermarkSub, cx, cy + size * 0.34);
    }
    ctx.restore();
  }

  // Extended-hours shading on intraday charts: US regular trading is 09:30–16:00 local to the bar's
  // own timestamps, so anything outside that is tinted. Purely a reading aid over the REAL bars —
  // nothing is filtered or synthesized. Off for daily+ data, where every bar is a whole session.
  private drawSessions(ctx: CanvasRenderingContext2D, f: number, l: number, pw: number) {
    if (!this.sessionsOn || !this.intraday || this.comparing || !this.extHours.length) return;
    const ph = this.plotH();
    const half = this.barSpacing / 2;
    ctx.fillStyle = alpha(this.theme.text, 0.055);
    let runStart = -1;
    const flush = (endI: number) => {
      if (runStart < 0) return;
      const x0 = this.x(runStart) - half;
      const x1 = this.x(endI) + half;
      ctx.fillRect(Math.max(0, x0), 0, Math.min(pw, x1) - Math.max(0, x0), ph);
      runStart = -1;
    };
    for (let i = f; i <= l; i++) {
      if (this.extHours[i]) {
        if (runStart < 0) runStart = i;
      } else flush(i - 1);
    }
    flush(l);
  }

  // Run `body` with drawing clipped to one pane's rectangle (plot width only, so right-axis tags are
  // never clipped away — they are drawn outside this helper).
  private clipPane(ctx: CanvasRenderingContext2D, p: Pane, body: () => void) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, p.top, this.plotW(), p.height);
    ctx.clip();
    body();
    ctx.restore();
  }

  // A soft column behind the hovered bar, spanning every pane — makes the crosshair feel attached to
  // a bar rather than floating over pixels.
  private drawHoverColumn(ctx: CanvasRenderingContext2D, pw: number) {
    if (!this.cross || this.dragging) return;
    // Don't tint a bar the cursor is not on: past the last bar this clamped back to n-1 and lit up
    // the newest candle while the pointer sat over the projection.
    const rawCol = Math.round(this.indexAt(this.cross.x));
    if (rawCol > this.n() - 1) return;
    const i = clamp(rawCol, 0, this.n() - 1);
    const x = this.x(i);
    const w = Math.max(2, this.barSpacing * 0.92);
    if (x + w / 2 < 0 || x - w / 2 > pw) return;
    ctx.fillStyle = alpha(this.theme.text, 0.07);
    ctx.fillRect(Math.round(x - w / 2), 0, Math.round(w), this.plotH());
  }

  private drawGridAndAxis(ctx: CanvasRenderingContext2D, p: Pane, pw: number) {
    const t = this.theme;
    ctx.font = t.monoFont;
    ctx.textBaseline = "middle";
    const ticks = p.kind === "volume" ? [p.max] : niceTicks(p.min, p.max, Math.max(2, Math.floor(p.height / 44)));
    for (const tick of ticks) {
      const y = p.kind === "volume" ? this.priceToY(p, tick) : this.priceToY(p, tick);
      if (y < p.top - 1 || y > p.top + p.height + 1) continue;
      if (this.gridOn) {
        ctx.strokeStyle = t.grid;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, crisp(y));
        ctx.lineTo(pw, crisp(y));
        ctx.stroke();
      }
      if (this.axisW === 0) continue; // bare plot: grid only, no label gutter to write into
      ctx.fillStyle = t.text;
      ctx.textAlign = "left";
      const label =
        p.kind === "volume"
          ? fmtVolume(tick)
          : p.kind === "study"
            ? tick.toFixed(p.study?.kind === "RSI" ? 0 : 2)
            : this.comparing && p.kind === "price"
              ? `${tick.toFixed(2)}%`
              : this.scaleMode === "percent" && p.base
                ? `${((tick / p.base - 1) * 100).toFixed(2)}%`
                : fmtPrice(tick, this.decimals);
      ctx.fillText(label, pw + 6, y);
    }
    if (p.study?.kind === "RSI" || p.study?.kind === "STOCH") {
      for (const lvl of p.study.kind === "RSI" ? [30, 70] : [20, 80]) {
        const y = this.priceToY(p, lvl);
        ctx.strokeStyle = t.border;
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.moveTo(0, crisp(y));
        ctx.lineTo(pw, crisp(y));
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }

  private drawTimeAxis(ctx: CanvasRenderingContext2D, f: number, l: number, pw: number) {
    const t = this.theme;
    ctx.font = t.monoFont;
    ctx.fillStyle = t.text;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const y = this.plotH() + BOTTOM_AXIS_H / 2;
    let lastLabelX = -Infinity;
    for (let i = f; i <= l; i++) {
      const boundary = isTimeBoundary(this.bars[i - 1], this.bars[i], this.intraday, this.utc);
      const px = this.x(i);
      if (px < 0 || px > pw) continue;
      // Gridlines mark section breaks only, but labels also land BETWEEN them — an intraday chart
      // zoomed inside one day would otherwise carry a single label, or none at all.
      if (boundary && this.gridOn) {
        ctx.strokeStyle = t.grid;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(crisp(px), 0);
        ctx.lineTo(crisp(px), this.plotH());
        ctx.stroke();
      }
      if (px - lastLabelX > 54) {
        // The date that opens a section reads stronger than the times within it.
        ctx.fillStyle = boundary ? t.textStrong : t.text;
        ctx.fillText(fmtAxisTime(this.bars[i].time, this.intraday, boundary, this.utc), px, y);
        lastLabelX = px;
      }
    }
  }

  private drawSeries(ctx: CanvasRenderingContext2D, p: Pane, f: number, l: number) {
    const t = this.theme;
    if (this.seriesType === "line" || this.seriesType === "area" || this.seriesType === "step") {
      const step = this.seriesType === "step";
      const trace = () => {
        let prevY = 0;
        for (let i = f; i <= l; i++) {
          const px = this.x(i);
          const py = this.priceToY(p, this.bars[i].close);
          if (i === f) ctx.moveTo(px, py);
          else if (step) {
            ctx.lineTo(px, prevY);
            ctx.lineTo(px, py);
          } else ctx.lineTo(px, py);
          prevY = py;
        }
      };
      if (this.seriesType === "area") {
        ctx.beginPath();
        trace();
        ctx.lineTo(this.x(l), p.top + p.height);
        ctx.lineTo(this.x(f), p.top + p.height);
        ctx.closePath();
        const grad = ctx.createLinearGradient(0, p.top, 0, p.top + p.height);
        grad.addColorStop(0, alpha(t.line, 0.3));
        grad.addColorStop(0.6, alpha(t.line, 0.09));
        grad.addColorStop(1, alpha(t.line, 0));
        ctx.fillStyle = grad;
        ctx.fill();
      }
      // a soft glow under the stroke, then the crisp line — the modern "lit" series look
      ctx.beginPath();
      trace();
      ctx.strokeStyle = alpha(t.line, 0.22);
      ctx.lineWidth = 5;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.stroke();
      ctx.beginPath();
      trace();
      ctx.strokeStyle = t.line;
      ctx.lineWidth = 1.7;
      ctx.stroke();
      ctx.lineCap = "butt";
      return;
    }
    if (this.seriesType === "baseline") {
      this.drawBaseline(ctx, p, f, l);
      return;
    }
    if (this.seriesType === "renko") {
      this.drawRenko(ctx, p, f, l);
      return;
    }
    // pnf/kagi with EMPTY meta (the degenerate single-bar/flat fallback where bars=rawBars) fall
    // through to the candle path below, so the raw bar is drawn plainly instead of a blank pane.
    if (this.seriesType === "pnf" && this.pnfCols.length) {
      this.drawPnf(ctx, p, f, l);
      return;
    }
    if (this.seriesType === "kagi" && this.kagiSegs.length) {
      this.drawKagi(ctx, p, f, l);
      return;
    }
    const bw = Math.max(1, Math.min(this.barSpacing * 0.7, this.barSpacing - 1));
    const half = bw / 2;
    const src = this.ohlcSrc();
    for (let i = f; i <= l; i++) {
      const b = src[i];
      const px = this.x(i);
      const up = b.close >= b.open;
      const col = up ? t.up : t.down;
      const yo = this.priceToY(p, b.open);
      const yc = this.priceToY(p, b.close);
      const yh = this.priceToY(p, b.high);
      const yl = this.priceToY(p, b.low);
      if (this.seriesType === "bars") {
        ctx.strokeStyle = col;
        ctx.lineWidth = Math.max(1, bw * 0.32);
        ctx.beginPath();
        ctx.moveTo(crisp(px), yh);
        ctx.lineTo(crisp(px), yl);
        ctx.moveTo(px, yo);
        ctx.lineTo(px - half, yo);
        ctx.moveTo(px, yc);
        ctx.lineTo(px + half, yc);
        ctx.stroke();
        continue;
      }
      // candles / hollow — wick first, then the body
      ctx.strokeStyle = up ? t.upWick : t.downWick;
      ctx.lineWidth = bw >= 5 ? 1.2 : 1;
      ctx.beginPath();
      ctx.moveTo(crisp(px), yh);
      ctx.lineTo(crisp(px), yl);
      ctx.stroke();
      const top = Math.min(yo, yc);
      const bh = Math.max(1, Math.abs(yc - yo));
      if (this.seriesType === "hollow") {
        if (up) {
          ctx.strokeStyle = col;
          ctx.lineWidth = 1.2;
          ctx.strokeRect(crisp(px - half), Math.round(top) + 0.5, Math.round(bw), Math.round(bh));
        } else {
          ctx.fillStyle = col;
          ctx.fillRect(Math.round(px - half), Math.round(top), Math.round(bw), Math.round(bh));
        }
      } else {
        // A body is a subtle vertical gradient (lighter at the open-side edge) with a slightly
        // stronger rim — the depth cue that separates a premium candle from a flat rectangle. Only
        // at readable widths; hairline candles stay flat fills so they never smear.
        const x0 = Math.round(px - half);
        const w0 = Math.max(1, Math.round(bw));
        const h0 = Math.round(bh);
        if (bw >= 4 && bh >= 2) {
          const g = ctx.createLinearGradient(x0, 0, x0 + w0, 0);
          g.addColorStop(0, mix(col, t.textStrong, 0.14));
          g.addColorStop(0.55, col);
          g.addColorStop(1, mix(col, t.background, 0.18));
          ctx.fillStyle = g;
          ctx.fillRect(x0, Math.round(top), w0, h0);
          ctx.strokeStyle = alpha(col, 0.95);
          ctx.lineWidth = 1;
          ctx.strokeRect(x0 + 0.5, Math.round(top) + 0.5, w0 - 1, Math.max(1, h0 - 1));
        } else {
          ctx.fillStyle = col;
          ctx.fillRect(x0, Math.round(top), w0, h0);
        }
      }
    }
  }

  // Renko: solid up/down bricks, near-full column width so they read as a masonry staircase. Each
  // brick's body already spans exactly one box (open→close), so a plain filled rect is the brick.
  private drawRenko(ctx: CanvasRenderingContext2D, p: Pane, f: number, l: number) {
    const t = this.theme;
    const bw = Math.max(2, this.barSpacing - 1);
    const half = bw / 2;
    for (let i = f; i <= l; i++) {
      const b = this.bars[i];
      const up = b.close >= b.open;
      const y0 = this.priceToY(p, b.open);
      const y1 = this.priceToY(p, b.close);
      const top = Math.min(y0, y1);
      const h = Math.max(1, Math.abs(y1 - y0));
      const x = Math.round(this.x(i) - half);
      ctx.fillStyle = up ? t.up : t.down;
      ctx.fillRect(x, Math.round(top), Math.max(1, Math.round(bw) - 1), Math.round(h));
    }
  }

  // Point & Figure: each column is a stack of X's (rising) or O's (falling), one glyph per box level.
  // The column meta lives in `pnfCols` (parallel to `bars`); box levels map back to price via boxEff.
  private drawPnf(ctx: CanvasRenderingContext2D, p: Pane, f: number, l: number) {
    const t = this.theme;
    const box = this.boxEff;
    const bw = Math.max(4, Math.min(this.barSpacing * 0.8, this.barSpacing - 1));
    const inset = bw / 2;
    ctx.lineCap = "round";
    for (let i = f; i <= l; i++) {
      const c = this.pnfCols[i];
      if (!c) continue;
      const px = this.x(i);
      const col = c.dir === 1 ? t.up : t.down;
      ctx.strokeStyle = col;
      ctx.lineWidth = Math.max(1.2, bw * 0.13);
      for (let j = c.lo; j <= c.hi; j++) {
        const yTop = this.priceToY(p, (j + 1) * box);
        const yBot = this.priceToY(p, j * box);
        const ch = yBot - yTop;
        if (ch < 2.5) continue;
        const pad = Math.min(inset, ch / 2) * 0.8;
        const cy = (yTop + yBot) / 2;
        ctx.beginPath();
        if (c.dir === 1) {
          ctx.moveTo(px - pad, cy - pad);
          ctx.lineTo(px + pad, cy + pad);
          ctx.moveTo(px + pad, cy - pad);
          ctx.lineTo(px - pad, cy + pad);
        } else {
          ctx.ellipse(px, cy, pad, Math.min(pad, (ch - 3) / 2), 0, 0, Math.PI * 2);
        }
        ctx.stroke();
      }
    }
    ctx.lineCap = "butt";
  }

  // Kagi: stroke each precomputed segment (vertical runs + horizontal shoulder connectors), thick in
  // the up-colour for "yang", thin in the down-colour for "yin". Segments carry column indices so the
  // line pans/zooms with the rest of the chart.
  private drawKagi(ctx: CanvasRenderingContext2D, p: Pane, f: number, l: number) {
    const t = this.theme;
    for (const s of this.kagiSegs) {
      const cMin = Math.min(s.c0, s.c1);
      const cMax = Math.max(s.c0, s.c1);
      if (cMax < f - 1 || cMin > l + 1) continue;
      const x0 = this.x(s.c0);
      const x1 = this.x(s.c1);
      const y0 = this.priceToY(p, s.p0);
      const y1 = this.priceToY(p, s.p1);
      ctx.strokeStyle = s.yang ? t.up : t.down;
      ctx.lineWidth = s.yang ? 2.4 : 1.1;
      ctx.lineCap = "square";
      ctx.beginPath();
      if (Math.abs(x0 - x1) < 0.5) {
        const xx = crisp(x0);
        ctx.moveTo(xx, y0);
        ctx.lineTo(xx, y1);
      } else {
        const yy = crisp(y0);
        ctx.moveTo(x0, yy);
        ctx.lineTo(x1, yy);
      }
      ctx.stroke();
    }
    ctx.lineCap = "butt";
  }

  // Baseline series: the close line + area, two-toned (up-color above the baseline, down-color
  // below), split by clipping at the baseline row — the TradingView "baseline" look.
  private drawBaseline(ctx: CanvasRenderingContext2D, p: Pane, f: number, l: number) {
    const t = this.theme;
    const baseVal = p.base ?? this.bars[f].close;
    const baseY = this.priceToY(p, baseVal);
    const path = () => {
      ctx.beginPath();
      for (let i = f; i <= l; i++) {
        const px = this.x(i);
        const py = this.priceToY(p, this.bars[i].close);
        i === f ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
    };
    const x0 = this.x(f);
    const x1 = this.x(l);
    // gradient area fills, clipped above / below the baseline row
    const fill = (top: number, bottom: number, c: string, a0: number, a1: number) => {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, top, this.plotW(), bottom - top);
      ctx.clip();
      path();
      ctx.lineTo(x1, baseY);
      ctx.lineTo(x0, baseY);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, top, 0, bottom);
      g.addColorStop(0, alpha(c, a0));
      g.addColorStop(1, alpha(c, a1));
      ctx.fillStyle = g;
      ctx.fill();
      ctx.restore();
    };
    fill(p.top, baseY, t.up, 0.24, 0.02);
    fill(baseY, p.top + p.height, t.down, 0.02, 0.24);
    // two-tone stroke: clip each half and stroke the line in its colour
    const strokeHalf = (top: number, bottom: number, c: string) => {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, top, this.plotW(), bottom - top);
      ctx.clip();
      path();
      ctx.strokeStyle = c;
      ctx.lineWidth = 1.6;
      ctx.lineJoin = "round";
      ctx.stroke();
      ctx.restore();
    };
    strokeHalf(p.top, baseY, t.up);
    strokeHalf(baseY, p.top + p.height, t.down);
    // the dashed baseline reference
    ctx.strokeStyle = t.border;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(0, crisp(baseY));
    ctx.lineTo(this.plotW(), crisp(baseY));
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Compare mode: every symbol as a % line from the window start, on a shared % scale.
  private drawComparePane(ctx: CanvasRenderingContext2D, p: Pane, f: number, l: number) {
    const zero = this.priceToY(p, 0);
    ctx.strokeStyle = this.theme.border;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(0, crisp(zero));
    ctx.lineTo(this.plotW(), crisp(zero));
    ctx.stroke();
    ctx.setLineDash([]);
    const pctLine = (valAt: (i: number) => number, base: number, color: string, width: number) => {
      if (base <= 0) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineJoin = "round";
      ctx.beginPath();
      let started = false;
      for (let i = f; i <= l; i++) {
        const v = valAt(i);
        if (!(v > 0)) {
          started = false;
          continue;
        }
        const y = this.priceToY(p, (v / base - 1) * 100);
        const x = this.x(i);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };
    pctLine((i) => this.bars[i].close, this.bars[f].close, this.theme.textStrong, 1.9);
    for (const c of this.compares) pctLine((i) => this.compareCloseAt(c.bars, this.bars[i].time), this.compareCloseAt(c.bars, this.bars[f].time), c.color, 1.7);
  }

  private drawLine(ctx: CanvasRenderingContext2D, p: Pane, ln: PlotLine, f: number, l: number) {
    ctx.strokeStyle = ln.color;
    ctx.lineWidth = ln.width;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    if (ln.dash) ctx.setLineDash(ln.dash);
    ctx.beginPath();
    let started = false;
    for (let i = f; i <= l; i++) {
      const v = ln.values[i];
      if (isNaN(v)) {
        started = false;
        continue;
      }
      const px = this.x(i);
      const py = this.priceToY(p, v);
      if (!started) {
        ctx.moveTo(px, py);
        started = true;
      } else ctx.lineTo(px, py);
    }
    ctx.stroke();
    if (ln.dash) ctx.setLineDash([]);
    ctx.lineCap = "butt";
  }

  // A line displaced along the time axis by `shift` bars — Ichimoku's leading spans (+26) and lagging
  // span (−26). Indices are allowed to run past the last bar: x() is pure arithmetic, so the cloud
  // legitimately projects into the empty space to the right of the newest bar.
  private drawShiftedLine(ctx: CanvasRenderingContext2D, p: Pane, ln: { values: number[]; color: string; width: number; shift: number; dash?: number[] }) {
    const [from, to] = this.shiftedRange(ln.shift);
    ctx.strokeStyle = ln.color;
    ctx.lineWidth = ln.width;
    ctx.lineJoin = "round";
    if (ln.dash) ctx.setLineDash(ln.dash);
    ctx.beginPath();
    let started = false;
    for (let i = from; i <= to; i++) {
      const v = ln.values[i];
      if (isNaN(v)) {
        started = false;
        continue;
      }
      const px = this.x(i + ln.shift);
      const py = this.priceToY(p, v);
      if (!started) {
        ctx.moveTo(px, py);
        started = true;
      } else ctx.lineTo(px, py);
    }
    ctx.stroke();
    if (ln.dash) ctx.setLineDash([]);
  }

  // Fill the region between two series, coloured by which one is on top (an Ichimoku kumo flips from
  // bullish to bearish exactly where the spans cross). Walks contiguous runs so a NaN gap breaks the
  // polygon instead of stitching across it.
  /**
   * The forward projection: a dashed centre line and a fading band, drawn in the empty margin past
   * the newest bar.
   *
   * Deliberately NOT candle-shaped and deliberately not up/down coloured — direction colours mean a
   * realized move on this chart, and nothing here is realized. It uses `theme.line` (the accent),
   * fades with distance so the far end reads as less certain than the near end, and is joined to
   * the last real close so the reader can see exactly where fact stops.
   */
  private drawProjection(ctx: CanvasRenderingContext2D, p: Pane) {
    const K = this.projLen();
    if (K === 0) return;
    const proj = this.projection!;
    const t = this.theme;
    const n = this.n();
    const lastClose = this.bars[n - 1]?.close;
    const X = (k: number) => this.x(n + k);
    const Y = (v: number) => this.priceToY(p, v);

    // Band first, under the line.
    if (proj.upper && proj.lower) {
      ctx.beginPath();
      let started = false;
      for (let k = 0; k < K; k++) {
        const v = proj.upper[k];
        if (v == null || !isFinite(v)) continue;
        if (!started && lastClose != null) ctx.moveTo(this.x(n - 1), Y(lastClose)), (started = true);
        ctx.lineTo(X(k), Y(v));
      }
      for (let k = K - 1; k >= 0; k--) {
        const v = proj.lower[k];
        if (v == null || !isFinite(v)) continue;
        ctx.lineTo(X(k), Y(v));
      }
      if (lastClose != null) ctx.lineTo(this.x(n - 1), Y(lastClose));
      ctx.closePath();
      ctx.fillStyle = alpha(t.line, 0.1);
      ctx.fill();
    }

    // Centre line, dashed, anchored to the last real close.
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = alpha(t.line, 0.85);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (lastClose != null) ctx.moveTo(this.x(n - 1), Y(lastClose));
    for (let k = 0; k < K; k++) {
      const v = proj.mid[k];
      if (v == null || !isFinite(v)) continue;
      ctx.lineTo(X(k), Y(v));
    }
    ctx.stroke();
    ctx.restore();

    // A hairline at the boundary: everything right of it is a claim, not a record.
    if (lastClose != null) {
      ctx.save();
      ctx.setLineDash([2, 3]);
      ctx.strokeStyle = alpha(t.text, 0.45);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(crisp(this.x(n - 1)), 0);
      ctx.lineTo(crisp(this.x(n - 1)), this.plotH());
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawBandFill(ctx: CanvasRenderingContext2D, p: Pane, fill: BandFill) {
    const shift = fill.shift ?? 0;
    const [from, to] = this.shiftedRange(shift);
    const op = fill.opacity ?? 0.12;
    let run: number[] = [];
    const flush = () => {
      if (run.length < 2) {
        run = [];
        return;
      }
      // one polygon per contiguous run, split further wherever the pair crosses
      let segStart = run[0];
      let segUp = fill.a[run[0]] >= fill.b[run[0]];
      const emit = (s: number, e: number, up: boolean) => {
        if (e <= s) return;
        ctx.beginPath();
        for (let i = s; i <= e; i++) ctx.lineTo(this.x(i + shift), this.priceToY(p, fill.a[i]));
        for (let i = e; i >= s; i--) ctx.lineTo(this.x(i + shift), this.priceToY(p, fill.b[i]));
        ctx.closePath();
        ctx.fillStyle = alpha(up ? fill.upColor : fill.downColor, op);
        ctx.fill();
      };
      for (const i of run) {
        const up = fill.a[i] >= fill.b[i];
        if (up !== segUp) {
          emit(segStart, i, segUp);
          segStart = i - 1 >= segStart ? i - 1 : i;
          segUp = up;
        }
      }
      emit(segStart, run[run.length - 1], segUp);
      run = [];
    };
    for (let i = from; i <= to; i++) {
      if (isNaN(fill.a[i]) || isNaN(fill.b[i])) flush();
      else run.push(i);
    }
    flush();
  }

  // A per-bar directional series: Supertrend as a colour-flipping stair (with a soft glow so the
  // active side reads at a glance), PSAR as dots above/below price.
  private drawDirSeries(ctx: CanvasRenderingContext2D, p: Pane, s: DirSeries, f: number, l: number) {
    if (s.mode === "dots") {
      const r = clamp(this.barSpacing * 0.13, 1, 2.6);
      for (let i = f; i <= l; i++) {
        const v = s.values[i];
        if (isNaN(v)) continue;
        ctx.fillStyle = s.dirs[i] === -1 ? s.down : s.up;
        ctx.beginPath();
        ctx.arc(this.x(i), this.priceToY(p, v), r, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    // two passes: a wide translucent glow, then the crisp line on top
    for (const pass of [0, 1]) {
      let started = false;
      let curDir = 0;
      ctx.beginPath();
      const stroke = (d: number) => {
        if (!started) return;
        const c = d === -1 ? s.down : s.up;
        ctx.strokeStyle = pass === 0 ? alpha(c, 0.22) : c;
        ctx.lineWidth = pass === 0 ? 6 : 1.9;
        ctx.stroke();
      };
      for (let i = f; i <= l; i++) {
        const v = s.values[i];
        if (isNaN(v)) {
          stroke(curDir);
          ctx.beginPath();
          started = false;
          continue;
        }
        const d = s.dirs[i];
        if (started && d !== curDir) {
          stroke(curDir);
          ctx.beginPath();
          started = false;
        }
        const px = this.x(i);
        const py = this.priceToY(p, v);
        if (!started) {
          ctx.moveTo(px, py);
          started = true;
          curDir = d;
        } else ctx.lineTo(px, py);
      }
      stroke(curDir);
    }
    ctx.lineCap = "butt";
  }

  // Visible-range volume profile: volume-by-price for exactly the bars on screen, drawn as a
  // right-anchored histogram with the point of control and the 70% value area called out. Cached on
  // the visible window so panning recomputes only when the window actually changes.
  private drawVpvr(ctx: CanvasRenderingContext2D, p: Pane, f: number, l: number) {
    const key = `${f}:${l}:${this.bars.length}:${this.bars[l]?.time ?? 0}`;
    if (this.vpvrCache.key !== key) {
      const slice = this.bars.slice(f, l + 1);
      this.vpvrCache = { key, vp: volumeProfile(slice, clamp(Math.round(p.height / 9), 12, 48)) };
    }
    const vp = this.vpvrCache.vp;
    if (!vp) return;
    const pw = this.plotW();
    const maxW = clamp(pw * 0.22, 60, 190);
    let peak = 0;
    for (const b of vp.bins) peak = Math.max(peak, b);
    if (peak <= 0) return;
    const t = this.theme;
    ctx.save();
    for (let i = 0; i < vp.bins.length; i++) {
      const yTop = this.priceToY(p, vp.lo + (i + 1) * vp.binH);
      const yBot = this.priceToY(p, vp.lo + i * vp.binH);
      const h = Math.max(1, yBot - yTop - 1);
      const w = (vp.bins[i] / peak) * maxW;
      if (w < 0.5) continue;
      const inVa = i >= vp.vaLo && i <= vp.vaHi;
      ctx.fillStyle = i === vp.poc ? alpha(t.line, 0.5) : inVa ? alpha(t.textStrong, 0.2) : alpha(t.text, 0.14);
      ctx.fillRect(pw - w, Math.round(yTop), w, h);
    }
    // POC line + label
    const pocPrice = vp.lo + (vp.poc + 0.5) * vp.binH;
    const py = this.priceToY(p, pocPrice);
    if (py > p.top && py < p.top + p.height) {
      ctx.strokeStyle = alpha(t.line, 0.85);
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(pw - maxW, crisp(py));
      ctx.lineTo(pw, crisp(py));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = t.monoFont;
      ctx.textAlign = "right";
      ctx.textBaseline = "bottom";
      ctx.fillStyle = t.line;
      ctx.fillText(`POC ${fmtPrice(pocPrice, this.decimals)}`, pw - 4, py - 2);
    }
    ctx.restore();
  }

  private drawVolume(ctx: CanvasRenderingContext2D, p: Pane, f: number, l: number) {
    const t = this.theme;
    const bw = Math.max(1, this.barSpacing * 0.7);
    const base = p.top + p.height;
    // one gradient per direction, reused across bars: bright at the top of the column, fading into
    // the pane floor, so the volume row reads as depth rather than a solid block
    const grad = (c: string) => {
      const g = ctx.createLinearGradient(0, p.top, 0, base);
      g.addColorStop(0, alpha(c, 0.95));
      g.addColorStop(1, alpha(c, 0.28));
      return g;
    };
    const gUp = grad(t.volumeUp);
    const gDown = grad(t.volumeDown);
    for (let i = f; i <= l; i++) {
      const b = this.bars[i];
      const v = b.volume ?? 0;
      const y = this.priceToY(p, v);
      ctx.fillStyle = b.close >= b.open ? gUp : gDown;
      ctx.fillRect(Math.round(this.x(i) - bw / 2), Math.round(y), Math.round(bw), Math.max(1, base - y));
    }
    // The volume moving average across the pane — the "is this bar unusual?" reference line. Its
    // window reaches back before the visible range, so it can exceed the visible max: clipped.
    if (this.volMa.length) this.clipPane(ctx, p, () => this.drawLine(ctx, p, { values: this.volMa, color: alpha(t.textStrong, 0.55), width: 1.1 }, f, l));
  }

  // A study's own pane is its whole world: clip to it, so a line that runs past the pane's scale
  // (an ADX pinned at 100, an MACD spike easing into range) can never scribble over the pane above.
  // The title chip is drawn after, unclipped, so it always reads.
  private drawStudy(ctx: CanvasRenderingContext2D, p: Pane, f: number, l: number) {
    this.clipPane(ctx, p, () => this.drawStudyBody(ctx, p, f, l));
    this.drawStudyTitle(ctx, p, p.study!);
  }
  private drawStudyBody(ctx: CanvasRenderingContext2D, p: Pane, f: number, l: number) {
    const s = p.study!;
    if (s.kind === "RSI" && s.data.rsi) {
      this.drawLine(ctx, p, { values: s.data.rsi, color: s.color, width: 1.4 }, f, l);
    } else if (s.kind === "STOCH" && s.data.stoch) {
      this.drawLine(ctx, p, { values: s.data.stoch.k, color: s.color, width: 1.3 }, f, l);
      this.drawLine(ctx, p, { values: s.data.stoch.d, color: SIGNAL_COLOR, width: 1.3 }, f, l);
    } else if (s.kind === "ATR" && s.data.atr) {
      this.drawLine(ctx, p, { values: s.data.atr, color: s.color, width: 1.4 }, f, l);
    } else if (s.kind === "MACD" && s.data.macd) {
      const m = s.data.macd;
      const zero = this.priceToY(p, 0);
      const bw = Math.max(1, this.barSpacing * 0.6);
      for (let i = f; i <= l; i++) {
        const hv = m.hist[i];
        if (isNaN(hv)) continue;
        const y = this.priceToY(p, hv);
        ctx.fillStyle = hv >= 0 ? this.theme.up : this.theme.down;
        ctx.globalAlpha = 0.55;
        ctx.fillRect(Math.round(this.x(i) - bw / 2), Math.round(Math.min(y, zero)), Math.round(bw), Math.max(1, Math.abs(y - zero)));
        ctx.globalAlpha = 1;
      }
      this.drawLine(ctx, p, { values: m.line, color: s.color, width: 1.3 }, f, l);
      this.drawLine(ctx, p, { values: m.signal, color: SIGNAL_COLOR, width: 1.3 }, f, l);
    } else if (s.data.line || s.data.lines) {
      // generic study: dashed reference levels, then one or more lines
      if (s.data.levels) {
        ctx.strokeStyle = this.theme.border;
        ctx.setLineDash([2, 3]);
        for (const lv of s.data.levels) {
          const y = this.priceToY(p, lv);
          if (y < p.top || y > p.top + p.height) continue;
          ctx.beginPath();
          ctx.moveTo(0, crisp(y));
          ctx.lineTo(this.plotW(), crisp(y));
          ctx.stroke();
        }
        ctx.setLineDash([]);
      }
      if (s.data.lines) for (const ln of s.data.lines) this.drawLine(ctx, p, ln, f, l);
      else this.drawLine(ctx, p, { values: s.data.line!, color: s.color, width: 1.4 }, f, l);
    }
  }

  // A small title chip in each study pane's top-left — so a stack of oscillators is self-labelling
  // instead of a row of anonymous squiggles.
  private drawStudyTitle(ctx: CanvasRenderingContext2D, p: Pane, s: Study) {
    const label = s.legend(this.n() - 1)[0]?.label ?? s.kind;
    ctx.save();
    ctx.font = this.theme.monoFont;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const w = ctx.measureText(label).width + 16;
    ctx.fillStyle = alpha(this.theme.paneBackground, 0.85);
    roundRectPath(ctx, 6, p.top + 5, w, 15, 4);
    ctx.fill();
    ctx.fillStyle = s.color;
    ctx.beginPath();
    ctx.arc(13, p.top + 12.5, 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = this.theme.textStrong;
    ctx.fillText(label, 19, p.top + 13);
    ctx.restore();
  }

  // Delegates to the pure `placeAxisTag` in util.ts, which is unit-tested — the collision rules are
  // the whole fix, so they live somewhere they can be asserted rather than only looked at.
  private reserveAxisSlot(y: number, h: number, anchor?: number): number {
    return placeAxisTag(y, h, this.axisSlots, anchor);
  }

  private drawLastPrice(ctx: CanvasRenderingContext2D, p: Pane): (() => void) | null {
    const b = this.bars[this.n() - 1];
    // Renko/P&F/Kagi bars end on a box edge, not the market — draw the real last close so the tag is
    // honest, and colour it by the REAL last move (not the synthetic brick's direction), so an honest
    // price never wears a wrong-direction colour.
    const resampled = this.seriesType === "renko" || this.seriesType === "pnf" || this.seriesType === "kagi";
    const useReal = resampled && this.replayTo == null && this.rawBars.length > 0;
    const price = useReal ? this.rawBars[this.rawBars.length - 1].close : b.close;
    const y = this.priceToY(p, price);
    if (y < p.top || y > p.top + p.height) return null;
    const up = useReal
      ? this.rawBars.length < 2 || this.rawBars[this.rawBars.length - 1].close >= this.rawBars[this.rawBars.length - 2].close
      : b.close >= b.open;
    const col = up ? this.theme.up : this.theme.down;
    // a faint wash toward the axis so the live level reads even at a glance across a busy plot
    const pw = this.plotW();
    const g = ctx.createLinearGradient(pw - 120, 0, pw, 0);
    g.addColorStop(0, alpha(col, 0));
    g.addColorStop(1, alpha(col, 0.13));
    ctx.fillStyle = g;
    ctx.fillRect(pw - 120, y - 7, 120, 14);
    ctx.strokeStyle = col;
    ctx.setLineDash([2, 2]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, crisp(y));
    ctx.lineTo(pw, crisp(y));
    ctx.stroke();
    ctx.setLineDash([]);
    // The tag is RETURNED, not drawn: the caller paints it after the levels so the live price is
    // never buried by a target that happens to sit a few ticks away. Its slot is reserved here, so
    // the levels already know to step around it.
    const sub = this.barCloseIn();
    this.lastPriceY = y;
    this.reserveAxisSlot(y, sub ? 30 : 19);
    return () => this.axisTag(ctx, y, fmtPrice(price, this.decimals), col, this.onFill(col), sub);
  }
  // Time remaining in the forming bar, derived from the REAL median bar spacing and the newest bar's
  // own timestamp — never a guess about market hours. Only meaningful intraday and at the live edge;
  // returns undefined (no sub-label) otherwise, and while replaying history.
  private barCloseIn(): string | undefined {
    if (!this.countdownOn || !this.intraday || this.replayTo != null || !this.rawBars.length) return undefined;
    const step = this.spacingSec;
    if (!(step > 0) || step >= 86000) return undefined;
    const last = this.rawBars[this.rawBars.length - 1].time;
    const left = last + step - Math.floor(Date.now() / 1000);
    // a stale feed (bar older than a full interval) has nothing honest to count down to
    if (left <= 0 || left > step) return undefined;
    return fmtCountdown(left);
  }
  // Readable ink for text sitting ON a filled colour chip. Luminance-based, so it stays legible on
  // every theme's up/down colours (and on a host's design-token greens/reds) instead of assuming black.
  private onFill(bg: string): string {
    const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(bg.trim());
    if (!m) return this.theme.background;
    const h = m[1].length === 3 ? m[1][0] + m[1][0] + m[1][1] + m[1][1] + m[1][2] + m[1][2] : m[1];
    const r = parseInt(h.slice(0, 2), 16) / 255;
    const gg = parseInt(h.slice(2, 4), 16) / 255;
    const b = parseInt(h.slice(4, 6), 16) / 255;
    const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    const lum = 0.2126 * lin(r) + 0.7152 * lin(gg) + 0.0722 * lin(b);
    return lum > 0.42 ? "rgb(11,11,13)" : "rgb(255,255,255)";
  }

  // Small right-axis price tags for each visible overlay indicator (MA, VWAP, BOLL mid, …).
  // Uses the same slot-collision avoidance as price-line and last-price tags, so they never bury one
  // another or the live price pill.
  private drawOverlayAxisTags(ctx: CanvasRenderingContext2D, p: Pane) {
    if (this.comparing || this.scaleMode === "percent") return;
    const n = this.n();
    if (!n) return;
    const lastI = clamp(Math.ceil(this.indexAt(this.plotW())), 0, n - 1);
    for (const o of this.overlays) {
      if (o.dir) continue; // PSAR/Supertrend use directional rendering — no single representative value
      // For multi-line overlays take the first non-zero-width line (e.g. the BOLL/Keltner midline)
      const ln = o.lines.find((l) => l.width > 0);
      if (!ln) continue;
      const v = ln.values[lastI];
      if (isNaN(v)) continue;
      const y = this.priceToY(p, v);
      if (y < p.top + 2 || y > p.top + p.height - 2) continue;
      const ty = this.reserveAxisSlot(y, 19, this.lastPriceY ?? undefined);
      this.axisTag(ctx, ty, fmtPrice(v, this.decimals), o.color, this.onFill(o.color));
    }
  }

  // Host-supplied horizontal price lines (alerts/orders): a dashed line across the plot, a left chip
  // ("label · price ✕") and a right-axis price tag, all in the line's colour. ✕ hit rects are cached
  // for onDown. Percent mode is skipped (the lines are absolute prices, not % of the window start).
  private drawPriceLines(ctx: CanvasRenderingContext2D, p: Pane) {
    this.priceLineHits = [];
    if (!this.priceLines.length || this.scaleMode === "percent") return;
    ctx.font = this.theme.monoFont;
    const pw = this.plotW();
    // TOP-DOWN, so the chip column can never invert.
    //
    // Slots are handed out in iteration order, so drawing in host order produced a column
    // whose vertical sequence did not match the prices — a stop above a target above an
    // entry, in whatever order they happened to be pushed. A reader takes a stacked column
    // as ordered; an unordered one is worse than an overlapping one, because it is
    // confidently wrong about which level sits where.
    const ordered = [...this.priceLines].sort((a, b) => b.price - a.price);
    for (const pl of ordered) {
      const y = this.priceToY(p, pl.price);
      if (y < p.top + 2 || y > p.top + p.height - 2) continue;
      ctx.strokeStyle = pl.color;
      ctx.lineWidth = 1;
      ctx.setLineDash(pl.dashed === false ? [] : [5, 3]);
      ctx.beginPath();
      ctx.moveTo(0, crisp(y));
      ctx.lineTo(pw, crisp(y));
      ctx.stroke();
      ctx.setLineDash([]);
      // Right-axis price tag, nudged clear of the live-price pill (and of each other) rather than
      // painted over it. The line above is still at the true price; only the pill moves.
      const ink = this.onFill(pl.color);
      const ty = this.reserveAxisSlot(y, 19, this.lastPriceY ?? undefined);
      if (Math.abs(ty - y) > 1) {
        // Displaced far enough to notice, so draw a hairline leader from the true level to its pill.
        // Without it a shifted tag would silently misreport where the line is.
        ctx.strokeStyle = pl.color;
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pw, crisp(y));
        ctx.lineTo(pw + 2, crisp(ty));
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      this.axisTag(ctx, ty, fmtPrice(pl.price, this.decimals), pl.color, ink);
      // Left chip: label AND price. The axis pill can be nudged or clipped off-pane, so the number
      // rides with the line too — the same way the S/R chips already carry theirs.
      const text = pl.label ? `${pl.label} ${fmtPrice(pl.price, this.decimals)}` : "";
      const tw = text ? ctx.measureText(text).width : 0;
      const closeW = pl.removable ? 15 : 0;
      const chipW = 10 + tw + (text && closeW ? 6 : 0) + closeW;
      const chipX = 4;
      // Chips are OPAQUE, so two levels within a chip-height of each other hid one another
      // entirely — and an entry, a stop and the live price sit within a few percent by
      // construction, which makes that the ordinary case rather than an edge case. The pills
      // on the right axis have always stepped apart; the chips had no such treatment.
      // The LINE stays at the true price and only the chip moves, so the geometry never lies.
      const cy = placeAxisTag(y, 18, this.chipSlots, this.lastPriceY ?? undefined);
      // A chip that cannot sit NEAR its line is not drawn at all.
      //
      // Zoomed out, a plan's levels compress into a few pixels, and fanning five chips into
      // a 90px column leaves every one of them pointing at a line it is nowhere near — the
      // labels stop describing the chart. The line and its right-axis tag still carry the
      // number, so nothing is lost but the word, and the word is what was lying.
      if (Math.abs(cy - y) > MAX_CHIP_OFFSET) continue;
      if (Math.abs(cy - y) > 1) {
        // Displaced far enough to notice → a hairline leader back to the real level, the same
        // way a nudged axis pill draws one. Without it the chip silently misreports its line.
        ctx.strokeStyle = pl.color;
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(chipX + chipW / 2, crisp(y));
        ctx.lineTo(chipX + chipW / 2, crisp(cy));
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.3)";
      ctx.shadowBlur = 5;
      ctx.shadowOffsetY = 1;
      ctx.fillStyle = pl.color;
      roundRectPath(ctx, chipX, cy - 9, chipW, 18, 5);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = ink;
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      if (text) ctx.fillText(text, chipX + 6, cy + 0.5);
      if (pl.removable) {
        const cxx = chipX + chipW - closeW + 3;
        ctx.strokeStyle = ink;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(cxx, cy - 3.5);
        ctx.lineTo(cxx + 7, cy + 3.5);
        ctx.moveTo(cxx + 7, cy - 3.5);
        ctx.lineTo(cxx, cy + 3.5);
        ctx.stroke();
        // The hit rect follows the DRAWN chip, not the line — a ✕ you can see but not click
        // is worse than none.
        this.priceLineHits.push({ id: pl.id, x: chipX + chipW - closeW - 2, y: cy - 9, w: closeW + 4, h: 18 });
      }
    }
  }

  // Bar-anchored events — backtest fills, real executions. Drawn AT the fill price, against the
  // candle that produced it, because "where did the stop fire" is a question about the bar.
  //
  // Percent mode is skipped: the markers carry absolute prices, and re-basing them to a window
  // start would put them somewhere the trade never happened.
  private drawMarkers(ctx: CanvasRenderingContext2D, p: Pane) {
    if (!this.markers.length || this.scaleMode === "percent") return;
    const pw = this.plotW();
    for (const m of this.markers) {
      const x = this.xAtTime(m.time);
      if (x < -8 || x > pw + 8) continue;
      const y = this.priceToY(p, m.price);
      if (y < p.top - 8 || y > p.top + p.height + 8) continue;

      // One hue per meaning, reusing the existing semantics: a stop is a loss-coloured event, a
      // target a gain-coloured one, an entry the neutral interactive accent. A
      // colour never means two things.
      const bought = (m.qty ?? 0) >= 0;
      const col =
        m.kind === "stop"
          ? this.theme.down
          : m.kind === "target"
            ? this.theme.up
            : m.kind === "close"
              ? this.theme.grid
              : bought
                ? this.theme.up
                : this.theme.down;

      ctx.save();
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = col;
      ctx.strokeStyle = this.theme.background;
      ctx.lineWidth = 1.25;

      if (m.kind === "stop" || m.kind === "target") {
        // A protective exit gets a DIAMOND — distinct in shape, not just colour, so it survives a
        // colour-blind reading and a greyscale screenshot.
        const r = 4.5;
        ctx.beginPath();
        ctx.moveTo(x, y - r);
        ctx.lineTo(x + r, y);
        ctx.lineTo(x, y + r);
        ctx.lineTo(x - r, y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else {
        // Entries/closes get a triangle pointing the way they traded.
        const r = 4.5;
        const up = bought;
        ctx.beginPath();
        if (up) {
          ctx.moveTo(x, y - r);
          ctx.lineTo(x + r, y + r * 0.8);
          ctx.lineTo(x - r, y + r * 0.8);
        } else {
          ctx.moveTo(x, y + r);
          ctx.lineTo(x + r, y - r * 0.8);
          ctx.lineTo(x - r, y - r * 0.8);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // Every axis readout is one rounded pill: a soft drop shadow, a hairline that matches the chart
  // background so adjacent tags never merge, and a second line of small text when a tag carries one
  // (the bar-close countdown). This single primitive is what makes the axis look designed.
  private pill(ctx: CanvasRenderingContext2D, y: number, text: string, bg: string, fg: string, sub?: string) {
    if (this.axisW === 0) return; // no axis gutter to hang a tag in
    const pw = this.plotW();
    const h = sub ? 30 : 19;
    const x = pw + 2;
    const w = this.axisW - 4;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 1;
    roundRectPath(ctx, x, y - h / 2, w, h, 4);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = alpha(this.theme.background, 0.85);
    ctx.lineWidth = 1;
    roundRectPath(ctx, x + 0.5, y - h / 2 + 0.5, w - 1, h - 1, 4);
    ctx.stroke();
    ctx.fillStyle = fg;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.font = this.theme.monoFont;
    ctx.fillText(text, x + 5, sub ? y - 5 : y + 0.5);
    if (sub) {
      ctx.globalAlpha = 0.75;
      ctx.font = this.theme.monoFont.replace(/^\d+(\.\d+)?px/, "9px");
      ctx.fillText(sub, x + 5, y + 8);
      ctx.globalAlpha = 1;
      ctx.font = this.theme.monoFont;
    }
  }
  private axisTag(ctx: CanvasRenderingContext2D, y: number, text: string, bg: string, fg: string, sub?: string) {
    this.pill(ctx, y, text, bg, fg, sub);
  }

  private makeDrawCtx(ctx: CanvasRenderingContext2D): DrawCtx {
    const price = this.panes[0];
    return {
      ctx,
      theme: this.theme,
      decimals: this.decimals,
      plotW: this.plotW(),
      plotH: this.plotH(),
      xOfTime: (t) => this.xAtTime(t),
      yOfPrice: (p) => this.priceToY(price, p),
      priceAtY: (y) => this.yToPrice(price, y),
      timeAtX: (x) => this.timeAtX(x),
      barsBetween: (t1, t2) => {
        const lo = Math.min(t1, t2);
        const hi = Math.max(t1, t2);
        const cap = this.n(); // never count past the bar-replay cursor
        let count = 0;
        for (let i = 0; i < cap; i++) if (this.bars[i].time >= lo && this.bars[i].time <= hi) count++;
        return count;
      },
      barsInRange: (t1, t2) => {
        const lo = Math.min(t1, t2);
        const hi = Math.max(t1, t2);
        const cap = this.n(); // volume tools (AVWAP / profile) must never see bars the replay hides
        const out: Bar[] = [];
        for (let i = 0; i < cap; i++) {
          const b = this.bars[i];
          if (b.time >= lo && b.time <= hi) out.push(b);
        }
        return out;
      },
      lastPrice: this.rawBars.length ? this.rawBars[this.rawBars.length - 1].close : 0,
      widthScale: 1,
      dash: undefined,
    };
  }
  private timeAtX(x: number): number {
    const i = clamp(Math.round(this.indexAt(x)), 0, this.bars.length - 1);
    return this.bars[i]?.time ?? 0;
  }
  private handleHit(dc: DrawCtx, d: Drawing, x: number, y: number): number {
    if (d.type === "brush" || d.type === "avwap" || d.type === "avwapbands") return -1; // freehand / anchored-VWAP(+bands): body-movable (drag re-anchors), no per-point handles
    for (let i = 0; i < d.points.length; i++) {
      if (Math.abs(x - dc.xOfTime(d.points[i].time)) < 6 && Math.abs(y - dc.yOfPrice(d.points[i].price)) < 6) return i;
    }
    return -1;
  }
  private drawDrawings(ctx: CanvasRenderingContext2D) {
    if (!this.panes.length) return;
    const dc = this.makeDrawCtx(ctx);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, this.plotW(), this.plotH());
    ctx.clip();
    for (const d of this.drawings) {
      if (d.hidden) continue;
      dc.widthScale = d.width ?? 1;
      dc.dash = d.style === "dashed" ? [6, 4] : d.style === "dotted" ? [1.5, 3] : undefined;
      DRAW_SPECS[d.type]?.draw(dc, d, this.selected === d.id);
    }
    if (this.brushing && this.brushing.length > 1) {
      dc.widthScale = 1;
      DRAW_SPECS.brush.draw(dc, { id: -1, type: "brush", points: this.brushing }, false);
    }
    ctx.restore();
  }
  private idxOfTime(time: number) {
    // nearest bar index for a stored time (drawings anchor to time, so they pan/zoom correctly)
    let lo = 0,
      hi = this.bars.length - 1;
    if (!this.bars.length) return 0;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (this.bars[m].time < time) lo = m + 1;
      else hi = m;
    }
    return lo;
  }

  // ---- crosshair overlay --------------------------------------------------
  private drawOverlay() {
    const ctx = this.octx;
    this.setup(ctx);
    // price-axis alert hint: a "＋" tag + faint guide when hovering the axis (no crosshair then)
    if (this.axisHoverY != null && this.bars.length) {
      const y = this.axisHoverY;
      const pw = this.plotW();
      const price = this.yToPrice(this.panes[0], y);
      ctx.strokeStyle = this.theme.crosshair;
      ctx.setLineDash([2, 3]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, crisp(y));
      ctx.lineTo(pw, crisp(y));
      ctx.stroke();
      ctx.setLineDash([]);
      this.pill(ctx, y, `＋ ${fmtPrice(price, this.decimals)}`, this.theme.line, this.onFill(this.theme.line));
    }
    if (!this.cross || !this.bars.length) return;
    const t = this.theme;
    const pw = this.plotW();
    // The UNCLAMPED column first: past the last bar the cursor is over a PROJECTED column, and the
    // readout must say so. Clamping first (as this did) silently reported the last real bar's OHLC
    // and its timestamp for a cursor sitting over the forecast — the chart answering a question
    // about the future with a fact about the past.
    const rawCol = Math.round(this.indexAt(this.cross.x));
    const projK = rawCol - this.n();
    const overProj = this.projLen() > 0 && projK >= 0 && projK < this.projLen();
    const i = clamp(rawCol, 0, this.n() - 1);
    const bx = overProj ? this.x(rawCol) : this.x(i);
    const p = this.paneAt(this.cross.y);
    // magnet mode + an active drawing tool → the horizontal crosshair snaps to the nearest OHLC so
    // the user sees exactly where the next anchor lands.
    const snapping = this.magnet && this.tool !== "cross" && p === this.panes[0];
    const price = snapping ? this.snapPrice(this.cross.x, this.cross.y) : this.yToPrice(p, this.cross.y);
    const cy = snapping ? this.priceToY(p, price) : this.cross.y;
    ctx.strokeStyle = t.crosshair;
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(crisp(bx), 0);
    ctx.lineTo(crisp(bx), this.plotH());
    ctx.moveTo(0, crisp(cy));
    ctx.lineTo(pw, crisp(cy));
    ctx.stroke();
    ctx.setLineDash([]);
    this.octx.font = t.monoFont;
    const label =
      p.kind === "volume"
        ? fmtVolume(price)
        : this.comparing && p.kind === "price"
          ? `${price.toFixed(2)}%`
          : this.scaleMode === "percent" && p.kind === "price" && p.base
            ? `${((price / p.base - 1) * 100).toFixed(2)}%`
            : fmtPrice(price, p.kind === "study" ? 2 : this.decimals);
    this.tagOverlay(cy, label, t.crosshairLabelBg, t.crosshairLabelText);
    // time label — a rounded pill on the time axis, matching the price side
    const tw = 112;
    const tx = clamp(bx - tw / 2, 1, pw - tw - 1);
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 6;
    ctx.fillStyle = t.crosshairLabelBg;
    roundRectPath(ctx, tx, this.plotH() + 2, tw, BOTTOM_AXIS_H - 3, 4);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = t.crosshairLabelText;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const projTime = overProj ? this.projection!.times?.[projK] : undefined;
    const timeLabel = overProj
      ? projTime != null
        ? fmtCrosshairTime(projTime, this.intraday, this.utc)
        : `+${projK + 1}` // no calendar supplied → never invent a date that may not trade
      : fmtCrosshairTime(this.bars[i].time, this.intraday, this.utc);
    ctx.fillText(timeLabel, tx + tw / 2, this.plotH() + BOTTOM_AXIS_H / 2 + 1);
    // legend
    const b = this.bars[i];
    const values: LegendValue[] = [];
    if (this.comparing) {
      const f0 = this.visible()[0];
      const mainBase = this.bars[f0].close;
      if (mainBase > 0) values.push({ label: "%", value: (b.close / mainBase - 1) * 100, color: this.theme.textStrong });
      for (const c of this.compares) {
        const base = this.compareCloseAt(c.bars, this.bars[f0].time);
        const cc = this.compareCloseAt(c.bars, b.time);
        values.push({ label: c.symbol, value: base > 0 && cc > 0 ? (cc / base - 1) * 100 : null, color: c.color });
      }
    }
    // tag each indicator's PRIMARY legend entry with its id, so the host matches a chip by identity
    // (not colour — two indicators can share a palette colour, or a secondary line's colour).
    if (overProj) {
      // No bar here, and no indicator is defined past the data — an indicator value computed at the
      // CLAMPED index would be the last real bar's, labelled as belonging to a future column.
      const pv: LegendValue[] = [];
      const proj = this.projection!;
      const add = (label: string, arr: number[] | undefined) => {
        const v = arr?.[projK];
        if (v != null && isFinite(v)) pv.push({ label, value: v, color: this.theme.line });
      };
      add(proj.label ?? "Projected", proj.mid);
      add("Upper", proj.upper);
      add("Lower", proj.lower);
      this.opts.onCrosshair?.(null, pv);
    } else {
      for (const o of this.overlays) { const g = o.legend(i); if (g[0]) g[0].id = o.id; values.push(...g); }
      for (const s of this.studies) { const g = s.legend(i); if (g[0]) g[0].id = s.id; values.push(...g); }
      this.opts.onCrosshair?.(b, values);
    }
    // in-progress drawing preview: the placed points + the cursor as the next point
    if (this.drafting && this.drafting.points.length >= 1) {
      const pr = this.panes[0];
      const cur: Point = { time: this.timeAtX(this.cross.x), price: this.snapPrice(this.cross.x, this.cross.y) };
      const spec = DRAW_SPECS[this.drafting.type];
      const pts = [...this.drafting.points, cur];
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, pw, this.plotH());
      ctx.clip();
      ctx.globalAlpha = 0.85;
      if (spec && pts.length >= spec.points) {
        // enough points (with the cursor) to render the real shape
        spec.draw(this.makeDrawCtx(ctx), { id: -1, type: this.drafting.type, points: pts.slice(0, spec.points) }, false);
      } else {
        // still collecting points — a light connecting line through what's placed + the cursor
        ctx.strokeStyle = this.theme.line;
        ctx.setLineDash([4, 3]);
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        pts.forEach((p, i) => {
          const px = this.x(this.idxOfTime(p.time));
          const py = this.priceToY(pr, p.price);
          i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        });
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore();
    }
  }
  private tagOverlay(y: number, text: string, bg: string, fg: string) {
    this.pill(this.octx, y, text, bg, fg);
  }

  // ---- interactions -------------------------------------------------------
  private localX(e: PointerEvent | WheelEvent | MouseEvent) {
    return e.clientX - this.host.getBoundingClientRect().left;
  }
  private localY(e: PointerEvent | WheelEvent | MouseEvent) {
    return e.clientY - this.host.getBoundingClientRect().top;
  }
  private onDown = (e: PointerEvent) => {
    const x = this.localX(e);
    const y = this.localY(e);
    this.pointers.set(e.pointerId, { x, y });
    // a second finger begins a pinch: cancel any single-pointer gesture and anchor the zoom
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const midX = (a.x + b.x) / 2;
      this.pinch = { startDist: Math.hypot(a.x - b.x, a.y - b.y) || 1, startSpacing: this.barSpacing, anchorIndex: this.indexAt(midX) };
      this.dragging = null;
      this.axisDrag = null;
      this.dragHandle = null; // else the remaining finger's move would silently reshape a drawing
      this.dragBody = null;
      this.drafting = null;
      this.brushing = null;
      this.cross = null;
      this.momentum = 0;
      this.drawOverlay();
      return;
    }
    if (this.pointers.size > 2) return;
    // a price line's ✕ badge → remove it (lines aren't drawn while comparing, so skip then)
    if (!this.comparing) {
      for (const h of this.priceLineHits) {
        if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) {
          this.opts.onPriceLineRemove?.(h.id);
          return;
        }
      }
    }
    // right price axis: a click creates (host may add an alert); a drag stretches the price scale
    if (x > this.plotW() && y < this.plotH() && this.bars.length) {
      this.axisDrag = { startY: y, startZoom: this.priceZoom, moved: false };
      return;
    }
    if (x > this.plotW() || y > this.plotH() || !this.bars.length) return;
    // A pane separator under the cursor → start resizing that pane (price absorbs the difference).
    // Only with the crosshair active: mid-drawing, a click near a separator must still place a point.
    const sep = this.tool === "cross" && !this.drafting && !this.brushing ? this.hitSeparator(x, y) : null;
    if (sep != null) {
      // Materialise EVERY non-price pane's rendered height into the overrides first. layout() only
      // scales when the non-price total exceeds its budget, and the rendered heights already satisfy
      // that budget — so after this the scale factor is exactly 1 and the separator tracks the
      // pointer 1:1 instead of drifting at k× speed.
      let others = 0;
      for (const pane of this.panes) {
        if (pane.kind === "price") continue;
        this.paneH[pane.key] = pane.height;
        others += pane.height;
      }
      const below = this.panes[sep];
      const above = this.panes[sep - 1];
      const pairH = below.height + (above.kind === "price" ? 0 : above.height);
      this.paneDrag = {
        key: below.key,
        startY: y,
        startH: below.height,
        aboveKey: above.kind === "price" ? null : above.key,
        startAboveH: above.kind === "price" ? 0 : above.height,
        othersH: others - pairH, // every other pane's height, held constant through the drag
      };
      this.overlay.style.cursor = "ns-resize";
      return;
    }
    // bar-replay: a click while armed picks the start bar
    if (this.replayArming) {
      this.setReplayAt(Math.round(this.indexAt(x)));
      return;
    }
    const price = this.panes[0];
    // freehand brush: begin a stroke; points are gathered on pointer-move, finalized on up
    if (this.tool === "brush") {
      this.brushing = [{ time: this.interpTime(x), price: this.yToPrice(price, y) }];
      return;
    }
    // placing a drawing: collect control points, finalize when the tool has enough
    if (this.drafting) {
      this.drafting.points.push({ time: this.timeAtX(x), price: this.snapPrice(x, y) });
      const spec = DRAW_SPECS[this.drafting.type];
      if (this.drafting.points.length >= spec.points) {
        const d: Drawing = { id: this.nextId++, type: this.drafting.type, points: this.drafting.points };
        spec.onCreate?.(d);
        this.drawings.push(d);
        this.selected = d.id;
        this.changed();
        this.revertToCross();
        this.emitSelection(); // keep the new drawing selected → its style popover appears
      }
      this.requestDraw();
      return;
    }
    const dc = this.makeDrawCtx(this.bctx);
    // grab a handle of the selected drawing (reshape)
    if (this.selected != null) {
      const d = this.drawings.find((dd) => dd.id === this.selected);
      if (d) {
        const hi = this.handleHit(dc, d, x, y);
        if (hi >= 0) {
          this.dragHandle = { id: d.id, idx: hi };
          return;
        }
      }
    }
    // select / start-moving a drawing under the cursor (topmost first)
    for (let k = this.drawings.length - 1; k >= 0; k--) {
      const d = this.drawings[k];
      if (d.hidden) continue;
      if (DRAW_SPECS[d.type]?.hit(dc, d, x, y)) {
        this.selected = d.id;
        this.dragBody = { id: d.id, startPts: d.points.map((p) => ({ ...p })), startIdx: this.indexAt(x), startPrice: this.yToPrice(price, y) };
        this.emitSelection();
        this.requestDraw();
        return;
      }
    }
    // empty space: deselect + pan
    if (this.selected != null) {
      this.selected = null;
      this.emitSelection();
      this.requestDraw();
    }
    this.momentum = 0;
    this.zoomAnchor = null;
    this.dragging = { startX: x, startOffset: this.offset, moved: false, lastX: x, vel: 0 };
    this.overlay.style.cursor = "grabbing";
  };
  private onMove = (e: PointerEvent) => {
    const x = this.localX(e);
    const y = this.localY(e);
    const price = this.panes[0];
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x, y });
    // pinch: distance ratio drives the zoom; the bar first pinched stays under the finger midpoint
    if (this.pinch && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const midX = (a.x + b.x) / 2;
      const spacing = clamp((this.pinch.startSpacing * dist) / this.pinch.startDist, MIN_BAR_SPACING, MAX_BAR_SPACING);
      this.barSpacing = spacing;
      this.tBarSpacing = spacing;
      this.zoomAnchor = null;
      this.offset = this.clampOffset(midX - this.pinch.anchorIndex * spacing);
      this.requestDraw();
      this.emitViewChange();
      return;
    }
    // resizing a pane: the separator follows the cursor; the pane above absorbs what the pane below
    // gives up (or the price pane does, when the separator sits directly under it)
    if (this.paneDrag) {
      const ph = this.plotH();
      const d = this.paneDrag;
      const maxH = ph * 0.6;
      // The budget layout() enforces; staying inside it here is what keeps the scale factor at 1.
      const budget = ph * 0.72;
      let h = d.startH - (y - d.startY);
      if (d.aboveKey) {
        // two panes share a fixed pair height — the total never moves, so only the pair is clamped
        const pair = d.startH + d.startAboveH;
        h = clamp(h, 34, Math.min(maxH, pair - 34));
        this.paneH[d.aboveKey] = pair - h;
      } else {
        // the price pane is above: it absorbs the change, so cap growth at the remaining budget
        // (never below the 34px floor, so a crowded stack still leaves a draggable pane)
        h = clamp(h, 34, Math.max(34, Math.min(maxH, budget - d.othersH)));
      }
      this.paneH[d.key] = h;
      this.requestDraw();
      return;
    }
    if (this.axisDrag) {
      if (Math.abs(y - this.axisDrag.startY) > 2) this.axisDrag.moved = true;
      // drag up = zoom in (tighter range), down = zoom out — the TradingView feel
      this.priceZoom = clamp(this.axisDrag.startZoom * Math.exp((y - this.axisDrag.startY) * 0.004), 0.05, 20);
      this.requestDraw();
      this.emitViewChange(); // so the host's "Auto" affordance reflects the manual stretch
      return;
    }
    if (this.brushing) {
      // gather a freehand point when the cursor has moved far enough from the last one
      const lp = this.brushing[this.brushing.length - 1];
      const lx = this.xAtTime(lp.time);
      const ly = this.priceToY(price, lp.price);
      if (Math.hypot(x - lx, y - ly) > 2.5) {
        this.brushing.push({ time: this.interpTime(clamp(x, 0, this.plotW())), price: this.yToPrice(price, clamp(y, 0, this.plotH())) });
        this.cross = null;
        this.requestDraw();
      }
      return;
    }
    if (this.dragHandle) {
      const d = this.drawings.find((dd) => dd.id === this.dragHandle!.id);
      if (d) {
        const cx = clamp(x, 0, this.plotW());
        const cy = clamp(y, 0, this.plotH());
        d.points[this.dragHandle.idx] = { time: this.timeAtX(cx), price: this.snapPrice(cx, cy) };
      }
      this.requestDraw();
      return;
    }
    if (this.dragBody) {
      const d = this.drawings.find((dd) => dd.id === this.dragBody!.id);
      if (d) {
        const dIdx = Math.round(this.indexAt(x) - this.dragBody.startIdx);
        const dPrice = this.yToPrice(price, y) - this.dragBody.startPrice;
        d.points = this.dragBody.startPts.map((p) => {
          const ni = clamp(this.idxOfTime(p.time) + dIdx, 0, this.bars.length - 1);
          return { time: this.bars[ni].time, price: p.price + dPrice };
        });
      }
      this.requestDraw();
      return;
    }
    if (this.dragging) {
      const dx = x - this.dragging.startX;
      if (Math.abs(dx) > 2) this.dragging.moved = true;
      this.dragging.vel = (x - this.dragging.lastX) * 0.6 + this.dragging.vel * 0.4;
      this.dragging.lastX = x;
      this.offset = this.clampOffset(this.dragging.startOffset + dx);
      this.cross = null;
      this.requestDraw();
      this.emitViewChange();
      return;
    }
    if (x <= this.plotW() && y <= this.plotH()) {
      const prevIdx = this.cross ? Math.round(this.indexAt(this.cross.x)) : null;
      this.cross = { x, y };
      this.axisHoverY = null;
      // hovering a separator lights it up + offers the resize cursor, before any drawing hit-test
      const sep = this.tool === "cross" && !this.drafting && !this.brushing ? this.hitSeparator(x, y) : null;
      const sepChanged = sep !== this.paneHover;
      this.paneHover = sep;
      if (sep != null) this.overlay.style.cursor = "ns-resize";
      else if (this.tool === "cross") this.updateHoverCursor(x, y);
      // the hovered-bar column lives on the BASE canvas, so repaint it only when the bar under the
      // cursor actually changes — a full redraw on every pixel of pointer movement would be wasteful
      if (sepChanged || Math.round(this.indexAt(x)) !== prevIdx) this.requestDraw();
      this.drawOverlay();
    } else {
      // Leaving the plot for the AXES doesn't fire pointerleave (the overlay canvas covers them too),
      // so clear the base-canvas hover chrome here as well — otherwise the tinted column and a lit
      // separator would sit there until some unrelated redraw.
      if (this.cross || this.paneHover != null) {
        this.cross = null;
        this.paneHover = null;
        this.requestDraw();
      }
      // hovering the right price axis with alert-create wired → hint you can click to set an alert
      const pp = this.panes[0];
      const overAxis = this.axisHint && !!pp && this.axisW > 0 && x > this.plotW() && x < this.plotW() + this.axisW && y > pp.top && y < pp.top + pp.height;
      this.axisHoverY = overAxis ? y : null;
      this.overlay.style.cursor = overAxis ? "pointer" : this.tool === "cross" ? "crosshair" : "copy";
      this.drawOverlay();
      this.opts.onCrosshair?.(null, []);
    }
  };
  private updateHoverCursor(x: number, y: number) {
    const dc = this.makeDrawCtx(this.bctx);
    let cur = "crosshair";
    if (this.selected != null) {
      const d = this.drawings.find((dd) => dd.id === this.selected);
      if (d && this.handleHit(dc, d, x, y) >= 0) cur = "pointer";
    }
    if (cur === "crosshair") {
      for (let k = this.drawings.length - 1; k >= 0; k--) {
        if (this.drawings[k].hidden) continue;
        if (DRAW_SPECS[this.drawings[k].type]?.hit(dc, this.drawings[k], x, y)) {
          cur = "move";
          break;
        }
      }
    }
    this.overlay.style.cursor = cur;
  }
  private onUp = (e?: PointerEvent) => {
    if (e) this.pointers.delete(e.pointerId);
    // a pinch ends when a finger lifts; don't let the remaining finger snap into a pan (would jump)
    if (this.pinch) {
      if (this.pointers.size < 2) {
        this.pinch = null;
      } else {
        // still ≥2 fingers (e.g. 3→2): re-anchor from the current pair so the next move doesn't
        // jump off the lifted finger's stale startDist/anchorIndex
        const [a, b] = [...this.pointers.values()];
        this.pinch = { startDist: Math.hypot(a.x - b.x, a.y - b.y) || 1, startSpacing: this.barSpacing, anchorIndex: this.indexAt((a.x + b.x) / 2) };
      }
      this.dragging = null;
      return;
    }
    // finalize a freehand stroke → a brush drawing (kept selected so its style popover shows)
    if (this.brushing) {
      if (this.brushing.length > 1) {
        const d: Drawing = { id: this.nextId++, type: "brush", points: this.brushing };
        this.drawings.push(d);
        this.selected = d.id;
        this.changed();
      }
      this.brushing = null;
      this.revertToCross();
      this.emitSelection();
      this.requestDraw();
      return;
    }
    if (this.paneDrag) {
      this.paneDrag = null;
      this.overlay.style.cursor = this.tool === "cross" ? "crosshair" : "copy";
      this.requestDraw();
      return;
    }
    const edited = this.dragHandle || this.dragBody;
    // a flick leaves momentum — the chart keeps gliding, then eases to rest
    if (this.dragging && this.dragging.moved && Math.abs(this.dragging.vel) > 1.4) {
      this.momentum = clamp(this.dragging.vel, -70, 70);
      this.requestDraw();
    }
    this.dragging = null;
    this.dragHandle = null;
    this.dragBody = null;
    // a price-axis click that never turned into a stretch → let the host create at that price
    if (this.axisDrag && !this.axisDrag.moved && this.opts.onAxisClickPrice) {
      const pane = this.paneAt(this.axisDrag.startY);
      if (pane === this.panes[0]) this.opts.onAxisClickPrice(this.yToPrice(pane, this.axisDrag.startY));
    }
    this.axisDrag = null;
    this.overlay.style.cursor = this.tool === "cross" ? "crosshair" : "copy";
    if (edited) {
      this.changed();
      this.emitSelection(); // the selected drawing moved → reposition its popover
    }
  };
  private onKey = (e: KeyboardEvent) => {
    const ae = typeof document !== "undefined" ? document.activeElement : null;
    if (ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) return;
    if (e.key === "Escape") {
      this.setTool("cross");
      this.selected = null;
      this.emitSelection();
      this.requestDraw();
    } else if ((e.key === "Delete" || e.key === "Backspace") && this.selected != null) {
      e.preventDefault();
      this.deleteSelected();
    }
  };
  private onLeave = () => {
    if (this.dragging || this.dragHandle || this.dragBody || this.paneDrag) return;
    this.cross = null;
    this.paneHover = null;
    this.setup(this.octx);
    this.requestDraw(); // drop the hovered-bar column from the base canvas
    this.opts.onCrosshair?.(null, []);
  };
  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const x = this.localX(e);
    if (x > this.plotW()) return;
    // normalise the delta across input kinds: trackpads report pixels (deltaMode 0), mice often lines.
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.plotH() : 1;
    const dx = e.deltaX * unit;
    const dy = e.deltaY * unit;
    // Horizontal two-finger swipe (not a pinch) → pan the time axis directly. Immediate, no easing,
    // so the chart tracks the fingers 1:1.
    if (!e.ctrlKey && Math.abs(dx) > Math.abs(dy)) {
      this.offset = this.clampOffset(this.offset - dx);
      this.zoomAnchor = null;
      this.momentum = 0;
      this.cross = { x, y: this.localY(e) };
      this.requestDraw();
      this.emitViewChange();
      return;
    }
    // Otherwise zoom, PROPORTIONAL to the scroll amount (exp keeps it multiplicative + symmetric), so
    // a trackpad's many tiny events zoom gently instead of racing on a fixed per-event factor; the
    // tick loop eases barSpacing toward the target, compounding across a fast scroll.
    const base = this.zoomAnchor ? this.tBarSpacing : this.barSpacing;
    const factor = Math.exp(-clamp(dy, -240, 240) * 0.0022);
    this.tBarSpacing = clamp(base * factor, MIN_BAR_SPACING, MAX_BAR_SPACING);
    this.zoomAnchor = { x, index: this.indexAt(x) };
    this.momentum = 0;
    this.cross = { x, y: this.localY(e) };
    this.requestDraw();
    this.emitViewChange();
  };
  private onDbl = () => {
    this.priceZoom = 1;
    this.fitContent();
    this.requestDraw();
    this.emitViewChange();
  };
  private clampOffset(off: number) {
    const pw = this.plotW();
    const n = this.n();
    // keep at least a few bars on screen at each edge
    // The floor has to clear the right margin, else a long projection cannot be panned into view.
    const minOff = pw - (n - 1) * this.barSpacing - this.barSpacing * panFloorBars(this.projLen());
    const maxOff = pw - this.barSpacing * 3;
    return clamp(off, Math.min(minOff, maxOff), maxOff);
  }
}

function valAt(arr: number[], i: number): number | null {
  const v = arr[i];
  return v == null || isNaN(v) ? null : v;
}
