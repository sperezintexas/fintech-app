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
  // Enriched by API (holdings with market values)
  marketValue?: number;
  unrealizedPL?: number;
  unrealizedPLPercent?: number;
  isExpired?: boolean;
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
export type Watchlist = {
  _id: string;
  name: string;
  purpose: string;
  createdAt: string;
  updatedAt: string;
};

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
  watchlistId: string;
  accountId?: string;
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
  accountId?: string;
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

/** Per-job alert delivery configuration (stored in alertConfigs collection). */
export type AlertConfigJobType =
  | "daily-analysis"
  | "option-scanner"
  | "covered-call"
  | "protective-put"
  | "straddle-strangle";

export type AlertDeliveryStatus = "pending" | "sent" | "failed";

export type AlertConfig = {
  _id?: string;
  jobType: AlertConfigJobType;
  accountId?: string; // optional: per-account override; omit for global default
  channels: Array<"slack" | "twitter">;
  templateId: AlertTemplateId;
  thresholds: {
    minPlPercent?: number; // only alert if |P/L| >= this
    maxDte?: number; // only alert if DTE <= this (for options)
  };
  quietHours?: {
    start: string; // HH:MM (24h)
    end: string; // HH:MM (24h)
    timezone?: string; // e.g. America/New_York
  };
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

/** Delivery record per channel (stored on alert doc). */
export type AlertDeliveryRecord = {
  channel: "slack" | "twitter";
  status: AlertDeliveryStatus;
  sentAt?: string;
  error?: string;
};

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
/** Legacy union - report types are now stored in reportTypes collection. Use string for type. */
export type ReportDefinitionType = "smartxai" | "portfoliosummary" | "cleanup" | "watchlistreport";

// Report message template (e.g. for watchlist Slack). Placeholders: {date}, {reportName}, {account}, {stocks}, {options}
export type ReportTemplateId = "concise" | "detailed" | "actionable" | "risk-aware";

export type ReportTemplate = {
  id: ReportTemplateId;
  name: string;
  description: string;
  slackTemplate: string;
  /** X/Twitter template (no {account}). Placeholders: {date}, {reportName}, {stocks}. Watchlist X posts exclude options. */
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
  /** null = portfolio (all accounts) */
  accountId: string | null;
  name: string;
  description: string;
  /** Report type id from reportTypes collection (e.g. smartxai, portfoliosummary, custom types) */
  type: string;
  /** Message template style for Slack (watchlist, etc.). Default: concise */
  templateId?: ReportTemplateId;
  /** Override: custom Slack message body. Placeholders: {date}, {reportName}, {account}, {stocks}, {options} */
  customSlackTemplate?: string;
  /** Override: custom X/Twitter message body (no {account}). Placeholders: {date}, {reportName}, {stocks}, {options} */
  customXTemplate?: string;
  /** Scanner config for OptionScanner report type (holdDteMin, btcDteMax, etc.) */
  scannerConfig?: OptionScannerConfig;
  createdAt: string;
  updatedAt: string;
};

// Scheduled Jobs (job type + config, no report definitions)
export type JobStatus = "active" | "paused";

/** Type-specific job config (JSON). Validated by Zod per jobType. */
export type JobConfig = Record<string, unknown>;

export type Job = {
  _id: string;
  /** null = portfolio (all accounts) */
  accountId: string | null;
  name: string;
  /** Job type id from jobTypes/reportTypes collection (e.g. smartxai, OptionScanner) */
  jobType: string;
  /** Message template (Handlebars/Mustache) for alert/report messages */
  messageTemplate?: string;
  /** Type-specific config (coveredCallScanner, csp-analysis, etc.) */
  config?: JobConfig;
  /** Message template for watchlist/smartxai/portfoliosummary (legacy) */
  templateId?: ReportTemplateId;
  customSlackTemplate?: string;
  customXTemplate?: string;
  /** Scanner config for OptionScanner job type (legacy) */
  scannerConfig?: OptionScannerConfig;
  scheduleCron: string;
  /** Delivery channels (slack, push, twitter, email) */
  channels: AlertDeliveryChannel[];
  status: JobStatus;
  lastRunAt?: string;
  nextRunAt?: string;
  createdAt: string;
  updatedAt: string;
};


// Option Scanner Types
export type OptionRecommendationAction = "HOLD" | "BUY_TO_CLOSE";

export type OptionRecommendationMetrics = {
  price: number;
  underlyingPrice: number;
  dte: number;
  pl: number;
  plPercent: number;
  intrinsicValue: number;
  timeValue: number;
  impliedVolatility?: number;
};

export type OptionRecommendation = {
  positionId: string;
  accountId: string;
  symbol: string;
  underlyingSymbol: string;
  strike: number;
  expiration: string;
  optionType: "call" | "put";
  contracts: number;
  recommendation: OptionRecommendationAction;
  reason: string;
  metrics: OptionRecommendationMetrics;
  source?: "rules" | "grok";
  preliminaryRecommendation?: OptionRecommendationAction;
  preliminaryReason?: string;
  createdAt: string;
};

/** Configurable rules for Option Scanner (via job data or report config). */
export type OptionScannerConfig = {
  /** DTE threshold: recommend HOLD if above this. Default 14. */
  holdDteMin?: number;
  /** DTE threshold: recommend BTC if below this. Default 7. */
  btcDteMax?: number;
  /** P/L percent threshold: recommend BTC (stop loss) if below this. Default -50. */
  btcStopLossPercent?: number;
  /** Time value as % of premium: HOLD if above. Default 20. */
  holdTimeValuePercentMin?: number;
  /** IV threshold: lean BTC for puts if above. Default 30. */
  highVolatilityPercent?: number;
  /** Account risk profile: conservative = BTC earlier. */
  riskProfile?: RiskLevel;
  /** Hybrid Grok: enable Grok for edge candidates. Default true. */
  grokEnabled?: boolean;
  /** Hybrid: send to Grok if |P/L| > this %. Default 12. */
  grokCandidatesPlPercent?: number;
  /** Hybrid: send to Grok if DTE < this. Default 14. */
  grokCandidatesDteMax?: number;
  /** Hybrid: send to Grok if IV > this. Default 55. */
  grokCandidatesIvMin?: number;
  /** Hybrid: max parallel Grok calls. Default 6. */
  grokMaxParallel?: number;
  /** Override Grok system prompt for HOLD/BTC decisions. Leave empty for default. */
  grokSystemPromptOverride?: string;
};

// Covered Call Analyzer Types
export type CoveredCallRecommendationAction =
  | "HOLD"
  | "BUY_TO_CLOSE"
  | "SELL_NEW_CALL"
  | "ROLL"
  | "NONE";

export type CoveredCallConfidence = "HIGH" | "MEDIUM" | "LOW";

export type CoveredCallRecommendationMetrics = {
  stockPrice: number;
  callBid: number;
  callAsk: number;
  dte: number;
  netPremium: number;
  unrealizedPl: number;
  annualizedReturn?: number;
  breakeven: number;
  extrinsicValue?: number;
  extrinsicPercentOfPremium?: number;
  moneyness?: "ITM" | "ATM" | "OTM";
  iv?: number;
  ivRank?: number;
};

export type CoveredCallRecommendation = {
  accountId: string;
  symbol: string;
  stockPositionId?: string;
  callPositionId?: string;
  watchlistItemId?: string;
  source: "holdings" | "watchlist";
  recommendation: CoveredCallRecommendationAction;
  confidence: CoveredCallConfidence;
  reason: string;
  suggestedStrike?: number;
  suggestedExpiration?: string;
  /** Strike/expiration for Grok context (set when building rec). */
  strikePrice?: number;
  expirationDate?: string;
  entryPremium?: number;
  metrics: CoveredCallRecommendationMetrics;
  createdAt: string;
  /** True if Grok was used to refine this recommendation. */
  grokEvaluated?: boolean;
  /** Grok's reasoning when grokEvaluated is true. */
  grokReasoning?: string;
};

// Protective Put Analyzer Types
export type ProtectivePutRecommendationAction =
  | "HOLD"
  | "SELL_TO_CLOSE"
  | "ROLL"
  | "BUY_NEW_PUT"
  | "NONE";

export type ProtectivePutConfidence = "HIGH" | "MEDIUM" | "LOW";

export type ProtectivePutRecommendationMetrics = {
  stockPrice: number;
  putBid: number;
  putAsk: number;
  dte: number;
  netProtectionCost: number;
  effectiveFloor: number;
  putDelta?: number;
  iv?: number;
  ivRank?: number;
  stockUnrealizedPl: number;
  stockUnrealizedPlPercent: number;
  protectionCostPercent: number;
  extrinsicValue?: number;
  extrinsicPercentOfPremium?: number;
  moneyness?: "ITM" | "ATM" | "OTM";
};

export type ProtectivePutRecommendation = {
  accountId: string;
  symbol: string;
  stockPositionId?: string;
  putPositionId?: string;
  recommendation: ProtectivePutRecommendationAction;
  confidence: ProtectivePutConfidence;
  reason: string;
  suggestedStrike?: number;
  suggestedExpiration?: string;
  metrics: ProtectivePutRecommendationMetrics;
  createdAt: string;
};
