"use client";
export { TradingChart } from "./TradingChart";
export type { TradingChartProps, TimeframeOption, RangePreset, ChartSettingGroup, ChartSettingOption, InstrumentHeader } from "./TradingChart";

export { TradeTicket, deriveTicketRisk, bracketCoherent, EMPTY_ORDER } from "./TradeTicket";
export type {
  TradeTicketProps,
  TicketOrder,
  TicketQuote,
  TicketAccount,
  TicketRisk,
  TicketStatus,
  TicketCheck,
  OrderSide,
  OrderType,
  TimeInForce,
  SizeMode,
} from "./TradeTicket";

export { ChartWorkspace } from "./ChartWorkspace";

// The design system, for hosts that theme the widget or build chrome beside it.
export { SPACE, RADIUS, TYPE, WEIGHT, CONTROL, ELEV, MOTION, Z, contrast, luminance, readable, themeVars, cx } from "./ui";
export type { ChartWorkspaceProps } from "./ChartWorkspace";

export type { ScriptPreset, ScriptScorecard, ScriptSweep, ScriptMetrics, SavedStrategy } from "./ScriptEditor";
export { DEFAULT_STRATEGIES } from "./strategies";
