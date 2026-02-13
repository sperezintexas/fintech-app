"use client";

import { useState, useEffect } from "react";
import { getMarketState } from "@/lib/market-calendar";
import type { MarketState } from "@/lib/market-calendar";

const STATUS_COLORS: Record<MarketState, string> = {
  open: "bg-emerald-500",
  closed: "bg-gray-500",
  "pre-market": "bg-amber-500",
  "after-hours": "bg-purple-500",
};

const STATUS_LABELS: Record<MarketState, string> = {
  open: "Market Open",
  closed: "Market Closed",
  "pre-market": "Pre-Market",
  "after-hours": "After Hours",
};

/** Client-side market status pill (uses market-calendar; updates every minute). */
export function MarketStatusPill() {
  const [status, setStatus] = useState<MarketState>(() => getMarketState());

  useEffect(() => {
    setStatus(getMarketState());
    const id = setInterval(() => setStatus(getMarketState()), 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium shadow-sm border border-gray-100 bg-white"
      aria-live="polite"
      role="status"
    >
      <span
        className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_COLORS[status]} ${status === "open" ? "animate-pulse" : ""}`}
      />
      <span className="text-gray-700">{STATUS_LABELS[status]}</span>
    </div>
  );
}
