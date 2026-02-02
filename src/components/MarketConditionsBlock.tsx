"use client";

import { useState, useEffect, useCallback } from "react";
import { MarketConditions } from "@/components/MarketConditions";
import type { MarketConditions as MarketConditionsType } from "@/types/portfolio";

export function MarketConditionsBlock() {
  const [marketData, setMarketData] = useState<MarketConditionsType | null>(null);

  const fetchMarket = useCallback(async () => {
    try {
      const res = await fetch("/api/market", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setMarketData(data);
    } catch {
      // Non-blocking; dashboard works without market data
    }
  }, []);

  useEffect(() => {
    fetchMarket();
  }, [fetchMarket]);

  if (!marketData) {
    return (
      <div className="w-full rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-6">
        <h2 className="text-lg font-semibold text-gray-800 sm:text-xl">Market Conditions</h2>
        <p className="mt-2 text-sm text-gray-500">Loading market data...</p>
      </div>
    );
  }

  return (
    <section className="w-full" aria-label="Market conditions">
      <MarketConditions market={marketData} variant="ticker" />
    </section>
  );
}
