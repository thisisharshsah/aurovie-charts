// React usage: mount <TradingChart> with a DataFeed. With the published package:
//   import { TradingChart } from "aurovie-charts/react";
//   import type { DataFeed, DataFeedResult } from "aurovie-charts";
import { TradingChart } from "../../../react/index.ts";
import type { DataFeed, DataFeedResult } from "../../../src/index.ts";

// A demo feed that synthesizes bars — replace getBars with your own data source.
const demoFeed: DataFeed = {
  async getBars(): Promise<DataFeedResult> {
    const bars = Array.from({ length: 120 }, (_, i) => {
      const time = 1_700_000_000 + i * 3_600;
      const open = 100 + Math.sin(i / 7) * 6;
      const close = open + (Math.sin(i / 4) - 0.5) * 3;
      return {
        time,
        open,
        high: Math.max(open, close) + 1,
        low: Math.min(open, close) - 1,
        close,
        volume: 500,
      };
    });
    return { bars };
  },
};

export default function App() {
  return (
    <TradingChart
      datafeed={demoFeed}
      symbol="DEMO"
      resolution="60"
      timeframes={[
        { label: "1H", value: "60" },
        { label: "1D", value: "1D" },
      ]}
      height={600}
    />
  );
}
