/**
 * Watchlist Rules Engine
 * Analyzes positions and generates recommendations based on:
 * - Account risk level (low/medium/high)
 * - Strategy type (covered-call, CSP, wheel, etc.)
 * - Technical indicators (RSI, MACD, volatility)
 * - Price movements and profit/loss
 */

import type {
  RiskLevel,
  WatchlistItem,
  WatchlistAlert,
  AlertRecommendation,
  AlertSeverity,
  TechnicalIndicators,
} from "@/types/portfolio";

// Risk disclosures from ODD (Options Disclosure Document)
export const RISK_DISCLOSURES = {
  "covered-call": {
    description: "Covered calls limit upside potential while providing downside premium cushion.",
    risks: [
      "Stock may be called away if price rises above strike",
      "Downside protection limited to premium received",
      "Early assignment risk near ex-dividend dates",
    ],
    maxLossDesc: "Full stock value minus premium received",
  },
  "cash-secured-put": {
    description: "Cash-secured puts obligate purchase of stock at strike price.",
    risks: [
      "Must buy stock at strike even if market price is much lower",
      "Ties up cash that could be used elsewhere",
      "Assignment can happen early for American-style options",
    ],
    maxLossDesc: "Strike price minus premium (if stock goes to zero)",
  },
  "uncovered-call": {
    description: "EXTREME RISK: Uncovered/naked calls have unlimited loss potential.",
    risks: [
      "UNLIMITED LOSS POTENTIAL - stock can rise indefinitely",
      "Margin calls may force position closure at worst time",
      "Requires highest options approval level",
      "Not suitable for most investors",
    ],
    maxLossDesc: "UNLIMITED",
  },
  "uncovered-put": {
    description: "HIGH RISK: Uncovered puts can result in substantial losses.",
    risks: [
      "Maximum loss equals strike price minus premium if stock goes to zero",
      "Requires margin account and significant buying power",
      "Early assignment risk",
    ],
    maxLossDesc: "Strike price × 100 per contract",
  },
  wheel: {
    description: "Wheel strategy combines CSPs and covered calls for income generation.",
    risks: [
      "May hold stock through significant declines",
      "Opportunity cost if stock rises significantly",
      "Requires substantial capital for cash-secured puts",
    ],
    maxLossDesc: "Full stock value if assigned on put and stock goes to zero",
  },
  "leap-call": {
    description: "LEAP calls provide leveraged upside with defined risk.",
    risks: [
      "Can lose 100% of premium paid",
      "Time decay accelerates in final months",
      "Less liquid than shorter-term options",
    ],
    maxLossDesc: "100% of premium paid",
  },
  "long-stock": {
    description: "Long stock has unlimited upside potential.",
    risks: [
      "Full capital at risk if company goes bankrupt",
      "No premium income like options strategies",
      "Dividend cuts can impact income",
    ],
    maxLossDesc: "100% of investment",
  },
  collar: {
    description: "Collar protects downside with put while funding via covered call.",
    risks: [
      "Limits both upside and downside",
      "May trigger wash sale rules if closed at loss",
      "Complexity in managing two options legs",
    ],
    maxLossDesc: "Stock price - put strike + net premium paid",
  },
};

// Rule thresholds by risk level
type RuleThresholds = {
  profitTarget: number; // % gain to consider closing
  stopLoss: number; // % loss to consider closing
  rsiOversold: number; // RSI below = oversold
  rsiOverbought: number; // RSI above = overbought
  volatilityHigh: number; // IV above = high volatility
  daysToExpWarning: number; // Days before expiration to warn
  profitCapturedClose: number; // % of max profit captured to close
};

