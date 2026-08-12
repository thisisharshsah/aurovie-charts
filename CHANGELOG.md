# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/) and the project adheres to
[Semantic Versioning](https://semver.org/).

## [0.3.1] - 2026-08-12

### Fixed

- `exports` did not expose `./package.json`, so `require.resolve
  ("aurovie-charts/package.json")` threw `ERR_PACKAGE_PATH_NOT_EXPORTED`. Build
  tooling routinely reads a dependency's manifest to pin the version it generated
  from; there is no reason to hide it.

## [0.3.0] - 2026-08-12

### Added

- `ChartOptions.axes` — `false` drops the price/time axis gutters so the plot fills
  the host. For embedded sparklines and price-header "hero" charts.
- `ChartOptions.interactive` — `false` makes the chart read-only (no pan, zoom,
  double-click or keyboard nav). The crosshair still tracks, so `onCrosshair` keeps
  driving a host readout, and the host's `touch-action` is released so a chart
  embedded in a scrolling list no longer eats the scroll gesture.
- `ChartOptions.session` + `Chart.setSession()` + `TradingChart`'s `session` prop +
  the `SessionSpec` type — the exchange session that drives intraday
  extended-hours shading, with `days` for venues that don't trade Mon–Fri and
  `utc` for bar times stored as exchange wall-clock. `US_EQUITIES_SESSION` is
  exported as the default.
- **Compare-box symbol suggestions.** `DataFeed.searchSymbols` was part of the
  contract but nothing ever called it, so the compare input was a bare text box
  you had to type an exact ticker into. It now drives a debounced picker; feeds
  without `searchSymbols` keep the plain input.
- **Visible-range presets** — `Chart.showSince(fromTime)` plus a `1M · 3M · 6M ·
  1Y · 5Y · All` strip in the toolbar, configurable (or hidden) via the `ranges`
  prop. Resolved from the bars' own timestamps, so holidays and non-trading days
  don't make the same preset span different periods for different instruments.
- **Instrument header** — a `header` prop (`InstrumentHeader`) rendering ticker,
  name, sector, reference stats and the headline price above the toolbar. Every
  field is optional and an absent one is omitted rather than dashed, since
  instrument metadata is never uniformly available. `priceSlot` hands the price
  block back to the host for animated tickers.

### Fixed

- **Session shading was computed in the VIEWER's timezone.** It hardcoded US
  09:30–16:00 via `Date#getHours`, so the same chart shaded different bars
  depending on where the reader sat, and marked every non-US venue wrong. Hours,
  trading days and the clock basis are now all part of `SessionSpec`.
- **The legend showed no prices unless you hovered.** `TradingChart` rendered OHLC
  only while the crosshair was on a bar, so a chart at rest displayed a ticker and
  nothing else — the reader had to move the mouse to learn the price already on
  screen. It now falls back to the newest bar, and follows realtime ticks.
- **`indicators={[]}` still turned on MA50.** The seed tested the array's length
  rather than its presence, so a host explicitly asking for a clean chart got the
  same default as a host that said nothing.

## [0.2.0] - 2026-08-11

### Added

- **Standalone IIFE build** (`dist/aurovie-charts.standalone.global.js`, exposed as
  `aurovie-charts/standalone`) — the React-free core as a `window.AurovieCharts`
  global, for hosts that cannot run an ES module: a React Native WebView, a
  `<script>` tag, a CSP'd page that inlines its bundle.
- `TradingChart` — `onCrosshair`, mirroring the crosshair readout to the host so
  chrome outside the chart can follow the hovered bar.
- `TradingChart` — `scripts`, for host-COMPUTED series (a model forecast, an
  equity curve) drawn with the same machinery as an editor script. Unlike the
  editor's own output these survive a symbol/interval change: only the host knows
  whether it has already recomputed.
- `TradingChart` — `lockedIndicators` / `onLockedIndicator`, so a host can gate
  indicators behind an entitlement. Locked entries stay listed and show a lock
  rather than disappearing, and a locked id never reaches the engine even if it
  arrives pre-seeded via `indicators`.

### Fixed

- `package.json` `repository`/`homepage`/`bugs` pointed at an `OWNER` placeholder,
  and `author` was empty.
- The build cleaned `dist/` from inside one of two concurrently-run tsup configs,
  which could delete the other's output. Cleaning now happens once, up front.

## [0.1.0] - 2026-08-11

### Added

- Initial public release: a framework-agnostic canvas `Chart` engine plus an
  optional `./react` `TradingChart` binding.
- `DataFeed` abstraction (`getBars` required; `subscribe`/`searchSymbols` optional).
- Built-in indicators, drawing tools, script overlays, and light/dark theming with
  named presets.
