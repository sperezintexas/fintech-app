// Editable on disk: config/ at repo root (../../../../ from apps/frontend/src/types)
import reportTemplatesData from "../../../../config/report-templates.json";
import alertTemplatesData from "../../../../config/alert-templates.json";

export type RiskLevel = "low" | "medium" | "high";

/** Stored tenant document: portfolio = tenant boundary. Requires explicit creation; owner is set at create (ownerXId when owner signed in with X). */
export type PortfolioDoc = {
  _id: string;
  name: string;
  /** Canonical owner (session user id at create time; for X login this is the X/Twitter user id). */
  ownerId: string;
  /** Set when portfolio was created by a user signed in with X (Twitter); same as ownerId for X-owned portfolios. */
  ownerXId?: string;
  /** X @handle of the owner (e.g. atxbogart). Set when created via X login; used for default-owner resolution. */
  ownerXHandle?: string;
  /** Session/oauth user ids that can access this portfolio (legacy + compat). */
  authorizedUserIds: string[];
  /** Usernames that can access this portfolio (e.g. atxbogart from auth_users). Primary association for X users. */
  authorizedUsers?: string[];
  /** Default name when creating a new account in this portfolio. */
  defaultAccountName?: string;
  /** Default broker name (or broker id) when creating accounts. */
  defaultBrokerName?: string;
  createdAt: Date;
  updatedAt: Date;
};

/** Add to every tenant-scoped document (Account, Alert, WatchlistItem, etc.). */
export type HasPortfolio = {
  portfolioId: string;
};

/** Risk metrics computed locally (VaR, beta, Sharpe, diversification). */
export type RiskMetrics = {
  totalValue: number;
  vaR95: number;
  beta: number;
  sharpe: number;
  diversification: number;
  volatility: number;
  positionCount: number;
};

/** Grok risk analysis output. */
export type RiskAnalysis = {
  riskLevel: "low" | "medium" | "high";
  recommendations: string[];
  confidence: number;
  explanation: string;
  /** Optional: estimated probability (0–100) of reaching the configured goal (e.g. $10M by 2030). */
  goalProbabilityPercent?: number;
};

export type Strategy = "growth" | "income" | "balanced" | "aggressive";

export type PositionType = "stock" | "option" | "cash";

export type OptionType = "call" | "put";

/** Activity type for import/sync (Ghostfolio-style). Used by activities collection and POST /api/import/activities. */
export type ActivityType = "BUY" | "SELL" | "DIVIDEND" | "FEE" | "INTEREST" | "LIABILITY";

export type ActivityDataSource = "MANUAL" | "YAHOO" | "IMPORT";

export type Activity = {
  _id: string;
  accountId: string;
  symbol: string;
  type: ActivityType;
  date: string;
  quantity: number;
  unitPrice: number;
  fee?: number;
  dataSource?: ActivityDataSource;
  comment?: string;
  /** Option-specific (for options activities). */
  optionType?: "call" | "put";
  strike?: number;
  expiration?: string;
  createdAt: string;
  updatedAt: string;
};

/** Payload item for POST /api/import/activities (same shape as Ghostfolio import, plus optional option fields). */
export type ActivityImportItem = {
  symbol: string;
  date: string;
  type: ActivityType;
  quantity: number;
  unitPrice: number;
  fee?: number;
  dataSource?: ActivityDataSource;
  comment?: string;
  optionType?: "call" | "put";
  strike?: number;
  expiration?: string;
};

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
  /** Current underlying stock price (options only; from API). */
  underlyingPrice?: number;
};

export type Recommendation = {
  id: string;
  type: "buy" | "sell" | "hold";
  ticker: string;
  reason: string;
  confidence: number;
  createdAt: string;
};

/** Broker type for import/export format (Merrill = generic/Merrill CSV; Fidelity = Fidelity CSV). */
export type BrokerType = "Merrill" | "Fidelity";

/** User-managed broker (name); accounts can reference for display. Logo from disk (Merrill/Fidelity) or color initial in UI. */
export type Broker = {
  _id: string;
  name: string;
  /** Display order (lower first). */
  order?: number;
  createdAt?: string;
  updatedAt?: string;
};

