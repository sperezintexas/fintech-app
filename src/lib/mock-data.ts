import type { Portfolio, MarketConditions } from "@/types/portfolio";

export const mockPortfolio: Portfolio = {
  _id: "portfolio-1",
  name: "Main Portfolio",
  totalValue: 247832.45,
  dailyChange: 3241.12,
  dailyChangePercent: 1.32,
  accounts: [
    {
      _id: "acc-1",
      name: "Growth Account",
      balance: 125000,
      riskLevel: "high",
      strategy: "growth",
      positions: [
        {
          _id: "pos-1",
          type: "stock",
          ticker: "TSLA",
          shares: 150,
          purchasePrice: 180.5,
          currentPrice: 248.32,
        },
        {
          _id: "pos-2",
          type: "stock",
          ticker: "NVDA",
          shares: 85,
          purchasePrice: 450.0,
          currentPrice: 892.45,
        },
        {
          _id: "pos-3",
          type: "option",
          ticker: "TSLA",
          optionType: "call",
          strike: 300,
          expiration: "2026-03-21",
          contracts: 10,
          premium: 15.5,
          currentPrice: 22.3,
        },
      ],
      recommendations: [
        {
          id: "rec-1",
          type: "buy",
          ticker: "IONQ",
          reason: "Strong momentum in quantum computing sector",
          confidence: 0.72,
          createdAt: "2026-01-25T10:00:00Z",
        },
      ],
    },
    {
      _id: "acc-2",
      name: "Income Account",
      balance: 75000,
      riskLevel: "low",
      strategy: "income",
      positions: [
        {
          _id: "pos-4",
          type: "stock",
          ticker: "AAPL",
          shares: 200,
          purchasePrice: 165.0,
          currentPrice: 178.25,
        },
        {
          _id: "pos-5",
          type: "stock",
          ticker: "MSFT",
          shares: 100,
          purchasePrice: 310.0,
          currentPrice: 425.8,
        },
        {
          _id: "pos-6",
          type: "cash",
          amount: 15000,
          currency: "USD",
        },
      ],
      recommendations: [],
    },
    {
      _id: "acc-3",
      name: "Options Trading",
      balance: 47832.45,
      riskLevel: "high",
      strategy: "aggressive",
      positions: [
        {
          _id: "pos-7",
          type: "option",
          ticker: "NVDA",
          optionType: "call",
          strike: 950,
          expiration: "2026-02-21",
          contracts: 5,
          premium: 45.2,
          currentPrice: 38.75,
        },
      ],
      recommendations: [
        {
          id: "rec-2",
          type: "sell",
          ticker: "NVDA 950C",
          reason: "Approaching expiration with low delta",
          confidence: 0.85,
          createdAt: "2026-01-25T09:30:00Z",
        },
      ],
    },
  ],
};

export const mockMarketConditions: MarketConditions = {
  status: "open",
  lastUpdated: new Date().toISOString(),
  indices: [
    {
      symbol: "SPY",
      name: "S&P 500",
      price: 4892.45,
      change: 23.12,
      changePercent: 0.47,
    },
    {
      symbol: "QQQ",
      name: "Nasdaq 100",
      price: 17234.78,
      change: 145.32,
      changePercent: 0.85,
    },
    {
      symbol: "DIA",
      name: "Dow Jones",
      price: 38456.21,
      change: -45.67,
      changePercent: -0.12,
    },
    {
      symbol: "IWM",
      name: "Russell 2000",
      price: 2012.34,
      change: 12.45,
      changePercent: 0.62,
    },
  ],
};
