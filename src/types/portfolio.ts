export type RiskLevel = "low" | "medium" | "high";

export type Strategy = "growth" | "income" | "balanced" | "aggressive";

export type PositionType = "stock" | "option" | "cash";

export type OptionType = "call" | "put";

export type Position = {
  _id: string;
  type: PositionType;
  ticker?: string;
  shares?: number;
  purchasePrice?: number;
  currentPrice?: number;
  // Option specific
  strike?: number;
  expiration?: string;
  optionType?: OptionType;
  contracts?: number;
  premium?: number;
  // Cash specific
  amount?: number;
  currency?: string;
};

export type Recommendation = {
  id: string;
  type: "buy" | "sell" | "hold";
  ticker: string;
  reason: string;
  confidence: number;
  createdAt: string;
};

export type Account = {
  _id: string;
  name: string;
  balance: number;
  riskLevel: RiskLevel;
  strategy: Strategy;
  positions: Position[];
  recommendations: Recommendation[];
};

export type Portfolio = {
  _id: string;
  name: string;
  accounts: Account[];
  totalValue: number;
  dailyChange: number;
  dailyChangePercent: number;
};

export type MarketIndex = {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
};

export type MarketConditions = {
  status: "open" | "closed" | "pre-market" | "after-hours";
  indices: MarketIndex[];
  lastUpdated: string;
};

// Watchlist Types
export type WatchlistItemType = "stock" | "call" | "put" | "csp" | "covered-call";

export type WatchlistStrategy =
  | "covered-call"
  | "cash-secured-put"
  | "wheel"
  | "long-stock"
  | "leap-call"
  | "collar";

export type WatchlistItem = {
  _id: string;
  accountId: string;
  symbol: string;
  underlyingSymbol: string;
  type: WatchlistItemType;
  strategy: WatchlistStrategy;
  quantity: number; // shares or contracts
  entryPrice: number;
  entryDate: string;
  // Option specific
  strikePrice?: number;
  expirationDate?: string;
  entryPremium?: number;
  // Tracking
  currentPrice?: number;
  currentPremium?: number;
  profitLoss?: number;
  profitLossPercent?: number;
  // Risk info
  riskDisclosure?: string;
  maxLoss?: number;
  maxProfit?: number;
  breakeven?: number;
  // Metadata
  notes?: string;
  addedAt: string;
  updatedAt: string;
};

export type AlertRecommendation = "HOLD" | "CLOSE" | "ROLL" | "BTC" | "STC" | "WATCH";

export type AlertSeverity = "info" | "warning" | "urgent" | "critical";

export type WatchlistAlert = {
  _id: string;
  watchlistItemId: string;
  accountId: string;
  symbol: string;
  recommendation: AlertRecommendation;
  severity: AlertSeverity;
  reason: string;
  details: {
    currentPrice: number;
    entryPrice: number;
    priceChange: number;
    priceChangePercent: number;
    daysToExpiration?: number;
    rsi?: number;
    volatility?: number;
    profitCaptured?: number;
  };
  riskWarning?: string;
  suggestedActions: string[];
  createdAt: string;
  acknowledged: boolean;
  acknowledgedAt?: string;
};

export type TechnicalIndicators = {
  rsi: number;
  macd: {
    value: number;
    signal: number;
    histogram: number;
  };
  sma50: number;
  sma200: number;
  volatility: number;
  volume: number;
  avgVolume: number;
};
