// Framework-agnostic canvas charting engine (React-free core).
export { Chart } from "./chart";
export type { Tool } from "./chart";
export { DARK, LIGHT, THEMES, THEME_NAMES, fitBarCount } from "./util";
export { parseScriptDraw, parseScriptDrawJson, scriptColor } from "./script";
export type { ScriptDraw, ScriptPlot, ScriptRender, ScriptColor, ScriptPlotStyle } from "./script";
export { US_EQUITIES_SESSION } from "./types";
// The trade ticket's arithmetic — React-free, so a host can size and risk-check an order without
// mounting the widget, and so the ticket and the chart can never disagree about one calculation.
export { deriveTicketRisk, bracketCoherent, EMPTY_ORDER, HAS_LIMIT, HAS_TRIGGER, HAS_TIF } from "./ticket";
export type { TicketOrder, TicketQuote, TicketAccount, TicketRisk, OrderSide, OrderType, TimeInForce, SizeMode } from "./ticket";
export type { Bar, SeriesType, Resolution, Theme, DataFeed, DataFeedResult, ChartOptions, IndicatorInstance, LegendValue, PriceLine, ChartMarker, Projection, ScaleMode, SessionSpec, TradePlan } from "./types";

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