export type Account = {
  _id: string;
  name: string;
  /** Broker/source account ref for import mapping (e.g. Merrill "51X-98940"). Not the MongoDB _id. */
  accountRef?: string;
  /** Broker type so import/export uses the right CSV format. */
  brokerType?: BrokerType;
  /** Reference to a Broker (for logo/name display). */
  brokerId?: string;
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
  /** When true (default), Covered Call Scanner does not evaluate watchlist items during daily job to save time. */
  excludeWatchlist?: boolean;
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
  /** Last daily-analysis recommendation + reason; updated when watchlist report runs */
  rationale?: string;
  /** Company name (e.g. longName from quote); enriched by API when loading watchlist */
  companyDescription?: string;
  /** Company business summary (e.g. longBusinessSummary from Yahoo); enriched by API when loading watchlist */
  companyOverview?: string;
  /** Company logo URL (e.g. from Ticker Logos CDN); enriched by API when loading watchlist */
  companyLogoUrl?: string;
  /** Live quote details (price, day change, volume, range); enriched by API when loading watchlist */
  symbolDetails?: SymbolDetails;
  addedAt: string;
  updatedAt: string;
};

export type SymbolDetails = {
  name?: string;
  price?: number;
  open?: number;
  high?: number;
  low?: number;
  volume?: number;
  change?: number;
  changePercent?: number;
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
  target: string; // email address, phone number, slack webhook, X handle, etc.
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
  /** X template (no {account}) */
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
  twitter: { perMessage: 0, description: "Free - X integration" },
};

// Alert templates loaded from config/alert-templates.json. Placeholders: {account}, {action}, {symbol}, {reason}, etc.
export const ALERT_TEMPLATES: AlertTemplate[] = alertTemplatesData.templates as AlertTemplate[];

/** Per-job alert delivery configuration (stored in alertConfigs collection). */
export type AlertConfigJobType =
  | "daily-analysis"
  | "option-scanner"
  | "covered-call"
  | "protective-put"
  | "straddle-strangle"
  | "risk-scanner";

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
  /** X template (no {account}). Placeholders: {date}, {reportName}, {stocks}. Watchlist X posts exclude options. */
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
  /** Override: custom X message body (no {account}). Placeholders: {date}, {reportName}, {stocks}, {options} */
  customXTemplate?: string;
  /** Scanner config for OptionScanner report type (holdDteMin, btcDteMax, etc.) */
  scannerConfig?: OptionScannerConfig;
  createdAt: string;
  updatedAt: string;
};

// Scheduled Tasks (task type + config; stored in reportJobs collection)
export type TaskStatus = "active" | "paused";

/** Type-specific task config (JSON). Validated by Zod per taskType. */
export type TaskConfig = Record<string, unknown>;

export type Task = {
  _id: string;
  /** null = portfolio (all accounts) */
  accountId: string | null;
  name: string;
  /** Task type id from reportTypes collection (e.g. smartxai, unifiedOptionsScanner) */
  jobType: string;
  /** Message template (Handlebars/Mustache) for alert/report messages */
  messageTemplate?: string;
  /** Type-specific config (coveredCallScanner, csp-analysis, etc.) */
  config?: TaskConfig;
  /** Message template for watchlist/smartxai/portfoliosummary (legacy) */
  templateId?: ReportTemplateId;
  customSlackTemplate?: string;
  customXTemplate?: string;
  /** Scanner config for OptionScanner task type (legacy) */
  scannerConfig?: OptionScannerConfig;
  scheduleCron: string;
  /** Delivery channels (slack, push, twitter, email) */
  channels: AlertDeliveryChannel[];
  status: TaskStatus;
  lastRunAt?: string;
  /** Set when last run failed (e.g. handler or delivery error). */
  lastRunError?: string;
  /** Run summary/notes for task run history (e.g. unified scanner stats + breakdown). */
  lastRunNotes?: string;
  nextRunAt?: string;
  createdAt: string;
  updatedAt: string;
};

/** @deprecated Use Task */
export type Job = Task;
/** @deprecated Use TaskStatus */
export type JobStatus = TaskStatus;
/** @deprecated Use TaskConfig */
export type JobConfig = TaskConfig;


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
  /** Probability of assignment (0–100) for short calls; shown in alerts. */
  assignmentProbability?: number;
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
  /** Option premium (cost) per share at purchase; shown in alerts. */
  unitCost?: number;
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
  /** Probability of assignment (0–100) for short call; shown in alerts. */
  assignmentProbability?: number;
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
  /** Suggested call options (symbol-mode SELL_NEW_CALL: OTM calls 1–14 DTE, ranked by premium). */
  suggestedCalls?: Array<{
    strike: number;
    expiration: string;
    dte: number;
    bid: number;
    ask: number;
    premium: number;
    otmPercent: number;
  }>;
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
