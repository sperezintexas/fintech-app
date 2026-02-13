"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import type { Broker, Portfolio } from "@/types/portfolio";
import { getBrokerLogoUrl, BROKER_LOGO_URLS } from "@/lib/broker-logo-url";

const BROKER_ICONS: Record<string, string> = {
  Merrill: "/merrill-icon.svg",
  Fidelity: "/fidelity-icon.svg",
};

const BUILTIN_BROKER_NAMES = ["merrill", "fidelity"] as const;

function BuiltinBrokerLogo({ brokerType }: { brokerType: "Merrill" | "Fidelity" }) {
  const [pngFailed, setPngFailed] = useState(false);
  const svgSrc = BROKER_ICONS[brokerType];
  const logoSrc = brokerType === "Merrill" ? BROKER_LOGO_URLS.merrill : BROKER_LOGO_URLS.fidelity;
  if (!pngFailed) {
    return (
      <img
        src={logoSrc}
        alt=""
        className="w-8 h-8 rounded object-contain shrink-0 bg-gray-100 ring-1 ring-gray-200/80"
        onError={() => setPngFailed(true)}
      />
    );
  }
  if (svgSrc) {
    return (
      <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 overflow-hidden bg-gray-100 ring-1 ring-gray-200/80">
        <Image src={svgSrc} alt={brokerType} width={24} height={24} className="w-6 h-6" />
      </div>
    );
  }
  return (
    <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 overflow-hidden bg-gray-100 ring-1 ring-gray-200/80 text-xs font-medium text-gray-600">
      {brokerType.charAt(0)}
    </div>
  );
}

type PortfolioCardProps = {
  portfolio: Portfolio;
  brokers?: Broker[];
};

