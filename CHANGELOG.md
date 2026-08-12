# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/) and the project adheres to
[Semantic Versioning](https://semver.org/).

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
