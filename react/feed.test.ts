import { test } from "node:test";
import assert from "node:assert/strict";
import { feedSession } from "./TradingChart.tsx";
import type { Bar, DataFeed, DataFeedResult } from "../src/types.ts";

const bar = (time: number, close: number): Bar => ({ time, open: close, high: close, low: close, close, volume: 1 });

// The bleed: switching AAA -> BBB subscribes to BBB at once, while the chart still holds AAA's
// bars. A BBB tick that beats BBB's getBars must not be merged onto AAA.
test("a tick from a new symbol is ignored until that symbol's bars are set", async () => {
  const calls: string[] = [];
  const chart = {
    setData: (bars: Bar[]) => void calls.push(`setData ${bars[0]?.close}`),
    update: (b: Bar) => void calls.push(`update ${b.close}`),
  };
  const ticks = new Map<string, (b: Bar) => void>();
  const pending = new Map<string, (r: DataFeedResult) => void>();
  const feed: DataFeed = {
    getBars: (s) => new Promise((res) => pending.set(s, res)),
    subscribe: (s, _r, on) => (ticks.set(s, on), () => ticks.delete(s)),
  };
  const noop = () => {};

  const stopA = feedSession(chart, feed, "AAA", "1d", noop, noop, noop);
  pending.get("AAA")!({ bars: [bar(1, 100)] });
  await Promise.resolve();
  ticks.get("AAA")!(bar(2, 101));
  stopA();

  feedSession(chart, feed, "BBB", "1d", noop, noop, noop);
  ticks.get("BBB")!(bar(2, 5)); // early: BBB's bars are not in yet
  pending.get("BBB")!({ bars: [bar(1, 4)] });
  await Promise.resolve();
  ticks.get("BBB")!(bar(2, 6));

  assert.deepEqual(calls, ["setData 100", "update 101", "setData 4", "update 6"]);
});
