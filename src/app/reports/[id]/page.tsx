"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import type { SmartXAIReport, MarketSentiment } from "@/types/portfolio";

export default function ReportPage() {
  const params = useParams();
  const reportId = params.id as string;

  const [report, setReport] = useState<(SmartXAIReport & { reportType?: string }) | any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchReport() {
      try {
        // Try SmartXAI first
        let res = await fetch(`/api/reports/smartxai?id=${reportId}`);
        if (res.ok) {
          const data = await res.json();
          setReport({ ...data, reportType: "smartxai" } as any);
          setLoading(false);
          return;
        }

        // Try PortfolioSummary
        res = await fetch(`/api/reports/portfoliosummary?id=${reportId}`);
        if (res.ok) {
          const portfolioReport = await res.json();
          if (portfolioReport && !portfolioReport.error) {
            setReport({ ...portfolioReport, reportType: "portfoliosummary" } as any);
            setLoading(false);
            return;
          }
        }

        setError("Report not found");
      } catch (err) {
        setError("Failed to load report");
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    if (reportId) {
      fetchReport();
    }
  }, [reportId]);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(value);

  const formatPercent = (value: number) =>
    `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;

  const getSentimentColor = (sentiment: MarketSentiment) => {
    switch (sentiment) {
      case "bullish":
        return "bg-green-100 text-green-800 border-green-300";
      case "bearish":
        return "bg-red-100 text-red-800 border-red-300";
      default:
        return "bg-gray-100 text-gray-800 border-gray-300";
    }
  };

  const getRecommendationColor = (rec: string) => {
    switch (rec) {
      case "HOLD":
        return "bg-green-100 text-green-800";
      case "CLOSE":
      case "STC":
        return "bg-red-100 text-red-800";
      case "BTC":
        return "bg-yellow-100 text-yellow-800";
      case "ROLL":
        return "bg-blue-100 text-blue-800";
      case "WATCH":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Report Not Found</h1>
          <Link href="/automation" className="text-blue-600 hover:text-blue-800">
            Back to Configure Automation
          </Link>
        </div>
      </div>
    );
  }

  // Render PortfolioSummary report
  if (report.reportType === "portfoliosummary") {
    const formatCurrency = (value: number) =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value);

    const formatPercent = (value: number) =>
      `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;

    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader />
        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 mb-6">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">{report.title}</h2>
            <p className="text-gray-600 mb-6">
              Generated: {new Date(report.reportDateTime).toLocaleString()}
            </p>

            <div className="space-y-6">
              {report.accounts.map((acc: any, idx: number) => (
                <div key={idx} className="border-t border-gray-200 pt-6 first:border-t-0 first:pt-0">
                  <h3 className="text-xl font-semibold text-gray-900 mb-3">
                    {acc.broker || acc.name} ({acc.riskLevel === "low" || acc.riskLevel === "medium" ? "Moderate" : "Aggressive"} – {acc.strategy || "Core"})
                  </h3>
                  <div className="space-y-2 text-sm font-mono">
                    <p>• Total Value:          {formatCurrency(acc.totalValue)}</p>
                    {acc.positions.length > 0 && acc.positions[0] && (
                      <p>
                        • {acc.positions[0].symbol} Position:        {acc.positions[0].shares || 0} shares @ avg {formatCurrency(acc.positions[0].avgCost)} → current {formatCurrency(acc.positions[0].currentPrice)} ({formatPercent(acc.positions[0].dailyChangePercent)} today / {formatPercent(acc.positions[0].unrealizedPnLPercent)} unrealized)
                      </p>
                    )}
                    <p>
                      • Portfolio Change:     Today: {formatCurrency(acc.dailyChange)} ({formatPercent(acc.dailyChangePercent)})    Week: {formatCurrency(acc.weekChange || 0)} ({formatPercent(acc.weekChangePercent || 0)})
                    </p>
                    {acc.optionsActivity && <p>• Options Activity:     {acc.optionsActivity}</p>}
                    {acc.recommendation && <p>• Recommendation:       {acc.recommendation}</p>}
                  </div>
                </div>
              ))}

              <div className="border-t border-gray-200 pt-6">
                <h3 className="text-xl font-semibold text-gray-900 mb-3">Market Snapshot</h3>
                <div className="space-y-2 text-sm font-mono">
                  <p>• SPY:      {formatCurrency(report.marketSnapshot.SPY.price)} ({formatPercent(report.marketSnapshot.SPY.changePercent)})</p>
                  <p>• QQQ:      {formatCurrency(report.marketSnapshot.QQQ.price)} ({formatPercent(report.marketSnapshot.QQQ.changePercent)})</p>
                  <p>• VIX:      {report.marketSnapshot.VIX.price.toFixed(1)} (fear level: {report.marketSnapshot.VIX.level})</p>
                  <p>• TSLA:     {formatCurrency(report.marketSnapshot.TSLA.price)} ({formatPercent(report.marketSnapshot.TSLA.changePercent)})</p>
                </div>
              </div>

              <div className="border-t border-gray-200 pt-6">
                <h3 className="text-xl font-semibold text-gray-900 mb-3">Progress Toward Goals</h3>
                <div className="space-y-2 text-sm font-mono">
                  <p>
                    • Merrill → {formatCurrency(report.goalsProgress.merrill.target)} balanced by {report.goalsProgress.merrill.targetDate}: ~{report.goalsProgress.merrill.progressPercent.toFixed(1)}% of way (assuming {Math.round(report.goalsProgress.merrill.cagrNeeded)}-{Math.ceil(report.goalsProgress.merrill.cagrNeeded * 1.4)}% CAGR needed)
                  </p>
                  <p>
                    • Fidelity → max growth by {report.goalsProgress.fidelity.targetDate}: current trajectory [{report.goalsProgress.fidelity.trajectory}]
                  </p>
                </div>
              </div>

              <div className="border-t border-gray-200 pt-6">
                <p className="text-sm text-gray-700 italic">
                  Risk Reminder: Options involve substantial risk of loss and are not suitable for all investors. Review OCC booklet before trading.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-8">
            <Link
              href="/automation"
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to Configure Automation
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Report Header */}
        <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl shadow-sm border border-indigo-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-3xl font-bold text-indigo-900 mb-2">{report.title}</h2>
              <p className="text-indigo-700">
                Generated: {new Date(report.reportDateTime).toLocaleString()}
              </p>
            </div>
            <div className={`px-4 py-2 rounded-full border-2 ${getSentimentColor(report.marketOverview.overallSentiment)}`}>
              <span className="font-semibold">
                {report.marketOverview.overallSentiment.toUpperCase()} Market
              </span>
            </div>
          </div>

          {/* Summary Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
            <div className="bg-white/60 rounded-lg p-4">
              <p className="text-xs text-gray-600 mb-1">Total Positions</p>
              <p className="text-2xl font-bold text-gray-900">{report.summary.totalPositions}</p>
            </div>
            <div className="bg-white/60 rounded-lg p-4">
              <p className="text-xs text-gray-600 mb-1">Total Value</p>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(report.summary.totalValue)}</p>
            </div>
            <div className="bg-white/60 rounded-lg p-4">
              <p className="text-xs text-gray-600 mb-1">Total P/L</p>
              <p className={`text-2xl font-bold ${report.summary.totalProfitLoss >= 0 ? "text-green-600" : "text-red-600"}`}>
                {formatCurrency(report.summary.totalProfitLoss)}
              </p>
            </div>
            <div className="bg-white/60 rounded-lg p-4">
              <p className="text-xs text-gray-600 mb-1">P/L %</p>
              <p className={`text-2xl font-bold ${report.summary.totalProfitLossPercent >= 0 ? "text-green-600" : "text-red-600"}`}>
                {formatPercent(report.summary.totalProfitLossPercent)}
              </p>
            </div>
          </div>

          {/* Sentiment Breakdown */}
          <div className="mt-4 flex items-center gap-4 text-sm">
            <span className="text-gray-600">Sentiment:</span>
            <span className="px-2 py-1 rounded bg-green-100 text-green-800">
              {report.summary.bullishCount} Bullish
            </span>
            <span className="px-2 py-1 rounded bg-gray-100 text-gray-800">
              {report.summary.neutralCount} Neutral
            </span>
            <span className="px-2 py-1 rounded bg-red-100 text-red-800">
              {report.summary.bearishCount} Bearish
            </span>
          </div>
        </div>

        {/* Market Overview */}
            {report.marketOverview.indices.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Market Overview</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {report.marketOverview.indices.map((index: any) => (
                <div key={index.symbol} className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-600 mb-1">{index.name}</p>
                  <p className="font-bold text-gray-900">{formatCurrency(index.price)}</p>
                  <p className={`text-sm ${index.changePercent >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {formatPercent(index.changePercent)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Position Reports */}
        <div className="space-y-4">
          <h3 className="text-xl font-bold text-gray-900">
            Position Analysis ({report.positions.length})
          </h3>

          {report.positions.map((position: any) => (
            <div
              key={position.watchlistItemId}
              className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6"
            >
              {/* Position Header */}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <h4 className="text-2xl font-bold text-gray-900">{position.symbol}</h4>
                    <span className="px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-700">
                      {position.type.toUpperCase()}
                    </span>
                    <span className="px-2 py-1 rounded text-xs font-medium bg-purple-100 text-purple-700">
                      {position.strategy}
                    </span>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getRecommendationColor(position.recommendation)}`}>
                      {position.recommendation}
                    </span>
                  </div>
                  <p className="text-gray-600">{position.underlyingSymbol}</p>
                </div>
                <div className={`px-4 py-2 rounded-full border-2 ${getSentimentColor(position.rationale.sentiment)}`}>
                  <span className="font-semibold text-sm">
                    {position.rationale.sentiment.toUpperCase()}
                  </span>
                </div>
              </div>

              {/* Price & P/L */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-600 mb-1">Current Price</p>
                  <p className="font-bold text-gray-900">{formatCurrency(position.currentPrice)}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-600 mb-1">Entry Price</p>
                  <p className="font-bold text-gray-900">{formatCurrency(position.entryPrice)}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-600 mb-1">P/L</p>
                  <p className={`font-bold ${position.profitLoss >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {formatCurrency(position.profitLoss)}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-600 mb-1">P/L %</p>
                  <p className={`font-bold ${position.profitLossPercent >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {formatPercent(position.profitLossPercent)}
                  </p>
                </div>
              </div>

              {/* SmartXAI Rationale */}
              <div className="border-t border-gray-200 pt-4 mt-4">
                <h5 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span className="text-xl">🤖</span>
                  SmartXAI Analysis
                </h5>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-medium text-gray-600 mb-1">Technical Analysis</p>
                    <p className="text-sm text-gray-800">{position.rationale.technical}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-600 mb-1">Fundamental/Strategy Analysis</p>
                    <p className="text-sm text-gray-800">{position.rationale.fundamental}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-600 mb-1">Market Conditions</p>
                    <p className="text-sm text-gray-800">{position.rationale.marketConditions}</p>
                  </div>
                </div>
              </div>

              {/* Recommendation */}
              <div className="border-t border-gray-200 pt-4 mt-4">
                <h5 className="font-semibold text-gray-900 mb-2">Recommendation</h5>
                <p className="text-sm text-gray-800 mb-3">{position.recommendationReason}</p>
              </div>

              {/* Position Insights */}
              <div className="border-t border-gray-200 pt-4 mt-4">
                <h5 className="font-semibold text-gray-900 mb-3">Position Insights</h5>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="bg-blue-50 rounded-lg p-3">
                    <p className="text-xs font-medium text-blue-600 mb-1">Entry vs Current</p>
                    <p className="text-sm text-blue-900">{position.positionInsights.entryVsCurrent}</p>
                  </div>
                  <div className="bg-amber-50 rounded-lg p-3">
                    <p className="text-xs font-medium text-amber-600 mb-1">Risk Assessment</p>
                    <p className="text-sm text-amber-900">{position.positionInsights.riskAssessment}</p>
                  </div>
                  <div className="bg-green-50 rounded-lg p-3">
                    <p className="text-xs font-medium text-green-600 mb-1">Opportunity</p>
                    <p className="text-sm text-green-900">{position.positionInsights.opportunity}</p>
                  </div>
                  <div className="bg-purple-50 rounded-lg p-3">
                    <p className="text-xs font-medium text-purple-600 mb-1">Time Horizon</p>
                    <p className="text-sm text-purple-900">{position.positionInsights.timeHorizon}</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Back Button */}
        <div className="mt-8">
          <Link
            href="/automation"
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Configure Automation
          </Link>
        </div>
      </main>
    </div>
  );
}
