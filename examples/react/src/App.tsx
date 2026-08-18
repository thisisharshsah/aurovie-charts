// React usage: mount <TradingChart> with a DataFeed, and dock a <TradeTicket> beside it.
// With the published package:
//   import { TradingChart, TradeTicket, ChartWorkspace } from "aurovie-charts/react";
//   import { EMPTY_ORDER } from "aurovie-charts";
//   import type { DataFeed, DataFeedResult } from "aurovie-charts";
import { useState } from "react";
import { ChartWorkspace, TradeTicket, TradingChart } from "../../../react/index.ts";
import { EMPTY_ORDER } from "../../../src/index.ts";
import type { DataFeed, DataFeedResult, TicketOrder } from "../../../src/index.ts";

// A demo feed that synthesizes bars — replace getBars with your own data source.
const demoFeed: DataFeed = {
  async getBars(): Promise<DataFeedResult> {
    const bars = Array.from({ length: 400 }, (_, i) => {
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
  // Two host-owned settings, DECLARED rather than drawn: the widget renders them in its own
  // bottom bar, in the same button as the Auto / Log / % switches beside them.
  const [basis, setBasis] = useState("market");
  const [range, setRange] = useState("1M");
  // The ticket is fully controlled — the host holds the order, the ticket renders it.
  const [order, setOrder] = useState<TicketOrder>({ ...EMPTY_ORDER, qty: 100, stop: 96, target: 112 });

  return (
    <ChartWorkspace
      aside={
        <TradeTicket
          order={order}
          onChange={(patch) => setOrder((o) => ({ ...o, ...patch }))}
          symbol="DEMO"
          quote={{ last: 103.4, bid: 103.38, ask: 103.42, changePct: 0.42 }}
          account={{ equity: 250_000, buyingPower: 500_000 }}
          currency="USD"
          onSubmit={() => alert("the host owns the submit")}
        />
      }
    >
      <TradingChart
        datafeed={demoFeed}
        symbol="DEMO"
        resolution="60"
        timeframes={[
          { label: "1H", value: "60" },
          { label: "1D", value: "1D" },
        ]}
        ranges={[
          { label: "1W", days: 7, note: "Hourly bars" },
          { label: "1M", days: 30, note: "Hourly bars" },
          { label: "ALL", days: null, title: "The whole history" },
        ]}
        range={range}
        onRangeChange={(r) => setRange(r.label)}
        settings={[
          {
            id: "basis",
            label: "Prices",
            value: basis,
            onChange: setBasis,
            options: [
              { value: "market", label: "Market", title: "As traded" },
              { value: "adjusted", label: "Adjusted", title: "Back-adjusted for corporate actions", note: "1 event" },
            ],
          },
        ]}
        height={600}
      />
    </ChartWorkspace>
  );
}
