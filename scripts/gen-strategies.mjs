// Regenerate react/strategies.ts from the package-local .piton files (the source of truth).
// Run: node scripts/gen-strategies.mjs  — after adding or editing a strategy in strategies/.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SRC_DIR = `${ROOT}strategies`;
const OUT = `${ROOT}react/strategies.ts`;

// Canonical presentation order: baselines first, then the techniques that need more explaining.
const ORDER = [
  "ma-crossover", "atr-trailing-stop", "donchian-breakout", "macd-signal-cross",
  "supertrend-follow", "adx-trend-filter", "squeeze-breakout", "rsi-mean-reversion",
  "bollinger-reversion", "golden-cross", "turtle-55-20", "triple-ema-ribbon",
  "stochastic-cross", "cci-reversal", "williams-r-reversion", "roc-momentum",
  "mfi-volume-reversion",
];

// The leading `//` block, minus its first line (the title). A strategy opens with its own
// explanation, so the prose is everything before the first non-comment line.
function leadingComment(src) {
  const out = [];
  for (const raw of src.split("\n")) {
    const t = raw.trim();
    if (t === "" && out.length === 0) continue;
    if (t.startsWith("//")) out.push(t.slice(2).trim());
    else break;
  }
  if (out.length) out.shift();
  return out.join("\n").trim();
}

const entries = ORDER.map((id) => {
  const source = readFileSync(`${SRC_DIR}/${id}.piton`, "utf8");
  const decl = source.match(/(?:strategy|indicator)\s*\(\s*"([^"]*)"/);
  return {
    id,
    title: decl ? decl[1] : id,
    description: leadingComment(source),
    overlay: /overlay\s*=\s*true/.test(source),
    source,
  };
});

const body = entries
  .map(
    (e) =>
      `  {\n    id: ${JSON.stringify(e.id)},\n    title: ${JSON.stringify(e.title)},\n    description: ${JSON.stringify(
        e.description,
      )},\n    overlay: ${e.overlay},\n    source: ${JSON.stringify(e.source)},\n  },`,
  )
  .join("\n");

const file = `// Built-in strategy library — 17 independent implementations of published techniques (Donchian's
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
${body}
];
`;

writeFileSync(OUT, file);
console.log(`wrote ${entries.length} strategies → ${OUT}`);