function AccountBrokerLogo({
  account,
  brokers,
}: {
  account: Portfolio["accounts"][number];
  brokers: Broker[];
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const broker = account.brokerId ? brokers.find((b) => b._id === account.brokerId) : undefined;
  if (!broker) return null;
  const logoSrc = getBrokerLogoUrl(broker, account.brokerType) ?? `/api/brokers/${broker._id}/logo`;
  if (imgFailed) {
    return (
      <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 overflow-hidden bg-gray-100 ring-1 ring-gray-200/80 text-xs font-medium text-gray-600">
        {(broker.name ?? "?").charAt(0).toUpperCase()}
      </div>
    );
  }
  return (
    <img
      src={logoSrc}
      alt=""
      className="w-8 h-8 rounded object-contain shrink-0 bg-gray-100 ring-1 ring-gray-200/80"
      onError={() => setImgFailed(true)}
    />
  );
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

/** Stable color from ticker string for symbol icon background. */
const SYMBOL_COLORS = [
  "bg-blue-100 text-blue-800",
  "bg-emerald-100 text-emerald-800",
  "bg-violet-100 text-violet-800",
  "bg-amber-100 text-amber-800",
  "bg-rose-100 text-rose-800",
  "bg-sky-100 text-sky-800",
];

function SymbolIcon({ ticker }: { ticker: string }) {
  const s = (ticker || "").trim().toUpperCase();
  const initial = s.slice(0, 2) || "?";
  const colorIndex = s.length > 0 ? s.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % SYMBOL_COLORS.length : 0;
  const colorClass = SYMBOL_COLORS[colorIndex];
  return (
    <div
      className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold ${colorClass} ring-1 ring-black/5`}
      aria-hidden
    >
      {initial}
    </div>
  );
}

function CompanyLogoOrInitial({ ticker }: { ticker: string }) {
  const [failed, setFailed] = useState(false);
  const s = (ticker || "").trim().toUpperCase();
  if (!s) return <SymbolIcon ticker="" />;
  if (failed) return <SymbolIcon ticker={s} />;
  return (
    <img
      src={`/api/ticker/${encodeURIComponent(s)}/logo`}
      alt=""
      className="w-9 h-9 rounded-lg object-contain shrink-0 bg-gray-50 ring-1 ring-black/5"
      onError={() => setFailed(true)}
    />
  );
}

export function PortfolioCard({ portfolio, brokers = [] }: PortfolioCardProps) {
  const isPositive = portfolio.dailyChange >= 0;
  const brokerMap = new Map(brokers.map((b) => [b._id, b]));

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-800">Portfolio Overview</h2>
        <div className="flex items-center gap-3">
          <Link
            href="/accounts"
            className="text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            Manage accounts
          </Link>
          <span className="text-sm text-gray-500">{portfolio.name}</span>
        </div>
      </div>

      <div className="mb-8">
        <p className="text-sm text-gray-500 mb-1">Total Value</p>
        <p className="text-4xl font-bold text-gray-900">
          {formatCurrency(portfolio.totalValue)}
        </p>
        <div className="flex items-center gap-2 mt-2">
          <span
            className={`text-lg font-medium ${
              isPositive ? "text-emerald-600" : "text-red-600"
            }`}
          >
            {isPositive ? "+" : ""}
            {formatCurrency(portfolio.dailyChange)}
          </span>
          <span
            className={`text-sm px-2 py-0.5 rounded-full ${
              isPositive
                ? "bg-emerald-100 text-emerald-700"
                : "bg-red-100 text-red-700"
            }`}
          >
            {formatPercent(portfolio.dailyChangePercent)}
          </span>
          <span className="text-sm text-gray-400">today</span>
        </div>
      </div>

      <div className="border-t border-gray-100 pt-6">
        <h3 className="text-sm font-medium text-gray-700 mb-4">Accounts</h3>
        <div className="space-y-3">
          {portfolio.accounts.map((account) => {
            // Use account.balance (already calculated by API, or stored value if no positions)
            const accountValue = account.balance || 0;

            return (
              <Link
                key={account._id}
                href={`/holdings?accountId=${account._id}`}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-blue-50 hover:border-blue-200 border border-transparent transition-colors cursor-pointer group"
              >
                <div className="flex items-center gap-3">
                  {account.brokerId && brokerMap.has(account.brokerId) ? (
                    <AccountBrokerLogo account={account} brokers={brokers} />
                  ) : account.brokerType && BUILTIN_BROKER_NAMES.includes(account.brokerType.toLowerCase() as (typeof BUILTIN_BROKER_NAMES)[number]) ? (
                    <BuiltinBrokerLogo brokerType={account.brokerType} />
                  ) : account.brokerType && BROKER_ICONS[account.brokerType] ? (
                    <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 overflow-hidden bg-gray-100 ring-1 ring-gray-200/80">
                      <Image
                        src={BROKER_ICONS[account.brokerType]}
                        alt={account.brokerType}
                        width={24}
                        height={24}
                        className="w-6 h-6"
                      />
                    </div>
                  ) : (
                    <div
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        account.riskLevel === "high"
                          ? "bg-red-500"
                          : account.riskLevel === "medium"
                          ? "bg-yellow-500"
                          : "bg-emerald-500"
                      }`}
                    />
                  )}
                  <div>
                    <p className="font-medium text-gray-800 group-hover:text-blue-700">{account.name}</p>
                    <p className="text-xs text-gray-500 capitalize flex items-center gap-1.5">
                      {!account.brokerType && (
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            account.riskLevel === "high"
                              ? "bg-red-500"
                              : account.riskLevel === "medium"
                              ? "bg-yellow-500"
                              : "bg-emerald-500"
                          }`}
                          aria-hidden
                        />
                      )}
                      {account.strategy} · {account.riskLevel} risk
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="font-medium text-gray-800">
                      {formatCurrency(accountValue)}
                    </p>
                    <p className="text-xs text-gray-500">
                      {account.positions.length} positions
                    </p>
                  </div>
                  <svg
                    className="w-4 h-4 text-gray-400 group-hover:text-blue-600 transition-colors"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      <div className="border-t border-gray-100 pt-6 mt-6">
        <h3 className="text-sm font-medium text-gray-700 mb-4">Top Holdings</h3>
        <div className="grid grid-cols-2 gap-3">
          {portfolio.accounts
            .flatMap((acc) => acc.positions)
            .filter((pos) => pos.type === "stock")
            .slice(0, 4)
            .map((position) => (
              <Link
                key={position._id}
                href={`/xstrategybuilder?symbol=${encodeURIComponent((position.ticker ?? "").toUpperCase())}`}
                className="p-3 bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg flex gap-3 hover:from-gray-100 hover:to-gray-200 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1"
              >
                <CompanyLogoOrInitial ticker={position.ticker ?? ""} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-gray-800">{position.ticker}</p>
                  <p className="text-sm text-gray-600">
                    {position.shares} shares
                  </p>
                  <p className="text-sm font-medium text-gray-800">
                    {formatCurrency((position.shares || 0) * (position.currentPrice || 0))}
                  </p>
                </div>
              </Link>
            ))}
        </div>
      </div>
    </div>
  );
}
