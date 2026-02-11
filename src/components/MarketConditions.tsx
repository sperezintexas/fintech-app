"use client";

import type { MarketConditions as MarketConditionsType } from "@/types/portfolio";

type MarketConditionsProps = {
  market: MarketConditionsType;
  variant?: "card" | "ticker";
};

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function getStatusColor(status: MarketConditionsType["status"]): string {
  switch (status) {
    case "open":
      return "bg-emerald-500";
    case "closed":
      return "bg-gray-500";
    case "pre-market":
      return "bg-yellow-500";
    case "after-hours":
      return "bg-purple-500";
    default:
      return "bg-gray-500";
  }
}

function getStatusText(status: MarketConditionsType["status"]): string {
  switch (status) {
    case "open":
      return "Market Open";
    case "closed":
      return "Market Closed";
    case "pre-market":
      return "Pre-Market";
    case "after-hours":
      return "After Hours";
    default:
      return "Unknown";
  }
}

/** Minutes until 4 PM ET (market close). */
function getMinutesUntilClose(): number | null {
  const now = new Date();
  const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const close = new Date(et);
  close.setHours(16, 0, 0, 0);
  if (et >= close) return 0;
  return Math.round((close.getTime() - et.getTime()) / 60000);
}

export function MarketConditions({ market, variant = "card" }: MarketConditionsProps) {
  if (variant === "ticker") {
    const minutesLeft = getMinutesUntilClose();
    const closeText =
      minutesLeft !== null
        ? minutesLeft <= 0
          ? "Markets closed"
          : minutesLeft >= 60
            ? `Markets close in ${Math.floor(minutesLeft / 60)}h ${minutesLeft % 60}m`
            : `Markets close in ${minutesLeft}m`
        : "";

    return (
      <div className="w-full">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-2">
          <div
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium shadow-sm border border-gray-100"
            aria-live="polite"
            role="status"
          >
            <span
              className={`w-2 h-2 rounded-full flex-shrink-0 ${getStatusColor(market.status)} ${market.status === "open" ? "animate-pulse" : ""}`}
            />
            <span className="text-gray-700">{getStatusText(market.status)}</span>
          </div>
        </div>
        <div
          className="flex gap-3 overflow-x-auto overflow-y-hidden pb-2 -mx-1 px-1 snap-x snap-mandatory [scrollbar-width:thin] [-webkit-overflow-scrolling:touch]"
          role="region"
          aria-label="Market indices"
        >
          {market.indices.map((index) => {
            const isPositive = index.change >= 0;
            return (
              <div
                key={index.symbol}
                className="flex shrink-0 snap-start items-center gap-2 rounded-lg bg-gray-100 px-3 py-2 text-sm"
              >
                <span className="font-medium text-gray-800">{index.name}</span>
                <span className="text-gray-600 tabular-nums">{formatNumber(index.price)}</span>
                <span
                  className={`font-medium tabular-nums ${isPositive ? "text-emerald-600" : "text-red-600"}`}
                >
                  {isPositive ? "+" : ""}
                  {formatNumber(index.change)}
                </span>
                <span
                  className={`text-xs font-medium tabular-nums ${isPositive ? "text-emerald-600" : "text-red-600"}`}
                >
                  {isPositive ? "+" : ""}
                  {index.changePercent.toFixed(2)}%
                </span>
              </div>
            );
          })}
        </div>
        <p className="mt-1.5 text-xs text-gray-500">
          Data may be delayed. {closeText}. Last updated{" "}
          {new Date(market.lastUpdated).toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
          })}
          .
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-lg p-4 sm:p-6 border border-gray-100 w-full">
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <h2 className="text-lg sm:text-xl font-semibold text-gray-800">Market Conditions</h2>
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${getStatusColor(market.status)} animate-pulse`}
          />
          <span className="text-sm font-medium text-gray-600">
            {getStatusText(market.status)}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:gap-4">
        {market.indices.map((index) => {
          const isPositive = index.change >= 0;

          return (
            <div
              key={index.symbol}
              className="flex items-center justify-between p-3 sm:p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
            >
              <div>
                <p className="font-semibold text-gray-800">{index.name}</p>
                <p className="text-xs text-gray-500">{index.symbol}</p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-gray-800">
                  {formatNumber(index.price)}
                </p>
                <div className="flex items-center justify-end gap-2">
                  <span
                    className={`text-sm font-medium ${
                      isPositive ? "text-emerald-600" : "text-red-600"
                    }`}
                  >
                    {isPositive ? "+" : ""}
                    {formatNumber(index.change)}
                  </span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      isPositive
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {isPositive ? "+" : ""}
                    {index.changePercent.toFixed(2)}%
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 sm:mt-6 pt-3 sm:pt-4 border-t border-gray-100">
        <p className="text-xs text-gray-400 text-center">
          Last updated:{" "}
          {new Date(market.lastUpdated).toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })}
        </p>
      </div>
    </div>
  );
}
