# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/) and the project adheres to
[Semantic Versioning](https://semver.org/).

## [0.10.1] - 2026-08-18

### Fixed

- **A lit range pill did not mean the chart was showing that range.** The strip moved the
  viewport on a CLICK and nowhere else — so a host that persists the choice (which is exactly
  what `range` is for) opened with "YTD" lit over whatever the engine's initial fit produced: at
  most 160 bars, about eight months of daily data. On an instrument with seven years of history
  every bar was loaded and pannable, and the chart still was not showing the window it claimed
  to be. A control that reports a state it is not in is worse than no control, because nothing
  invites the reader to doubt it.

  The active preset is now re-asserted after each series load (`setData` refits, which would
  otherwise discard it) and whenever a controlled `range` changes. Not on every tick: a poll that
  appends a bar must not yank a viewport the reader has since panned. Uncontrolled charts are
  unchanged — the click stays the only trigger, and a chart that has never had a preset picked
  still opens on the engine's fit.

- **Every theme drew a grid nobody could see.** Measured against its own background, each preset
  sat between 1.13:1 and 1.28:1 — and a hairline under about 1.35:1 is not a faint line, it is no
  line at all. The plot read as a void: nothing to place a candle against, no sense of where the
  chart surface even was. Grid is now ~1.45:1 and border ~1.70:1 in all nine presets, light ones
  included, and a test holds the floor — the failure is invisible to whoever edits the palette,
  because they are picking colours beside each other rather than measuring one on the other, which
  is how it survived nine themes.

- **The long/short position tool contradicted itself.** The Δ carried a hard-coded `+` on the
  target and `−` on the stop — the signs a canonical plan happens to have — while the percentage
  beside it was computed from where the levels actually sit. Drag them the other way and one chip
  read `+535.6 (−40.89%)`: plus points, minus percent, in the same breath. Both halves now come
  from the same subtraction.

  Each chip also names itself (`Target …`, `Stop …`). `−731.2 (+55.82%) · $1,000` never said what
  it was a distance *to*, leaving target and stop to be told apart by colour — exactly the
  inference that fails on a plan drawn the unusual way round. And a plan that IS drawn the wrong
  way round now says so: both legs are measured as distances, so a long taking profit below its
  entry still produces a healthy-looking R/R and two confident chips, and the zones are painted by
  role so the green sits under the target wherever the target is. Nothing in the geometry could
  report it; it had to be words.

### Changed

- **The bottom bar drops its `RANGE` and `PRICES` captions.** A row reading
  `RANGE 1D 1W 1M … PRICES Market Adjusted` spends two words telling a reader what a lit pill
  already tells them — the selected option *is* the label. `ChartSettingGroup.label` is unchanged
  and still does real work where it is not redundant: the group's accessible name, the compact
  sheet's title, the tooltip. The buttons also take the toolbar's shape and lit state rather than
  a smaller cousin's, since matching that selected-option look is the whole mechanism.

## [0.10.0] - 2026-08-18

### Added

- **A real compact layout for phones — `compact`.** `"auto"` (the default) turns it on when the
  widget MEASURES under 560px, so it follows the box the chart is actually in rather than the
  viewport: a chart in a phone-width column on a desktop gets it, a tablet in landscape does not.
  `true`/`false` decide it yourself.

  The old narrow handling hid the ticker and collapsed the interval tabs and stopped there. That
  left thirteen labelled controls in a wrapping toolbar — three rows on a 360px screen — over a
  bottom bar that wrapped to two, which is roughly 140px of chrome around a plot that had about
  300px to work with. The chart was losing an argument with its own controls.

  Compact is **one row that scrolls instead of wrapping**, because wrapping is the wrong failure
  mode for chart chrome: every row it adds comes out of the plot, silently, and the reader cannot
  get it back. On the surface stay the four decisions a phone user actually makes — interval,
  series, indicators, draw. Everything else moves into **one bottom sheet**, reachable from the
  toolbar's `⋯` and from the bottom bar's `⚙` alike, so a host that hides the toolbar entirely
  (a glance view) still leaves every control reachable. Nothing is removed; the reclaimed height
  goes straight to the plot, which is a flex child.

  Also in compact: 32px touch targets (a 29px control is fine under a cursor and a coin-toss
  under a finger, and a mis-tap on a chart toolbar changes the chart); the drawing rail's tools
  in the sheet rather than a fixed column taken from a 360px plot; the indicator picker as a
  sheet instead of a 326px panel pinned to a 360px screen's corner; and an **armed-tool chip**
  over the plot — without a rail, an armed trend line was invisible state, and every subsequent
  tap drew a line the reader did not ask for with nothing on screen saying why.

  `TradeTicket` takes `compact: "auto"` on the same terms, measured at 380px.

### Fixed

- **`timeframes` was accepted and then ignored.** The interval tabs came from a hard-coded
  `TF_ORDER` and the ▾ menu from a hard-coded `INTERVAL_GROUPS`, so a host that carefully
  declared the four resolutions its backend serves still got a menu offering nine — five of them
  returning nothing. Same dead-button problem `ranges` documents, and worse in compact, where
  that list is the only interval control on the screen. A host value the widget has no group for
  is now listed under "Other" rather than dropped: the host serves it, so hiding it would be the
  widget overruling the feed about its own data.

## [0.9.0] - 2026-08-18

### Added

- **`settings` — host chart controls the WIDGET draws.** The bottom bar has always taken a
  `footer` slot, and every host filled it with buttons styled from its own design system. So the
  one row that is most obviously part of the chart ended up carrying two vocabularies: a range
  strip in the host's pill shape, a price-basis toggle in the host's colours, and the widget's own
  scale switches beside them, all claiming to be settings for the same chart. The host controls
  looked like they had been parked next to the chart rather than belonging to it.

  A `ChartSettingGroup` is declared, not drawn: a label, a value, a list of options and a change
  handler. The widget renders it in the same button as `Auto` / `Log` / `%`, laid out as a
  segmented row or collapsed behind a menu past four options, with the menu opening UPWARD
  because this is the last row of the widget and a menu dropping below it lands outside any host
  that clips its own corners. An option can carry a `note` — a fact about the CURRENT selection
  ("1 event"), which is printed only while that option is active, so it can never describe a
  basis the chart is not drawing.

  `footer` is unchanged and still right for anything that is not a choice between options.

- **`range`** — the active range preset, by label, for a host that persists the choice. Left
  uncontrolled the widget tracks the last preset picked, as before; passed a value the strip
  follows the host, so a window restored from storage lights the pill it came from instead of
  opening with nothing selected.

- **`RangePreset.days` accepts a thunk**, and gains `title` and `note`. A year-to-date or
  fiscal-year window is a different number of days every day, so hosts were computing it at click
  time in their own strip rather than using the widget's — the thunk is resolved on the click,
  not when the list was built, so a page left open overnight does not keep measuring YTD from
  yesterday's boundary. `note` says what the range COSTS to draw ("Daily bars"): picking a range
  usually changes the resolution too, a pill has room for a label and nothing else, and without
  it the series silently changed under the reader.

- **`TradeTicket`** (`aurovie-charts/react`) — an order ticket in the chart's own vocabulary:
  the same theme, the same button shapes, the same tabular numerals as the plot beside it. Fully
  controlled and purely presentational — it holds no order state, makes no request, and knows
  nothing about a broker. Side, order type, time-in-force, size by shares / cash / percent of
  equity risked, limit and trigger prices with bid·mid·ask snapping off the real top of book, a
  bracket, an estimated cost against buying power, and a risk readout.

  Three things it does that a hand-rolled ticket usually does not. The SIDE is stated by the
  whole card — a hairline in the side's colour down the leading edge — not only by a toggle the
  size of the venue picker, because mistaking a sell ticket for a buy one is the expensive
  mistake. Sizing by cash or by risk shows the share count it RESOLVED to, rather than leaving
  the reader to discover the rounding on the fill. And every figure whose inputs are missing is
  omitted rather than printed as a zero: risk computed against an absent stop is not a
  conservative estimate, it is a fabricated one, and it would render as the most confident
  number on the ticket.

  `submitSlot` replaces the action for a hold-to-confirm or two-step arm; `checks` renders a
  host's pre-trade gate as a checklist and blocks the action while any of it fails.

- **`deriveTicketRisk` / `bracketCoherent` / `EMPTY_ORDER`** — the ticket's arithmetic, exported
  from the React-FREE core. A host almost always needs the same figures outside the ticket (to
  gate a submit, to draw the plan on the chart, to log what was risked), and two implementations
  of one calculation is exactly how a ticket ends up disagreeing with the chart next to it.
  `bracketCoherent` catches the failure the ratio cannot show: both legs are measured absolute,
  so a long whose stop sits above its entry produces a perfectly healthy-looking 1:2.

- **`ChartWorkspace`** — the chart-and-panel layout, measured on the CONTAINER rather than the
  viewport, because a workspace inside a split pane is narrow no matter how wide the window is.
  Below the breakpoint the panel stacks under the chart instead of squeezing the plot past the
  width where a candle stops being legible.

### Changed

- **The range strip moved from the toolbar to the bottom bar.** In the toolbar it sat among the
  interval tabs — and those pick the width of a BAR while these pick the width of the WINDOW,
  with "1D" and "1W" printed in both rows, in the same pill, one lit in each. A reader has no way
  to tell which governs what they are looking at, and clicking the wrong one does something they
  did not ask for. The bottom bar already holds the scale switches, which are the same kind of
  control: how this chart is drawn, not what is drawn on it. The strip is now captioned `RANGE`,
  which ends the collision outright.

## [0.8.19] - 2026-08-14

### Added

- **`Theme.entry`** — the colour of a `TradePlan`'s entry rule. Optional, falling back to
  `textStrong` as before.

  Entry is the one level on a plan that is not an outcome, so it must not borrow `up` or `down`.
  But `textStrong` was not right either: it is the theme's most emphatic ink, so a *reference*
  level drew as the heaviest line on the chart, and it inverts between light and dark while the
  level it marks does not. A host that gives entry its own colour — gold is the convention for a
  resting order — can now have the plan agree with its own price rules instead of drawing the
  same level two different ways.

## [0.8.18] - 2026-08-14

### Changed

- Radii eased back a notch from 0.8.17: controls 12px → 10px, menus 14px → 12px, frame 16px →
  14px. 0.8.17 corrected a real mismatch (8px widget buttons beside 12px host ones) by moving the
  whole ramp up, and overshot — at 12px a 26px-tall button is most of the way to a capsule, which
  reads as soft rather than precise on a control that sits beside a price.

## [0.8.17] - 2026-08-13

### Changed

- **Softer, and consistent, corner radii.** Controls went 8px → 12px, menus and popovers
  10px → 14px, the widget frame 12px → 16px. The old ramp was terminal geometry — correct for a
  tool, dated beside a product — and it also left a visible seam for any host whose own controls
  sit next to the widget's: a 12px host button beside an 8px widget button reads as two
  components sharing a row, which is exactly what a `footer` slot is meant to avoid.

## [0.8.16] - 2026-08-13

### Added

- **`footer`** — host content for the left of the bottom bar, beside the scale and navigation
  switches. A range strip and a view toggle belong to the chart but are not the widget's to own,
  and without a slot a host has to stack its own row directly against this one — spending a
  border and a strip of height to insist the two groups are different kinds of thing when both
  are just "settings for this chart".

## [0.8.15] - 2026-08-13

### Fixed

- **Crash — "Cannot read properties of undefined (reading 'low')" on a chart with no bars yet.**
  `visible()` clamped both ends of the range into `[0, n - 1]`, and with `n === 0` that is
  `[0, -1]`, so clamping 0 gives **-1 for both ends**. Every `for (i = f; i <= l)` in the engine
  then ran exactly once against bar -1.

  It was latent until 0.8.12: the only path that reached the autoscale was `draw()`, which
  returns early on an empty chart. `setAxes` re-lays out on demand and can arrive before the
  first bar does. The clamp is now `visibleIndexRange`, exported and tested, and returns an
  inverted range for an empty series so those loops run zero times — which is what "nothing is
  visible" should mean. `priceTarget` also short-circuits on an empty series rather than
  returning an `Infinity` range.

- `setAxes` no longer relayouts when the resolved gutter widths are unchanged. Hosts pass object
  literals, which are a new reference every render, so a re-render repainted the whole chart for
  a value that had not changed.

## [0.8.14] - 2026-08-13

### Fixed

- **A closed plan's entry, target and stop all read as the same colour.** 0.8.13 pushed history
  back by fading it, and at the alpha needed to stop a season of trades burying the live call,
  green, red and the neutral entry rule collapsed into one grey wash — colour was carrying the
  meaning and opacity was destroying it.

  Live plans are now FILLED and closed ones OUTLINED: the difference is shape rather than
  opacity. A filled band reads as far heavier than two hairlines, so history still recedes, while
  every line keeps the colour that says what it is.

## [0.8.13] - 2026-08-13

### Added

- **`plan` accepts an array, and `TradePlan` gains `to`.** A chart normally carries a live call
  plus the closed ones behind it, and those are the same object with different dates rather than
  two features. `to` bounds a plan's right edge; a plan with `to` set is history and draws back
  (lighter fill, softer edges), so a season of past calls cannot bury the one being carried.

  This exists so past trades can be shown in the SAME visual language as the current one. A
  marker glyph can say a trade happened and nothing else — not what was risked, not whether the
  target was ever reached. The zones say all of it, and a reader learns one vocabulary instead
  of two.

## [0.8.12] - 2026-08-13

### Fixed

- **`axes` was construction-only, so toggling it did nothing.** It was read once in the Chart
  constructor; a host switching the same mounted widget between a bare glance view and a full
  chart kept whatever it was built with. A chart built bare stayed bare — which reads as the
  price and time scales being broken, not as a prop being ignored. `Chart.setAxes()` applies it
  live and the React binding calls it on change.

### Added

- **`axes` accepts `{ price, time }`** as well as a boolean, so a host can keep one gutter and
  drop the other. That is what a glance chart usually wants: a price scale but no time scale,
  because "what is it worth" survives the loss of chrome and "which Tuesday" mostly does not.

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