const THRESHOLDS: Record<RiskLevel, RuleThresholds> = {
  low: {
    profitTarget: 15,
    stopLoss: 10,
    rsiOversold: 35,
    rsiOverbought: 65,
    volatilityHigh: 40,
    daysToExpWarning: 14,
    profitCapturedClose: 70,
  },
  medium: {
    profitTarget: 25,
    stopLoss: 15,
    rsiOversold: 30,
    rsiOverbought: 70,
    volatilityHigh: 50,
    daysToExpWarning: 10,
    profitCapturedClose: 75,
  },
  high: {
    profitTarget: 40,
    stopLoss: 25,
    rsiOversold: 25,
    rsiOverbought: 75,
    volatilityHigh: 60,
    daysToExpWarning: 7,
    profitCapturedClose: 80,
  },
};

export type MarketData = {
  currentPrice: number;
  previousClose: number;
  change: number;
  changePercent: number;
  optionBid?: number;
  optionAsk?: number;
  optionMid?: number;
};

export type AnalysisResult = {
  recommendation: AlertRecommendation;
  severity: AlertSeverity;
  reason: string;
  details: WatchlistAlert["details"];
  riskWarning?: string;
  suggestedActions: string[];
  confidence: number;
};

/**
 * Main analysis function - evaluates a watchlist item
 */
