// Line-art icons for the chart controls — a small, consistent set keyed by tool / chart-type /
// action name, so the toolbar reads clearly instead of leaning on ambiguous unicode glyphs.
// Stroke follows `currentColor`, so each icon takes the button's colour automatically.
import type { CSSProperties, ReactNode } from "react";

const ICONS: Record<string, ReactNode> = {
  // ---- cursor / drawing tools ----
  cross: (
    <>
      <line x1="12" y1="3" x2="12" y2="21" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <circle cx="12" cy="12" r="2.4" />
    </>
  ),
  trend: (
    <>
      <line x1="5.5" y1="18.5" x2="18.5" y2="5.5" />
      <circle cx="5.5" cy="18.5" r="1.9" />
      <circle cx="18.5" cy="5.5" r="1.9" />
    </>
  ),
  ray: (
    <>
      <circle cx="5.5" cy="18.5" r="1.9" />
      <line x1="5.5" y1="18.5" x2="21" y2="5" />
    </>
  ),
  extended: (
    <>
      <line x1="3" y1="20.5" x2="21" y2="4.5" />
      <circle cx="8.2" cy="15.9" r="1.6" />
      <circle cx="15.8" cy="9.1" r="1.6" />
    </>
  ),
  hline: (
    <>
      <line x1="3" y1="12" x2="21" y2="12" />
      <circle cx="12" cy="12" r="1.9" />
    </>
  ),
  vline: (
    <>
      <line x1="12" y1="3" x2="12" y2="21" />
      <circle cx="12" cy="12" r="1.9" />
    </>
  ),
  arrow: (
    <>
      <line x1="5" y1="19" x2="18" y2="6" />
      <polyline points="12.5,6 18,6 18,11.5" />
    </>
  ),
  channel: (
    <>
      <line x1="4" y1="15" x2="15" y2="4" />
      <line x1="9" y1="20" x2="20" y2="9" />
    </>
  ),
  pitchfork: (
    <>
      <circle cx="4.2" cy="12" r="1.6" />
      <line x1="4.2" y1="12" x2="20" y2="6" />
      <line x1="4.2" y1="12" x2="20" y2="12" />
      <line x1="4.2" y1="12" x2="20" y2="18" />
    </>
  ),
  rect: <rect x="4" y="6" width="16" height="12" rx="1.5" />,
  ellipse: <ellipse cx="12" cy="12" rx="8.5" ry="6" />,
  fib: (
    <>
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="10" x2="20" y2="10" />
      <line x1="4" y1="14" x2="20" y2="14" />
      <line x1="4" y1="18" x2="20" y2="18" />
    </>
  ),
  brush: (
    <>
      <path d="M4 20 v-3.2 L14.5 6.3 l3.2 3.2 L7.2 20 Z" />
      <line x1="13" y1="7.8" x2="16.2" y2="11" />
    </>
  ),
  text: (
    <>
      <line x1="5.5" y1="6" x2="18.5" y2="6" />
      <line x1="12" y1="6" x2="12" y2="19" />
      <line x1="9.5" y1="19" x2="14.5" y2="19" />
    </>
  ),
  measure: (
    <>
      <rect x="3" y="9" width="18" height="6" rx="1" />
      <line x1="7" y1="9" x2="7" y2="12" />
      <line x1="11" y1="9" x2="11" y2="13" />
      <line x1="15" y1="9" x2="15" y2="12" />
    </>
  ),
  // ---- forecasting: long / short position (risk-reward) ----
  longpos: (
    <>
      <rect x="3.5" y="5" width="12" height="14" rx="1" />
      <line x1="3.5" y1="12" x2="15.5" y2="12" />
      <line x1="19" y1="16.5" x2="19" y2="6" />
      <polyline points="16.7,8.6 19,6 21.3,8.6" />
    </>
  ),
  shortpos: (
    <>
      <rect x="3.5" y="5" width="12" height="14" rx="1" />
      <line x1="3.5" y1="12" x2="15.5" y2="12" />
      <line x1="19" y1="7.5" x2="19" y2="18" />
      <polyline points="16.7,15.4 19,18 21.3,15.4" />
    </>
  ),
  // ---- measurers: price / date / date+price range ----
  pricerange: (
    <>
      <line x1="12" y1="4.5" x2="12" y2="19.5" />
      <polyline points="9,7.5 12,4.5 15,7.5" />
      <polyline points="9,16.5 12,19.5 15,16.5" />
    </>
  ),
  daterange: (
    <>
      <line x1="4.5" y1="12" x2="19.5" y2="12" />
      <polyline points="7.5,9 4.5,12 7.5,15" />
      <polyline points="16.5,9 19.5,12 16.5,15" />
    </>
  ),
  datepricerange: (
    <>
      <rect x="4" y="5.5" width="16" height="13" rx="1" />
      <line x1="4" y1="18.5" x2="20" y2="5.5" />
    </>
  ),
  delete: (
    <>
      <path d="M8.5 5 H20 V19 H8.5 L3 12 Z" />
      <line x1="11.5" y1="9.5" x2="16" y2="14.5" />
      <line x1="16" y1="9.5" x2="11.5" y2="14.5" />
    </>
  ),
  trash: (
    <>
      <line x1="4.5" y1="7" x2="19.5" y2="7" />
      <path d="M9 7 V5 H15 V7" />
      <path d="M6.5 7 L7.5 20 H16.5 L17.5 7" />
      <line x1="10" y1="10.5" x2="10" y2="16.5" />
      <line x1="14" y1="10.5" x2="14" y2="16.5" />
    </>
  ),
  // ---- chart types ----
  candles: (
    <>
      <line x1="8" y1="3.5" x2="8" y2="7" />
      <line x1="8" y1="15" x2="8" y2="20.5" />
      <rect x="6" y="7" width="4" height="8" fill="currentColor" stroke="none" />
      <line x1="16" y1="5" x2="16" y2="8" />
      <line x1="16" y1="16" x2="16" y2="19" />
      <rect x="14" y="8" width="4" height="8" fill="currentColor" stroke="none" />
    </>
  ),
  hollow: (
    <>
      <line x1="8" y1="3.5" x2="8" y2="7" />
      <line x1="8" y1="15" x2="8" y2="20.5" />
      <rect x="6" y="7" width="4" height="8" />
      <line x1="16" y1="5" x2="16" y2="8" />
      <line x1="16" y1="16" x2="16" y2="19" />
      <rect x="14" y="8" width="4" height="8" />
    </>
  ),
  bars: (
    <>
      <line x1="8" y1="4" x2="8" y2="18" />
      <line x1="8" y1="7" x2="5" y2="7" />
      <line x1="8" y1="14" x2="11" y2="14" />
      <line x1="16" y1="6" x2="16" y2="20" />
      <line x1="16" y1="9" x2="13" y2="9" />
      <line x1="16" y1="16" x2="19" y2="16" />
    </>
  ),
  heikin: (
    <>
      <line x1="12" y1="3.5" x2="12" y2="7" />
      <line x1="12" y1="16" x2="12" y2="20.5" />
      <rect x="9" y="7" width="6" height="9" fill="currentColor" stroke="none" />
    </>
  ),
  line: <polyline points="3,16 8,10 13,13 21,5" />,
  step: <polyline points="3,17 8,17 8,10 14,10 14,13 21,13" />,
  area: (
    <>
      <path d="M3 16 L9 10 L14 13 L21 6 L21 20 L3 20 Z" fill="currentColor" stroke="none" opacity="0.22" />
      <polyline points="3,16 9,10 14,13 21,6" />
    </>
  ),
  baseline: (
    <>
      <line x1="3" y1="12" x2="21" y2="12" strokeDasharray="2 2" />
      <polyline points="3,15 9,9 14,13 21,7" />
    </>
  ),
  renko: (
    <>
      <rect x="3.5" y="13.5" width="4" height="4" fill="currentColor" stroke="none" />
      <rect x="7.7" y="9.3" width="4" height="4" fill="currentColor" stroke="none" />
      <rect x="11.9" y="6.5" width="4" height="4" fill="currentColor" stroke="none" opacity="0.5" />
      <rect x="16.1" y="10.7" width="4" height="4" fill="currentColor" stroke="none" opacity="0.5" />
    </>
  ),
  pnf: (
    <>
      <line x1="4" y1="6" x2="9" y2="11" />
      <line x1="9" y1="6" x2="4" y2="11" />
      <circle cx="16" cy="15" r="2.8" />
    </>
  ),
  kagi: (
    // a zig-zag with a thick up-leg and thin down-leg — the yang/yin Kagi signature
    <>
      <polyline points="4,18 4,10 9,10 9,5" strokeWidth="2.4" />
      <polyline points="9,5 9,13 14,13 14,8" strokeWidth="1" />
      <polyline points="14,8 14,16 19,16 19,11" strokeWidth="2.4" />
    </>
  ),
  // ---- volume analysis ----
  avwap: (
    <>
      <circle cx="4.6" cy="17.5" r="1.9" fill="currentColor" stroke="none" />
      <polyline points="4.6,17.5 9,12.5 13,14 20,6.5" />
    </>
  ),
  avwapbands: (
    <>
      <circle cx="4.6" cy="15.5" r="1.7" fill="currentColor" stroke="none" />
      <polyline points="4.6,15.5 9,11.5 13,13 20,7" />
      <polyline points="4.6,11.5 9,7.5 13,9 20,3" strokeDasharray="2 2" opacity="0.6" />
      <polyline points="4.6,19.5 9,15.5 13,17 20,11" strokeDasharray="2 2" opacity="0.6" />
    </>
  ),
  volprofile: (
    <>
      <line x1="3.5" y1="4" x2="3.5" y2="20" />
      <line x1="3.5" y1="7" x2="9" y2="7" />
      <line x1="3.5" y1="11" x2="19" y2="11" />
      <line x1="3.5" y1="15" x2="13" y2="15" />
      <line x1="3.5" y1="18.5" x2="7" y2="18.5" />
    </>
  ),
  avolprofile: (
    <>
      <circle cx="3.6" cy="4.4" r="1.5" fill="currentColor" stroke="none" />
      <line x1="3.5" y1="5.5" x2="3.5" y2="20" />
      <line x1="3.5" y1="8.5" x2="9" y2="8.5" />
      <line x1="3.5" y1="12" x2="19" y2="12" />
      <line x1="3.5" y1="15.5" x2="13" y2="15.5" />
      <line x1="3.5" y1="18.5" x2="7" y2="18.5" />
    </>
  ),
  // ---- toolbar actions ----
  camera: (
    <>
      <rect x="3" y="7.5" width="18" height="11.5" rx="2" />
      <circle cx="12" cy="13.2" r="3.1" />
      <path d="M8.2 7.5 L9.6 5 H14.4 L15.8 7.5" />
    </>
  ),
  indicators: <polyline points="3,14 7,14 9.5,6 12.5,18 15,11 17,14 21,14" />,
  compare: (
    <>
      <polyline points="3,17 9,9 21,15" />
      <polyline points="3,11 12,18 21,5" opacity="0.55" />
    </>
  ),
  replay: <path d="M8 5 L19 12 L8 19 Z" fill="currentColor" stroke="none" />,
  objects: (
    <>
      <polyline points="12,3 21,7.5 12,12 3,7.5 12,3" />
      <polyline points="3,12 12,16.5 21,12" />
      <polyline points="3,16.5 12,21 21,16.5" />
    </>
  ),
  // ---- advanced-feature controls ----
  datawindow: (
    <>
      <rect x="3.5" y="4" width="17" height="16" rx="2" />
      <line x1="3.5" y1="8.5" x2="20.5" y2="8.5" />
      <line x1="12" y1="8.5" x2="12" y2="20" />
    </>
  ),
  vpvr: (
    <>
      <line x1="21" y1="6" x2="10" y2="6" />
      <line x1="21" y1="10" x2="5" y2="10" />
      <line x1="21" y1="14" x2="13" y2="14" />
      <line x1="21" y1="18" x2="16" y2="18" />
    </>
  ),
  keyboard: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <line x1="6.5" y1="10" x2="6.5" y2="10" />
      <line x1="10.5" y1="10" x2="10.5" y2="10" />
      <line x1="14.5" y1="10" x2="14.5" y2="10" />
      <line x1="8" y1="14" x2="16" y2="14" />
    </>
  ),
  script: (
    <>
      <polyline points="9,7 5,12 9,17" />
      <polyline points="15,7 19,12 15,17" />
    </>
  ),
  layout: (
    <>
      <rect x="3.5" y="4" width="17" height="16" rx="2" />
      <line x1="3.5" y1="14" x2="20.5" y2="14" />
    </>
  ),
};

export function Icon({ name, size = 16, style }: { name: string; size?: number; style?: CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" style={{ display: "block", flex: "none", ...style }}>
      {ICONS[name] ?? <circle cx="12" cy="12" r="2" />}
    </svg>
  );
}
