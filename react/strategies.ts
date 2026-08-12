// Built-in strategy library — 17 independent implementations of published techniques (Donchian's
// channel, Wilder's RSI and ADX, Appel's MACD, Bollinger's bands, …). A trading RULE is not a
// copyrightable work; someone else's source code is. Nothing here is transcribed from another
// platform, and each entry names the technique it implements.
//
// GENERATED — do not edit by hand. Source of truth: the strategies/*.piton files.
// Re-run scripts/gen-strategies.mjs after adding or editing one.
//
// These ship WITH the chart so a bare consumer gets a usable library out of the box, rather than
// having to define one. They are ordinary data: extend by spreading your own into the array —
//   library={[...DEFAULT_STRATEGIES, ...myStrategies]}
// and override any by id. The host still owns run/backtest/scoring; this is only the suggestion list.
import type { ScriptPreset } from "./ScriptEditor";

export const DEFAULT_STRATEGIES: ScriptPreset[] = [
  {
    id: "ma-crossover",
    title: "MA Crossover",
    description: "Long while the fast average is above the slow one. The oldest published trend rule\nthere is; the 50/200 pairing is the one the financial press calls a \"golden cross\".\n\nIncluded because it is the honest baseline: any strategy that cannot beat this, after\ncosts and out of sample, is not earning its complexity.",
    overlay: true,
    source: "// Moving Average Crossover\n//\n// Long while the fast average is above the slow one. The oldest published trend rule\n// there is; the 50/200 pairing is the one the financial press calls a \"golden cross\".\n//\n// Included because it is the honest baseline: any strategy that cannot beat this, after\n// costs and out of sample, is not earning its complexity.\nstrategy(\"MA Crossover\", overlay = true)\n\nfast = ema(close, 20)\nslow = ema(close, 50)\n\nplot(fast, title = \"Fast\", color = color.accent)\nplot(slow, title = \"Slow\", color = color.mute)\n\nif crossover(fast, slow)\n    strategy.entry(\"trend\", strategy.long)\n\nif crossunder(fast, slow)\n    strategy.close(\"trend\")\n",
  },
  {
    id: "atr-trailing-stop",
    title: "ATR trailing stop",
    description: "Enter long when price closes above its 50-bar average, then protect the position with a stop set\na multiple of ATR below the close and RE-ARMED every bar. The stop only ever tightens in a rising\nmarket because it trails the close; it never widens on the way down, because the exit is taken\nthe moment the level is touched.\n\nThis is the asymmetry the Covenant is built around (BLUEPRINT Part V): small mechanical losses,\noccasional large riding wins. Humans invert it reliably — they take profits like thieves and hold\nlosses like heirlooms. The machine does not hope.\n\nWHAT THE BACKTEST WILL AND WILL NOT TELL YOU. Stops fill intra-bar here, which is honest, but two\ncosts are modelled deliberately pessimistically because the alternative flatters: a bar that GAPS\nthrough the stop fills at the open, not at the stop; and when a bar touches both the stop and a\ntarget, the stop is taken, because which came first is unknowable without tick data.\n@version=1",
    overlay: false,
    source: "// ATR trailing stop — ride the trend, exit mechanically\n//\n// Enter long when price closes above its 50-bar average, then protect the position with a stop set\n// a multiple of ATR below the close and RE-ARMED every bar. The stop only ever tightens in a rising\n// market because it trails the close; it never widens on the way down, because the exit is taken\n// the moment the level is touched.\n//\n// This is the asymmetry the Covenant is built around (BLUEPRINT Part V): small mechanical losses,\n// occasional large riding wins. Humans invert it reliably — they take profits like thieves and hold\n// losses like heirlooms. The machine does not hope.\n//\n// WHAT THE BACKTEST WILL AND WILL NOT TELL YOU. Stops fill intra-bar here, which is honest, but two\n// costs are modelled deliberately pessimistically because the alternative flatters: a bar that GAPS\n// through the stop fills at the open, not at the stop; and when a bar touches both the stop and a\n// target, the stop is taken, because which came first is unknowable without tick data.\n//@version=1\nstrategy(\"ATR trailing stop\")\n\ntrend = sma(close, 50)\natr14 = atr(14)\n\nif close > trend and strategy.position_size == 0\n    strategy.entry(\"L\", strategy.long)\n\n// Re-armed every bar: this is what makes it TRAIL. A stop set once at entry is a fixed stop.\nstrategy.exit(\"L\", close - 3 * atr14, na)\n\n// Stand down when the trend breaks, rather than waiting to be stopped out of a position the regime\n// no longer supports. Cash is a position (Covenant 4).\nif close < trend\n    strategy.close(\"L\")\n\nplot(trend)\n",
  },
  {
    id: "donchian-breakout",
    title: "Donchian Breakout",
    description: "Buy when price closes above the highest high of the last N bars; leave when it closes\nbelow the lowest low of a shorter window. Richard Donchian's channel, and the core of\nthe Turtle Traders' published rules — a technique documented for decades, implemented\nhere from its description.\n\nIt is a TREND system: it loses small and often, and pays for that with rare large wins.\nJudged on win rate it looks terrible. Judged on expectancy it is the reason trend\nfollowing survived fifty years.",
    overlay: true,
    source: "// Donchian Breakout\n//\n// Buy when price closes above the highest high of the last N bars; leave when it closes\n// below the lowest low of a shorter window. Richard Donchian's channel, and the core of\n// the Turtle Traders' published rules — a technique documented for decades, implemented\n// here from its description.\n//\n// It is a TREND system: it loses small and often, and pays for that with rare large wins.\n// Judged on win rate it looks terrible. Judged on expectancy it is the reason trend\n// following survived fifty years.\nstrategy(\"Donchian Breakout\", overlay = true)\n\n[upper, mid, lower] = donchian(20)\n[xUp, xMid, xLow]   = donchian(10)\n\nplot(upper, title = \"Upper\", color = color.mute)\nplot(lower, title = \"Lower\", color = color.mute)\n\n// `upper[1]` is the channel BEFORE this bar — comparing against `upper` would compare the\n// high to a channel that already contains it, and nothing would ever break out.\nif close > upper[1]\n    strategy.entry(\"breakout\", strategy.long)\n\nif close < xLow[1]\n    strategy.close(\"breakout\")\n",
  },
  {
    id: "macd-signal-cross",
    title: "MACD Signal Cross",
    description: "Gerald Appel's moving-average convergence/divergence: the distance between a fast and a\nslow EMA, and an EMA of that distance. Long while the line is above its signal.\n\nThe histogram is the difference between them, so it crosses zero at exactly the same\nbars — it is plotted because it reads more clearly, not because it says anything more.",
    overlay: false,
    source: "// MACD Signal Cross\n//\n// Gerald Appel's moving-average convergence/divergence: the distance between a fast and a\n// slow EMA, and an EMA of that distance. Long while the line is above its signal.\n//\n// The histogram is the difference between them, so it crosses zero at exactly the same\n// bars — it is plotted because it reads more clearly, not because it says anything more.\nstrategy(\"MACD Signal Cross\", overlay = false)\n\n[line, signal, hist] = macd(close, 12, 26, 9)\n\nplot(hist,   title = \"Histogram\", color = color.mute, style = style.histogram)\nplot(line,   title = \"MACD\",      color = color.accent)\nplot(signal, title = \"Signal\",    color = color.s2)\n\nif crossover(line, signal)\n    strategy.entry(\"macd\", strategy.long)\n\nif crossunder(line, signal)\n    strategy.close(\"macd\")\n",
  },
  {
    id: "supertrend-follow",
    title: "Supertrend",
    description: "An ATR-width band that RATCHETS: it may only tighten while price stays on its side, and\nflips when price closes through. Follow the flip.\n\nThe ratchet is the whole indicator — a plain band at mid ± ATR would whipsaw on every\nbar. `dir` is +1 in an uptrend and -1 in a downtrend, and reads 0 during ATR warmup,\nwhich is why the entries test the flip rather than the sign.",
    overlay: true,
    source: "// Supertrend\n//\n// An ATR-width band that RATCHETS: it may only tighten while price stays on its side, and\n// flips when price closes through. Follow the flip.\n//\n// The ratchet is the whole indicator — a plain band at mid ± ATR would whipsaw on every\n// bar. `dir` is +1 in an uptrend and -1 in a downtrend, and reads 0 during ATR warmup,\n// which is why the entries test the flip rather than the sign.\nstrategy(\"Supertrend\", overlay = true)\n\n[line, dir] = supertrend(10, 3)\n\nplot(line, title = \"Supertrend\", color = color.accent)\n\nif dir == 1 and dir[1] == -1\n    strategy.entry(\"trend\", strategy.long)\n\nif dir == -1 and dir[1] == 1\n    strategy.close(\"trend\")\n",
  },
  {
    id: "adx-trend-filter",
    title: "ADX-Filtered Trend",
    description: "A moving-average crossover that only trades when Wilder's ADX says a trend actually\nexists. Below 20, ADX is telling you the market is ranging and a crossover means little.\n\nThe point of including it is comparative: run it beside \"MA Crossover\" and the filter's\nvalue shows up as fewer trades, not as a better win rate. Whether that is worth it is an\nexpectancy question, which is what the scorecard answers.",
    overlay: true,
    source: "// ADX-Filtered Trend\n//\n// A moving-average crossover that only trades when Wilder's ADX says a trend actually\n// exists. Below 20, ADX is telling you the market is ranging and a crossover means little.\n//\n// The point of including it is comparative: run it beside \"MA Crossover\" and the filter's\n// value shows up as fewer trades, not as a better win rate. Whether that is worth it is an\n// expectancy question, which is what the scorecard answers.\nstrategy(\"ADX-Filtered Trend\", overlay = true)\n\nfast = ema(close, 20)\nslow = ema(close, 50)\n[adxv, plusDi, minusDi] = adx(14)\n\ntrending = adxv > 20\n\nplot(fast, title = \"Fast\", color = color.accent)\nplot(slow, title = \"Slow\", color = color.mute)\n\nif crossover(fast, slow) and trending\n    strategy.entry(\"filtered\", strategy.long)\n\nif crossunder(fast, slow)\n    strategy.close(\"filtered\")\n",
  },
  {
    id: "squeeze-breakout",
    title: "Squeeze Breakout",
    description: "Volatility coils, then releases. When the Bollinger bands sit INSIDE the Keltner\nchannels, range is unusually tight; the trade is the direction price leaves in.\n\nThis is the classic squeeze construction (Bollinger bands inside Keltner channels,\npopularised by John Carter's TTM Squeeze), implemented from that public description.",
    overlay: true,
    source: "// Squeeze Breakout\n//\n// Volatility coils, then releases. When the Bollinger bands sit INSIDE the Keltner\n// channels, range is unusually tight; the trade is the direction price leaves in.\n//\n// This is the classic squeeze construction (Bollinger bands inside Keltner channels,\n// popularised by John Carter's TTM Squeeze), implemented from that public description.\nstrategy(\"Squeeze Breakout\", overlay = true)\n\n[bbUp, bbMid, bbLo] = bb(close, 20, 2)\n[kcUp, kcMid, kcLo] = keltner(20, 1.5, 20)\n\nsqueezed = bbUp < kcUp and bbLo > kcLo\n\nplot(kcUp, title = \"Keltner upper\", color = color.mute)\nplot(kcLo, title = \"Keltner lower\", color = color.mute)\nplot(squeezed ? kcMid : na, title = \"Squeeze\", color = color.s3, style = style.circles, width = 2)\n\n// Enter on the bar that LEAVES a squeeze upward: coiled last bar, breaking the band now.\nif squeezed[1] and close > bbUp\n    strategy.entry(\"release\", strategy.long)\n\nif close < kcMid\n    strategy.close(\"release\")\n",
  },
  {
    id: "rsi-mean-reversion",
    title: "RSI Mean Reversion",
    description: "Welles Wilder's relative strength index, traded the way he described: buy exhaustion\nbelow 30, leave on the return to the middle.\n\nRead its numbers carefully. Mean reversion wins often and loses rarely but LARGELY —\nnegative skew — which is exactly the return shape a naive Sharpe flatters. The deflated\nfigure exists for strategies like this one.",
    overlay: false,
    source: "// RSI Mean Reversion\n//\n// Welles Wilder's relative strength index, traded the way he described: buy exhaustion\n// below 30, leave on the return to the middle.\n//\n// Read its numbers carefully. Mean reversion wins often and loses rarely but LARGELY —\n// negative skew — which is exactly the return shape a naive Sharpe flatters. The deflated\n// figure exists for strategies like this one.\nstrategy(\"RSI Mean Reversion\", overlay = false)\n\nr = rsi(close, 14)\n\nplot(r,  title = \"RSI\",        color = color.accent)\nplot(30, title = \"Oversold\",   color = color.mute, style = style.step)\nplot(70, title = \"Overbought\", color = color.mute, style = style.step)\n\nif crossover(r, 30)\n    strategy.entry(\"reversion\", strategy.long)\n\nif crossunder(r, 55)\n    strategy.close(\"reversion\")\n",
  },
  {
    id: "bollinger-reversion",
    title: "Bollinger Reversion",
    description: "John Bollinger's bands: a moving average with rails at two standard deviations. Traded\nas reversion — buy the lower rail, leave at the middle.\n\nBollinger himself warned against exactly this reading: a touch of the lower band in a\ndowntrend is not a bargain, it is a downtrend. It is here because it is the most common\npublished use, and because seeing it fail out of sample teaches more than being told.",
    overlay: true,
    source: "// Bollinger Band Reversion\n//\n// John Bollinger's bands: a moving average with rails at two standard deviations. Traded\n// as reversion — buy the lower rail, leave at the middle.\n//\n// Bollinger himself warned against exactly this reading: a touch of the lower band in a\n// downtrend is not a bargain, it is a downtrend. It is here because it is the most common\n// published use, and because seeing it fail out of sample teaches more than being told.\nstrategy(\"Bollinger Reversion\", overlay = true)\n\n[upper, mid, lower] = bb(close, 20, 2)\n\nplot(upper, title = \"Upper\",  color = color.mute)\nplot(mid,   title = \"Middle\", color = color.accent)\nplot(lower, title = \"Lower\",  color = color.mute)\n\nif crossunder(close, lower)\n    strategy.entry(\"reversion\", strategy.long)\n\nif crossover(close, mid)\n    strategy.close(\"reversion\")\n",
  },
  {
    id: "golden-cross",
    title: "Golden Cross",
    description: "The 50/200-day crossover the financial press names. Slow enough that it trades a\nhandful of times a decade, which is the point: it is a REGIME filter wearing a\nstrategy's clothes, and its value is measured in drawdown avoided, not trades won.\n\nExpect very few out-of-sample trades on any normal window. That is honest evidence of\nnothing rather than evidence of failure — the scorecard says so explicitly.",
    overlay: true,
    source: "// Golden Cross\n//\n// The 50/200-day crossover the financial press names. Slow enough that it trades a\n// handful of times a decade, which is the point: it is a REGIME filter wearing a\n// strategy's clothes, and its value is measured in drawdown avoided, not trades won.\n//\n// Expect very few out-of-sample trades on any normal window. That is honest evidence of\n// nothing rather than evidence of failure — the scorecard says so explicitly.\nstrategy(\"Golden Cross\", overlay = true)\n\nfast = sma(close, 50)\nslow = sma(close, 200)\n\nplot(fast, title = \"SMA 50\", color = color.accent)\nplot(slow, title = \"SMA 200\", color = color.mute)\n\nif crossover(fast, slow)\n    strategy.entry(\"golden\", strategy.long)\n\nif crossunder(fast, slow)\n    strategy.close(\"golden\")\n",
  },
  {
    id: "turtle-55-20",
    title: "Turtle 55/20",
    description: "The Turtles' slower channel: enter on a 55-bar breakout, leave on a 20-bar reversal.\nLonger than the 20/10 variant, so it holds trends further and gives back more at the end.\n\nBoth Turtle systems are in the library on purpose — run them side by side and the\ndifference between them is a lesson about holding period that no single backtest teaches.",
    overlay: true,
    source: "// Turtle System 2 (55/20)\n//\n// The Turtles' slower channel: enter on a 55-bar breakout, leave on a 20-bar reversal.\n// Longer than the 20/10 variant, so it holds trends further and gives back more at the end.\n//\n// Both Turtle systems are in the library on purpose — run them side by side and the\n// difference between them is a lesson about holding period that no single backtest teaches.\nstrategy(\"Turtle 55/20\", overlay = true)\n\n[hi, mid, lo]    = donchian(55)\n[xHi, xMid, xLo] = donchian(20)\n\nplot(hi, title = \"55 high\", color = color.mute)\nplot(xLo, title = \"20 low\", color = color.s2)\n\nif close > hi[1]\n    strategy.entry(\"turtle\", strategy.long)\n\nif close < xLo[1]\n    strategy.close(\"turtle\")\n",
  },
  {
    id: "triple-ema-ribbon",
    title: "Triple EMA Ribbon",
    description: "Hold only while three exponential averages are stacked in order — 8 above 21 above 55.\nThe stack is the filter: any two averages cross constantly, three agreeing is rarer and\nsays the whole term structure of the trend points one way.\n\nIts weakness is the exit. By the time the stack breaks, a good part of the move is gone.",
    overlay: true,
    source: "// Triple EMA Ribbon\n//\n// Hold only while three exponential averages are stacked in order — 8 above 21 above 55.\n// The stack is the filter: any two averages cross constantly, three agreeing is rarer and\n// says the whole term structure of the trend points one way.\n//\n// Its weakness is the exit. By the time the stack breaks, a good part of the move is gone.\nstrategy(\"Triple EMA Ribbon\", overlay = true)\n\nf = ema(close, 8)\nm = ema(close, 21)\ns = ema(close, 55)\n\nplot(f, title = \"EMA 8\",  color = color.accent)\nplot(m, title = \"EMA 21\", color = color.s2)\nplot(s, title = \"EMA 55\", color = color.mute)\n\nstacked = f > m and m > s\n\nif stacked and not stacked[1]\n    strategy.entry(\"ribbon\", strategy.long)\n\nif not stacked\n    strategy.close(\"ribbon\")\n",
  },
  {
    id: "stochastic-cross",
    title: "Stochastic Cross",
    description: "George Lane's oscillator: where the close sits in the recent high/low range. Buy when\n%K crosses above %D while both are still low — momentum turning inside a pullback.\n\nThe oversold condition matters. A bare %K/%D cross fires constantly in a trend and means\nalmost nothing; requiring the cross to happen below 30 is what makes it a signal.",
    overlay: false,
    source: "// Stochastic Cross\n//\n// George Lane's oscillator: where the close sits in the recent high/low range. Buy when\n// %K crosses above %D while both are still low — momentum turning inside a pullback.\n//\n// The oversold condition matters. A bare %K/%D cross fires constantly in a trend and means\n// almost nothing; requiring the cross to happen below 30 is what makes it a signal.\nstrategy(\"Stochastic Cross\", overlay = false)\n\n[k, d] = stoch(14, 3)\n\nplot(k,  title = \"%K\", color = color.accent)\nplot(d,  title = \"%D\", color = color.s2)\nplot(20, title = \"Oversold\", color = color.mute, style = style.step)\n\nif crossover(k, d) and k < 30\n    strategy.entry(\"stoch\", strategy.long)\n\nif crossunder(k, d) and k > 70\n    strategy.close(\"stoch\")\n",
  },
  {
    id: "cci-reversal",
    title: "CCI Reversal",
    description: "Donald Lambert's commodity channel index measures how far price sits from its own mean\nin units of mean deviation. Lambert traded the ±100 band as a trend signal; the reversal\nreading below is the other common published use.\n\nNote the asymmetry: entry needs -100 crossed from below (exhaustion ending), exit takes\nthe return to zero rather than waiting for +100, because the far band arrives rarely.",
    overlay: false,
    source: "// CCI Reversal\n//\n// Donald Lambert's commodity channel index measures how far price sits from its own mean\n// in units of mean deviation. Lambert traded the ±100 band as a trend signal; the reversal\n// reading below is the other common published use.\n//\n// Note the asymmetry: entry needs -100 crossed from below (exhaustion ending), exit takes\n// the return to zero rather than waiting for +100, because the far band arrives rarely.\nstrategy(\"CCI Reversal\", overlay = false)\n\nc = cci(20)\n\nplot(c,    title = \"CCI\", color = color.accent)\nplot(100,  title = \"+100\", color = color.mute, style = style.step)\nplot(-100, title = \"-100\", color = color.mute, style = style.step)\n\nif crossover(c, -100)\n    strategy.entry(\"cci\", strategy.long)\n\nif crossover(c, 0)\n    strategy.close(\"cci\")\n",
  },
  {
    id: "williams-r-reversion",
    title: "Williams %R Reversion",
    description: "Larry Williams' oscillator — the mirror of the stochastic, on a -100..0 scale. Below -80\nis \"oversold\": the close is near the bottom of its recent range.\n\nLike every reversion rule here it wins often and loses rarely but largely. Read the\nexpectancy and the max drawdown, not the win rate.",
    overlay: false,
    source: "// Williams %R Reversion\n//\n// Larry Williams' oscillator — the mirror of the stochastic, on a -100..0 scale. Below -80\n// is \"oversold\": the close is near the bottom of its recent range.\n//\n// Like every reversion rule here it wins often and loses rarely but largely. Read the\n// expectancy and the max drawdown, not the win rate.\nstrategy(\"Williams %R Reversion\", overlay = false)\n\nw = willr(14)\n\nplot(w,   title = \"%R\", color = color.accent)\nplot(-80, title = \"Oversold\",   color = color.mute, style = style.step)\nplot(-20, title = \"Overbought\", color = color.mute, style = style.step)\n\nif crossover(w, -80)\n    strategy.entry(\"wr\", strategy.long)\n\nif crossunder(w, -30)\n    strategy.close(\"wr\")\n",
  },
  {
    id: "roc-momentum",
    title: "ROC Momentum",
    description: "The oldest momentum measurement there is: price now against price N bars ago. Long while\nthe change is positive and turning up.\n\nIt is included as a CONTROL. Momentum this plain is the null hypothesis every more\nelaborate trend strategy in this library should have to beat out of sample — and often\ndoes not.\n\nNOTE, because it cost this file a rewrite: \"rising\" is `r > r[1]`, NOT `r > sma(r, 5)`.\n`sma` reproduces the chart's running sum exactly, including that a single `na` poisons it\npermanently — and `roc` is `na` for its first 20 bars. `sma(roc(close, 20), 5)` is\ntherefore `na` for the WHOLE run, every comparison against it is false, and the strategy\nsilently never trades. Feed an averager only a series that is already warm, or use `nz`\nand accept the zeros it substitutes.",
    overlay: false,
    source: "// Rate-of-Change Momentum\n//\n// The oldest momentum measurement there is: price now against price N bars ago. Long while\n// the change is positive and turning up.\n//\n// It is included as a CONTROL. Momentum this plain is the null hypothesis every more\n// elaborate trend strategy in this library should have to beat out of sample — and often\n// does not.\n//\n// NOTE, because it cost this file a rewrite: \"rising\" is `r > r[1]`, NOT `r > sma(r, 5)`.\n// `sma` reproduces the chart's running sum exactly, including that a single `na` poisons it\n// permanently — and `roc` is `na` for its first 20 bars. `sma(roc(close, 20), 5)` is\n// therefore `na` for the WHOLE run, every comparison against it is false, and the strategy\n// silently never trades. Feed an averager only a series that is already warm, or use `nz`\n// and accept the zeros it substitutes.\nstrategy(\"ROC Momentum\", overlay = false)\n\nr = roc(close, 20)\nrising = r > r[1]\n\nplot(r, title = \"ROC\", color = color.accent)\nplot(0, title = \"Zero\", color = color.mute, style = style.step)\n\nif crossover(r, 0) and rising\n    strategy.entry(\"roc\", strategy.long)\n\nif crossunder(r, 0)\n    strategy.close(\"roc\")\n",
  },
  {
    id: "mfi-volume-reversion",
    title: "Money Flow Reversion",
    description: "The money flow index is RSI weighted by volume: it asks not just whether price rose, but\nwhether volume came with it. Below 20 is exhaustion with the sellers spent.\n\nIt is the only reversion rule here that can see volume, which is exactly why it belongs\nbeside RSI — compare the two on the same instrument and the difference IS the information\nvolume adds, measured rather than asserted.",
    overlay: false,
    source: "// Money Flow Reversion\n//\n// The money flow index is RSI weighted by volume: it asks not just whether price rose, but\n// whether volume came with it. Below 20 is exhaustion with the sellers spent.\n//\n// It is the only reversion rule here that can see volume, which is exactly why it belongs\n// beside RSI — compare the two on the same instrument and the difference IS the information\n// volume adds, measured rather than asserted.\nstrategy(\"Money Flow Reversion\", overlay = false)\n\nm = mfi(14)\n\nplot(m,  title = \"MFI\", color = color.accent)\nplot(20, title = \"Oversold\",   color = color.mute, style = style.step)\nplot(80, title = \"Overbought\", color = color.mute, style = style.step)\n\nif crossover(m, 20)\n    strategy.entry(\"mfi\", strategy.long)\n\nif crossunder(m, 55)\n    strategy.close(\"mfi\")\n",
  },
];
