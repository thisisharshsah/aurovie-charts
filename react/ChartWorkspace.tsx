"use client";
// The chart-and-ticket layout, so a host does not rebuild it. It is a small component for an
// unglamorous reason: the two halves have to agree about width, and every host that hand-rolled
// this got a ticket that either squeezed the plot on a laptop or floated in a 700px column on a
// wide monitor. Measured on the CONTAINER, not the viewport — a workspace inside a split pane is
// narrow no matter how wide the window is.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

export interface ChartWorkspaceProps {
  /** The chart. Given the remaining width and the full height. */
  children: ReactNode;
  /** The docked panel — normally a `TradeTicket`. Omitted, the chart simply gets the whole width. */
  aside?: ReactNode;
  /** Which edge the panel docks to. */
  side?: "right" | "left";
  /** Panel width in px while docked. Below `breakpoint` the panel stacks under the chart instead. */
  asideWidth?: number;
  /**
   * Container width under which the layout stacks. Defaults to 880 — narrower than that, a
   * 340px panel leaves the plot under 500px, which is where a candle stops being legible.
   */
  breakpoint?: number;
  gap?: number;
  style?: CSSProperties;
  className?: string;
}

export function ChartWorkspace({ children, aside, side = "right", asideWidth = 340, breakpoint = 880, gap = 12, style, className }: ChartWorkspaceProps) {
  const ref = useRef<HTMLDivElement>(null);
  // Start docked. A stacked first paint that immediately re-docks is a visible jump on every
  // desktop load, and desktop is the common case for a workspace.
  const [wide, setWide] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setWide(e.contentRect.width >= breakpoint));
    ro.observe(el);
    return () => ro.disconnect();
  }, [breakpoint]);

  const docked = wide && !!aside;

  return (
    <div
      ref={ref}
      className={className}
      style={{
        display: "flex",
        flexDirection: docked ? (side === "left" ? "row-reverse" : "row") : "column",
        alignItems: "stretch",
        gap,
        minWidth: 0,
        ...style,
      }}
    >
      {/* minWidth:0 — without it a flex child refuses to shrink below its content, and a chart
          with a wide legend pushes the panel off the edge instead of narrowing. */}
      <div style={{ flex: "1 1 auto", minWidth: 0 }}>{children}</div>
      {aside && <div style={{ flex: docked ? `0 0 ${asideWidth}px` : "1 1 auto", minWidth: 0, width: docked ? asideWidth : "100%" }}>{aside}</div>}
    </div>
  );
}
