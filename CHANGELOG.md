# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/) and the project adheres to
[Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-08-11

### Added

- Initial public release: a framework-agnostic canvas `Chart` engine plus an
  optional `./react` `TradingChart` binding.
- `DataFeed` abstraction (`getBars` required; `subscribe`/`searchSymbols` optional).
- Built-in indicators, drawing tools, script overlays, and light/dark theming with
  named presets.
