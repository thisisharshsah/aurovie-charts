// Zero-framework usage: construct a Chart on any HTMLElement and feed it bars.
// With a bundler: `import { Chart, DARK } from "aurovie-charts";`
import { Chart, DARK } from "../../src/index.ts";

const host = document.getElementById("chart")!;
const chart = new Chart(host, { theme: DARK });

// 60 synthetic daily bars — Bar.time is UNIX SECONDS.
const bars = Array.from({ length: 60 }, (_, i) => {
  const time = 1_700_000_000 + i * 86_400;
  const open = 100 + Math.sin(i / 5) * 8;
  const close = open + (Math.sin(i / 3) - 0.5) * 4;
  return {
    time,
    open,
    high: Math.max(open, close) + 1,
    low: Math.min(open, close) - 1,
    close,
    volume: 1000 + i * 10,
  };
});

chart.setData(bars);
