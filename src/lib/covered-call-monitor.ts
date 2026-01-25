// Covered Call Position Monitoring & Recommendation Engine

export type CoveredCallPosition = {
  symbol: string;           // Underlying stock (e.g., TSLA)
  contractSymbol: string;   // Option contract (Yahoo format)
  strikePrice: number;
  expirationDate: string;   // YYYY-MM-DD
  entryPremium: number;     // Premium received when sold (per share)
  quantity: number;         // Number of contracts
  entryDate?: string;       // When position was opened
};

export type MarketData = {
  stockPrice: number;
  optionBid: number;
  optionAsk: number;
  impliedVolatility?: number;
};

export type Recommendation = 
  | "HOLD"           // Keep position, let time decay work
  | "BTC"            // Buy to close - take profits or cut losses
  | "LET_EXPIRE"     // Near expiration, worthless - let it expire
  | "ROLL_OUT"       // Roll to later expiration
  | "ROLL_UP"        // Roll to higher strike
  | "ROLL_UP_OUT";   // Roll to higher strike and later date

export type CoveredCallEvaluation = {
  recommendation: Recommendation;
  confidence: number;        // 0-100%
  rationale: string;
  metrics: {
    daysToExpiration: number;
    moneyness: string;       // "ITM", "ATM", "OTM"
    moneynessPercent: number;
    currentOptionValue: number;
    profitCaptured: number;  // As percentage of entry premium
    profitDollars: number;
    costToClose: number;
    maxProfit: number;
    breakeven: number;
    assignmentRisk: "low" | "medium" | "high";
    timeDecayWorking: boolean;
  };
  actions: {
    action: string;
    description: string;
    estimatedCost?: number;
    estimatedProfit?: number;
  }[];
};

