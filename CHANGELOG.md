# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/) and the project adheres to
[Semantic Versioning](https://semver.org/).

## [0.8.11] - 2026-08-13

### Changed

- **The scale and navigation controls moved off the plot into a bottom bar.** Auto, Log, %, the
  volume-profile and data-window toggles, go-to-realtime and the settings gear were a cluster
  floating over the plot's bottom-right corner — which is where a chart puts controls when it has
  nowhere else for them: translucent so as not to hide the candles, and therefore sitting on the
  data it is trying not to hide.

  They are chart-wide switches, not annotations on a price, so they belong in chrome. As a real
  bar they also stop colliding with the axis corner, the bar countdown, and anything the host
  draws in `overlay`.

## [0.8.10] - 2026-08-13

### Added

- **`volume`** — force the volume pane on or off, overriding the user's saved preference for as
  long as it is passed. A host building a glance view needs it: volume is a working tool, and a
  chart stripped to a price line with no axes and no grid should not still carry a histogram
  under it. Omitted, the pref decides as before, so "this view has no volume" stays distinct from
  "this user turned volume off".

### Fixed

- **The theme control was a Unicode placeholder and a redundant word.** It rendered `◑ Theme ▾`
  — a circle character standing in for an icon the package has actually drawn since 0.7.0, plus
  a label for a control whose whole vocabulary is a picture. It was the widest item in a crowded
  toolbar and said nothing the mark does not. Now icon-only, with the name on `aria-label`.

## [0.8.9] - 2026-08-13

### Changed

- **The script editor docks below the plot instead of floating over it.** It was absolutely
  positioned inside the chart at 62% of its height, so writing a script covered the chart the
  script is written against — and the space it did get was shared between source, library, error
  strip and a backtest scorecard, each in its own scrolling slit.

  It is now a sibling of the plot: a real region of the widget that takes height out of the
  layout rather than stealing it from the chart. The plot shrinks, both are fully visible, and
  the dock is `clamp(240px, 42%, 420px)` — enough to write in on a tall chart without swallowing
  a short one. Expanded still claims the rest of the widget for reading a backtest. Being docked
  rather than floating, it also drops the translucency, blur and drop shadow it only needed in
  order to sit on top of something.

## [0.8.8] - 2026-08-13

### Changed

- **The data window moved to the left of the plot.** It sat top-right, which is where the price
  axis is and where the newest bars sit against it — so a panel describing the series covered the
  exact region a reader is most likely watching, its live edge. The left holds the oldest bars in
  view and is the cheapest area of a chart to cover.

## [0.8.7] - 2026-08-13

### Added

- **Clear all** in the on-chart legend — removes every active indicator and any script output in
  one action. Each overlay had its own ✕ and nothing took them down together, so returning to a
  clean chart after trying five studies meant five precise clicks on 12px targets.

  It also fixes a real dead end: **script output had no removal affordance at all.** Closing the
  editor left its plots drawn, and no other control in the interface offered to remove them — the
  only ways out were changing symbol or interval, both of which clear scripts as a side effect of
  doing something else. The button therefore appears whenever a script is drawn, even alone, and
  otherwise only once there are two indicators to clear, so it never sits over a bare chart.

## [0.8.6] - 2026-08-13

### Changed

- **The drawing rail now starts closed, and its state persists.** The rail is a fixed column
  taken out of the PLOT, and most sessions never draw a single line — so the default was
  spending chart width on tools the reader was not using. Its switch moved into the toolbar in
  0.8.4, which made the rail reachable in one click, and that is what makes a closed default
  reasonable rather than obstructive. It joins the persisted preference blob, so anyone who does
  draw opens it once instead of closing it on every reload.

  Hosts that want the old behaviour can seed the stored pref; the rail itself is still gated by
  `drawingRail` as before.

## [0.8.5] - 2026-08-13

### Added

- **`endpointMarker`** — marks the final point of a line/area/step series with a live dot: a
  halo, a filled centre, and a hairline ring in the pane colour so it holds its shape over a
  dense area fill. A line otherwise just stops at its right edge, which tells a reader nothing
  about whether they are looking at the present or at a window ending somewhere in the past. The
  mark says "this is now", and it is most of what separates a glance chart from a plotted array.

  Static, not pulsing. An animated marker means an unending frame loop per chart purely for
  decoration, and a page carrying several of them pays that in battery for no information —
  a halo reads as live without the loop. Drawn only when the newest bar is actually in view:
  once the viewport is panned into history the last VISIBLE point is not the last point, and
  marking it there would claim a recency the chart cannot support.

## [0.8.4] - 2026-08-13

### Added

- **`onRangeChange`** — fired when a built-in range preset is picked, with the preset. The widget
  can only move the VIEWPORT: it calls `showSince` and stops. It cannot know that five years of
  five-minute bars is not a chart, or that one day of monthly bars is a single candle — only the
  host knows what its feed serves and what each range is worth asking for at. Without the hook
  the range strip was a viewport control pretending to be a period control.

### Fixed

- **The range strip had no active state.** Every preset drew in the inactive style, so picking a
  range gave no confirmation that anything had been selected, and returning to a chart later
  there was no way to tell which window was applied.
- **`frame` was announced in 0.8.3 but not in the published tarball** — 0.8.3 was cut before the
  feature landed, so it shipped identical to 0.8.2 and a consumer passing `frame` could not
  compile. `frame` and the drawing-rail fix below are genuinely in this release.
- **A collapsed drawing rail still cost a full column.** The rail's on/off switch was the first
  item *inside the rail*, so turning the tools off could not remove the rail — it had to keep
  rendering to hold its own button. The switch moved to the horizontal toolbar and the rail now
  disappears entirely when off.

## [0.8.3] - 2026-08-13

Published identical to 0.8.2 — the version was cut before the work below landed, so these notes
describe 0.8.4. Kept for the record rather than rewritten.

### Added

- **`frame`** — `false` drops the widget's border, corner radius and drop shadow so it renders
  flush. The frame is right for a chart dropped into a page as a card and wrong for one that IS
  the page: a host with its own header above the plot and its own controls below ended up with a
  rounded, shadowed box wedged between two bare rows, and the three read as three unrelated
  components rather than one instrument.

### Fixed

- **A collapsed drawing rail still cost a full column.** The rail's on/off switch was the first
  item *inside the rail*, so turning the tools off could not remove the rail — it had to keep
  rendering to hold its own button, leaving a gutter down the left of every chart whose owner
  was not drawing. The switch moved to the horizontal toolbar, where it belongs, and the rail now
  disappears entirely when off. The plot gets the width back.

## [0.8.2] - 2026-08-13

### Added

- **`axes`** on `TradingChart` — `false` drops the price and time gutters so the plot fills the
  host. `ChartOptions.axes` has supported this since 0.3.0 and the widget simply never passed it
  through, so the one binding most hosts use could not build a glance chart. An axis exists so a
  reader can put a number on a point they are looking at; a chart with its headline figure in
  host chrome above it, not meant to be measured, is spending two gutters on a question nobody
  is asking.

## [0.8.1] - 2026-08-13

### Added

- **`volumeEmphasis`** — brighten volume bars that exceed their own moving average, step back the
  ones that do not. Volume is on a price chart to answer "was there anything behind this move?",
  and a row of equally-bright columns cannot answer it: every bar looks as important as every
  other and the reader compares heights by eye against a baseline that is off-screen for most of
  them. Keying brightness to the MA the chart already draws puts the answer in the ink. Direction
  colour is kept on both, so nothing is lost. Off by default — it changes how an existing chart
  reads.

### Fixed

- Nothing else — this release exists because `volumeEmphasis` landed after 0.8.0 was published,
  and a consumer passing the prop against 0.8.0 fails to compile.

## [0.8.0] - 2026-08-13

### Added

- **`legend`** on `TradingChart` — `"auto"` (default) | `"ohlc"` | `"price"` | `"none"`. Under
  `auto` the readout keys on the series actually on screen: an OHLC series keeps the full
  `O H L C · change · Vol`, a close-based one (line, area, step, baseline) shows the price and
  its change alone, and `"none"` removes the on-canvas legend entirely.

  This is a correctness fix wearing a feature's clothes. A line chart draws ONE number per bar
  and the legend printed four — a high and a low the reader cannot see anywhere in the shape in
  front of them, inviting them to read a bar's range off a series that never plotted one. It
  resolves against the live type rather than the seeded prop, so a user switching candles→line
  in the toolbar sees the readout follow.

- **`InstrumentHeader.metrics`** — a full-width slot beneath the identity and price rows, for the
  values that CHANGE: an OHLC + volume readout, a spread, a countdown. `stats` renders static
  instrument facts and the widget styles those itself; `metrics` is a slot because the widget
  cannot know that a host colours its open against the previous close, or abbreviates volume in
  lakhs. It is the supported way to lift the bar readout out of the canvas and into real chrome,
  where it can be laid out, aligned and read.

- **The script editor expands into a real workspace.** It was a dock pinned to 62% of the chart
  height — on a 360px chart that is ~220px holding a source pane, a library browser, an error
  strip, a sweep and a full backtest scorecard with a per-symbol table. Every one of those was
  given its own scrolling slit, so reading a result meant scrolling a 150px window inside a
  220px window, and the editor covered the chart it was testing.

  A toggle in the header now takes it to the full chart area, and past 720px the source sits
  BESIDE the results rather than above them — reading a backtest against the code that produced
  it is the whole task, and it was the one layout the dock could not do. Collapsed, it is the
  old dock unchanged. Narrow stays single-column: splitting a phone into two columns makes both
  unreadable, which is the problem, not the fix.

- **`TradePlan` / `plan`** — a bracket drawn as a POSITION rather than three loose lines: a
  reward zone from entry to target, a risk zone from entry to stop, shaded and stopping at the
  entry from both sides so the boundary between them IS the entry. Whether a plan is worth
  taking is mostly the ratio of those two areas, and the eye reads areas far faster than it
  reads three labelled numbers and does the arithmetic.

  Distinct from the `longpos` drawing TOOL, which the user places and owns: a plan comes from
  the host, cannot be selected or dragged, never enters `getDrawings()`, and survives "clear all
  drawings" — so it cannot be nudged out of agreement with the model that produced it. Drawn
  under the series, because a translucent fill over the candles tints the very bars the reader
  is judging the plan against.

- **`onReady`** — hands the host the live `Chart` (and `null` on teardown). For chrome the
  widget cannot host: a range strip in the host's own header, a layout that needs `showSince`,
  a host keyboard shortcut. Everything the toolbar does is reachable through it, so hiding the
  toolbar no longer costs its capabilities — which is what forced hosts to choose between a
  clean chart and a controllable one.

- **A drawing on/off switch, first in the rail.** The rail was always-on whenever `drawingRail`
  was set, with no way to put the tools away. The new first item collapses it to a single icon
  — and resets the active tool to the crosshair, because a "drawing off" that still draws on the
  next click is not off.

### Fixed

- **The initial fit was a desktop measurement hardcoded as a constant.** Every chart opened on
  160 bars regardless of how wide it was. Across a 1200px plot that is a comfortable 7.5px per
  bar; across a 320px phone plot it is TWO PIXELS — a body barely over a pixel with a wick
  somewhere inside it. The chart was not merely small at that size, it was illegible: no candle
  could be read individually, which is the whole reason to draw candles instead of a line. Worse,
  it hit hardest on phones, where the chart is usually the entire screen rather than one card
  among several.

  The fit now follows the plot width at a spacing where a candle is still a candle, floored at
  30 bars and capped at the same 160 — desktop fits are byte-identical, narrow ones stop opening
  crushed. A reader can always zoom out; what they could not do was un-crush a chart that opened
  that way. `fitBarCount` is exported and pinned by tests.

## [0.7.2] - 2026-08-13

### Fixed

- **The left chip column could invert, and pointed nowhere when zoomed out.** 0.7.1
  gave the chips collision slots but handed them out in host order, so the column's
  vertical sequence did not match the prices — a stop above a target above an entry.
  A reader takes a stacked column as ordered, and an unordered one is worse than an
  overlapping one because it is confidently wrong about which level sits where. Chips
  are now placed top-down by price.
- A chip that cannot sit within ~28px of its own line is no longer drawn. Zoomed out, a
  plan's levels compress into a few pixels, and fanning five chips into a 90px column
  left every one of them beside a line it was nowhere near. The line and its right-axis
  tag still carry the number; only the word is dropped, and the word was the part that
  was lying.

## [0.7.1] - 2026-08-13

### Fixed

- **Left price-line chips overlapped each other.** The right-axis pills have always
  stepped apart (`placeAxisTag`), but the chips rode the true price with no collision
  handling — and an entry, a stop and the live price sit within a few percent of one
  another by construction, so two chips hiding a third was the ordinary case rather
  than an edge case. Chips now reserve slots in their own column (independent of the
  axis pills, which they can never overlap), draw a hairline leader back to the real
  level when displaced, and keep their ✕ hit-rect on the drawn chip rather than the
  line — a close button you can see but not click is worse than none.

## [0.7.0] - 2026-08-12

### Added

- **Real icons in the quick dock, command palette and pin editor.** The drawing rail always
  drew SVG icons, but those three surfaces fell back to raw Unicode (`▮ ⊢ ◫ ∿ ⌐ ◺ ⇌ ▤ ⌇ ⚙ ⬇ ◑`).
  Unicode is typography, not iconography: it carries a font's own weight and baseline instead
  of the stroke width every real icon shares, sits differently on each platform, and several
  of those characters fall back to an entirely different face — beside an SVG icon in the same
  row they read as placeholders. Five missing marks were drawn (settings, fit, realtime, save,
  theme) and `hasIcon` lets a caller fall back deliberately rather than render the placeholder
  dot, which looks like a bug rather than an absence.
- **Keyboard focus, everywhere.** The widget is built from inline styles, which cannot
  express a pseudo-class, so nothing in it had a focus ring — a keyboard user tabbing
  the toolbar, the drawing rail and every menu got no indication of where they were,
  across the whole component. One scoped `:focus-visible` block, keyed on the root's
  data attribute so it cannot leak into the host page, drawn in `currentColor` so it
  follows the theme and stays visible on the light presets.
- **`prefers-reduced-motion`** is now honoured: transitions and animations collapse to
  1ms rather than being merely shortened.

## [0.6.0] - 2026-08-12

### Added

- **Built-in strategy library** — `DEFAULT_STRATEGIES`, 17 self-contained implementations of
  published techniques (MA/golden cross, Donchian, MACD, Supertrend, ADX, squeeze, RSI/Bollinger/
  CCI/Williams %R/stochastic reversion, turtle, triple-EMA, ROC, money-flow). A bare consumer gets
  a usable library out of the box instead of having to define one; extend by spreading your own
  into the array (`library={[...DEFAULT_STRATEGIES, ...mine]}`). Source of truth is
  `strategies/*.piton`, regenerated by `scripts/gen-strategies.mjs`.

- **A saveable strategy layer** in `ScriptEditor` / `TradingChart`. New optional props —
  `savedLibrary`, `onSave`, `onSaveAs` (via `onSaveScript` / `onSaveAsScript` on `TradingChart`),
  `onSelectSaved` / `onDeleteSaved` (`onDeleteSavedScript`), and `dirty` — render a "Yours ·
  editable" section beside the read-only built-ins, with Save / Save-as / delete and an optional
  per-entry profitability `badge`. The host owns persistence; the editor never talks to the
  network. `onBacktestScript` now also receives the loaded strategy's id, so a host can cache the
  score against it. `SavedStrategy` type exported. All props optional — a host without persistence
  is unaffected.

## [0.5.0] - 2026-08-12

### Added

- **Forward projection** — `Projection`, `Chart.setProjection()` and `TradingChart`'s
  `projection` prop draw model output in the empty margin PAST the newest bar: a
  dashed centre line, an optional band, and a hairline marking where record stops
  and claim begins.

  Projected columns are not bars and the engine keeps it that way — they never
  enter the OHLC readout, the bar count, indicator inputs, volume or replay, so
  the rule that the engine never invents a bar it wasn't given still holds. The
  crosshair now emits `onCrosshair(null, …)` over a projected column with the
  projection's own values, instead of silently reporting the last real bar's OHLC
  and timestamp for a cursor sitting over the forecast.

  A projection is cleared automatically by `setData`: computed against one series,
  it is meaningless against another.

### Fixed

- The right margin was the literal `barSpacing * 6` at four call sites that all had
  to agree; it is now one `rightMarginBars()`, and the pan floor is derived from it
  so a projection can always be reached by dragging.
- The hover-column tint clamped to the last bar, lighting up the newest candle
  while the pointer sat past it.

## [0.4.0] - 2026-08-12

### Added

- **Instrument header** — a `header` prop (`InstrumentHeader`) rendering ticker,
  name, sector, reference stats and the headline price above the toolbar. Every
  field is optional and an absent one is omitted rather than dashed, since
  instrument metadata is never uniformly available (an index has no sector; a new
  listing has no 52-week range). `priceSlot` hands the price block back to the
  host for animated tickers.
- `ChartOptions.utc` (and `TradingChart`'s `utc` prop) — read bar times as UTC
  rather than in the viewer's local zone, for timestamps stored as exchange
  wall-clock. It governs the time axis, the crosshair readout AND the session
  shading together, so the chart cannot end up with two clocks.

### Fixed

- **The intraday time axis was unreadable.** It labelled every day boundary with a
  clock time, so a chart of an exchange with a fixed open printed the session open
  over and over — a real NEPSE 1H chart read `07:00 07:00 07:00 08:00 07:00`
  across its whole width. Boundaries now carry the DATE and ticks between them
  carry the time, and labels no longer appear only at boundaries (so a chart
  zoomed inside one day is still labelled). Pinned by tests.
- **Axis and crosshair times were rendered in the reader's timezone.** Same defect
  the 0.3.0 session-shading fix addressed, in the two places it was missed: the
  same chart labelled its bars differently in Kathmandu and New York.
- The toolbar repeated the instrument ticker even when `header` already displayed
  it, printing the same word three times with the on-canvas legend.
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
