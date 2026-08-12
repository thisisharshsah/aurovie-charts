// Framework-agnostic canvas charting engine (React-free core).
export { Chart } from "./chart";
export type { Tool } from "./chart";
export { DARK, LIGHT, THEMES, THEME_NAMES } from "./util";
export { parseScriptDraw, parseScriptDrawJson, scriptColor } from "./script";
export type { ScriptDraw, ScriptPlot, ScriptRender, ScriptColor, ScriptPlotStyle } from "./script";
export { US_EQUITIES_SESSION } from "./types";
export type { Bar, SeriesType, Resolution, Theme, DataFeed, DataFeedResult, ChartOptions, IndicatorInstance, LegendValue, PriceLine, ChartMarker, ScaleMode, SessionSpec } from "./types";

export type { Drawing } from "./drawings";

// Technical-analysis functions — the raw indicator maths the chart draws, exported so downstream
// tools can compute or verify the same series independently of the canvas.
export {
  sma, ema, wma, hma, dema, tema, trix,
  rsi, stochRsi, stochastic, williamsR, cci, roc, momentum, aroon,
  macd, bollinger, atr, adx, keltner, donchian, supertrend, psar, ichimoku,
  obv, mfi, cmf, vwap, vwapAnchored, vwapAnchoredBands, vwma, volumeProfile,
  pivotPoints, stddev,
} from "./util";
