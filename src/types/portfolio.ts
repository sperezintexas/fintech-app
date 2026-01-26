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

// Alert Configuration Types
export type AlertDeliveryChannel = "email" | "sms" | "slack" | "push";

export type AlertDeliveryConfig = {
  channel: AlertDeliveryChannel;
  enabled: boolean;
  target: string; // email address, phone number, slack webhook/channel
  verified?: boolean;
  // Cost tracking (per message)
  estimatedCost?: number; // in cents
};

export type AlertTemplateId =
  | "concise"      // Short action-focused: "BTC TSLA 380P - 85% profit captured"
  | "detailed"     // Full context with reasoning
  | "actionable"   // Action + key metrics only
  | "risk-aware";  // Includes risk warnings

export type AlertTemplate = {
  id: AlertTemplateId;
  name: string;
  description: string;
  // Template supports variables: {symbol}, {action}, {reason}, {profit}, {risk}, etc.
  subjectTemplate: string;
  bodyTemplate: string;
  smsTemplate: string; // Short version for SMS (160 chars)
  slackTemplate: string; // Slack block format
};

export type AlertFrequency = "realtime" | "daily" | "weekly";

export type AlertPreferences = {
  _id?: string;
  accountId: string;
  // Delivery channels
  channels: AlertDeliveryConfig[];
  // Template preference
  templateId: AlertTemplateId;
  // Frequency
  frequency: AlertFrequency;
  // Filters - only alert on these severities
  severityFilter: AlertSeverity[];
  // Quiet hours (don't send during these times)
  quietHoursStart?: string; // HH:MM format
  quietHoursEnd?: string;
  quietHoursTimezone?: string;
  // Risk-based thresholds
  thresholds: {
    // Only alert if profit/loss exceeds these percentages
    profitThreshold: number; // e.g., 50 means alert when 50%+ profit
    lossThreshold: number;   // e.g., 20 means alert when 20%+ loss
    // Days to expiration warning
    dteWarning: number;      // e.g., 7 means alert when 7 or fewer DTE
  };
  // Metadata
  createdAt: string;
  updatedAt: string;
};

// Cost estimates per channel (in cents)
export const ALERT_CHANNEL_COSTS: Record<AlertDeliveryChannel, { perMessage: number; description: string }> = {
  email: { perMessage: 0, description: "Free - unlimited emails" },
  sms: { perMessage: 1, description: "$0.01 per SMS (Twilio)" },
  slack: { perMessage: 0, description: "Free - webhook integration" },
  push: { perMessage: 0, description: "Free - browser notifications" },
};

// Predefined alert templates
export const ALERT_TEMPLATES: AlertTemplate[] = [
  {
    id: "concise",
    name: "Concise",
    description: "Short, action-focused alerts",
    subjectTemplate: "{action} {symbol} - {reason}",
    bodyTemplate: "{action} {symbol}\n{reason}\nP/L: {profitPercent}% | Price: {currentPrice}",
    smsTemplate: "{action} {symbol}: {reason} ({profitPercent}%)",
    slackTemplate: "*{action}* `{symbol}` - {reason} | P/L: {profitPercent}%",
  },
  {
    id: "detailed",
    name: "Detailed",
    description: "Full context with reasoning and risk info",
    subjectTemplate: "[{severity}] {action} {symbol} - {strategy} Alert",
    bodyTemplate: "Position: {symbol} ({strategy})\nAction: {action}\n\nReason: {reason}\n\nMetrics:\n- Current Price: {currentPrice}\n- Entry Price: {entryPrice}\n- P/L: {profitPercent}% ({profitDollars})\n- DTE: {dte} days\n\nRisk Level: {riskLevel}\n{riskWarning}\n\nSuggested Actions:\n{actions}",
    smsTemplate: "{action} {symbol}: {reason}. P/L {profitPercent}%. DTE {dte}d",
    slackTemplate: ":alert: *{severity}* | *{action}* `{symbol}`\n> {reason}\n• Price: ${currentPrice} | P/L: {profitPercent}%\n• DTE: {dte} days | Risk: {riskLevel}",
  },
  {
    id: "actionable",
    name: "Actionable",
    description: "Action + key metrics only",
    subjectTemplate: "{action}: {symbol} ({profitPercent}% P/L)",
    bodyTemplate: "ACTION: {action} {symbol}\n\nKey Metrics:\n- P/L: {profitPercent}% ({profitDollars})\n- Current: {currentPrice}\n- DTE: {dte} days\n\nNext Steps: {actions}",
    smsTemplate: "{action} {symbol} NOW. {profitPercent}% P/L, {dte}d left",
    slackTemplate: ":point_right: *{action}* `{symbol}` | {profitPercent}% P/L | {dte} DTE\n```{actions}```",
  },
  {
    id: "risk-aware",
    name: "Risk-Aware",
    description: "Emphasizes risk warnings and protective actions",
    subjectTemplate: "[{riskLevel} RISK] {action} {symbol}",
    bodyTemplate: "⚠️ RISK ALERT: {symbol}\n\nAction: {action}\nRisk Level: {riskLevel}\n\n{riskWarning}\n\nPosition Details:\n- Strategy: {strategy}\n- P/L: {profitPercent}%\n- DTE: {dte} days\n\nProtective Actions:\n{actions}\n\nDisclosure: {disclosure}",
    smsTemplate: "⚠️{riskLevel} {action} {symbol}: {reason}",
    slackTemplate: ":warning: *{riskLevel} RISK* | `{symbol}`\n> {riskWarning}\n*Action:* {action}\n*Reason:* {reason}",
  },
];
