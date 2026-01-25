"use client";

import type { MarketConditions as MarketConditionsType } from "@/types/portfolio";

type MarketConditionsProps = {
  market: MarketConditionsType;
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

export function MarketConditions({ market }: MarketConditionsProps) {
  return (
    <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-800">Market Conditions</h2>
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${getStatusColor(market.status)} animate-pulse`}
          />
          <span className="text-sm font-medium text-gray-600">
            {getStatusText(market.status)}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {market.indices.map((index) => {
          const isPositive = index.change >= 0;

          return (
            <div
              key={index.symbol}
              className="flex items-center justify-between p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
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

      <div className="mt-6 pt-4 border-t border-gray-100">
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
