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

### Driving host chrome from the widget

The widget owns its toolbar and legend, but a host usually has chrome of its own to keep in sync.
Three props open that up without giving up the batteries-included widget:

```tsx
<TradingChart
  datafeed={feed}
  symbol="DEMO"
  // mirror the crosshair into your own price header
  onCrosshair={(bar) => setScrubbed(bar)}
  // draw series YOU computed (a model forecast, an equity curve)
  scripts={forecast ? [forecast] : []}
  // gate indicators behind a plan; locked entries stay listed, with a lock
  lockedIndicators={plan === "free" ? ["rsi", "macd", "boll"] : []}
  onLockedIndicator={(id) => openUpgrade(id)}
/>
```

`scripts` takes the same `ScriptRender` shape the script editor produces (`parseScriptDraw` builds
one). Host series are the host's to invalidate — the widget clears the *editor's* scripts when the
symbol or interval changes, but never yours, since only you know whether you have recomputed.

### Instrument header, ranges, and sessions

```tsx
<TradingChart
  datafeed={feed}
  symbol="GMFBS"
  header={{
    name: "Ganapati Laghubitta Bittiya Sanstha Limited",
    sector: "Microfinance",
    stats: [{ label: "52W", value: "1,130.5-1,688.0" }, { label: "Vol", value: "24" }],
    price: { value: "1,160.00", change: "▲ 27.00 (2.38%)", direction: "up" },
  }}
  ranges={[{ label: "6M", days: 180 }, { label: "1Y", days: 365 }, { label: "All", days: null }]}
  session={{ openMin: 11 * 60, closeMin: 15 * 60, days: [0, 1, 2, 3, 4], utc: true }}
/>
```

Every `header` field is optional — a field you cannot fill is omitted, never rendered as a dash or
a zero, which would state something false about the instrument. `priceSlot` replaces the price
block entirely when your ticker animates.

`session` drives the intraday out-of-hours shading. It defaults to `US_EQUITIES_SESSION`, so set it
for any other venue or the shading marks the wrong bars. Use `utc: true` when your bar times are
exchange wall-clock stamped as UTC — otherwise the shading is computed in the *reader's* timezone.

## Standalone build (no ES modules)

For hosts that cannot import an ES module — a React Native WebView, a `<script>` tag, a page that
inlines its whole bundle — `aurovie-charts/standalone` is the React-free core as one self-contained
IIFE that defines `window.AurovieCharts`:

```html
<script src="node_modules/aurovie-charts/dist/aurovie-charts.standalone.global.js"></script>
<script>
  const chart = new AurovieCharts.Chart(document.getElementById("chart"), { theme: AurovieCharts.DARK });
  chart.setData(bars);
</script>
```

## Examples

See [`examples/`](./examples) — a zero-framework `vanilla` example and a `react` example.

## License

[MIT](./LICENSE)