// Evaluate a covered call position and generate recommendation
export function evaluateCoveredCall(
  position: CoveredCallPosition,
  market: MarketData
): CoveredCallEvaluation {
  const { strikePrice, expirationDate, entryPremium, quantity } = position;
  const { stockPrice, optionBid, optionAsk } = market;

  // Calculate days to expiration
  const today = new Date();
  const expDate = new Date(expirationDate);
  const daysToExp = Math.max(0, Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));

  // Calculate moneyness
  const moneynessPercent = ((stockPrice - strikePrice) / strikePrice) * 100;
  let moneyness: "ITM" | "ATM" | "OTM";
  if (moneynessPercent > 2) moneyness = "ITM";
  else if (moneynessPercent < -2) moneyness = "OTM";
  else moneyness = "ATM";

  // Current option value (midpoint)
  const currentOptionValue = (optionBid + optionAsk) / 2;

  // Profit calculations
  const profitDollars = (entryPremium - currentOptionValue) * 100 * quantity;
  const profitCaptured = ((entryPremium - currentOptionValue) / entryPremium) * 100;
  const costToClose = optionAsk * 100 * quantity;
  const maxProfit = entryPremium * 100 * quantity;
  const breakeven = stockPrice - entryPremium;

  // Assignment risk assessment
  let assignmentRisk: "low" | "medium" | "high";
  if (moneyness === "OTM") {
    assignmentRisk = "low";
  } else if (moneyness === "ATM") {
    assignmentRisk = daysToExp < 7 ? "medium" : "low";
  } else {
    // ITM
    if (moneynessPercent > 5 || daysToExp < 7) {
      assignmentRisk = "high";
    } else {
      assignmentRisk = "medium";
    }
  }

  // Is time decay working for us?
  const timeDecayWorking = moneyness !== "ITM" || moneynessPercent < 3;

  // Generate recommendation
  let recommendation: Recommendation;
  let confidence: number;
  let rationale: string;
  const actions: CoveredCallEvaluation["actions"] = [];

  // Decision logic
  if (daysToExp === 0) {
    // Expiration day
    if (moneyness === "OTM" || moneyness === "ATM") {
      recommendation = "LET_EXPIRE";
      confidence = 95;
      rationale = "Option expires today and is OTM/ATM. Let it expire worthless to keep full premium.";
      actions.push({
        action: "No action needed",
        description: "Option will expire worthless. Full premium captured.",
        estimatedProfit: entryPremium * 100 * quantity,
      });
    } else {
      recommendation = "BTC";
      confidence = 85;
      rationale = "Option expires today ITM. Consider buying to close to avoid assignment and selling shares.";
      actions.push({
        action: "Buy to Close",
        description: `Close position at ~$${optionAsk.toFixed(2)} to avoid assignment`,
        estimatedCost: costToClose,
      });
    }
  } else if (daysToExp <= 5 && profitCaptured >= 80) {
    // Near expiration with most profit captured
    recommendation = "LET_EXPIRE";
    confidence = 90;
    rationale = `${profitCaptured.toFixed(0)}% of premium captured with ${daysToExp} days left. Let time decay capture the rest.`;
    actions.push({
      action: "Hold to expiration",
      description: "Minimal value remaining. Let option expire.",
      estimatedProfit: profitDollars,
    });
  } else if (profitCaptured >= 50 && daysToExp > 14) {
    // Good profit captured with time remaining - BTC and redeploy
    recommendation = "BTC";
    confidence = 75;
    rationale = `${profitCaptured.toFixed(0)}% profit captured with ${daysToExp} days remaining. Consider closing and redeploying capital.`;
    actions.push({
      action: "Buy to Close",
      description: `Close at ~$${optionAsk.toFixed(2)} and open new position`,
      estimatedCost: costToClose,
      estimatedProfit: profitDollars,
    });
    actions.push({
      action: "Roll Out",
      description: "Close current and sell next month's expiration",
    });
  } else if (moneyness === "ITM" && moneynessPercent > 5) {
    // Deep ITM - high assignment risk
    recommendation = "ROLL_UP_OUT";
    confidence = 70;
    rationale = `Stock ${moneynessPercent.toFixed(1)}% above strike. High assignment risk. Consider rolling up and out.`;
    actions.push({
      action: "Roll Up and Out",
      description: `Close current call and sell higher strike with later expiration`,
      estimatedCost: costToClose,
    });
    actions.push({
      action: "Let Assign",
      description: `Accept assignment. Sell shares at $${strikePrice} + $${entryPremium.toFixed(2)} premium`,
    });
  } else if (moneyness === "ITM" && daysToExp < 7) {
    // ITM near expiration
    recommendation = "BTC";
    confidence = 80;
    rationale = "Option is ITM with less than a week to expiration. Close to avoid assignment.";
    actions.push({
      action: "Buy to Close",
      description: `Close at ~$${optionAsk.toFixed(2)}`,
      estimatedCost: costToClose,
    });
  } else if (profitCaptured < 0 && Math.abs(profitCaptured) > 100) {
    // Big loss - stock dropped significantly
    recommendation = "ROLL_OUT";
    confidence = 60;
    rationale = "Position underwater. Consider rolling out to collect more premium over time.";
    actions.push({
      action: "Roll Out",
      description: "Close current and sell later expiration for net credit",
    });
    actions.push({
      action: "Hold",
      description: "Wait for stock recovery if bullish on underlying",
    });
  } else if (moneyness === "OTM" && profitCaptured >= 0) {
    // OTM with profit - ideal scenario
    recommendation = "HOLD";
    confidence = 85;
    rationale = `Option is ${Math.abs(moneynessPercent).toFixed(1)}% OTM. Time decay working in your favor. Hold for max profit.`;
    actions.push({
      action: "Hold",
      description: `Continue holding. ${daysToExp} days until expiration.`,
      estimatedProfit: maxProfit,
    });
  } else {
    // Default: Hold and monitor
    recommendation = "HOLD";
    confidence = 65;
    rationale = "Position is neutral. Continue monitoring daily.";
    actions.push({
      action: "Hold and Monitor",
      description: "No immediate action needed. Review daily.",
    });
  }

  return {
    recommendation,
    confidence,
    rationale,
    metrics: {
      daysToExpiration: daysToExp,
      moneyness,
      moneynessPercent,
      currentOptionValue,
      profitCaptured,
      profitDollars,
      costToClose,
      maxProfit,
      breakeven,
      assignmentRisk,
      timeDecayWorking,
    },
    actions,
  };
}

// Generate a summary for watchlist display
export function generateSummary(eval_result: CoveredCallEvaluation): string {
  const { recommendation, metrics } = eval_result;
  const icon = recommendation === "HOLD" ? "✓" : 
               recommendation === "BTC" ? "⚠" :
               recommendation === "LET_EXPIRE" ? "✓" : "↻";
  
  return `${icon} ${recommendation}: ${metrics.daysToExpiration}d | ${metrics.moneyness} (${metrics.moneynessPercent >= 0 ? "+" : ""}${metrics.moneynessPercent.toFixed(1)}%) | ${metrics.profitCaptured.toFixed(0)}% captured`;
}
