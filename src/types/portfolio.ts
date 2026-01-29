// Editable on disk: config/report-templates.json, config/alert-templates.json
import reportTemplatesData from "../../config/report-templates.json";
import alertTemplatesData from "../../config/alert-templates.json";

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
  // Daily change (from market data)
  dailyChange?: number;
  dailyChangePercent?: number;
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

// Per-account strategy configuration (Setup → Strategy tab)
export type StrategyTag = "covered-call" | "cash-secured-put";

export type StrategySettings = {
  _id: string;
  accountId: string;
  thresholds: Record<
    StrategyTag,
    { minOpenInterest: number; minVolume: number; maxAssignmentProbability: number }
  >;
  createdAt: string;
  updatedAt: string;
};

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

// Scheduled Alert Types
export type ScheduledAlertStatus = "pending" | "sent" | "failed" | "cancelled";

export type ScheduledAlertSchedule =
  | { type: "immediate" }
  | { type: "daily"; time: string } // HH:MM format
  | { type: "weekly"; dayOfWeek: number; time: string } // 0-6 (Sunday-Saturday)
  | { type: "once"; datetime: string } // ISO datetime
  | { type: "recurring"; cron: string }; // Cron expression

export type ScheduledAlert = {
  _id: string;
  watchlistItemId: string;
  accountId: string;
  // Alert data
  alert: Omit<WatchlistAlert, "_id" | "createdAt" | "acknowledged" | "acknowledgedAt">;
  // Delivery configuration
  channels: AlertDeliveryChannel[];
  templateId: AlertTemplateId;
  // Schedule
  schedule: ScheduledAlertSchedule;
  // Status
  status: ScheduledAlertStatus;
  sentAt?: string;
  failedAt?: string;
  errorMessage?: string;
  // Metadata
  createdAt: string;
  updatedAt: string;
};

// Alert Configuration Types
export type AlertDeliveryChannel = "email" | "sms" | "slack" | "push" | "twitter";

export type AlertDeliveryConfig = {
  channel: AlertDeliveryChannel;
  enabled: boolean;
  target: string; // email address, phone number, slack webhook, twitter handle, etc.
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
  /** X/Twitter template (no {account}) */
  xTemplate: string;
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
  twitter: { perMessage: 0, description: "Free - X/Twitter integration" },
};

// Alert templates loaded from config/alert-templates.json. Placeholders: {account}, {action}, {symbol}, {reason}, etc.
export const ALERT_TEMPLATES: AlertTemplate[] = alertTemplatesData.templates as AlertTemplate[];

// SmartXAI Report Types
export type MarketSentiment = "bullish" | "neutral" | "bearish";

export type StockSnapshot = {
  symbol: string;
  price: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  change: number;
  changePercent: number;
  previousClose: number;
};

export type StockRationale = {
  technical: string;
  fundamental: string;
  sentiment: MarketSentiment;
  keyMetrics: {
    rsi?: number;
    volatility?: number;
    volumeVsAverage?: number;
    priceVsMA50?: number;
    priceVsMA200?: number;
  };
  marketConditions: string;
};

export type PositionAnalysis = {
  watchlistItemId: string;
  symbol: string;
  underlyingSymbol: string;
  strategy: WatchlistStrategy;
  type: WatchlistItemType;
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  profitLoss: number;
  profitLossPercent: number;
  // Market snapshot
  snapshot: StockSnapshot;
  // AI-generated rationale
  rationale: StockRationale;
  // Recommendation from analysis
  recommendation: AlertRecommendation;
  recommendationReason: string;
  // Position-specific insights
  positionInsights: {
    entryVsCurrent: string;
    riskAssessment: string;
    opportunity: string;
    timeHorizon: string;
  };
};

export type SmartXAIReport = {
  _id: string;
  accountId: string;
  reportDate: string; // ISO date string (YYYY-MM-DD)
  reportDateTime: string; // Full ISO datetime
  title: string; // "SmartXAI Says - January 26, 2026"
  summary: {
    totalPositions: number;
    totalValue: number;
    totalProfitLoss: number;
    totalProfitLossPercent: number;
    bullishCount: number;
    neutralCount: number;
    bearishCount: number;
    recommendations: {
      HOLD: number;
      CLOSE: number;
      BTC: number;
      STC: number;
      ROLL: number;
      WATCH: number;
    };
  };
  positions: PositionAnalysis[];
  marketOverview: {
    marketStatus: "open" | "closed" | "pre-market" | "after-hours";
    indices: MarketIndex[];
    overallSentiment: MarketSentiment;
  };
  createdAt: string;
  expiresAt: string; // 30 days from creation
};

// Custom Report Definitions (user-configured)
export type ReportDefinitionType = "smartxai" | "portfoliosummary" | "cleanup" | "watchlistreport";

// Report message template (e.g. for watchlist Slack). Placeholders: {date}, {reportName}, {account}, {stocks}, {options}
export type ReportTemplateId = "concise" | "detailed" | "actionable" | "risk-aware";

export type ReportTemplate = {
  id: ReportTemplateId;
  name: string;
  description: string;
  slackTemplate: string;
  /** X/Twitter template (no {account}). Placeholders: {date}, {reportName}, {stocks}, {options} */
  xTemplate: string;
};

// Report templates loaded from config/report-templates.json. Placeholders: {date}, {reportName}, {account}, {stocks}, {options}
export const REPORT_TEMPLATES: ReportTemplate[] = reportTemplatesData.templates as ReportTemplate[];

/** @deprecated Use REPORT_TEMPLATES or reportDef.templateId / customSlackTemplate */
export const WATCHLIST_REPORT_TEMPLATE = REPORT_TEMPLATES[0].slackTemplate;

export function getReportTemplate(templateId: ReportTemplateId): ReportTemplate {
  return REPORT_TEMPLATES.find((t) => t.id === templateId) ?? REPORT_TEMPLATES[0];
}

export type ReportDefinition = {
  _id: string;
  accountId: string;
  name: string;
  description: string;
  type: ReportDefinitionType;
  /** Message template style for Slack (watchlist, etc.). Default: concise */
  templateId?: ReportTemplateId;
  /** Override: custom Slack message body. Placeholders: {date}, {reportName}, {account}, {stocks}, {options} */
  customSlackTemplate?: string;
  /** Override: custom X/Twitter message body (no {account}). Placeholders: {date}, {reportName}, {stocks}, {options} */
  customXTemplate?: string;
  createdAt: string;
  updatedAt: string;
};

// Scheduled Report Jobs (user-configured)
export type ReportJobStatus = "active" | "paused";

export type ReportJob = {
  _id: string;
  accountId: string;
  name: string;
  reportId: string;
  scheduleCron: string; // cron expression
  channels: AlertDeliveryChannel[]; // slack | push | twitter
  status: ReportJobStatus;
  lastRunAt?: string;
  nextRunAt?: string;
  createdAt: string;
  updatedAt: string;
};