export function analyzeWatchlistItem(
  item: WatchlistItem,
  riskLevel: RiskLevel,
  marketData: MarketData,
  technicals?: TechnicalIndicators
): AnalysisResult {
  const thresholds = THRESHOLDS[riskLevel];
  const priceChange = marketData.currentPrice - item.entryPrice;
  const priceChangePercent = (priceChange / item.entryPrice) * 100;

  // Calculate days to expiration for options
  let daysToExpiration: number | undefined;
  if (item.expirationDate) {
    const expDate = new Date(item.expirationDate);
    const now = new Date();
    daysToExpiration = Math.ceil(
      (expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );
  }

  // Calculate profit captured for options
  let profitCaptured: number | undefined;
  if (item.entryPremium && marketData.optionMid !== undefined) {
    const currentValue = marketData.optionMid;
    const maxProfit = item.entryPremium;
    profitCaptured = ((maxProfit - currentValue) / maxProfit) * 100;
  }

  // Base details
  const details: WatchlistAlert["details"] = {
    currentPrice: marketData.currentPrice,
    entryPrice: item.entryPrice,
    priceChange,
    priceChangePercent,
    daysToExpiration,
    rsi: technicals?.rsi,
    volatility: technicals?.volatility,
    profitCaptured,
  };

  // Route to strategy-specific analysis
  switch (item.strategy) {
    case "covered-call":
      return analyzeCoveredCall(item, riskLevel, marketData, technicals, details, thresholds);
    case "cash-secured-put":
      return analyzeCSP(item, riskLevel, marketData, technicals, details, thresholds);
    case "wheel":
      return analyzeWheel(item, riskLevel, marketData, technicals, details, thresholds);
    case "long-stock":
      return analyzeLongStock(item, riskLevel, marketData, technicals, details, thresholds);
    case "leap-call":
      return analyzeLEAP(item, riskLevel, marketData, technicals, details, thresholds);
    default:
      return analyzeGeneric(item, riskLevel, marketData, technicals, details, thresholds);
  }
}

/**
 * Covered Call Analysis
 */
function analyzeCoveredCall(
  item: WatchlistItem,
  riskLevel: RiskLevel,
  marketData: MarketData,
  technicals: TechnicalIndicators | undefined,
  details: WatchlistAlert["details"],
  thresholds: RuleThresholds
): AnalysisResult {
  const actions: string[] = [];
  let recommendation: AlertRecommendation = "HOLD";
  let severity: AlertSeverity = "info";
  let reason = "";
  let confidence = 70;

  const { daysToExpiration, profitCaptured } = details;
  const strikePrice = item.strikePrice || 0;
  const stockPrice = marketData.currentPrice;
  const moneyness = ((stockPrice - strikePrice) / strikePrice) * 100;

  // Rule 1: Expiration approaching
  if (daysToExpiration !== undefined && daysToExpiration <= thresholds.daysToExpWarning) {
    if (daysToExpiration <= 3) {
      severity = "urgent";
      reason = `Expiration in ${daysToExpiration} days. `;
      if (stockPrice < strikePrice) {
        recommendation = "HOLD";
        reason += "Stock below strike - let expire worthless to keep premium and stock.";
        actions.push("Monitor closely for price spike above strike");
        actions.push("Consider rolling out if you want to maintain position");
      } else {
        recommendation = "ROLL";
        reason += "Stock above strike - will be assigned. Roll out/up to avoid assignment.";
        actions.push("Roll to next month at same or higher strike");
        actions.push("Or let assign and sell new CSP to restart wheel");
      }
      confidence = 85;
    } else {
      reason = `Expiration in ${daysToExpiration} days. `;
      severity = "warning";
    }
  }

  // Rule 2: Profit captured threshold
  if (profitCaptured !== undefined && profitCaptured >= thresholds.profitCapturedClose) {
    recommendation = "BTC";
    severity = severity === "info" ? "warning" : severity;
    reason = `${profitCaptured.toFixed(0)}% of max profit captured. `;
    reason += "Consider buying to close early to lock in gains and free up capital.";
    actions.push(`Buy to close at ~$${(marketData.optionMid || 0).toFixed(2)}`);
    actions.push("Sell new call at higher strike or further expiration");
    confidence = 80;
  }

  // Rule 3: Stock significantly below strike (safe)
  if (moneyness < -10) {
    if (!reason) {
      recommendation = "HOLD";
      reason = `Stock ${Math.abs(moneyness).toFixed(0)}% below strike. Safe from assignment.`;
      severity = "info";
      actions.push("Continue holding - theta decay working in your favor");
      if (riskLevel === "high") {
        actions.push("Consider rolling down strike to collect more premium");
      }
    }
  }

  // Rule 4: Stock above strike (assignment risk)
  if (stockPrice > strikePrice) {
    severity = "warning";
    recommendation = reason ? recommendation : "WATCH";
    reason = reason || `Stock $${(stockPrice - strikePrice).toFixed(2)} above strike. Assignment risk. `;
    actions.push("Be prepared for assignment");
    actions.push("Roll up and out if you want to keep shares");
  }

  // Rule 5: RSI extreme
  if (technicals?.rsi) {
    if (technicals.rsi < thresholds.rsiOversold) {
      reason += ` RSI=${technicals.rsi.toFixed(0)} (oversold). `;
      if (riskLevel !== "low") {
        actions.push("Stock may rebound - favorable for covered call holder");
      }
    } else if (technicals.rsi > thresholds.rsiOverbought) {
      reason += ` RSI=${technicals.rsi.toFixed(0)} (overbought). `;
      actions.push("Watch for pullback - assignment risk if continues higher");
    }
  }

  // Rule 6: High volatility
  if (technicals?.volatility && technicals.volatility > thresholds.volatilityHigh) {
    reason += ` IV=${technicals.volatility.toFixed(0)}% (elevated). `;
    if (riskLevel === "high") {
      actions.push("High IV = higher premiums. Consider selling more calls.");
    }
  }

  // Default case
  if (!reason) {
    recommendation = "HOLD";
    reason = "Position within normal parameters. Continue collecting theta decay.";
    actions.push("Monitor for significant price movements");
  }

  return {
    recommendation,
    severity,
    reason: reason.trim(),
    details,
    riskWarning: (() => {
  const rsiStr = technicals?.rsi ? `RSI ${technicals.rsi.toFixed(0)}` : 'RSI N/A';
  const moneynessPct = ((stockPrice - strikePrice) / strikePrice) * 100;
  let probStr: string;
  if (moneynessPct > 5) probStr = '>80%';
  else if (moneynessPct > 0) probStr = '60-80%';
  else if (moneynessPct > -5) probStr = '30-60%';
  else probStr = '<30%';
  return `Risk: Stock may be called away if price rises above strike (${probStr} est. prob). ${rsiStr}.`;
})(),
    suggestedActions: actions,
    confidence,
  };
}

/**
 * Cash-Secured Put Analysis
 */
function analyzeCSP(
  item: WatchlistItem,
  riskLevel: RiskLevel,
  marketData: MarketData,
  technicals: TechnicalIndicators | undefined,
  details: WatchlistAlert["details"],
  thresholds: RuleThresholds
): AnalysisResult {
  const actions: string[] = [];
  let recommendation: AlertRecommendation = "HOLD";
  let severity: AlertSeverity = "info";
  let reason = "";
  let confidence = 70;

  const { daysToExpiration, profitCaptured } = details;
  const strikePrice = item.strikePrice || 0;
  const stockPrice = marketData.currentPrice;
  const percentBelowStrike = ((strikePrice - stockPrice) / strikePrice) * 100;

  // Rule 1: Stock dropped significantly below strike
  if (percentBelowStrike > 10) {
    severity = "warning";
    recommendation = "WATCH";
    reason = `Stock ${percentBelowStrike.toFixed(0)}% below strike. Assignment likely. `;

    if (percentBelowStrike > 20) {
      severity = "urgent";
      if (riskLevel === "low") {
        recommendation = "BTC";
        reason += "Consider closing to avoid assignment at unfavorable price.";
        actions.push("Buy to close put to avoid assignment");
        actions.push("Reassess if you still want to own this stock");
      } else {
        recommendation = "HOLD";
        reason += "If bullish long-term, accept assignment and sell covered calls.";
        actions.push("Prepare cash for assignment");
        actions.push("Plan covered call strike for after assignment");
      }
    }
    confidence = 80;
  }

  // Rule 2: Expiration approaching
  if (daysToExpiration !== undefined && daysToExpiration <= thresholds.daysToExpWarning) {
    if (daysToExpiration <= 3) {
      severity = severity === "info" ? "warning" : severity;
      reason += `Expiration in ${daysToExpiration} days. `;

      if (stockPrice > strikePrice) {
        recommendation = "HOLD";
        reason += "Stock above strike - put will expire worthless. Keep premium!";
        actions.push("Let expire worthless");
        actions.push("Sell new CSP for next cycle");
        confidence = 90;
      } else {
        reason += "Stock below strike - expect assignment.";
        actions.push("Ensure cash is available for stock purchase");
      }
    }
  }

  // Rule 3: Profit captured threshold
  if (profitCaptured !== undefined && profitCaptured >= thresholds.profitCapturedClose) {
    recommendation = "BTC";
    severity = severity === "info" ? "warning" : severity;
    reason = `${profitCaptured.toFixed(0)}% of max profit captured. `;
    reason += "Close early to free up cash for new opportunity.";
    actions.push(`Buy to close at ~$${(marketData.optionMid || 0).toFixed(2)}`);
    actions.push("Sell new CSP at lower strike or further expiration");
    confidence = 80;
  }

  // Rule 4: RSI indicates oversold
  if (technicals?.rsi && technicals.rsi < thresholds.rsiOversold) {
    reason += ` RSI=${technicals.rsi.toFixed(0)} (oversold). `;
    if (riskLevel === "high") {
      recommendation = "HOLD";
      actions.push("Oversold condition - potential rebound. Good entry if assigned.");
    } else {
      actions.push("Watch for further decline before assignment");
    }
  }

  // Default case
  if (!reason) {
    recommendation = "HOLD";
    reason = "Position within normal parameters. Continue collecting theta decay.";
    actions.push("Monitor underlying stock price");
    actions.push("Ensure cash remains available");
  }

  return {
    recommendation,
    severity,
    reason: reason.trim(),
    details,
    riskWarning: RISK_DISCLOSURES["cash-secured-put"].risks[0],
    suggestedActions: actions,
    confidence,
  };
}

/**
 * Wheel Strategy Analysis
 */
function analyzeWheel(
  item: WatchlistItem,
  riskLevel: RiskLevel,
  marketData: MarketData,
  technicals: TechnicalIndicators | undefined,
  details: WatchlistAlert["details"],
  thresholds: RuleThresholds
): AnalysisResult {
  // Wheel is CSP until assigned, then covered call
  if (item.type === "csp" || item.type === "put") {
    const result = analyzeCSP(item, riskLevel, marketData, technicals, details, thresholds);
    result.suggestedActions.push("After assignment: sell covered call to continue wheel");
    return result;
  } else {
    const result = analyzeCoveredCall(item, riskLevel, marketData, technicals, details, thresholds);
    result.suggestedActions.push("After call assignment: sell CSP to restart wheel");
    return result;
  }
}

/**
 * Long Stock Analysis
 */
function analyzeLongStock(
  item: WatchlistItem,
  riskLevel: RiskLevel,
  marketData: MarketData,
  technicals: TechnicalIndicators | undefined,
  details: WatchlistAlert["details"],
  thresholds: RuleThresholds
): AnalysisResult {
  const actions: string[] = [];
  let recommendation: AlertRecommendation = "HOLD";
  let severity: AlertSeverity = "info";
  let reason = "";
  let confidence = 70;

  const { priceChangePercent } = details;

  // Rule 1: Profit target hit
  if (priceChangePercent >= thresholds.profitTarget) {
    severity = "warning";
    if (riskLevel === "low") {
      recommendation = "CLOSE";
      reason = `Up ${priceChangePercent.toFixed(1)}% - profit target reached.`;
      actions.push("Consider taking profits");
      actions.push("Or set trailing stop to protect gains");
    } else {
      recommendation = "HOLD";
      reason = `Up ${priceChangePercent.toFixed(1)}%. Consider selling covered calls for income.`;
      actions.push("Sell covered calls to generate income");
      actions.push("Set stop loss to protect gains");
    }
    confidence = 75;
  }

  // Rule 2: Stop loss hit
  if (priceChangePercent <= -thresholds.stopLoss) {
    severity = "urgent";
    if (riskLevel === "low" || riskLevel === "medium") {
      recommendation = "CLOSE";
      reason = `Down ${Math.abs(priceChangePercent).toFixed(1)}% - stop loss triggered.`;
      actions.push("Consider exiting to prevent further losses");
      confidence = 85;
    } else {
      recommendation = "WATCH";
      reason = `Down ${Math.abs(priceChangePercent).toFixed(1)}%. Review thesis - hold if unchanged.`;
      actions.push("Reassess investment thesis");
      actions.push("Consider averaging down if still bullish");
    }
  }

  // Rule 3: RSI extreme
  if (technicals?.rsi) {
    if (technicals.rsi < thresholds.rsiOversold) {
      reason += ` RSI=${technicals.rsi.toFixed(0)} (oversold). `;
      actions.push("Potential buying opportunity if thesis intact");
    } else if (technicals.rsi > thresholds.rsiOverbought) {
      reason += ` RSI=${technicals.rsi.toFixed(0)} (overbought). `;
      actions.push("Consider trimming position or selling calls");
    }
  }

  // Default case
  if (!reason) {
    recommendation = "HOLD";
    reason = "Position within normal parameters.";
    actions.push("Monitor for significant news or price movements");
  }

  return {
    recommendation,
    severity,
    reason: reason.trim(),
    details,
    suggestedActions: actions,
    confidence,
  };
}

/**
 * LEAP Call Analysis
 */
function analyzeLEAP(
  item: WatchlistItem,
  riskLevel: RiskLevel,
  marketData: MarketData,
  _technicals: TechnicalIndicators | undefined,
  details: WatchlistAlert["details"],
  _thresholds: RuleThresholds
): AnalysisResult {
  const actions: string[] = [];
  let recommendation: AlertRecommendation = "HOLD";
  let severity: AlertSeverity = "info";
  let reason = "";
  let confidence = 70;

  const { daysToExpiration, priceChangePercent } = details;
  const strikePrice = item.strikePrice || 0;
  const stockPrice = marketData.currentPrice;

  // Rule 1: Time decay warning (< 6 months)
  if (daysToExpiration !== undefined && daysToExpiration < 180) {
    severity = "warning";
    reason = `Only ${daysToExpiration} days to expiration. Time decay accelerating. `;

    if (stockPrice < strikePrice) {
      severity = "urgent";
      recommendation = "CLOSE";
      reason += "LEAP is OTM - consider closing before further decay.";
      actions.push("Close position to salvage remaining value");
      actions.push("Or roll to further expiration if still bullish");
      confidence = 80;
    } else {
      actions.push("Monitor theta decay closely");
      actions.push("Consider rolling to later expiration");
    }
  }

  // Rule 2: Large gain
  if (priceChangePercent >= 50) {
    severity = "warning";
    recommendation = riskLevel === "high" ? "HOLD" : "STC";
    reason = `LEAP up ${priceChangePercent.toFixed(0)}%. `;
    if (riskLevel !== "high") {
      reason += "Consider taking profits.";
      actions.push("Sell to close for profit");
      actions.push("Or sell portion and let rest ride");
    } else {
      reason += "Holding for higher target per aggressive strategy.";
      actions.push("Set trailing stop to protect gains");
    }
    confidence = 75;
  }

  // Rule 3: Large loss
  if (priceChangePercent <= -50) {
    severity = "critical";
    recommendation = "WATCH";
    reason = `LEAP down ${Math.abs(priceChangePercent).toFixed(0)}%. Major loss. `;
    actions.push("Reassess thesis - has anything changed fundamentally?");
    if (riskLevel === "low") {
      recommendation = "CLOSE";
      actions.push("Consider closing to prevent total loss");
    }
    confidence = 75;
  }

  // Default case
  if (!reason) {
    recommendation = "HOLD";
    reason = "LEAP within normal parameters. Time is on your side with >6mo remaining.";
    actions.push("Monitor underlying for thesis confirmation");
  }

  return {
    recommendation,
    severity,
    reason: reason.trim(),
    details,
    riskWarning: RISK_DISCLOSURES["leap-call"].risks[0],
    suggestedActions: actions,
    confidence,
  };
}

/**
 * Generic Analysis for other strategies
 */
function analyzeGeneric(
  _item: WatchlistItem,
  _riskLevel: RiskLevel,
  _marketData: MarketData,
  _technicals: TechnicalIndicators | undefined,
  details: WatchlistAlert["details"],
  thresholds: RuleThresholds
): AnalysisResult {
  const actions: string[] = [];
  let recommendation: AlertRecommendation = "HOLD";
  let severity: AlertSeverity = "info";
  const { priceChangePercent } = details;

  const reason = `Position ${priceChangePercent >= 0 ? "up" : "down"} ${Math.abs(priceChangePercent).toFixed(1)}%.`;

  if (Math.abs(priceChangePercent) > thresholds.profitTarget) {
    severity = "warning";
    recommendation = "WATCH";
    actions.push("Review position and consider action");
  }

  actions.push("Monitor for significant changes");

  return {
    recommendation,
    severity,
    reason,
    details,
    suggestedActions: actions,
    confidence: 60,
  };
}

/**
 * Get risk disclosure for a strategy
 */
export function getRiskDisclosure(strategy: WatchlistItem["strategy"]): typeof RISK_DISCLOSURES[keyof typeof RISK_DISCLOSURES] {
  return RISK_DISCLOSURES[strategy] || RISK_DISCLOSURES["long-stock"];
}
