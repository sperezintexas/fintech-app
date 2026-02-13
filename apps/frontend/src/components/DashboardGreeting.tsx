"use client";

import { useState, useEffect } from "react";
import { getMarketState } from "@/lib/market-calendar";
import type { MarketState } from "@/lib/market-calendar";

type Props = { displayName: string };

const MARKET_LABELS: Record<MarketState, string> = {
  open: "open",
  closed: "closed",
  "pre-market": "in pre-market",
  "after-hours": "in after-hours",
};

export function DashboardGreeting({ displayName }: Props) {
  const [weather, setWeather] = useState<string | null>(null);
  const [marketState, setMarketState] = useState<MarketState>(() => getMarketState());

  useEffect(() => {
    let cancelled = false;
    fetch("/api/weather", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { condition?: string | null }) => {
        if (cancelled) return;
        setWeather(data.condition ?? null);
      })
      .catch(() => {
        if (!cancelled) setWeather(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setMarketState(getMarketState());
    const id = setInterval(() => setMarketState(getMarketState()), 60_000);
    return () => clearInterval(id);
  }, []);

  const weatherText = weather ?? "—";
  const marketText = MARKET_LABELS[marketState];

  return (
    <div className="mb-3 sm:mb-4">
      <h1 className="text-xl font-semibold text-gray-900 sm:text-2xl" style={{ wordBreak: "keep-all" }}>
        Hello, {displayName}. Today the weather is {weatherText}. The market is {marketText}.
      </h1>
    </div>
  );
}
