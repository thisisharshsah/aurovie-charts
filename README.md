# aurovie-charts

> A framework-agnostic canvas charting engine — a TradingView-class financial chart (candles/volume, indicators, drawings, crosshair, pan/zoom) with a datafeed abstraction. The core is **React-free**; an optional `./react` binding ships a full self-contained widget.

<!-- badges: npm version · CI · license -->

## Why

Most financial-chart libraries either couple you to a framework or hide the engine behind a heavy widget. This one is a plain canvas engine you drive with data, plus an optional React component for when you want batteries included. No runtime dependencies in the core.

## Install

```sh
npm i aurovie-charts
# react is a PEER dependency, needed ONLY for the ./react widget:
npm i react react-dom
```

## Quick start

### Vanilla (no framework)

```ts
import { Chart, DARK } from "aurovie-charts";

const host = document.getElementById("chart")!; // any HTMLElement
const chart = new Chart(host, { theme: DARK });

// Bar.time is UNIX SECONDS
chart.setData([
  { time: 1_700_000_000, open: 100, high: 104, low: 99, close: 103, volume: 1200 },
  // …
]);
```

### React

```tsx
import { TradingChart } from "aurovie-charts/react";
import type { DataFeed } from "aurovie-charts";

const feed: DataFeed = {
  async getBars(symbol, resolution) {
    const bars = await fetchBarsSomehow(symbol, resolution);
    return { bars }; // { bars: Bar[]; dataVersion?: string }
  },
  // optional realtime + search:
  // subscribe(symbol, resolution, onTick) { …; return unsubscribe; },
  // async searchSymbols(query) { return [{ symbol, description }]; },
};

export default function App() {
  return (
    <TradingChart
      datafeed={feed}
      symbol="DEMO"
      resolution="60"
      timeframes={[{ label: "1H", value: "60" }, { label: "1D", value: "1D" }]}
      height={600}
    />
  );
}
```

## Core concepts

### The `DataFeed` contract

A consumer implements a `DataFeed` — this is the integration surface, and the only required method is `getBars`:

```ts
interface DataFeed {
  getBars(symbol: string, resolution: Resolution): Promise<DataFeedResult>;
  subscribe?(symbol: string, resolution: Resolution, onTick: (bar: Bar) => void): () => void;
  searchSymbols?(query: string): Promise<{ symbol: string; description: string }[]>;
}

type DataFeedResult = { bars: Bar[]; dataVersion?: string };
type Bar = { time: number /* UNIX SECONDS */; open: number; high: number; low: number; close: number; volume?: number };
```

The engine never makes network calls — your `DataFeed` owns all fetching, auth, and polling.

### Theming

Pass a `Partial<Theme>` over the built-in `DARK` (or `LIGHT`) default and override any field — e.g. map your app's design tokens onto it:

```ts
import { DARK } from "aurovie-charts";
new Chart(host, { theme: { ...DARK, up: "#12b886", down: "#e03131", background: "#000" } });
```

`THEMES` is a map of named presets and `THEME_NAMES` lists them (used by the React widget's theme picker).

### Indicators

The React widget accepts a list of built-in indicator ids via its `indicators` prop:

```
ma50 · ma200 · ema21 · vwap · boll · donch · rsi · macd · atr · stoch · obv · cci · roc
```

## API (core)

- `Chart` — `new Chart(host, opts?)`; `setData`, `update`, `setIndicators`, `setScripts`, `setTool`, `setScaleMode`, `getDrawings`/`setDrawings`, …
- Themes: `DARK`, `LIGHT`, `THEMES`, `THEME_NAMES`
- Script overlays: `parseScriptDraw`, `parseScriptDrawJson`, `scriptColor`
- Types: `Bar`, `SeriesType`, `Resolution`, `Theme`, `DataFeed`, `DataFeedResult`, `ChartOptions`, `IndicatorInstance`, `LegendValue`, `PriceLine`, `ChartMarker`, `ScaleMode`, `Tool`, `Drawing`, `ScriptDraw`, `ScriptPlot`, `ScriptRender`, `ScriptColor`, `ScriptPlotStyle`

## API (`aurovie-charts/react`)

- `TradingChart` — the full self-contained widget (toolbar + drawing rail + legend) wired to a `DataFeed`
- Types: `TradingChartProps`, `TimeframeOption`

## Examples

See [`examples/`](./examples) — a zero-framework `vanilla` example and a `react` example.

## License

[MIT](./LICENSE)
