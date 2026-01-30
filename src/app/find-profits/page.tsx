"use client";

import { useState, useEffect, useMemo } from "react";
import { Account, RiskLevel, StrategySettings } from "@/types/portfolio";
import { AppHeader } from "@/components/AppHeader";

type Strategy = {
  id: string;
  name: string;
  description: string;
  riskLevels: RiskLevel[];
  supported: boolean;
  icon: string;
};

const STRATEGIES: Strategy[] = [
  {
    id: "covered-calls",
    name: "Covered Calls",
    description: "Sell call options against stocks you own to generate income. Lower risk, consistent returns.",
    riskLevels: ["low", "medium"],
    supported: true,
    icon: "📈",
  },
  {
    id: "cash-secured-puts",
    name: "Cash-Secured Puts",
    description: "Sell put options secured by cash to collect premium. Get paid to potentially buy stock at lower price.",
    riskLevels: ["medium", "high"],
    supported: true,
    icon: "💵",
  },
  {
    id: "collar",
    name: "Collar Strategy",
    description: "Protect your stock position with a put while funding it by selling a call. Defensive strategy.",
    riskLevels: ["low", "medium"],
    supported: false,
    icon: "🛡️",
  },
  {
    id: "wheel",
    name: "Wheel Strategy",
    description: "Sell puts to acquire stock, then sell calls. Repeatable income generation strategy.",
    riskLevels: ["medium", "high"],
    supported: false,
    icon: "🎡",
  },
  {
    id: "bull-call-spread",
    name: "Bull Call Spreads",
    description: "Buy a call and sell a higher strike call. Limited risk bullish position.",
    riskLevels: ["medium", "high"],
    supported: false,
    icon: "🐂",
  },
  {
    id: "leap-calls",
    name: "Long LEAP Calls",
    description: "Buy long-dated call options for leveraged upside with time to be right.",
    riskLevels: ["high"],
    supported: false,
    icon: "🚀",
  },
];

type TickerData = {
  symbol: string;
  name: string;
  type: "stock" | "option";
  price: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  change: number;
  changePercent: number;
  underlyingSymbol?: string;
  optionType?: "call" | "put";
  strike?: number;
  expiration?: string;
};

type UserOutlook = "bullish" | "neutral" | "bearish";

const OUTLOOK_OPTIONS: { value: UserOutlook; label: string; icon: string; description: string }[] = [
  {
    value: "bullish",
    label: "Goes Up",
    icon: "↑",
    description: "I expect the price to increase",
  },
  {
    value: "neutral",
    label: "Stays Flat",
    icon: "—",
    description: "I expect sideways movement, little net change",
  },
  {
    value: "bearish",
    label: "Goes Down",
    icon: "↓",
    description: "I expect the price to decrease",
  },
];

type CoveredCallAnalysis = {
  sentiment: "bullish" | "neutral" | "bearish";
  volatility: "low" | "medium" | "high";
  recommendation: string;
  suggestedStrike: string;
  potentialIncome: string;
  maxProfit: string;
  breakeven: string;
  riskAssessment: string;
};

type CashSecuredPutAnalysis = {
  sentiment: "bullish" | "neutral" | "bearish";
  volatility: "low" | "medium" | "high";
  recommendation: string;
  suggestedStrike: string;
  potentialIncome: string;
  maxProfit: string;
  maxLoss: string;
  breakeven: string;
  cashRequired: string;
  riskAssessment: string;
  effectiveBuyPrice: string;
};

// Generate covered call analysis
function analyzeCoveredCall(ticker: TickerData, riskLevel: RiskLevel, userOutlook: UserOutlook): CoveredCallAnalysis {
  const { price, changePercent, high, low } = ticker;
  const volatility = ((high - low) / low) * 100;

  // Use user outlook as primary sentiment
  const sentiment = userOutlook;

  // Determine volatility level
  let volLevel: "low" | "medium" | "high";
  if (volatility < 2) volLevel = "low";
  else if (volatility < 4) volLevel = "medium";
  else volLevel = "high";

  // Calculate suggested strikes based on risk level AND user outlook
  let strikeMultiplier: number;
  let premiumEstimate: number;

  if (riskLevel === "low") {
    strikeMultiplier = 1.05; // 5% OTM for conservative
    premiumEstimate = 0.5;
  } else if (riskLevel === "medium") {
    strikeMultiplier = 1.03; // 3% OTM
    premiumEstimate = 0.8;
  } else {
    strikeMultiplier = 1.01; // 1% OTM for aggressive (higher premium)
    premiumEstimate = 1.2;
  }

  // Adjust based on user outlook
  if (userOutlook === "bullish") {
    // If bullish, suggest higher strike to capture more upside
    strikeMultiplier += 0.02;
  } else if (userOutlook === "bearish") {
    // If bearish, suggest lower strike for more premium protection
    strikeMultiplier -= 0.02;
    premiumEstimate *= 1.1;
  }

  // Adjust premium for volatility
  if (volLevel === "high") premiumEstimate *= 1.5;
  else if (volLevel === "low") premiumEstimate *= 0.7;

  const suggestedStrike = Math.round(price * strikeMultiplier);
  const estimatedPremium = price * (premiumEstimate / 100);
  const maxProfit = (suggestedStrike - price) + estimatedPremium;
  const breakeven = price - estimatedPremium;

  // Generate recommendation based on user outlook
  let recommendation: string;
  if (sentiment === "bearish") {
    recommendation = "CAUTION: With a bearish outlook, covered calls can provide downside protection via premium. Consider ATM/ITM strikes for maximum premium. Be prepared if stock rallies unexpectedly.";
  } else if (sentiment === "bullish") {
    if (volLevel === "high") {
      recommendation = "FAVORABLE: Bullish outlook with high volatility. Sell OTM calls to capture upside while collecting elevated premiums. Risk: shares called away if stock exceeds strike.";
    } else {
      recommendation = "GOOD: Bullish outlook suits covered calls. Sell OTM strikes to participate in upside while generating income. Be aware of early assignment if stock rallies sharply.";
    }
  } else {
    recommendation = "IDEAL: Neutral outlook is perfect for covered calls. Stock likely stays in range, maximizing premium income. Theta decay works in your favor.";
  }

  // Add market context
  const marketContext = changePercent > 1.5 ? " Market currently showing bullish momentum." :
                        changePercent < -1.5 ? " Market currently showing bearish momentum." : "";
  recommendation += marketContext;

  return {
    sentiment,
    volatility: volLevel,
    recommendation,
    suggestedStrike: `$${suggestedStrike}`,
    potentialIncome: `$${estimatedPremium.toFixed(2)} per share (~${(premiumEstimate).toFixed(1)}%)`,
    maxProfit: `$${maxProfit.toFixed(2)} per share`,
    breakeven: `$${breakeven.toFixed(2)}`,
    riskAssessment: riskLevel === "low"
      ? "Conservative approach with higher strike reduces assignment risk but lower premium."
      : riskLevel === "medium"
      ? "Balanced approach with moderate premium and assignment risk."
      : "Aggressive approach maximizes premium but higher chance of assignment.",
  };
}

// Generate cash-secured put analysis
function analyzeCashSecuredPut(ticker: TickerData, riskLevel: RiskLevel, userOutlook: UserOutlook): CashSecuredPutAnalysis {
  const { price, changePercent, high, low } = ticker;
  const volatility = ((high - low) / low) * 100;

  // Use user outlook as primary sentiment
  const sentiment = userOutlook;

  // Determine volatility level
  let volLevel: "low" | "medium" | "high";
  if (volatility < 2) volLevel = "low";
  else if (volatility < 4) volLevel = "medium";
  else volLevel = "high";

  // Calculate suggested strikes based on risk level AND user outlook (OTM puts = below current price)
  let strikeMultiplier: number;
  let premiumEstimate: number;

  if (riskLevel === "low") {
    strikeMultiplier = 0.90; // 10% OTM for conservative (lower premium, safer)
    premiumEstimate = 0.4;
  } else if (riskLevel === "medium") {
    strikeMultiplier = 0.95; // 5% OTM
    premiumEstimate = 0.7;
  } else {
    strikeMultiplier = 0.98; // 2% OTM for aggressive (higher premium, higher assignment risk)
    premiumEstimate = 1.0;
  }

  // Adjust based on user outlook
  if (userOutlook === "bullish") {
    // If bullish, can be more aggressive with strike (closer to ATM)
    strikeMultiplier += 0.02;
    premiumEstimate *= 1.1;
  } else if (userOutlook === "bearish") {
    // If bearish, go deeper OTM to reduce assignment risk
    strikeMultiplier -= 0.03;
  }

  // Adjust premium for volatility
  if (volLevel === "high") premiumEstimate *= 1.5;
  else if (volLevel === "low") premiumEstimate *= 0.7;

  const suggestedStrike = Math.round(price * strikeMultiplier);
  const estimatedPremium = price * (premiumEstimate / 100);
  const maxProfit = estimatedPremium; // Max profit is premium received
  const breakeven = suggestedStrike - estimatedPremium;
  const cashRequired = suggestedStrike * 100; // Cash needed per contract
  const effectiveBuyPrice = suggestedStrike - estimatedPremium;
  const maxLoss = (breakeven) * 100; // If stock goes to $0

  // Generate recommendation based on user outlook
  let recommendation: string;
  if (sentiment === "bearish") {
    recommendation = "CAUTION: With a bearish outlook, CSPs carry higher assignment risk. If you proceed, use deep OTM strikes. Be prepared to own shares at a loss if assigned.";
  } else if (sentiment === "bullish") {
    if (volLevel === "high") {
      recommendation = "FAVORABLE: Bullish outlook with high volatility is ideal for CSPs. Elevated premiums + low assignment probability = great income opportunity.";
    } else {
      recommendation = "GOOD: Bullish outlook suits CSPs well. Stock likely stays above strike. If assigned, you acquire shares you want at your effective buy price.";
    }
  } else {
    recommendation = "SOLID: Neutral outlook works for CSPs. Stock range-bound above strike = keep premium. Lower assignment risk than bearish scenario.";
  }

  // Add market context
  const marketContext = changePercent > 1.5 ? " Market currently showing bullish momentum." :
                        changePercent < -1.5 ? " Market currently showing bearish momentum." : "";
  recommendation += marketContext;

  return {
    sentiment,
    volatility: volLevel,
    recommendation,
    suggestedStrike: `$${suggestedStrike}`,
    potentialIncome: `$${estimatedPremium.toFixed(2)} per share (~${(premiumEstimate).toFixed(1)}%)`,
    maxProfit: `$${maxProfit.toFixed(2)} per share`,
    maxLoss: `$${maxLoss.toFixed(0)} per contract (if stock → $0)`,
    breakeven: `$${breakeven.toFixed(2)}`,
    cashRequired: `$${cashRequired.toLocaleString()} per contract`,
    effectiveBuyPrice: `$${effectiveBuyPrice.toFixed(2)}`,
    riskAssessment: riskLevel === "low"
      ? "Conservative: Deep OTM strike minimizes assignment risk but lower premium."
      : riskLevel === "medium"
      ? "Balanced: Moderate OTM provides decent premium with reasonable assignment protection."
      : "Aggressive: Near-ATM strike maximizes premium but higher assignment probability.",
  };
}

type SMAData = {
  symbol: string;
  sma50: number;
  sma50Plus15: number;
  sma50Minus15: number;
};

type TechnicalsData = {
  symbol: string;
  rsi14: number;
  volatility: number; // annualized %
  dataPoints: number;
};

type OptionContract = {
  ticker: string;
  yahoo_symbol: string;
  strike_price: number;
  expiration_date: string;
  premium: number;
  totalPremium: number;
  volume: number;
  open_interest: number;
  implied_volatility: number;
  rationale: string;
  contract_type: "call" | "put";
  /** Risk-neutral P(stock > strike at expiration); calls only. 0–1. */
  probability_called_away?: number;
  /** Risk-neutral P(stock > strike at expiration) = expire OTM; puts only. 0–1. */
  probability_expire_otm?: number;
  last_quote?: {
    bid: number;
    ask: number;
  };
  dataSource?: string;
};

type OptionChainRow = {
  strike: number;
  call: OptionContract | null;
  put: OptionContract | null;
};

type OptionsSearchResult = {
  underlying: string;
  expiration: string;
  targetStrike: number;
  strikeTolerance: number;
  stockPrice: number;
  daysToExpiration: number;
  totalCalls: number;
  totalPuts: number;
  optionChain: OptionChainRow[];
  dataSource?: "yahoo" | "live" | "estimated" | "synthetic";
  note?: string;
};

type CoveredCallEvaluation = {
  recommendation: string;
  confidence: number;
  rationale: string;
  metrics: {
    daysToExpiration: number;
    moneyness: string;
    moneynessPercent: number;
    currentOptionValue: number;
    profitCaptured: number;
    profitDollars: number;
    costToClose: number;
    maxProfit: number;
    breakeven: number;
    assignmentRisk: string;
    timeDecayWorking: boolean;
  };
  actions: {
    action: string;
    description: string;
    estimatedCost?: number;
    estimatedProfit?: number;
  }[];
};

type MonitorResult = {
  position: {
    symbol: string;
    strikePrice: number;
    expirationDate: string;
    entryPremium: number;
    quantity: number;
  };
  market: {
    stockPrice: number;
    optionBid: number;
    optionAsk: number;
    optionMid: number;
  };
  evaluation: CoveredCallEvaluation;
};

// Generate strike price options around a value
function generateStrikeOptions(basePrice: number, smaData: SMAData | null): number[] {
  const strikes: Set<number> = new Set();

  // Add strikes around current price (in $5 increments for stocks under $100, $10 for higher)
  const increment = basePrice < 100 ? 5 : 10;
  const roundedPrice = Math.round(basePrice / increment) * increment;

  for (let i = -5; i <= 5; i++) {
    strikes.add(roundedPrice + (i * increment));
  }

  // Add SMA-based strikes if available
  if (smaData) {
    strikes.add(Math.round(smaData.sma50 / increment) * increment);
    strikes.add(Math.round(smaData.sma50Plus15 / increment) * increment);
    strikes.add(Math.round(smaData.sma50Minus15 / increment) * increment);
  }

  return Array.from(strikes).filter(s => s > 0).sort((a, b) => a - b);
}

// Generate expiration date options (1-52 weeks)
// Uses local date for YYYY-MM-DD to avoid timezone shift (toISOString uses UTC)
function generateExpirationOptions(): { weeks: number; date: string; label: string }[] {
  const options = [];
  const today = new Date();

  for (let weeks = 1; weeks <= 52; weeks++) {
    const expDate = new Date(today);
    expDate.setDate(expDate.getDate() + (weeks * 7));
    // Options typically expire on Fridays
    const dayOfWeek = expDate.getDay();
    const daysToFriday = (5 - dayOfWeek + 7) % 7;
    expDate.setDate(expDate.getDate() + daysToFriday);

    const y = expDate.getFullYear();
    const m = String(expDate.getMonth() + 1).padStart(2, "0");
    const d = String(expDate.getDate()).padStart(2, "0");
    const dateStr = `${y}-${m}-${d}`;
    const label = `${weeks}w - ${expDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

    options.push({ weeks, date: dateStr, label });
  }

  return options;
}

export default function FindProfitsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [selectedStrategy, setSelectedStrategy] = useState<string>("");
  const [symbol, setSymbol] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tickerData, setTickerData] = useState<TickerData | null>(null);
  const [userOutlook, setUserOutlook] = useState<UserOutlook | null>(null);
  const [analysis, setAnalysis] = useState<CoveredCallAnalysis | null>(null);
  const [cspAnalysis, setCspAnalysis] = useState<CashSecuredPutAnalysis | null>(null);
  const [searchHistory, setSearchHistory] = useState<TickerData[]>([]);

  // Collapsible step panels (space saver)
  const [collapseStep1, setCollapseStep1] = useState(false);
  const [collapseStep2, setCollapseStep2] = useState(false);
  const [collapseStep3, setCollapseStep3] = useState(false);
  const [collapseStep4, setCollapseStep4] = useState(false);
  const [collapseCcAnalysis, setCollapseCcAnalysis] = useState(false);

  // Recommendation state
  const [smaData, setSmaData] = useState<SMAData | null>(null);
  const [smaLoading, setSmaLoading] = useState(false);
  const [technicals, setTechnicals] = useState<TechnicalsData | null>(null);
  const [technicalsLoading, setTechnicalsLoading] = useState(false);

  // Options search state
  const [optionsResult, setOptionsResult] = useState<OptionsSearchResult | null>(null);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [optionsError, setOptionsError] = useState("");
  const [selectedOption, setSelectedOption] = useState<OptionContract | null>(null);
  const [optionsCollapsed, setOptionsCollapsed] = useState(false);
  const [numContracts, setNumContracts] = useState<number>(1);

  // Build flow state (Covered Call / CSP)
  const [buildExpirationWeeks, setBuildExpirationWeeks] = useState<number | null>(null);
  const [buildStrike, setBuildStrike] = useState<number | null>(null);
  const [buildOptionContract, setBuildOptionContract] = useState<OptionContract | null>(null);
  const [buildLimitPriceType, setBuildLimitPriceType] = useState<"bid" | "mid" | "ask">("mid");
  const [buildQuantity, setBuildQuantity] = useState<number>(1);
  const [buildOptionLoading, setBuildOptionLoading] = useState(false);
  const [buildLimitTouched, setBuildLimitTouched] = useState(false);
  const [buildQtyTouched, setBuildQtyTouched] = useState(false);

  // Covered Call Monitor state
  const [showMonitor, setShowMonitor] = useState(false);
  const [entryPremium, setEntryPremium] = useState<string>("");
  const [monitorQuantity, setMonitorQuantity] = useState<number>(1);
  const [monitorResult, setMonitorResult] = useState<MonitorResult | null>(null);
  const [monitorLoading, setMonitorLoading] = useState(false);
  const [monitorError, setMonitorError] = useState("");

  // Watchlist state
  const [watchlistLoading, setWatchlistLoading] = useState(false);
  const [watchlistSuccess, setWatchlistSuccess] = useState<string | null>(null);
  const [watchlistError, setWatchlistError] = useState("");

  // Strategy thresholds (configured in Setup → Strategy)
  const [minOiThresholds, setMinOiThresholds] = useState<{
    coveredCall: number;
    cashSecuredPut: number;
  }>({ coveredCall: 500, cashSecuredPut: 500 });
  const [minVolumeThresholds, setMinVolumeThresholds] = useState<{
    coveredCall: number;
    cashSecuredPut: number;
  }>({ coveredCall: 0, cashSecuredPut: 0 });
  const [maxAssignProbThresholds, setMaxAssignProbThresholds] = useState<{
    coveredCall: number;
    cashSecuredPut: number;
  }>({ coveredCall: 100, cashSecuredPut: 100 });

  // Fetch accounts on mount
  useEffect(() => {
    async function fetchAccounts() {
      try {
        const res = await fetch("/api/accounts", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          setAccounts(data);
          if (data.length > 0) {
            setSelectedAccountId(data[0]._id);
          }
        }
      } catch (err) {
        console.error("Failed to fetch accounts:", err);
      }
    }
    fetchAccounts();
  }, []);

  // Fetch strategy settings for selected account (min OI filters)
  useEffect(() => {
    if (!selectedAccountId) return;
    (async () => {
      try {
        const res = await fetch(
          `/api/strategy-settings?accountId=${encodeURIComponent(selectedAccountId)}`,
          { cache: "no-store" }
        );
        const data = (await res.json()) as StrategySettings | { error?: string };
        if (!res.ok) return;
        const settings = "thresholds" in data ? data : null;
        const ccOi = Number(settings?.thresholds?.["covered-call"]?.minOpenInterest);
        const cspOi = Number(settings?.thresholds?.["cash-secured-put"]?.minOpenInterest);
        const ccVol = Number(settings?.thresholds?.["covered-call"]?.minVolume);
        const cspVol = Number(settings?.thresholds?.["cash-secured-put"]?.minVolume);
        setMinOiThresholds({
          coveredCall: Number.isFinite(ccOi) ? ccOi : 500,
          cashSecuredPut: Number.isFinite(cspOi) ? cspOi : 500,
        });
        setMinVolumeThresholds({
          coveredCall: Number.isFinite(ccVol) ? ccVol : 0,
          cashSecuredPut: Number.isFinite(cspVol) ? cspVol : 0,
        });
        const ccAssign = Number(settings?.thresholds?.["covered-call"]?.maxAssignmentProbability);
        const cspAssign = Number(settings?.thresholds?.["cash-secured-put"]?.maxAssignmentProbability);
        setMaxAssignProbThresholds({
          coveredCall: Number.isFinite(ccAssign) ? ccAssign : 100,
          cashSecuredPut: Number.isFinite(cspAssign) ? cspAssign : 100,
        });
      } catch {
        // keep defaults
      }
    })();
  }, [selectedAccountId]);

  const selectedAccount = accounts.find((a) => a._id === selectedAccountId);
  const selectedStrategyData = STRATEGIES.find((s) => s.id === selectedStrategy);

  // Calculate available shares for the selected account and ticker (for covered calls)
  const availableShares = useMemo(() => {
    if (!selectedAccount || !tickerData) return 0;
    const positions = selectedAccount.positions || [];
    // Sum shares from stock positions matching the ticker
    return positions
      .filter((p) => p.type === "stock" && p.ticker?.toUpperCase() === tickerData.symbol.toUpperCase())
      .reduce((sum, p) => sum + (p.shares || 0), 0);
  }, [selectedAccount, tickerData]);

  // Sort option chain rows by strike based on strategy:
  // - Covered calls: highest strike first (surface +15% OTM first)
  // - Cash-secured puts: lowest strike first (surface -15% OTM first)
  const sortedOptionChain = useMemo((): OptionChainRow[] => {
    const chain = optionsResult?.optionChain ?? [];
    if (chain.length === 0) return [];
    const sorted = [...chain];
    if (selectedStrategy === "covered-calls") {
      sorted.sort((a, b) => b.strike - a.strike);
    } else if (selectedStrategy === "cash-secured-puts") {
      sorted.sort((a, b) => a.strike - b.strike);
    }
    return sorted;
  }, [optionsResult, selectedStrategy]);

  const minOiForCurrentStrategy = useMemo(() => {
    if (selectedStrategy === "covered-calls") return minOiThresholds.coveredCall;
    if (selectedStrategy === "cash-secured-puts") return minOiThresholds.cashSecuredPut;
    return 500;
  }, [minOiThresholds, selectedStrategy]);

  const minVolumeForCurrentStrategy = useMemo(() => {
    if (selectedStrategy === "covered-calls") return minVolumeThresholds.coveredCall;
    if (selectedStrategy === "cash-secured-puts") return minVolumeThresholds.cashSecuredPut;
    return 0;
  }, [minVolumeThresholds, selectedStrategy]);

  const maxAssignProbForCurrentStrategy = useMemo(() => {
    if (selectedStrategy === "covered-calls") return maxAssignProbThresholds.coveredCall;
    if (selectedStrategy === "cash-secured-puts") return maxAssignProbThresholds.cashSecuredPut;
    return 100;
  }, [maxAssignProbThresholds, selectedStrategy]);

  const { visibleOptionChain, oiFilterFallbackActive } = useMemo(() => {
    if (!optionsResult) return { visibleOptionChain: [] as OptionChainRow[], oiFilterFallbackActive: false };
    const minOi = minOiForCurrentStrategy;
    const minVol = minVolumeForCurrentStrategy;
    const maxAssign = maxAssignProbForCurrentStrategy;
    const assignProbOk = (callOrPut: OptionContract | null | undefined, isCall: boolean): boolean => {
      if (!callOrPut || maxAssign >= 100) return true;
      if (isCall) {
        const prob = callOrPut.probability_called_away;
        if (prob == null) return true;
        return prob * 100 <= maxAssign;
      }
      const probOtm = callOrPut.probability_expire_otm;
      if (probOtm == null) return true;
      const assignProb = (1 - probOtm) * 100;
      return assignProb <= maxAssign;
    };
    let filtered: OptionChainRow[];
    if (selectedStrategy === "covered-calls") {
      filtered = sortedOptionChain.filter(
        (row) =>
          (row.call?.open_interest ?? 0) >= minOi &&
          (row.call?.volume ?? 0) >= minVol &&
          assignProbOk(row.call, true)
      );
    } else if (selectedStrategy === "cash-secured-puts") {
      filtered = sortedOptionChain.filter(
        (row) =>
          (row.put?.open_interest ?? 0) >= minOi &&
          (row.put?.volume ?? 0) >= minVol &&
          assignProbOk(row.put, false)
      );
    } else {
      return { visibleOptionChain: sortedOptionChain, oiFilterFallbackActive: false };
    }
    // Fallback: when filters remove all rows, show unfiltered chain (like Yahoo)
    if (filtered.length === 0 && sortedOptionChain.length > 0) {
      return { visibleOptionChain: sortedOptionChain, oiFilterFallbackActive: true };
    }
    return { visibleOptionChain: filtered, oiFilterFallbackActive: false };
  }, [minOiForCurrentStrategy, minVolumeForCurrentStrategy, maxAssignProbForCurrentStrategy, optionsResult, selectedStrategy, sortedOptionChain]);

  const selectedOptionLiquidity = useMemo(() => {
    if (!selectedOption) return null;
    const bid = selectedOption.last_quote?.bid;
    const ask = selectedOption.last_quote?.ask;
    if (bid == null || ask == null) {
      return {
        bid: null as number | null,
        ask: null as number | null,
        spreadAbs: null as number | null,
        spreadPct: null as number | null,
      };
    }
    const mid = (bid + ask) / 2;
    const spreadAbs = Math.max(0, ask - bid);
    const spreadPct = mid > 0 ? (spreadAbs / mid) * 100 : null;
    return { bid, ask, spreadAbs, spreadPct };
  }, [selectedOption]);

  const buildOptionLiquidity = useMemo(() => {
    if (!buildOptionContract) return null;
    const bid = buildOptionContract.last_quote?.bid;
    const ask = buildOptionContract.last_quote?.ask;
    if (bid == null || ask == null) {
      return {
        bid: null as number | null,
        ask: null as number | null,
        spreadAbs: null as number | null,
        spreadPct: null as number | null,
      };
    }
    const mid = (bid + ask) / 2;
    const spreadAbs = Math.max(0, ask - bid);
    const spreadPct = mid > 0 ? (spreadAbs / mid) * 100 : null;
    return { bid, ask, spreadAbs, spreadPct };
  }, [buildOptionContract]);

  // Calculate estimated total cash across all accounts
  // Cash should be stored as positions (type: "cash"), but we also check account.balance as fallback
  const estimatedTotalCash = useMemo(() => {
    if (accounts.length === 0) return 0;

    const total = accounts.reduce((sum, account) => {
      const positions = account.positions || [];

      // Sum cash positions (type: "cash")
      const cashPositions = positions.filter((p) => p.type === "cash");
      const cashFromPositions = cashPositions.reduce((posSum, pos) => posSum + (pos.amount || 0), 0);

      // If account has explicit cash positions, use those
      if (cashFromPositions > 0) {
        return sum + cashFromPositions;
      }

      // Fallback: if account has no positions at all, treat balance as cash
      // (This handles legacy accounts where cash wasn't stored as a position)
      if (positions.length === 0) {
        return sum + (account.balance || 0);
      }

      // Account has positions but no cash positions - return 0 for this account
      return sum;
    }, 0);

    return total;
  }, [accounts]);

  // Filter strategies based on risk level
  const getStrategyFit = (strategy: Strategy): "recommended" | "caution" | "not-recommended" => {
    if (!selectedAccount) return "caution";
    if (strategy.riskLevels.includes(selectedAccount.riskLevel)) return "recommended";
    if (selectedAccount.riskLevel === "low" && strategy.riskLevels.includes("high")) return "not-recommended";
    if (selectedAccount.riskLevel === "high" && strategy.riskLevels.includes("low")) return "caution";
    return "caution";
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!symbol.trim()) return;

    setLoading(true);
    setError("");
    setTickerData(null);
    setAnalysis(null);
    setCspAnalysis(null);
    setSmaData(null);
    setTechnicals(null);
    setOptionsResult(null);
    setOptionsError("");
    setOptionsCollapsed(false);
    setBuildStrike(null);
    setBuildOptionContract(null);
    setBuildExpirationWeeks(null);
    setBuildQuantity(1);
    setBuildLimitTouched(false);
    setBuildQtyTouched(false);
    setCollapseCcAnalysis(false);

    try {
      const res = await fetch(`/api/ticker/${symbol.trim().toUpperCase()}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to fetch ticker data");
        return;
      }

      // For option strategies, we need stock data not options
      if (data.type === "option") {
        setError("This strategy requires a stock symbol, not an option. Enter the underlying stock symbol.");
        return;
      }

      setTickerData(data);
      setCollapseStep4(true);

      // Generate analysis based on selected strategy and user outlook
      if (selectedAccount && userOutlook) {
        if (selectedStrategy === "covered-calls") {
          const ccAnalysis = analyzeCoveredCall(data, selectedAccount.riskLevel, userOutlook);
          setAnalysis(ccAnalysis);
          // Default strike based on outlook
          const strikeMultiplier = userOutlook === "bullish" ? 1.05 : userOutlook === "bearish" ? 1.00 : 1.03;
          setBuildStrike(Math.round(data.price * strikeMultiplier));
        } else if (selectedStrategy === "cash-secured-puts") {
          const cspResult = analyzeCashSecuredPut(data, selectedAccount.riskLevel, userOutlook);
          setCspAnalysis(cspResult);
          // Default strike based on outlook - CSP strikes below current price
          const strikeMultiplier = userOutlook === "bullish" ? 0.97 : userOutlook === "bearish" ? 0.90 : 0.95;
          setBuildStrike(Math.round(data.price * strikeMultiplier));
        }
      }

      // Fetch SMA data
      setSmaLoading(true);
      try {
        const smaRes = await fetch(`/api/ticker/${symbol.trim().toUpperCase()}/sma`);
        if (smaRes.ok) {
          const smaResult = await smaRes.json();
          setSmaData(smaResult);
        }
      } catch (smaErr) {
        console.error("Failed to fetch SMA data:", smaErr);
      } finally {
        setSmaLoading(false);
      }

      // Fetch RSI + Volatility
      setTechnicalsLoading(true);
      try {
        const techRes = await fetch(`/api/ticker/${symbol.trim().toUpperCase()}/technicals`);
        if (techRes.ok) {
          const tech = (await techRes.json()) as TechnicalsData;
          setTechnicals(tech);
        }
      } catch (techErr) {
        console.error("Failed to fetch technical indicators:", techErr);
      } finally {
        setTechnicalsLoading(false);
      }

      // Add to search history
      setSearchHistory((prev) => {
        const filtered = prev.filter((t) => t.symbol !== data.symbol);
        return [data, ...filtered].slice(0, 5);
      });
    } catch (err) {
      setError("Failed to fetch ticker data");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(value);

  const formatVolume = (value: number) =>
    new Intl.NumberFormat("en-US", { notation: "compact" }).format(value);

  // Evaluate covered call position
  const handleEvaluatePosition = async () => {
    if (!selectedOption || !tickerData || !entryPremium) return;

    setMonitorLoading(true);
    setMonitorError("");
    setMonitorResult(null);

    try {
      const res = await fetch("/api/covered-call/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: tickerData.symbol,
          contractSymbol: selectedOption.yahoo_symbol,
          strikePrice: selectedOption.strike_price,
          expirationDate: selectedOption.expiration_date,
          entryPremium: parseFloat(entryPremium),
          quantity: monitorQuantity,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMonitorError(data.error || "Failed to evaluate position");
        return;
      }

      setMonitorResult(data);
    } catch (err) {
      setMonitorError("Failed to evaluate position");
      console.error(err);
    } finally {
      setMonitorLoading(false);
    }
  };

  // Add option to watchlist
  const handleAddToWatchlist = async () => {
    if (!selectedOption || !tickerData || !selectedAccountId) return;

    setWatchlistLoading(true);
    setWatchlistError("");
    setWatchlistSuccess(null);

    try {
      const strategy = selectedStrategy === "cash-secured-puts" ? "cash-secured-put" : "covered-call";
      const itemType = selectedOption.contract_type === "put" ? "csp" : "covered-call";
      const entryDate = new Date().toISOString().split("T")[0];

      // Covered calls must be covered by shares in the selected account.
      if (strategy === "covered-call" && selectedOption.contract_type === "call") {
        const maxContracts = Math.floor(availableShares / 100);
        if (maxContracts <= 0) {
          setWatchlistError(
            `No eligible shares found to cover calls for ${tickerData.symbol} in ${selectedAccount?.name || "this account"}.`
          );
          return;
        }
        if (numContracts > maxContracts) {
          setWatchlistError(
            `Not enough shares to cover ${numContracts} contracts. Max for ${tickerData.symbol} in ${selectedAccount?.name || "this account"} is ${maxContracts}.`
          );
          return;
        }
      }

      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: selectedAccountId,
          symbol: selectedOption.yahoo_symbol,
          underlyingSymbol: tickerData.symbol,
          type: itemType,
          strategy: strategy,
          quantity: numContracts,
          entryPrice: tickerData.price,
          entryDate,
          strikePrice: selectedOption.strike_price,
          expirationDate: selectedOption.expiration_date,
          entryPremium: selectedOption.premium,
          notes: `Added from xAIProfitBuilder • ${userOutlook || "unknown"} outlook • ${tickerData.symbol} ${selectedOption.expiration_date} ${selectedOption.contract_type.toUpperCase()} $${selectedOption.strike_price} • est prem $${selectedOption.premium.toFixed(2)}`,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setWatchlistError(data.error || "Failed to add to watchlist");
        return;
      }

      setWatchlistSuccess(`Added ${selectedOption.yahoo_symbol} to watchlist!`);

      // Clear success message after 5 seconds
      setTimeout(() => setWatchlistSuccess(null), 5000);
    } catch (err) {
      setWatchlistError("Failed to add to watchlist");
      console.error(err);
    } finally {
      setWatchlistLoading(false);
    }
  };

  const handleLoadOptionChainBuild = async () => {
    if (!tickerData) return;
    if (selectedStrategy !== "covered-calls" && selectedStrategy !== "cash-secured-puts") return;
    if (buildExpirationWeeks == null) return;
    const expOptions = generateExpirationOptions();
    const expOption = expOptions.find((o) => o.weeks === buildExpirationWeeks);
    if (!expOption) return;

    const centerStrike = buildStrike ?? Math.round(tickerData.price);
    setOptionsLoading(true);
    setOptionsError("");
    setOptionsResult(null);
    setOptionsCollapsed(false);

    try {
      const params = new URLSearchParams({
        underlying: tickerData.symbol,
        strike: centerStrike.toString(),
        expiration: expOption.date,
      });
      console.log("[find-profits] Load option chain: weeks=", buildExpirationWeeks, "date=", expOption.date, "label=", expOption.label);
      const res = await fetch(`/api/options?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        setOptionsError((data as { error?: string }).error ?? "Failed to load option chain");
        return;
      }
      setOptionsResult(data);
    } catch (err) {
      setOptionsError("Failed to load option chain");
      console.error(err);
    } finally {
      setOptionsLoading(false);
    }
  };

  // Effect to auto-fetch option when strike and expiration are selected
  useEffect(() => {
    if (!tickerData || !buildStrike || buildExpirationWeeks == null) {
      return;
    }
    if (selectedStrategy !== "covered-calls" && selectedStrategy !== "cash-secured-puts") return;

    const fetchBuildOption = async () => {
      const expOptions = generateExpirationOptions();
      const expOption = expOptions.find((o) => o.weeks === buildExpirationWeeks);
      if (!expOption) return;

      setBuildOptionLoading(true);
      setBuildOptionContract(null);
      // Reset "BE preview" gating when inputs change
      setBuildLimitTouched(false);
      setBuildQtyTouched(false);

      try {
        const params = new URLSearchParams({
          underlying: tickerData.symbol,
          strike: buildStrike.toString(),
          expiration: expOption.date,
        });

        const res = await fetch(`/api/options?${params.toString()}`);
        const data = (await res.json()) as unknown;

        if (!res.ok) {
          const errMsg =
            typeof data === "object" && data != null && "error" in data
              ? String((data as { error?: unknown }).error ?? "Failed to fetch option")
              : "Failed to fetch option";
          console.error("Failed to fetch option:", errMsg);
          return;
        }

        // /api/options returns an optionChain[] of { strike, call, put }
        const optionChain = (data as { optionChain?: unknown }).optionChain;
        const row =
          Array.isArray(optionChain)
            ? (optionChain as OptionChainRow[]).find((r) => r.strike === buildStrike)
            : undefined;
        const callOrPutOption =
          selectedStrategy === "cash-secured-puts" ? (row?.put ?? null) : (row?.call ?? null);

        setBuildOptionContract(callOrPutOption);
      } catch (err) {
        console.error("Failed to fetch build option:", err);
      } finally {
        setBuildOptionLoading(false);
      }
    };

    fetchBuildOption();
  }, [buildStrike, buildExpirationWeeks, tickerData?.symbol, selectedStrategy]);

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900">xAIProfitBuilder</h2>
          <p className="text-gray-600 mt-1">Select a strategy and analyze opportunities based on your risk profile</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Step 1: Account Selection */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">1</div>
                <h3 className="text-lg font-semibold text-gray-900">Account</h3>
              </div>
              <button
                type="button"
                onClick={() => setCollapseStep1((v) => !v)}
                className="text-xs font-medium text-gray-600 hover:text-gray-900"
              >
                {collapseStep1 ? "Show" : "Hide"}
              </button>
            </div>
            {collapseStep1 ? (
              <p className="text-sm text-gray-500">
                {selectedAccount ? `${selectedAccount.name} • ${selectedAccount.riskLevel.toUpperCase()} • ${selectedAccount.strategy}` : "Select an account"}
              </p>
            ) : (
              <div className="flex flex-col sm:flex-row gap-4">
                <select
                  value={selectedAccountId}
                  onChange={(e) => {
                    setSelectedAccountId(e.target.value);
                    setSelectedStrategy("");
                    setTickerData(null);
                    setAnalysis(null);
                    setCspAnalysis(null);
                    setSymbol("");
                    setOptionsResult(null);
                    setSelectedOption(null);
                    setCollapseStep1(true);
                    setCollapseStep2(false);
                    setCollapseStep4(false);
                  }}
                  className="flex-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                >
                  {accounts.map((account) => (
                    <option key={account._id} value={account._id}>
                      {account.name} - {account.riskLevel} risk
                    </option>
                  ))}
                </select>
                {selectedAccount && (
                  <div
                    className={`px-4 py-2 rounded-lg text-sm font-medium ${
                      selectedAccount.riskLevel === "high"
                        ? "bg-red-100 text-red-700"
                        : selectedAccount.riskLevel === "medium"
                        ? "bg-yellow-100 text-yellow-700"
                        : "bg-green-100 text-green-700"
                    }`}
                  >
                    {selectedAccount.riskLevel.toUpperCase()} RISK • {selectedAccount.strategy}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Step 3: Market Outlook (moved next to account) */}
          <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-2xl shadow-sm border border-purple-200 p-6">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-purple-600 text-white rounded-full flex items-center justify-center font-bold">3</div>
                <div>
                  <h3 className="text-lg font-semibold text-purple-900">Market Outlook</h3>
                  <p className="text-sm text-purple-700">What do you expect the stock to do?</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCollapseStep3((v) => !v)}
                className="text-xs font-medium text-purple-700 hover:text-purple-900"
              >
                {collapseStep3 ? "Show" : "Hide"}
              </button>
            </div>

            {collapseStep3 ? (
              <p className="text-sm text-purple-800">
                {userOutlook ? `Outlook: ${userOutlook}` : "Select an outlook"}
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {OUTLOOK_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      setUserOutlook(option.value);
                      setCollapseStep3(true);
                      setCollapseStep4(false);
                    }}
                    className={`p-4 rounded-xl border-2 text-center transition-all ${
                      userOutlook === option.value
                        ? option.value === "bullish"
                          ? "border-green-500 bg-green-50 shadow-md"
                          : option.value === "bearish"
                          ? "border-red-500 bg-red-50 shadow-md"
                          : "border-gray-500 bg-gray-50 shadow-md"
                        : "border-gray-200 hover:border-purple-300 hover:bg-white"
                    }`}
                  >
                    <div
                      className={`text-3xl mb-1 ${
                        option.value === "bullish"
                          ? "text-green-600"
                          : option.value === "bearish"
                          ? "text-red-600"
                          : "text-gray-600"
                      }`}
                    >
                      {option.icon}
                    </div>
                    <p
                      className={`font-semibold text-sm ${
                        userOutlook === option.value
                          ? option.value === "bullish"
                            ? "text-green-800"
                            : option.value === "bearish"
                            ? "text-red-800"
                            : "text-gray-800"
                          : "text-gray-800"
                      }`}
                    >
                      {option.label}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">{option.description}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Step 2: Strategy Selection */}
        {selectedAccount && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">2</div>
                <h3 className="text-lg font-semibold text-gray-900">Strategy</h3>
              </div>
              <button
                type="button"
                onClick={() => setCollapseStep2((v) => !v)}
                className="text-xs font-medium text-gray-600 hover:text-gray-900"
              >
                {collapseStep2 ? "Show" : "Hide"}
              </button>
            </div>

            {collapseStep2 ? (
              <p className="text-sm text-gray-500">
                {selectedStrategyData ? selectedStrategyData.name : "Choose a strategy"}
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {STRATEGIES.map((strategy) => {
                  const fit = getStrategyFit(strategy);
                  const isSelected = selectedStrategy === strategy.id;

                  return (
                    <button
                      key={strategy.id}
                      onClick={() => {
                        setSelectedStrategy(strategy.id);
                        setTickerData(null);
                        setAnalysis(null);
                        setCspAnalysis(null);
                        setSymbol("");
                        setOptionsResult(null);
                        setSelectedOption(null);
                        setBuildStrike(null);
                        setBuildOptionContract(null);
                        setBuildExpirationWeeks(null);
                        setBuildQuantity(1);
                        setCollapseCcAnalysis(false);
                        setCollapseStep2(true);
                        setCollapseStep4(false);
                      }}
                      className={`p-4 rounded-xl border-2 text-left transition-all ${
                        isSelected
                          ? "border-blue-500 bg-blue-50"
                          : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                      }`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <span className="text-2xl">{strategy.icon}</span>
                        <div className="flex items-center gap-2">
                          {!strategy.supported && (
                            <span className="text-xs px-2 py-0.5 bg-gray-200 text-gray-600 rounded">
                              Coming Soon
                            </span>
                          )}
                          <span
                            className={`text-xs px-2 py-0.5 rounded ${
                              fit === "recommended"
                                ? "bg-green-100 text-green-700"
                                : fit === "caution"
                                ? "bg-yellow-100 text-yellow-700"
                                : "bg-red-100 text-red-700"
                            }`}
                          >
                            {fit === "recommended"
                              ? "✓ Recommended"
                              : fit === "caution"
                              ? "⚠ Caution"
                              : "✗ High Risk"}
                          </span>
                        </div>
                      </div>
                      <h4 className="font-semibold text-gray-900">{strategy.name}</h4>
                      <p className="text-sm text-gray-600 mt-1">{strategy.description}</p>
                      <p className="text-xs text-gray-400 mt-2">
                        Best for: {strategy.riskLevels.join(", ")} risk
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Step 3: Strategy Content */}
        {selectedStrategy && selectedStrategyData && (
          <>
            {!selectedStrategyData.supported ? (
              /* Not Supported Message */
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
                <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-4xl">{selectedStrategyData.icon}</span>
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">{selectedStrategyData.name}</h3>
                <p className="text-gray-600 mb-4">{selectedStrategyData.description}</p>
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-yellow-100 text-yellow-800 rounded-lg">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  This strategy is not yet supported. Coming soon!
                </div>
                <p className="text-sm text-gray-500 mt-4">
                  Try <strong>Covered Calls</strong> or <strong>Cash-Secured Puts</strong> which are fully supported.
                </p>
              </div>
            ) : (
              /* Covered Calls - Supported */
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                  {/* Market outlook moved to Step 3 next to account */}

                  {/* Step 4: Symbol Search */}
                  <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                    <div className="flex items-center justify-between gap-3 mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">4</div>
                        <h3 className="text-lg font-semibold text-gray-900">Symbol</h3>
                      </div>
                      <button
                        type="button"
                        onClick={() => setCollapseStep4((v) => !v)}
                        className="text-xs font-medium text-gray-600 hover:text-gray-900"
                      >
                        {collapseStep4 ? "Show" : "Hide"}
                      </button>
                    </div>
                    {collapseStep4 ? (
                      <p className="text-sm text-gray-500">
                        {tickerData ? `${tickerData.symbol} • ${formatCurrency(tickerData.price)}` : symbol ? `Symbol: ${symbol}` : "Enter a symbol to analyze"}
                      </p>
                    ) : (
                      <div>
                        <form onSubmit={handleSearch} className="flex gap-3">
                          <input
                            type="text"
                            list="recent-symbols"
                            value={symbol}
                            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                            placeholder="Enter stock symbol (e.g., AAPL, MSFT, TSLA)"
                            className="flex-1 px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                          <datalist id="recent-symbols">
                            {Array.from(
                              new Map(
                                (searchHistory ?? [])
                                  .filter((t) => t.type === "stock" && t.symbol)
                                  .map((t) => [t.symbol.toUpperCase(), t] as const)
                              ).values()
                            )
                              .slice(0, 10)
                              .map((t) => (
                                <option key={t.symbol} value={t.symbol.toUpperCase()}>
                                  {t.name}
                                </option>
                              ))}
                          </datalist>
                          <button
                            type="submit"
                            disabled={loading || !symbol.trim() || !userOutlook}
                            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                          >
                            {loading ? (
                              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                                />
                              </svg>
                            )}
                            Analyze
                          </button>
                        </form>
                        {(searchHistory?.length ?? 0) > 0 && (
                          <div className="mt-3">
                            <p className="text-xs text-gray-500 mb-2">Recent symbols</p>
                            <div className="flex flex-wrap gap-2">
                              {searchHistory
                                .filter((t) => t.type === "stock" && t.symbol)
                                .slice(0, 6)
                                .map((t) => (
                                  <button
                                    key={t.symbol}
                                    type="button"
                                    onClick={() => setSymbol(t.symbol.toUpperCase())}
                                    className="px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 hover:bg-gray-200"
                                  >
                                    {t.symbol.toUpperCase()}
                                  </button>
                                ))}
                            </div>
                          </div>
                        )}
                        {error && <p className="mt-3 text-red-600 text-sm">{error}</p>}
                        {!userOutlook && (
                          <p className="mt-2 text-xs text-amber-600">
                            ↑ Select your market outlook (Step 3) before analyzing
                          </p>
                        )}
                        {userOutlook && (
                          <p className="mt-2 text-xs text-gray-500">
                            Analyzing with{" "}
                            <span
                              className={`font-medium ${
                                userOutlook === "bullish"
                                  ? "text-green-600"
                                  : userOutlook === "bearish"
                                  ? "text-red-600"
                                  : "text-gray-600"
                              }`}
                            >
                              {userOutlook === "bullish"
                                ? "↑ bullish"
                                : userOutlook === "bearish"
                                ? "↓ bearish"
                                : "— neutral"}{" "}
                              outlook
                            </span>
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Analysis Results */}
                  {tickerData && (
                    <>
                      {/* Stock Overview */}
                      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                        <div className="flex items-start justify-between mb-6">
                          <div>
                            <div className="flex items-center gap-3">
                              <h3 className="text-2xl font-bold text-gray-900">{tickerData.symbol}</h3>
                              <span className="px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-700">
                                STOCK
                              </span>
                            </div>
                            <p className="text-gray-600">{tickerData.name}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-3xl font-bold text-gray-900">{formatCurrency(tickerData.price)}</p>
                            <p className={`text-lg font-medium ${tickerData.change >= 0 ? "text-green-600" : "text-red-600"}`}>
                              {tickerData.change >= 0 ? "+" : ""}{formatCurrency(tickerData.change)} ({tickerData.changePercent >= 0 ? "+" : ""}{tickerData.changePercent.toFixed(2)}%)
                            </p>
                          </div>
                        </div>

                        {/* Price Stats */}
                        <div className="grid grid-cols-4 gap-4">
                          <div className="bg-gray-50 rounded-lg p-3">
                            <p className="text-xs text-gray-500">Open</p>
                            <p className="font-semibold text-gray-900">{formatCurrency(tickerData.open)}</p>
                          </div>
                          <div className="bg-gray-50 rounded-lg p-3">
                            <p className="text-xs text-gray-500">High</p>
                            <p className="font-semibold text-green-600">{formatCurrency(tickerData.high)}</p>
                          </div>
                          <div className="bg-gray-50 rounded-lg p-3">
                            <p className="text-xs text-gray-500">Low</p>
                            <p className="font-semibold text-red-600">{formatCurrency(tickerData.low)}</p>
                          </div>
                          <div className="bg-gray-50 rounded-lg p-3">
                            <p className="text-xs text-gray-500">Volume</p>
                            <p className="font-semibold text-gray-900">{formatVolume(tickerData.volume)}</p>
                          </div>
                        </div>

                        {/* Option filters note (CC/CSP only) */}
                        {(selectedStrategy === "covered-calls" || selectedStrategy === "cash-secured-puts") && (
                          <p className="mt-3 text-[11px] text-gray-500">
                            Option chain filters: OI ≥ {minOiForCurrentStrategy.toLocaleString()}, Vol ≥ {minVolumeForCurrentStrategy.toLocaleString()}, Assign prob ≤ {maxAssignProbForCurrentStrategy}%{" "}
                            <span className="text-gray-400">(Automation → Strategy)</span>
                          </p>
                        )}
                      </div>

                      {/* Cash-Secured Put Analysis */}
                      {cspAnalysis && selectedStrategy === "cash-secured-puts" && (
                        <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl shadow-sm border border-amber-200 p-6">
                          <div className="flex items-center gap-3 mb-4">
                            <span className="text-2xl">💵</span>
                            <h3 className="text-lg font-semibold text-amber-900">Cash-Secured Put Analysis</h3>
                          </div>

                          {/* Sentiment & Volatility */}
                          <div className="grid grid-cols-2 gap-4 mb-6">
                            <div className="bg-white/60 rounded-lg p-4">
                              <p className="text-sm text-gray-600 mb-1">Your Outlook</p>
                              <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${
                                cspAnalysis.sentiment === "bullish" ? "bg-green-100 text-green-700" :
                                cspAnalysis.sentiment === "bearish" ? "bg-red-100 text-red-700" :
                                "bg-gray-100 text-gray-700"
                              }`}>
                                {cspAnalysis.sentiment === "bullish" ? "↑" : cspAnalysis.sentiment === "bearish" ? "↓" : "—"}
                                {cspAnalysis.sentiment.charAt(0).toUpperCase() + cspAnalysis.sentiment.slice(1)}
                              </div>
                            </div>
                            <div className="bg-white/60 rounded-lg p-4">
                              <p className="text-sm text-gray-600 mb-1">Volatility</p>
                              <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${
                                cspAnalysis.volatility === "high" ? "bg-red-100 text-red-700" :
                                cspAnalysis.volatility === "low" ? "bg-green-100 text-green-700" :
                                "bg-yellow-100 text-yellow-700"
                              }`}>
                                {cspAnalysis.volatility.charAt(0).toUpperCase() + cspAnalysis.volatility.slice(1)}
                              </div>
                            </div>
                          </div>

                          {/* Key Metrics - CSP specific */}
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                            <div className="bg-white/60 rounded-lg p-3">
                              <p className="text-xs text-gray-600">Suggested Strike</p>
                              <p className="font-bold text-amber-800">{cspAnalysis.suggestedStrike}</p>
                            </div>
                            <div className="bg-white/60 rounded-lg p-3">
                              <p className="text-xs text-gray-600">Premium Income</p>
                              <p className="font-bold text-amber-800">{cspAnalysis.potentialIncome}</p>
                            </div>
                            <div className="bg-white/60 rounded-lg p-3">
                              <p className="text-xs text-gray-600">Cash Required</p>
                              <p className="font-bold text-amber-800">{cspAnalysis.cashRequired}</p>
                            </div>
                            <div className="bg-white/60 rounded-lg p-3">
                              <p className="text-xs text-gray-600">Max Profit</p>
                              <p className="font-bold text-green-700">{cspAnalysis.maxProfit}</p>
                            </div>
                            <div className="bg-white/60 rounded-lg p-3">
                              <p className="text-xs text-gray-600">Breakeven</p>
                              <p className="font-bold text-amber-800">{cspAnalysis.breakeven}</p>
                            </div>
                            <div className="bg-white/60 rounded-lg p-3">
                              <p className="text-xs text-gray-600">Effective Buy Price</p>
                              <p className="font-bold text-blue-700">{cspAnalysis.effectiveBuyPrice}</p>
                            </div>
                          </div>

                          {/* Max Loss Warning */}
                          <div className="mb-4 p-3 bg-red-50 rounded-lg border border-red-200">
                            <p className="text-sm text-red-800">
                              <strong>Max Loss:</strong> {cspAnalysis.maxLoss}
                            </p>
                          </div>

                          {/* Recommendation */}
                          <div className="bg-white rounded-lg p-4 border border-amber-200">
                            <h4 className="font-semibold text-amber-900 mb-2">Recommendation</h4>
                            <p className="text-gray-700">{cspAnalysis.recommendation}</p>
                          </div>

                          {/* Risk Assessment */}
                          <div className="mt-4 p-3 bg-white/40 rounded-lg">
                            <p className="text-sm text-gray-600">
                              <strong>Risk Assessment ({selectedAccount?.riskLevel} profile):</strong> {cspAnalysis.riskAssessment}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Recommendations Section - Only show after analysis */}
                      {(analysis || cspAnalysis) && (
                      <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl shadow-sm border border-indigo-200 p-6">
                        <div className="flex items-center gap-3 mb-4">
                          <span className="text-2xl">🎯</span>
                          <h3 className="text-lg font-semibold text-indigo-900">
                            Build Your {selectedStrategy === "cash-secured-puts" ? "Cash-Secured Put" : "Covered Call"}
                          </h3>
                        </div>

                        {/* 50 DMA Display */}
                        <div className="mb-6">
                          <h4 className="text-sm font-medium text-gray-700 mb-3">50-Day Moving Average Analysis</h4>
                          {smaLoading ? (
                            <div className="flex items-center gap-2 text-gray-500">
                              <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                              Loading technical data...
                            </div>
                          ) : smaData ? (
                            <div className="grid grid-cols-3 gap-4">
                              <div className="bg-white/60 rounded-lg p-4 text-center border-2 border-red-200">
                                <p className="text-xs text-red-600 mb-1">-15% from 50 DMA</p>
                                <p className="text-xl font-bold text-red-700">{formatCurrency(smaData.sma50Minus15)}</p>
                                <p className="text-xs text-gray-500 mt-1">Support Zone</p>
                              </div>
                              <div className="bg-white/60 rounded-lg p-4 text-center border-2 border-indigo-300">
                                <p className="text-xs text-indigo-600 mb-1">50 Day MA</p>
                                <p className="text-xl font-bold text-indigo-700">{formatCurrency(smaData.sma50)}</p>
                                <p className="text-xs text-gray-500 mt-1">
                                  {tickerData.price > smaData.sma50 ? "Price Above MA" : "Price Below MA"}
                                </p>
                              </div>
                              <div className="bg-white/60 rounded-lg p-4 text-center border-2 border-green-200">
                                <p className="text-xs text-green-600 mb-1">+15% from 50 DMA</p>
                                <p className="text-xl font-bold text-green-700">{formatCurrency(smaData.sma50Plus15)}</p>
                                <p className="text-xs text-gray-500 mt-1">Resistance Zone</p>
                              </div>
                            </div>
                          ) : (
                            <p className="text-gray-500 text-sm">Technical data unavailable</p>
                          )}
                        </div>

                        {/* Build Flow (Covered Call / CSP) */}
                        {(selectedStrategy === "covered-calls" || selectedStrategy === "cash-secured-puts") && (
                          <>
                            {/* Expiration and Strike Row */}
                            <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                              {/* Expiration Dropdown */}
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Expiration Date</label>
                                <select
                                  value={buildExpirationWeeks ?? ""}
                                  onChange={(e) => {
                                    const next = e.target.value ? parseInt(e.target.value) : null;
                                    setBuildExpirationWeeks(next);
                                    setBuildStrike(null);
                                    setBuildOptionContract(null);
                                    setBuildLimitTouched(false);
                                    setBuildQtyTouched(false);
                                  }}
                                  className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
                                >
                                  <option value="">Select expiration...</option>
                                  {generateExpirationOptions().map((opt) => (
                                    <option key={opt.weeks} value={opt.weeks}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              {/* Strike Price Dropdown */}
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Strike Price</label>
                                {buildExpirationWeeks == null ? (
                                  <div className="w-full px-4 py-3 border border-gray-200 rounded-lg bg-gray-50 text-sm text-gray-500">
                                    Select expiration first
                                  </div>
                                ) : (
                                  <select
                                    value={buildStrike || ""}
                                    onChange={(e) => {
                                      const strike = e.target.value ? parseFloat(e.target.value) : null;
                                      setBuildStrike(strike);
                                      setBuildOptionContract(null);
                                    }}
                                    className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
                                  >
                                    <option value="">Select strike...</option>
                                    {generateStrikeOptions(tickerData.price, smaData)
                                      .filter((strike) =>
                                        selectedStrategy === "covered-calls"
                                          ? strike > tickerData.price // OTM calls
                                          : strike < tickerData.price // OTM puts
                                      )
                                      .map((strike) => {
                                        const isCurrentPrice = Math.abs(strike - tickerData.price) < 5;
                                        const isSma = smaData && Math.abs(strike - smaData.sma50) < 5;
                                        const pctFromPrice = ((strike - tickerData.price) / tickerData.price) * 100;
                                        let label = `$${strike}`;
                                        if (isCurrentPrice) label += " ≈ Price";
                                        else if (isSma) label += " ≈ 50MA";
                                        else if (selectedStrategy === "covered-calls" && pctFromPrice >= 15) {
                                          label += ` (+${pctFromPrice.toFixed(1)}% OTM)`;
                                        } else if (selectedStrategy === "cash-secured-puts" && pctFromPrice <= -15) {
                                          label += ` (${pctFromPrice.toFixed(1)}% OTM)`;
                                        }
                                        return (
                                          <option key={strike} value={strike}>
                                            {label}
                                          </option>
                                        );
                                      })}
                                  </select>
                                )}
                              </div>
                            </div>

                            {/* Limit Price (Bid/Mid/Ask dropdown) */}
                            {buildOptionContract && (buildOptionContract.last_quote || buildOptionContract.premium != null) && (
                              <div className="mb-6">
                                <label className="block text-sm font-medium text-gray-700 mb-2">Limit Price</label>
                                <select
                                  value={buildLimitPriceType}
                                  onChange={(e) => {
                                    const v = e.target.value as "bid" | "mid" | "ask";
                                    setBuildLimitPriceType(v);
                                    setBuildLimitTouched(true);
                                  }}
                                  className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
                                >
                                  {(() => {
                                    const premium = buildOptionContract.premium ?? 0;
                                    const rawBid = buildOptionContract.last_quote?.bid;
                                    const rawAsk = buildOptionContract.last_quote?.ask;
                                    const bid = (rawBid != null && rawBid > 0) ? rawBid : premium;
                                    const ask = (rawAsk != null && rawAsk > 0) ? rawAsk : premium;
                                    const mid = (bid + ask) / 2;
                                    return (
                                      <>
                                        <option value="bid">Bid — ${bid.toFixed(2)}</option>
                                        <option value="mid">Mid — ${mid.toFixed(2)}</option>
                                        <option value="ask">Ask — ${ask.toFixed(2)}</option>
                                      </>
                                    );
                                  })()}
                                </select>
                              </div>
                            )}

                            {/* Quantity Input */}
                            {buildOptionContract && (
                              <div className="mb-6">
                                <label className="block text-sm font-medium text-gray-700 mb-2">Quantity (Contracts)</label>
                                <input
                                  type="number"
                                  min="1"
                                  max="1000"
                                  value={buildQuantity}
                                  onChange={(e) => {
                                    setBuildQuantity(Math.max(1, parseInt(e.target.value) || 1));
                                    setBuildQtyTouched(true);
                                  }}
                                  className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                  {buildQuantity} contract{buildQuantity !== 1 ? "s" : ""} = {buildQuantity * 100} shares
                                </p>
                              </div>
                            )}

                            {/* Breakeven (preview) */}
                            {buildOptionContract && tickerData && (
                              <div className="mb-6">
                                <h4 className="text-sm font-medium text-gray-700 mb-3">Breakeven (Preview)</h4>
                                <div className="bg-white rounded-lg p-4 border border-gray-200">
                                  {!buildLimitTouched || !buildQtyTouched ? (
                                    <p className="text-sm text-gray-600">
                                      Select a <strong>limit price</strong> and set <strong>quantity</strong> to calculate breakeven.
                                    </p>
                                  ) : (() => {
                                    const contractPremium = buildOptionContract.premium ?? 0;
                                    const rawBid = buildOptionContract.last_quote?.bid;
                                    const rawAsk = buildOptionContract.last_quote?.ask;
                                    const bid = (rawBid != null && rawBid > 0) ? rawBid : contractPremium;
                                    const ask = (rawAsk != null && rawAsk > 0) ? rawAsk : contractPremium;
                                    const mid = (bid + ask) / 2;
                                    const currentPrice = tickerData.price;
                                    const strike = buildOptionContract.strike_price;
                                    const premium = buildLimitPriceType === "bid" ? bid : buildLimitPriceType === "ask" ? ask : mid;
                                    const totalPremium = premium * 100 * buildQuantity;
                                    const isCall = buildOptionContract.contract_type === "call";
                                    const breakeven = isCall ? currentPrice - premium : strike - premium;

                                    const pnlAtExpiry = (stockPriceAtExpiry: number) => {
                                      if (isCall) {
                                        // Covered call payoff (assumes stock acquired at currentPrice, call sold for premium)
                                        if (stockPriceAtExpiry <= strike) {
                                          return (stockPriceAtExpiry - currentPrice) * 100 * buildQuantity + totalPremium;
                                        }
                                        return (strike - currentPrice) * 100 * buildQuantity + totalPremium;
                                      }
                                      // Cash-secured put payoff (short put): keep premium if stock >= strike; else assigned
                                      if (stockPriceAtExpiry >= strike) return totalPremium;
                                      return (stockPriceAtExpiry - strike) * 100 * buildQuantity + totalPremium;
                                    };

                                    const maxProfit = isCall ? pnlAtExpiry(strike + 1) : totalPremium;
                                    const maxLoss = pnlAtExpiry(0);

                                    const scenarios = [
                                      { label: "Down 10%", price: Math.max(0, currentPrice * 0.9) },
                                      { label: "Now", price: currentPrice },
                                      { label: "Strike", price: strike },
                                      { label: "B/E", price: breakeven },
                                      { label: "Up 10%", price: currentPrice * 1.1 },
                                    ].map((s) => ({
                                      ...s,
                                      price: Math.round(s.price * 100) / 100,
                                      pnl: Math.round(pnlAtExpiry(s.price) * 100) / 100,
                                    }));

                                    const pnlValues = scenarios.map((s) => s.pnl);
                                    const maxPnl = Math.max(...pnlValues);
                                    const minPnl = Math.min(...pnlValues);
                                    const range = maxPnl - minPnl || 1;

                                    // P&L chart: X = stock price, Y = P&L (more points for smooth line)
                                    const minPrice = Math.max(0, currentPrice * 0.7);
                                    const maxPrice = currentPrice * 1.3;
                                    const priceStep = (maxPrice - minPrice) / 30;
                                    const chartData: { price: number; pnl: number }[] = [];
                                    for (let p = minPrice; p <= maxPrice; p += priceStep) {
                                      chartData.push({ price: p, pnl: pnlAtExpiry(p) });
                                    }
                                    const chartMinPnl = Math.min(...chartData.map((d) => d.pnl));
                                    const chartMaxPnl = Math.max(...chartData.map((d) => d.pnl));
                                    const chartPnlRange = chartMaxPnl - chartMinPnl || 1;
                                    const pad = 24;
                                    const w = 280;
                                    const h = 140;
                                    const toX = (price: number) =>
                                      pad + ((price - minPrice) / (maxPrice - minPrice)) * (w - 2 * pad);
                                    const toY = (pnl: number) =>
                                      h - pad - ((pnl - chartMinPnl) / chartPnlRange) * (h - 2 * pad);
                                    const zeroY = toY(0);
                                    const strikeX = toX(strike);
                                    const breakevenX = toX(breakeven);
                                    const currentX = toX(currentPrice);
                                    const linePoints = chartData.map((d) => `${toX(d.price)},${toY(d.pnl)}`).join(" ");

                                    return (
                                      <div>
                                        <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                                          <div>
                                            <p className="text-gray-600">Breakeven (stock)</p>
                                            <p className="font-bold text-gray-900">{formatCurrency(breakeven)}</p>
                                          </div>
                                          <div>
                                            <p className="text-gray-600">Limit premium</p>
                                            <p className="font-bold text-gray-900">{formatCurrency(premium)} / share</p>
                                          </div>
                                          <div>
                                            <p className="text-gray-600">Estimated income</p>
                                            <p className="font-bold text-green-700">{formatCurrency(totalPremium)}</p>
                                          </div>
                                          <div>
                                            <p className="text-gray-600">Max Profit</p>
                                            <p className="font-bold text-green-700">{formatCurrency(maxProfit)}</p>
                                          </div>
                                          <div>
                                            <p className="text-gray-600">Max Loss</p>
                                            <p className="font-bold text-red-700">{formatCurrency(maxLoss)}</p>
                                          </div>
                                        </div>

                                        {/* Trade summary note */}
                                        {(() => {
                                          const expDate = buildOptionContract.expiration_date
                                            ? new Date(buildOptionContract.expiration_date + "T12:00:00")
                                            : null;
                                          const expFormatted = expDate
                                            ? expDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                                            : "—";
                                          const today = new Date();
                                          const dte = expDate
                                            ? Math.max(0, Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)))
                                            : 0;
                                          const weeks = Math.floor(dte / 7);
                                          const days = dte % 7;
                                          const isCall = buildOptionContract.contract_type === "call";
                                          const probOtm =
                                            isCall
                                              ? (buildOptionContract.probability_called_away != null
                                                ? Math.round((1 - buildOptionContract.probability_called_away) * 100)
                                                : null)
                                              : (buildOptionContract.probability_expire_otm != null
                                                ? Math.round(buildOptionContract.probability_expire_otm * 100)
                                                : null);
                                          const probItm =
                                            probOtm != null ? Math.max(0, Math.min(100, 100 - probOtm)) : null;
                                          const symbol = tickerData?.symbol ?? "—";
                                          return (
                                            <p className="text-xs text-gray-600 mt-3 pt-3 border-t border-gray-200">
                                              You are selling <strong>{buildQuantity}</strong>{" "}
                                              {isCall ? "call" : "put"}
                                              {buildQuantity !== 1 ? "s" : ""} to open with a strike price of{" "}
                                              <strong>{formatCurrency(strike)}</strong> that expires <strong>{expFormatted}</strong>{" "}
                                              ({weeks > 0 ? `${weeks} week${weeks !== 1 ? "s" : ""}${days > 0 ? `, ${days} day${days !== 1 ? "s" : ""}` : ""}` : `${days} day${days !== 1 ? "s" : ""}`}). This trade is expected to result in receiving a credit of{" "}
                                              <strong>{formatCurrency(totalPremium)}</strong>.
                                              {probOtm != null && probItm != null ? (
                                                <> This trade has a <strong>{probOtm}%</strong> probability to expire out of the money (OTM) and <strong>{probItm}%</strong> probability to be in the money (ITM / assigned).</>
                                              ) : null}
                                              {" "}If assigned at any time you have the obligation to{" "}
                                              {isCall ? "sell" : "buy"} <strong>{symbol}</strong> at the strike price of <strong>{formatCurrency(strike)}</strong>.
                                            </p>
                                          );
                                        })()}

                                        {/* P&L vs Stock Price chart */}
                                        <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50/50 p-3">
                                          <p className="text-xs font-medium text-gray-700 mb-2">P&L at expiry vs stock price</p>
                                          <svg viewBox={`0 0 ${w} ${h}`} className="w-full max-w-md h-36" preserveAspectRatio="xMidYMid meet">
                                            <defs>
                                              <line id="grid-v" x1="0" y1="0" x2="0" y2={h} stroke="#e5e7eb" strokeWidth="0.5" />
                                              <line id="grid-h" x1="0" y1="0" x2={w} y2="0" stroke="#e5e7eb" strokeWidth="0.5" />
                                            </defs>
                                            {/* Zero line */}
                                            <line x1={pad} y1={zeroY} x2={w - pad} y2={zeroY} stroke="#9ca3af" strokeWidth="0.5" strokeDasharray="2,2" />
                                            {/* P&L line */}
                                            <polyline points={linePoints} fill="none" stroke="#4f46e5" strokeWidth="2" />
                                            {/* Strike vertical */}
                                            <line x1={strikeX} y1={pad} x2={strikeX} y2={h - pad} stroke="#7c3aed" strokeWidth="1" strokeDasharray="3,2" opacity={0.8} />
                                            {/* Breakeven vertical */}
                                            <line x1={breakevenX} y1={pad} x2={breakevenX} y2={h - pad} stroke="#059669" strokeWidth="1" strokeDasharray="3,2" opacity={0.8} />
                                            {/* Current price vertical (optional, subtle) */}
                                            <line x1={currentX} y1={pad} x2={currentX} y2={h - pad} stroke="#3b82f6" strokeWidth="0.5" opacity={0.5} />
                                          </svg>
                                          <div className="flex flex-wrap justify-between gap-2 mt-1 text-[10px] text-gray-500">
                                            <span>{formatCurrency(minPrice)}</span>
                                            <span className="text-indigo-600 font-medium">Strike {formatCurrency(strike)}</span>
                                            <span className="text-emerald-600 font-medium">B/E {formatCurrency(breakeven)}</span>
                                            <span className="text-blue-600">Now {formatCurrency(currentPrice)}</span>
                                            <span>{formatCurrency(maxPrice)}</span>
                                          </div>
                                          <div className="flex gap-4 mt-2 text-[10px]">
                                            <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-indigo-500 rounded" /> Strike</span>
                                            <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-emerald-500 rounded" /> Breakeven</span>
                                            <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-blue-500 rounded opacity-50" /> Current</span>
                                          </div>
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                          {/* Mini chart (compact) */}
                                          <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                                            <p className="text-xs text-gray-600 mb-2">P&L at expiry (sample)</p>
                                            <svg viewBox="0 0 100 40" className="w-full h-16">
                                              <polyline
                                                points={scenarios
                                                  .map((s, idx) => {
                                                    const x = (idx / Math.max(1, scenarios.length - 1)) * 100;
                                                    const y = 40 - ((s.pnl - minPnl) / range) * 40;
                                                    return `${x},${y}`;
                                                  })
                                                  .join(" ")}
                                                fill="none"
                                                stroke="#4f46e5"
                                                strokeWidth="2"
                                              />
                                            </svg>
                                            <div className="flex justify-between text-[10px] text-gray-500">
                                              <span>{scenarios[0]?.label}</span>
                                              <span>{scenarios[scenarios.length - 1]?.label}</span>
                                            </div>
                                          </div>

                                          {/* Table */}
                                          <div className="overflow-hidden rounded-lg border border-gray-200">
                                            <table className="w-full text-xs">
                                              <thead className="bg-gray-50 text-gray-600">
                                                <tr>
                                                  <th className="text-left px-3 py-2 font-medium">Scenario</th>
                                                  <th className="text-right px-3 py-2 font-medium">Stock</th>
                                                  <th className="text-right px-3 py-2 font-medium">P&L</th>
                                                </tr>
                                              </thead>
                                              <tbody className="divide-y divide-gray-100">
                                                {scenarios.map((s) => (
                                                  <tr key={s.label}>
                                                    <td className="px-3 py-2 text-gray-700">{s.label}</td>
                                                    <td className="px-3 py-2 text-right font-medium text-gray-900">
                                                      {formatCurrency(s.price)}
                                                    </td>
                                                    <td className={`px-3 py-2 text-right font-bold ${s.pnl >= 0 ? "text-green-700" : "text-red-700"}`}>
                                                      {formatCurrency(s.pnl)}
                                                    </td>
                                                  </tr>
                                                ))}
                                              </tbody>
                                            </table>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })()}
                                </div>
                              </div>
                            )}

                            {/* Loading State */}
                            {buildOptionLoading && (
                              <div className="mb-6 flex items-center justify-center gap-2 text-gray-500">
                                <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                                Loading option data...
                              </div>
                            )}

                            {/* Load option chain (optional) */}
                            <div className="mb-6">
                              <p className="text-sm text-gray-600 mb-2">Optional: load the full option chain and pick a contract from the table:</p>
                              <button
                                type="button"
                                onClick={handleLoadOptionChainBuild}
                                disabled={optionsLoading || !tickerData || buildExpirationWeeks == null}
                                className="px-4 py-2 rounded-lg border-2 border-indigo-200 text-indigo-700 hover:bg-indigo-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                              >
                                {optionsLoading ? (
                                  <>
                                    <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                                    Loading...
                                  </>
                                ) : (
                                  <>
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                                    </svg>
                                    Load option chain{" "}
                                    {buildExpirationWeeks == null
                                      ? "(select expiration)"
                                      : `(${generateExpirationOptions().find((o) => o.weeks === buildExpirationWeeks)?.label ?? `${buildExpirationWeeks}w`})`}
                                  </>
                                )}
                              </button>
                              {optionsError && (
                                <p className="mt-2 text-red-600 text-sm">{optionsError}</p>
                              )}
                            </div>
                          </>
                        )}

                        {/* Legacy CSP strike/expiration selector removed in favor of build dropdowns */}

                        {/* Options Chain Results - for both covered-calls (manual pick) and cash-secured-puts */}
                        {optionsResult && (selectedStrategy === "cash-secured-puts" || selectedStrategy === "covered-calls") && (
                          <div className="mt-6 bg-white rounded-lg p-4 border border-indigo-200">
                            <div className="flex items-center justify-between mb-4">
                              <div className="flex items-center gap-2">
                                <h4 className="font-semibold text-indigo-900">📊 Option Chain</h4>
                                <span className={`text-xs px-2 py-0.5 rounded-full ${
                                  optionsResult.dataSource === "live" || optionsResult.dataSource === "yahoo"
                                    ? "bg-green-100 text-green-700"
                                    : optionsResult.dataSource === "synthetic"
                                    ? "bg-orange-100 text-orange-700"
                                    : "bg-yellow-100 text-yellow-700"
                                }`}>
                                  {optionsResult.dataSource === "live" || optionsResult.dataSource === "yahoo" ? "Live Quotes" :
                                   optionsResult.dataSource === "synthetic" ? "Modeled" : "Estimated"}
                                </span>
                              </div>
                              <div className="text-sm text-gray-500">
                                {optionsResult.totalCalls} calls • {optionsResult.totalPuts} puts
                              </div>
                            </div>

                                <div className="flex items-center justify-between mb-3">
                                  <div className="text-xs text-gray-500">
                                    Exp: {optionsResult.expiration} ({optionsResult.daysToExpiration} days) • Stock: {formatCurrency(optionsResult.stockPrice)}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => setOptionsCollapsed((v) => !v)}
                                    className="text-xs font-medium text-indigo-700 hover:text-indigo-900"
                                  >
                                    {optionsCollapsed ? "Show options" : "Hide options"}
                                  </button>
                                </div>

                            {optionsResult.note && (
                              <div className="mb-4 p-3 bg-yellow-50 rounded-lg border border-yellow-200 text-sm text-yellow-800">
                                ⚠️ {optionsResult.note}
                              </div>
                            )}

                            {visibleOptionChain.length === 0 ? (
                              <div className="text-center py-8">
                                <p className="text-gray-500">No options found matching your criteria.</p>
                                <p className="text-sm text-gray-400 mt-1">
                                  Try a different strike price or expiration date.
                                </p>
                              </div>
                            ) : (
                              <>
                                <div className="mb-2 text-[11px] text-gray-500">
                                  {oiFilterFallbackActive ? (
                                    <>
                                      Filters (OI ≥{minOiForCurrentStrategy.toLocaleString()}, Vol ≥{minVolumeForCurrentStrategy.toLocaleString()}, Assign ≤{maxAssignProbForCurrentStrategy}%) removed all rows; showing all strikes.{" "}
                                      <span className="text-amber-600">Adjust in Automation → Strategy</span>
                                    </>
                                  ) : (
                                    <>
                                      Filter: OI ≥ {minOiForCurrentStrategy.toLocaleString()}, Vol ≥ {minVolumeForCurrentStrategy.toLocaleString()}, Assign ≤ {maxAssignProbForCurrentStrategy}%{" "}
                                      (Automation → Strategy)
                                    </>
                                  )}
                                </div>
                                {!optionsCollapsed ? (
                                  <>
                                  {/* Option Chain Table */}
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-xs">
                                    <thead>
                                      <tr className="border-b-2 border-gray-300">
                                        <th colSpan={6} className="text-center py-2 px-1 font-bold text-green-700 bg-green-50">
                                          CALLS
                                        </th>
                                        <th className="text-center py-2 px-1 font-bold text-gray-700 bg-gray-100">
                                          STRIKE
                                        </th>
                                        <th colSpan={6} className="text-center py-2 px-1 font-bold text-red-700 bg-red-50">
                                          PUTS
                                        </th>
                                      </tr>
                                      <tr className="border-b border-gray-200">
                                        <th className="text-center py-1 px-1 font-medium text-gray-500 bg-green-50/50">Contract</th>
                                        <th className="text-center py-1 px-1 font-medium text-gray-500 bg-green-50/50">Bid</th>
                                        <th className="text-center py-1 px-1 font-medium text-gray-500 bg-green-50/50">Ask</th>
                                        <th className="text-center py-1 px-1 font-medium text-gray-500 bg-green-50/50">Vol</th>
                                        <th className="text-center py-1 px-1 font-medium text-gray-500 bg-green-50/50">IV</th>
                                        <th className="text-left py-1 px-1 font-medium text-gray-500 bg-green-50/50">Rationale</th>
                                        <th className="text-center py-1 px-1 font-medium text-gray-500 bg-gray-50"></th>
                                        <th className="text-center py-1 px-1 font-medium text-gray-500 bg-red-50/50">Contract</th>
                                        <th className="text-center py-1 px-1 font-medium text-gray-500 bg-red-50/50">Bid</th>
                                        <th className="text-center py-1 px-1 font-medium text-gray-500 bg-red-50/50">Ask</th>
                                        <th className="text-center py-1 px-1 font-medium text-gray-500 bg-red-50/50">Vol</th>
                                        <th className="text-center py-1 px-1 font-medium text-gray-500 bg-red-50/50">IV</th>
                                        <th className="text-left py-1 px-1 font-medium text-gray-500 bg-red-50/50">Rationale</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {visibleOptionChain.map((row) => {
                                        const isATM = Math.abs(row.strike - optionsResult.stockPrice) < 5;
                                        const isTarget = buildStrike != null ? row.strike === buildStrike : false;
                                        const callSelected =
                                          selectedStrategy === "covered-calls"
                                            ? buildOptionContract?.ticker === row.call?.ticker
                                            : selectedOption?.ticker === row.call?.ticker;
                                        const putSelected = selectedOption?.ticker === row.put?.ticker;
                                        const pctFromSpot = ((row.strike - optionsResult.stockPrice) / optionsResult.stockPrice) * 100;
                                        const isCoveredCall15Plus = selectedStrategy === "covered-calls" && pctFromSpot >= 15;
                                        const isCspMinus15Plus = selectedStrategy === "cash-secured-puts" && pctFromSpot <= -15;

                                        return (
                                          <tr
                                            key={row.strike}
                                            className={`border-b border-gray-100 ${isATM ? "bg-blue-50/30" : ""}`}
                                          >
                                            {/* Call side */}
                                          {row.call ? (
                                              <>
                                                <td
                                                  onClick={() => {
                                                    if (selectedStrategy === "covered-calls") {
                                                      setBuildStrike(row.strike);
                                                      setBuildOptionContract(row.call);
                                                    }
                                                    setSelectedOption(row.call);
                                                    setOptionsCollapsed(true);
                                                  }}
                                                  className={`py-1.5 px-1 text-center cursor-pointer hover:bg-green-100 transition-colors font-mono text-[10px] ${callSelected ? "bg-green-200" : ""}`}
                                                  title={row.call.yahoo_symbol}
                                                >
                                                  {row.call.yahoo_symbol?.slice(-12) || "—"}
                                                </td>
                                                <td
                                                  onClick={() => {
                                                    if (selectedStrategy === "covered-calls") {
                                                      setBuildStrike(row.strike);
                                                      setBuildOptionContract(row.call);
                                                    }
                                                    setSelectedOption(row.call);
                                                    setOptionsCollapsed(true);
                                                  }}
                                                  className={`py-1.5 px-1 text-center cursor-pointer hover:bg-green-100 transition-colors ${callSelected ? "bg-green-200" : ""}`}
                                                >
                                                  ${row.call.last_quote?.bid?.toFixed(2)}
                                                </td>
                                                <td
                                                  onClick={() => {
                                                    if (selectedStrategy === "covered-calls") {
                                                      setBuildStrike(row.strike);
                                                      setBuildOptionContract(row.call);
                                                    }
                                                    setSelectedOption(row.call);
                                                    setOptionsCollapsed(true);
                                                  }}
                                                  className={`py-1.5 px-1 text-center cursor-pointer hover:bg-green-100 transition-colors ${callSelected ? "bg-green-200" : ""}`}
                                                >
                                                  ${row.call.last_quote?.ask?.toFixed(2)}
                                                </td>
                                                <td
                                                  onClick={() => {
                                                    if (selectedStrategy === "covered-calls") {
                                                      setBuildStrike(row.strike);
                                                      setBuildOptionContract(row.call);
                                                    }
                                                    setSelectedOption(row.call);
                                                    setOptionsCollapsed(true);
                                                  }}
                                                  className={`py-1.5 px-1 text-center cursor-pointer hover:bg-green-100 transition-colors text-gray-600 ${callSelected ? "bg-green-200" : ""}`}
                                                >
                                                  {row.call.volume > 0 ? row.call.volume.toLocaleString() : "—"}
                                                </td>
                                                <td
                                                  onClick={() => {
                                                    if (selectedStrategy === "covered-calls") {
                                                      setBuildStrike(row.strike);
                                                      setBuildOptionContract(row.call);
                                                    }
                                                    setSelectedOption(row.call);
                                                    setOptionsCollapsed(true);
                                                  }}
                                                  className={`py-1.5 px-1 text-center cursor-pointer hover:bg-green-100 transition-colors ${
                                                    row.call.implied_volatility > 50 ? "text-red-600 font-medium" :
                                                    row.call.implied_volatility < 25 ? "text-blue-600" : "text-gray-600"
                                                  } ${callSelected ? "bg-green-200" : ""}`}
                                                >
                                                  {row.call.implied_volatility?.toFixed(0)}%
                                                </td>
                                                <td
                                                  onClick={() => {
                                                    if (selectedStrategy === "covered-calls") {
                                                      setBuildStrike(row.strike);
                                                      setBuildOptionContract(row.call);
                                                    }
                                                    setSelectedOption(row.call);
                                                    setOptionsCollapsed(true);
                                                  }}
                                                  className={`py-1.5 px-1 text-left cursor-pointer hover:bg-green-100 transition-colors text-[10px] ${
                                                    row.call.rationale?.includes("Good STO") ? "text-green-700 font-medium" :
                                                    row.call.rationale?.includes("Safe") ? "text-blue-700" : "text-gray-600"
                                                  } ${callSelected ? "bg-green-200" : ""}`}
                                                >
                                                  {row.call.rationale || "—"}
                                                </td>
                                              </>
                                            ) : (
                                              <>
                                                <td className="py-1.5 px-1 text-center text-gray-300">—</td>
                                                <td className="py-1.5 px-1 text-center text-gray-300">—</td>
                                                <td className="py-1.5 px-1 text-center text-gray-300">—</td>
                                                <td className="py-1.5 px-1 text-center text-gray-300">—</td>
                                                <td className="py-1.5 px-1 text-center text-gray-300">—</td>
                                                <td className="py-1.5 px-1 text-center text-gray-300">—</td>
                                              </>
                                            )}

                                            {/* Strike */}
                                            <td className={`py-1.5 px-1 text-center font-bold text-sm ${
                                              isTarget ? "bg-indigo-100 text-indigo-800" :
                                              isATM ? "bg-blue-100 text-blue-800" : "bg-gray-50 text-gray-900"
                                            }`}>
                                              ${row.strike}
                                              {isATM && <span className="block text-[9px] font-normal">ATM</span>}
                                              {isCoveredCall15Plus && (
                                                <span className="mt-0.5 block text-[9px] font-semibold text-green-700">
                                                  ≥ +15% OTM
                                                </span>
                                              )}
                                              {isCspMinus15Plus && (
                                                <span className="mt-0.5 block text-[9px] font-semibold text-red-700">
                                                  ≤ -15% OTM
                                                </span>
                                              )}
                                            </td>

                                            {/* Put side */}
                                            {row.put ? (
                                              <>
                                                <td
                                                  onClick={() => {
                                                    if (selectedStrategy === "cash-secured-puts") {
                                                      setBuildStrike(row.strike);
                                                      setBuildOptionContract(row.put);
                                                      setBuildLimitTouched(false);
                                                      setBuildQtyTouched(false);
                                                    }
                                                    setSelectedOption(row.put);
                                                    setOptionsCollapsed(true);
                                                  }}
                                                  className={`py-1.5 px-1 text-center cursor-pointer hover:bg-red-100 transition-colors font-mono text-[10px] ${putSelected ? "bg-red-200" : ""}`}
                                                  title={row.put.yahoo_symbol}
                                                >
                                                  {row.put.yahoo_symbol?.slice(-12) || "—"}
                                                </td>
                                                <td
                                                  onClick={() => {
                                                    if (selectedStrategy === "cash-secured-puts") {
                                                      setBuildStrike(row.strike);
                                                      setBuildOptionContract(row.put);
                                                      setBuildLimitTouched(false);
                                                      setBuildQtyTouched(false);
                                                    }
                                                    setSelectedOption(row.put);
                                                    setOptionsCollapsed(true);
                                                  }}
                                                  className={`py-1.5 px-1 text-center cursor-pointer hover:bg-red-100 transition-colors ${putSelected ? "bg-red-200" : ""}`}
                                                >
                                                  ${row.put.last_quote?.bid?.toFixed(2)}
                                                </td>
                                                <td
                                                  onClick={() => {
                                                    if (selectedStrategy === "cash-secured-puts") {
                                                      setBuildStrike(row.strike);
                                                      setBuildOptionContract(row.put);
                                                      setBuildLimitTouched(false);
                                                      setBuildQtyTouched(false);
                                                    }
                                                    setSelectedOption(row.put);
                                                    setOptionsCollapsed(true);
                                                  }}
                                                  className={`py-1.5 px-1 text-center cursor-pointer hover:bg-red-100 transition-colors ${putSelected ? "bg-red-200" : ""}`}
                                                >
                                                  ${row.put.last_quote?.ask?.toFixed(2)}
                                                </td>
                                                <td
                                                  onClick={() => {
                                                    if (selectedStrategy === "cash-secured-puts") {
                                                      setBuildStrike(row.strike);
                                                      setBuildOptionContract(row.put);
                                                      setBuildLimitTouched(false);
                                                      setBuildQtyTouched(false);
                                                    }
                                                    setSelectedOption(row.put);
                                                    setOptionsCollapsed(true);
                                                  }}
                                                  className={`py-1.5 px-1 text-center cursor-pointer hover:bg-red-100 transition-colors text-gray-600 ${putSelected ? "bg-red-200" : ""}`}
                                                >
                                                  {row.put.volume > 0 ? row.put.volume.toLocaleString() : "—"}
                                                </td>
                                                <td
                                                  onClick={() => {
                                                    if (selectedStrategy === "cash-secured-puts") {
                                                      setBuildStrike(row.strike);
                                                      setBuildOptionContract(row.put);
                                                      setBuildLimitTouched(false);
                                                      setBuildQtyTouched(false);
                                                    }
                                                    setSelectedOption(row.put);
                                                    setOptionsCollapsed(true);
                                                  }}
                                                  className={`py-1.5 px-1 text-center cursor-pointer hover:bg-red-100 transition-colors ${
                                                    row.put.implied_volatility > 50 ? "text-red-600 font-medium" :
                                                    row.put.implied_volatility < 25 ? "text-blue-600" : "text-gray-600"
                                                  } ${putSelected ? "bg-red-200" : ""}`}
                                                >
                                                  {row.put.implied_volatility?.toFixed(0)}%
                                                </td>
                                                <td
                                                  onClick={() => {
                                                    if (selectedStrategy === "cash-secured-puts") {
                                                      setBuildStrike(row.strike);
                                                      setBuildOptionContract(row.put);
                                                      setBuildLimitTouched(false);
                                                      setBuildQtyTouched(false);
                                                    }
                                                    setSelectedOption(row.put);
                                                    setOptionsCollapsed(true);
                                                  }}
                                                  className={`py-1.5 px-1 text-left cursor-pointer hover:bg-red-100 transition-colors text-[10px] ${
                                                    row.put.rationale?.includes("CSP target") ? "text-green-700 font-medium" :
                                                    row.put.rationale?.includes("Safe") ? "text-blue-700" : "text-gray-600"
                                                  } ${putSelected ? "bg-red-200" : ""}`}
                                                >
                                                  {row.put.rationale || "—"}
                                                </td>
                                              </>
                                            ) : (
                                              <>
                                                <td className="py-1.5 px-1 text-center text-gray-300">—</td>
                                                <td className="py-1.5 px-1 text-center text-gray-300">—</td>
                                                <td className="py-1.5 px-1 text-center text-gray-300">—</td>
                                                <td className="py-1.5 px-1 text-center text-gray-300">—</td>
                                                <td className="py-1.5 px-1 text-center text-gray-300">—</td>
                                                <td className="py-1.5 px-1 text-center text-gray-300">—</td>
                                              </>
                                            )}
                                          </tr>
                                        );
                                      })}
                                      </tbody>
                                    </table>
                                  </div>

                                  <p className="text-xs text-gray-400 mt-2 text-center">
                                    Click on a call or put to see full details and calculate estimated income
                                  </p>
                                  </>
                                ) : (
                                  <div className="py-6 text-center text-sm text-gray-500">
                                    Options hidden to save space. Click <strong>Show options</strong> to expand.
                                  </div>
                                )}

                                {/* Selected Option Income Calculator */}
                                {selectedOption && (
                                  <div className="mt-4 p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg border border-green-200">
                                    <div className="flex items-center justify-between mb-3">
                                      <h5 className="font-semibold text-green-900">
                                        💰 {selectedOption.contract_type === "call" ? "Call" : "Put"} Option Selected
                                      </h5>
                                      <button
                                        onClick={() => setSelectedOption(null)}
                                        className="text-gray-400 hover:text-gray-600"
                                      >
                                        ✕
                                      </button>
                                    </div>

                                    {/* Contract Symbol */}
                                    <div className="mb-3 p-2 bg-white/80 rounded border border-gray-200">
                                      <p className="text-xs text-gray-500 mb-1">Contract Symbol (Yahoo Format)</p>
                                      <p className="font-mono text-sm font-bold text-indigo-700 select-all">
                                        {selectedOption.yahoo_symbol}
                                      </p>
                                    </div>

                                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-4 text-sm">
                                      <div className="bg-white/60 rounded p-2">
                                        <p className="text-xs text-gray-500">Strike</p>
                                        <p className="font-bold">${selectedOption.strike_price}</p>
                                      </div>
                                      <div className="bg-white/60 rounded p-2">
                                        <p className="text-xs text-gray-500">Premium</p>
                                        <p className="font-bold text-green-700">${selectedOption.premium.toFixed(2)}/share</p>
                                      </div>
                                      <div className="bg-white/60 rounded p-2">
                                        <p className="text-xs text-gray-500">Bid / Ask</p>
                                        <p className="font-bold">${selectedOption.last_quote?.bid?.toFixed(2)} / ${selectedOption.last_quote?.ask?.toFixed(2)}</p>
                                      </div>
                                      <div className="bg-white/60 rounded p-2">
                                        <p className="text-xs text-gray-500">Volume</p>
                                        <p className="font-bold">{selectedOption.volume > 0 ? selectedOption.volume.toLocaleString() : "—"}</p>
                                      </div>
                                      <div className="bg-white/60 rounded p-2">
                                        <p className="text-xs text-gray-500">Implied Vol</p>
                                        <p className={`font-bold ${
                                          selectedOption.implied_volatility > 50 ? "text-red-600" :
                                          selectedOption.implied_volatility < 25 ? "text-blue-600" : "text-gray-900"
                                        }`}>
                                          {selectedOption.implied_volatility?.toFixed(1)}%
                                        </p>
                                      </div>
                                      <div className="bg-white/60 rounded p-2">
                                        <p className="text-xs text-gray-500">Type</p>
                                        <p className={`font-bold ${selectedOption.contract_type === "call" ? "text-green-700" : "text-red-700"}`}>
                                          {selectedOption.contract_type.toUpperCase()}
                                        </p>
                                      </div>
                                    </div>

                                    {/* Rationale */}
                                    <div className="mb-4 p-2 bg-white/60 rounded">
                                      <p className="text-xs text-gray-500 mb-1">Rationale</p>
                                      <p className={`font-medium ${
                                        selectedOption.rationale?.includes("Good STO") || selectedOption.rationale?.includes("CSP target")
                                          ? "text-green-700"
                                          : selectedOption.rationale?.includes("Safe")
                                          ? "text-blue-700"
                                          : "text-gray-700"
                                      }`}>
                                        {selectedOption.rationale}
                                      </p>
                                    </div>

                                    {/* CSP trade summary note */}
                                    {selectedStrategy === "cash-secured-puts" && selectedOption.contract_type === "put" && (() => {
                                      const expDate = selectedOption.expiration_date
                                        ? new Date(selectedOption.expiration_date + "T12:00:00")
                                        : null;
                                      const expFormatted = expDate
                                        ? expDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                                        : "—";
                                      const today = new Date();
                                      const dte = expDate
                                        ? Math.max(0, Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)))
                                        : 0;
                                      const weeks = Math.floor(dte / 7);
                                      const days = dte % 7;
                                      const probOtm = selectedOption.probability_expire_otm != null
                                        ? Math.round(selectedOption.probability_expire_otm * 100)
                                        : null;
                                      const probItm = selectedOption.probability_expire_otm != null
                                        ? Math.round((1 - selectedOption.probability_expire_otm) * 100)
                                        : null;
                                      const symbol = tickerData?.symbol ?? "—";
                                      const totalCredit = selectedOption.premium * 100 * numContracts;
                                      const timeText = weeks > 0
                                        ? `${weeks} week${weeks !== 1 ? "s" : ""}${days > 0 ? `, ${days} day${days !== 1 ? "s" : ""}` : ""}`
                                        : `${days} day${days !== 1 ? "s" : ""}`;
                                      return (
                                        <p className="text-xs text-gray-600 mb-4 pt-3 border-t border-gray-200">
                                          You are selling <strong>{numContracts}</strong> put{numContracts !== 1 ? "s" : ""} to open with a strike price of{" "}
                                          <strong>{formatCurrency(selectedOption.strike_price)}</strong> that expires <strong>{expFormatted}</strong>{" "}
                                          ({timeText}). This trade is expected to result in receiving a credit of <strong>{formatCurrency(totalCredit)}</strong>.
                                          {probOtm != null && probItm != null ? (
                                            <> This trade has a <strong>{probOtm}%</strong> probability to expire out of the money (OTM; stock above ${selectedOption.strike_price} at expiration) and <strong>{probItm}%</strong> probability to be in the money (ITM / assigned).</>
                                          ) : null}
                                          {" "}If assigned at any time you have the obligation to buy <strong>{symbol}</strong> at the strike price of <strong>{formatCurrency(selectedOption.strike_price)}</strong>.
                                        </p>
                                      );
                                    })()}

                                    {/* Option Liquidity */}
                                    <div className="mb-4 p-3 bg-white/80 rounded-lg border border-gray-200">
                                      <div className="flex items-center justify-between mb-2">
                                        <span className="text-xs font-medium text-gray-700">Option Liquidity</span>
                                        <span className="text-[10px] text-gray-500">
                                          {optionsResult?.dataSource === "synthetic" ? "modeled" : optionsResult?.dataSource || ""}
                                        </span>
                                      </div>
                                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                                        <div className="bg-gray-50 rounded p-2">
                                          <p className="text-gray-600 mb-0.5">OI</p>
                                          <p className="font-bold text-gray-900">{selectedOption.open_interest?.toLocaleString?.() ?? "—"}</p>
                                          <p className="text-[10px] text-gray-500 mt-0.5">higher = easier fills</p>
                                        </div>
                                        <div className="bg-gray-50 rounded p-2">
                                          <p className="text-gray-600 mb-0.5">Daily Vol</p>
                                          <p className="font-bold text-gray-900">{selectedOption.volume?.toLocaleString?.() ?? "—"}</p>
                                          <p className="text-[10px] text-gray-500 mt-0.5">higher = tighter markets</p>
                                        </div>
                                        <div className="bg-gray-50 rounded p-2">
                                          <p className="text-gray-600 mb-0.5">Bid–Ask Spread</p>
                                          <p className="font-bold text-gray-900">
                                            {selectedOptionLiquidity?.spreadAbs != null && selectedOptionLiquidity?.spreadPct != null
                                              ? `${formatCurrency(selectedOptionLiquidity.spreadAbs)} (${selectedOptionLiquidity.spreadPct.toFixed(1)}%)`
                                              : "—"}
                                          </p>
                                          <p className="text-[10px] text-gray-500 mt-0.5">&lt;5% good • &gt;10% avoid</p>
                                        </div>
                                        <div className="bg-gray-50 rounded p-2">
                                          <p className="text-gray-600 mb-0.5">IV</p>
                                          <p className="font-bold text-gray-900">{selectedOption.implied_volatility?.toFixed?.(0) ?? "—"}%</p>
                                          <p className="text-[10px] text-gray-500 mt-0.5">
                                            {selectedOption.contract_type === "call"
                                              ? "higher IV = more premium (sell)"
                                              : "higher IV = more premium, more assignment risk"}
                                          </p>
                                        </div>
                                        {selectedOption.contract_type === "call" && selectedOption.probability_called_away != null && (
                                          <div className="bg-blue-50 rounded p-2 border border-blue-100">
                                            <p className="text-blue-700 mb-0.5">Chance of being called away</p>
                                            <p className="font-bold text-blue-900">
                                              ~{Math.round(selectedOption.probability_called_away * 100)}%
                                            </p>
                                            <p className="text-[10px] text-blue-600 mt-0.5">
                                              P(stock &gt; strike at exp), risk-neutral
                                            </p>
                                          </div>
                                        )}
                                      </div>
                                    </div>

                                    {/* Contract Calculator */}
                                    <div className="flex items-center gap-4 p-3 bg-white rounded-lg border border-green-200">
                                      <label className="text-sm font-medium text-green-800">
                                        Contracts:
                                      </label>
                                      <input
                                        type="number"
                                        min="1"
                                        max="1000"
                                        value={numContracts}
                                        onChange={(e) => setNumContracts(Math.max(1, parseInt(e.target.value) || 1))}
                                        className="w-20 px-3 py-2 border border-green-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-center"
                                      />
                                      <span className="text-sm text-gray-600">
                                        = {numContracts * 100} shares
                                      </span>
                                      <div className="ml-auto text-right">
                                        <p className="text-xs text-gray-500">Estimated Income</p>
                                        <p className="text-2xl font-bold text-green-700">
                                          {formatCurrency(selectedOption.premium * 100 * numContracts)}
                                        </p>
                                      </div>
                                    </div>

                                    <p className="text-xs text-green-600 mt-2">
                                      Premium per contract: {formatCurrency(selectedOption.premium * 100)} •
                                      Total for {numContracts} contract{numContracts !== 1 ? "s" : ""}: {formatCurrency(selectedOption.premium * 100 * numContracts)}
                                    </p>

                                    {/* CSP-specific Cash Requirement */}
                                    {selectedStrategy === "cash-secured-puts" && selectedOption.contract_type === "put" && (
                                      <div className="mt-3 p-3 bg-amber-50 rounded-lg border border-amber-200">
                                        <div className="grid grid-cols-2 gap-4 text-sm">
                                          <div>
                                            <p className="text-xs text-amber-700 mb-1">Cash Required to Secure</p>
                                            <p className="font-bold text-amber-900">
                                              {formatCurrency(selectedOption.strike_price * 100 * numContracts)}
                                            </p>
                                          </div>
                                          <div>
                                            <p className="text-xs text-amber-700 mb-1">Breakeven Price</p>
                                            <p className="font-bold text-amber-900">
                                              {formatCurrency(selectedOption.strike_price - selectedOption.premium)}
                                            </p>
                                          </div>
                                          <div>
                                            <p className="text-xs text-amber-700 mb-1">Effective Buy Price (if assigned)</p>
                                            <p className="font-bold text-blue-700">
                                              {formatCurrency(selectedOption.strike_price - selectedOption.premium)}
                                            </p>
                                          </div>
                                          <div>
                                            <p className="text-xs text-amber-700 mb-1">Return on Cash (if expires)</p>
                                            <p className="font-bold text-green-700">
                                              {((selectedOption.premium * 100 * numContracts) / (selectedOption.strike_price * 100 * numContracts) * 100).toFixed(2)}%
                                            </p>
                                          </div>
                                        </div>
                                        <p className="text-xs text-amber-600 mt-2">
                                          Max profit: {formatCurrency(selectedOption.premium * 100 * numContracts)} (premium received) •
                                          Max loss: {formatCurrency((selectedOption.strike_price - selectedOption.premium) * 100 * numContracts)} (if stock → $0)
                                        </p>
                                      </div>
                                    )}

                                    {/* Add to Watchlist Button */}
                                    <div className="mt-4 pt-4 border-t border-green-200">
                                      <button
                                        onClick={handleAddToWatchlist}
                                        disabled={watchlistLoading}
                                        className="w-full px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                      >
                                        {watchlistLoading ? (
                                          <>
                                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                            Adding to Watchlist...
                                          </>
                                        ) : (
                                          <>
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                            </svg>
                                            Add to Watchlist
                                          </>
                                        )}
                                      </button>

                                      {watchlistSuccess && (
                                        <div className="mt-3 p-3 bg-green-100 text-green-800 rounded-lg flex items-center gap-2">
                                          <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                          </svg>
                                          {watchlistSuccess}
                                        </div>
                                      )}

                                      {watchlistError && (
                                        <div className="mt-3 p-3 bg-red-100 text-red-800 rounded-lg flex items-center gap-2">
                                          <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                          </svg>
                                          {watchlistError}
                                        </div>
                                      )}

                                      <p className="text-xs text-gray-500 mt-2 text-center">
                                        Track this position and get daily Hold/Close recommendations
                                      </p>
                                    </div>

                                    {/* Monitor Position Toggle */}
                                    {selectedOption.contract_type === "call" && (
                                      <div className="mt-4 pt-4 border-t border-green-200">
                                        <button
                                          onClick={() => {
                                            setShowMonitor(!showMonitor);
                                            setMonitorResult(null);
                                            setEntryPremium(selectedOption.premium.toFixed(2));
                                          }}
                                          className="flex items-center gap-2 text-sm font-medium text-indigo-700 hover:text-indigo-900"
                                        >
                                          <svg className={`w-4 h-4 transition-transform ${showMonitor ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                          </svg>
                                          📊 Monitor Existing Position (Hold/BTC Recommendation)
                                        </button>

                                        {showMonitor && (
                                          <div className="mt-4 p-4 bg-indigo-50 rounded-lg border border-indigo-200">
                                            <h6 className="font-medium text-indigo-900 mb-3">Enter Your Position Details</h6>
                                            <div className="grid grid-cols-2 gap-4 mb-4">
                                              <div>
                                                <label className="text-xs text-gray-600 block mb-1">Entry Premium ($/share)</label>
                                                <input
                                                  type="number"
                                                  step="0.01"
                                                  min="0.01"
                                                  value={entryPremium}
                                                  onChange={(e) => setEntryPremium(e.target.value)}
                                                  placeholder="e.g., 5.50"
                                                  className="w-full px-3 py-2 border border-indigo-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                                                />
                                              </div>
                                              <div>
                                                <label className="text-xs text-gray-600 block mb-1">Contracts</label>
                                                <input
                                                  type="number"
                                                  min="1"
                                                  max="1000"
                                                  value={monitorQuantity}
                                                  onChange={(e) => setMonitorQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                                                  className="w-full px-3 py-2 border border-indigo-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                                                />
                                              </div>
                                            </div>
                                            <button
                                              onClick={handleEvaluatePosition}
                                              disabled={monitorLoading || !entryPremium}
                                              className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
                                            >
                                              {monitorLoading ? (
                                                <>
                                                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                  Evaluating...
                                                </>
                                              ) : (
                                                <>
                                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                                  </svg>
                                                  Get Hold/BTC Recommendation
                                                </>
                                              )}
                                            </button>
                                            {monitorError && (
                                              <p className="mt-2 text-red-600 text-xs">{monitorError}</p>
                                            )}

                                            {/* Monitor Results */}
                                            {monitorResult && (
                                              <div className="mt-4 space-y-4">
                                                {/* Recommendation Badge */}
                                                <div className={`p-4 rounded-lg ${
                                                  monitorResult.evaluation.recommendation === "HOLD" ? "bg-green-100 border border-green-300" :
                                                  monitorResult.evaluation.recommendation === "LET_EXPIRE" ? "bg-green-100 border border-green-300" :
                                                  monitorResult.evaluation.recommendation === "BTC" ? "bg-yellow-100 border border-yellow-300" :
                                                  "bg-blue-100 border border-blue-300"
                                                }`}>
                                                  <div className="flex items-center justify-between mb-2">
                                                    <span className={`text-2xl font-bold ${
                                                      monitorResult.evaluation.recommendation === "HOLD" || monitorResult.evaluation.recommendation === "LET_EXPIRE" ? "text-green-700" :
                                                      monitorResult.evaluation.recommendation === "BTC" ? "text-yellow-700" :
                                                      "text-blue-700"
                                                    }`}>
                                                      {monitorResult.evaluation.recommendation === "HOLD" && "✓ HOLD"}
                                                      {monitorResult.evaluation.recommendation === "LET_EXPIRE" && "✓ LET EXPIRE"}
                                                      {monitorResult.evaluation.recommendation === "BTC" && "⚠ BUY TO CLOSE"}
                                                      {monitorResult.evaluation.recommendation === "ROLL_OUT" && "↻ ROLL OUT"}
                                                      {monitorResult.evaluation.recommendation === "ROLL_UP" && "↑ ROLL UP"}
                                                      {monitorResult.evaluation.recommendation === "ROLL_UP_OUT" && "↗ ROLL UP & OUT"}
                                                    </span>
                                                    <span className="text-sm text-gray-600">
                                                      {monitorResult.evaluation.confidence}% confidence
                                                    </span>
                                                  </div>
                                                  <p className="text-sm text-gray-700">{monitorResult.evaluation.rationale}</p>
                                                </div>

                                                {/* Metrics Grid */}
                                                <div className="grid grid-cols-3 gap-2 text-xs">
                                                  <div className="bg-white p-2 rounded">
                                                    <p className="text-gray-500">Days to Exp</p>
                                                    <p className="font-bold">{monitorResult.evaluation.metrics.daysToExpiration}</p>
                                                  </div>
                                                  <div className="bg-white p-2 rounded">
                                                    <p className="text-gray-500">Moneyness</p>
                                                    <p className={`font-bold ${
                                                      monitorResult.evaluation.metrics.moneyness === "OTM" ? "text-green-600" :
                                                      monitorResult.evaluation.metrics.moneyness === "ITM" ? "text-red-600" : "text-gray-600"
                                                    }`}>
                                                      {monitorResult.evaluation.metrics.moneyness} ({monitorResult.evaluation.metrics.moneynessPercent.toFixed(1)}%)
                                                    </p>
                                                  </div>
                                                  <div className="bg-white p-2 rounded">
                                                    <p className="text-gray-500">Assignment Risk</p>
                                                    <p className={`font-bold ${
                                                      monitorResult.evaluation.metrics.assignmentRisk === "low" ? "text-green-600" :
                                                      monitorResult.evaluation.metrics.assignmentRisk === "high" ? "text-red-600" : "text-yellow-600"
                                                    }`}>
                                                      {monitorResult.evaluation.metrics.assignmentRisk.toUpperCase()}
                                                    </p>
                                                  </div>
                                                  <div className="bg-white p-2 rounded">
                                                    <p className="text-gray-500">Profit Captured</p>
                                                    <p className={`font-bold ${monitorResult.evaluation.metrics.profitCaptured >= 0 ? "text-green-600" : "text-red-600"}`}>
                                                      {monitorResult.evaluation.metrics.profitCaptured.toFixed(0)}%
                                                    </p>
                                                  </div>
                                                  <div className="bg-white p-2 rounded">
                                                    <p className="text-gray-500">Profit $</p>
                                                    <p className={`font-bold ${monitorResult.evaluation.metrics.profitDollars >= 0 ? "text-green-600" : "text-red-600"}`}>
                                                      {formatCurrency(monitorResult.evaluation.metrics.profitDollars)}
                                                    </p>
                                                  </div>
                                                  <div className="bg-white p-2 rounded">
                                                    <p className="text-gray-500">Cost to Close</p>
                                                    <p className="font-bold">{formatCurrency(monitorResult.evaluation.metrics.costToClose)}</p>
                                                  </div>
                                                </div>

                                                {/* Actions */}
                                                <div className="space-y-2">
                                                  <p className="text-xs font-medium text-gray-700">Suggested Actions:</p>
                                                  {monitorResult.evaluation.actions.map((action, idx) => (
                                                    <div key={idx} className="p-2 bg-white rounded border border-gray-200">
                                                      <p className="font-medium text-sm">{action.action}</p>
                                                      <p className="text-xs text-gray-600">{action.description}</p>
                                                      {action.estimatedProfit !== undefined && (
                                                        <p className="text-xs text-green-600 mt-1">
                                                          Est. profit: {formatCurrency(action.estimatedProfit)}
                                                        </p>
                                                      )}
                                                      {action.estimatedCost !== undefined && (
                                                        <p className="text-xs text-red-600 mt-1">
                                                          Est. cost: {formatCurrency(action.estimatedCost)}
                                                        </p>
                                                      )}
                                                    </div>
                                                  ))}
                                                </div>

                                                {/* Market Data */}
                                                <div className="text-xs text-gray-500 pt-2 border-t">
                                                  <p>Stock: {formatCurrency(monitorResult.market.stockPrice)} •
                                                     Option: {formatCurrency(monitorResult.market.optionBid)} / {formatCurrency(monitorResult.market.optionAsk)}
                                                  </p>
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </div>
                      )}
                    </>
                  )}
                </div>

                {/* Sidebar */}
                <div className="space-y-6 lg:sticky lg:top-6 self-start">
                  {/* Covered Call Analysis - above strategy info */}
                  {analysis && selectedStrategy === "covered-calls" && (
                    <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl shadow-sm border border-green-200 p-6">
                      <div className="flex items-center justify-between gap-3 mb-4">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">📈</span>
                          <h3 className="text-lg font-semibold text-green-900">Covered Call Analysis</h3>
                        </div>
                        <button
                          type="button"
                          onClick={() => setCollapseCcAnalysis((v) => !v)}
                          className="text-xs font-medium text-green-700 hover:text-green-900"
                        >
                          {collapseCcAnalysis ? "Show" : "Hide"}
                        </button>
                      </div>
                      {collapseCcAnalysis ? (
                        <p className="text-sm text-green-700">Click Show to expand analysis.</p>
                      ) : (
                        <>
                          {/* Sentiment & Volatility */}
                          <div className="grid grid-cols-2 gap-4 mb-6">
                            <div className="bg-white/60 rounded-lg p-4">
                              <p className="text-sm text-gray-600 mb-1">Your Outlook</p>
                              <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${
                                analysis.sentiment === "bullish" ? "bg-green-100 text-green-700" :
                                analysis.sentiment === "bearish" ? "bg-red-100 text-red-700" :
                                "bg-gray-100 text-gray-700"
                              }`}>
                                {analysis.sentiment === "bullish" ? "↑" : analysis.sentiment === "bearish" ? "↓" : "—"}
                                {analysis.sentiment.charAt(0).toUpperCase() + analysis.sentiment.slice(1)}
                              </div>
                            </div>
                            <div className="bg-white/60 rounded-lg p-4">
                              <p className="text-sm text-gray-600 mb-1">Volatility</p>
                              <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${
                                analysis.volatility === "high" ? "bg-red-100 text-red-700" :
                                analysis.volatility === "low" ? "bg-green-100 text-green-700" :
                                "bg-yellow-100 text-yellow-700"
                              }`}>
                                {analysis.volatility.charAt(0).toUpperCase() + analysis.volatility.slice(1)}
                              </div>
                            </div>
                          </div>

                          {/* Key Metrics */}
                          <div className="grid grid-cols-2 gap-4 mb-6">
                            <div className="bg-white/60 rounded-lg p-3">
                              <p className="text-xs text-gray-600">Suggested Strike</p>
                              <p className="font-bold text-green-800">{analysis.suggestedStrike}</p>
                            </div>
                            <div className="bg-white/60 rounded-lg p-3">
                              <p className="text-xs text-gray-600">Potential Income</p>
                              <p className="font-bold text-green-800">{analysis.potentialIncome}</p>
                            </div>
                            <div className="bg-white/60 rounded-lg p-3">
                              <p className="text-xs text-gray-600">Max Profit</p>
                              <p className="font-bold text-green-800">{analysis.maxProfit}</p>
                            </div>
                            <div className="bg-white/60 rounded-lg p-3">
                              <p className="text-xs text-gray-600">Breakeven</p>
                              <p className="font-bold text-green-800">{analysis.breakeven}</p>
                            </div>
                          </div>

                          {/* Recommendation */}
                          <div className="bg-white rounded-lg p-4 border border-green-200">
                            <h4 className="font-semibold text-green-900 mb-2">Recommendation</h4>
                            <p className="text-gray-700">{analysis.recommendation}</p>
                          </div>

                          {/* Risk Assessment */}
                          <div className="mt-4 p-3 bg-white/40 rounded-lg">
                            <p className="text-sm text-gray-600">
                              <strong>Risk Assessment ({selectedAccount?.riskLevel} profile):</strong> {analysis.riskAssessment}
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* Strategy Info - Covered Calls */}
                  {selectedStrategy === "covered-calls" && (
                    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-6 border border-blue-100">
                      <h3 className="text-lg font-semibold text-blue-900 mb-3">📈 Covered Calls</h3>
                      <p className="text-sm text-blue-800 mb-4">
                        A covered call involves owning shares of stock and selling call options against them to generate income.
                      </p>

                      {/* RSI + Volatility */}
                      <div className="mb-4 p-3 bg-white/80 rounded-lg border border-blue-200">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-blue-900">RSI (14)</span>
                          <span className="text-sm font-bold text-blue-900">
                            {technicalsLoading ? "Loading…" : technicals?.rsi14 != null ? technicals.rsi14.toFixed(1) : "—"}
                          </span>
                        </div>
                        <p className="text-xs text-blue-800 mt-1">
                          RSI Signals:
                        </p>
                        <p className="text-xs text-blue-700">
                          &gt;70: Overbought • &lt;30: Oversold • 30–70: Normal
                        </p>

                        <div className="mt-3 flex items-center justify-between">
                          <span className="text-xs font-medium text-blue-900">Volatility (ann.)</span>
                          <span className="text-sm font-bold text-blue-900">
                            {technicalsLoading
                              ? "Loading…"
                              : technicals?.volatility != null
                              ? `${technicals.volatility.toFixed(1)}%`
                              : "—"}
                          </span>
                        </div>
                        <p className="text-xs text-blue-700 mt-1">
                          Quick ref: &lt;25% low • 25–50% moderate • &gt;50% high
                        </p>
                      </div>

                      {/* Option Liquidity (selected contract) */}
                      <div className="mb-4 p-3 bg-white/80 rounded-lg border border-blue-200">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-blue-900">Option Liquidity</span>
                          <span className="text-[10px] text-blue-700">
                            {buildOptionContract?.dataSource === "synthetic" ? "modeled" : buildOptionContract?.dataSource || ""}
                          </span>
                        </div>
                        {buildOptionContract && buildOptionContract.contract_type === "call" ? (
                          <div className="mt-2 grid grid-cols-2 gap-3 text-xs">
                            <div className="bg-blue-50/50 rounded p-2">
                              <p className="text-blue-800">OI</p>
                              <p className="font-bold text-blue-950">
                                {buildOptionContract.open_interest?.toLocaleString?.() ?? "—"}
                              </p>
                              <p className="text-[10px] text-blue-700">Rule: higher = easier fills</p>
                            </div>
                            <div className="bg-blue-50/50 rounded p-2">
                              <p className="text-blue-800">Daily Vol (DV)</p>
                              <p className="font-bold text-blue-950">
                                {buildOptionContract.volume?.toLocaleString?.() ?? "—"}
                              </p>
                              <p className="text-[10px] text-blue-700">Rule: higher = tighter markets</p>
                            </div>
                            <div className="bg-blue-50/50 rounded p-2">
                              <p className="text-blue-800">Bid–Ask Spread</p>
                              <p className="font-bold text-blue-950">
                                {buildOptionLiquidity?.spreadAbs != null && buildOptionLiquidity?.spreadPct != null
                                  ? `${formatCurrency(buildOptionLiquidity.spreadAbs)} (${buildOptionLiquidity.spreadPct.toFixed(1)}%)`
                                  : "—"}
                              </p>
                              <p className="text-[10px] text-blue-700">Rule: &lt;5% good • &gt;10% avoid</p>
                            </div>
                            <div className="bg-blue-50/50 rounded p-2">
                              <p className="text-blue-800">IV</p>
                              <p className="font-bold text-blue-950">
                                {buildOptionContract.implied_volatility?.toFixed?.(0) ?? "—"}%
                              </p>
                              <p className="text-[10px] text-blue-700">CC: higher IV = more premium (sell)</p>
                            </div>
                          </div>
                        ) : (
                          <p className="mt-2 text-xs text-blue-700">
                            Select an expiration + strike to load a <strong>call</strong> contract.
                          </p>
                        )}
                      </div>

                      {/* Rationale explained */}
                      <div className="mb-4 p-3 bg-white/80 rounded-lg border border-blue-200">
                        <h4 className="text-xs font-semibold text-blue-900 mb-2">Rationale (e.g. 10% OTM • Low premium • Low IV)</h4>
                        <ul className="text-[11px] text-blue-800 space-y-1">
                          <li><strong>% OTM</strong> — Strike above spot; higher % = more cushion, less income, lower chance of being called away.</li>
                          <li><strong>Low premium</strong> — Far OTM = less time value; you keep more upside, less income.</li>
                          <li><strong>Low IV</strong> — Market expects smaller moves; options cheaper, probability of finishing above strike is lower.</li>
                          <li><strong>Chance of being called away</strong> — Risk-neutral P(stock &gt; strike at expiration). Use it to compare strikes.</li>
                        </ul>
                      </div>

                      {/* Available Shares Display */}
                      {tickerData && selectedAccount && (
                        <div className="mb-4 p-3 bg-white/80 rounded-lg border border-blue-300">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-blue-900">
                              Available Shares ({tickerData.symbol}):
                            </span>
                            <span className="text-lg font-bold text-blue-900">
                              {availableShares.toLocaleString()}
                            </span>
                          </div>
                          <p className="text-xs text-blue-700 mt-1">
                            {selectedAccount.name}
                          </p>
                          {availableShares === 0 && (
                            <p className="text-xs text-amber-600 mt-1">
                              ⚠ No shares found. You need to own shares to write covered calls.
                            </p>
                          )}
                        </div>
                      )}

                      <ul className="space-y-2 text-sm text-blue-800">
                        <li className="flex items-start gap-2">
                          <span className="text-green-500">✓</span>
                          Generate income from stocks you own
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-green-500">✓</span>
                          Reduce cost basis over time
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-green-500">✓</span>
                          Lower risk than buying options
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-yellow-500">⚠</span>
                          Limits upside if stock rises sharply
                        </li>
                      </ul>
                    </div>
                  )}

                  {/* Strategy Info - Cash-Secured Puts */}
                  {selectedStrategy === "cash-secured-puts" && (
                    <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl p-6 border border-amber-100">
                      <h3 className="text-lg font-semibold text-amber-900 mb-3">💵 Cash-Secured Puts</h3>
                      <p className="text-sm text-amber-800 mb-4">
                        Sell put options while holding cash to cover potential stock purchase. Get paid premium upfront for agreeing to buy shares at the strike price.
                      </p>

                      {/* RSI + Volatility */}
                      <div className="mb-4 p-3 bg-white/80 rounded-lg border border-amber-300">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-amber-900">RSI (14)</span>
                          <span className="text-sm font-bold text-amber-900">
                            {technicalsLoading ? "Loading…" : technicals?.rsi14 != null ? technicals.rsi14.toFixed(1) : "—"}
                          </span>
                        </div>
                        <p className="text-xs text-amber-800 mt-1">
                          RSI Signals:
                        </p>
                        <p className="text-xs text-amber-700">
                          &gt;70: Overbought • &lt;30: Oversold • 30–70: Normal
                        </p>

                        <div className="mt-3 flex items-center justify-between">
                          <span className="text-xs font-medium text-amber-900">Volatility (ann.)</span>
                          <span className="text-sm font-bold text-amber-900">
                            {technicalsLoading
                              ? "Loading…"
                              : technicals?.volatility != null
                              ? `${technicals.volatility.toFixed(1)}%`
                              : "—"}
                          </span>
                        </div>
                        <p className="text-xs text-amber-700 mt-1">
                          Quick ref: &lt;25% low • 25–50% moderate • &gt;50% high
                        </p>
                      </div>

                      {/* Option Liquidity (selected contract) */}
                      <div className="mb-4 p-3 bg-white/80 rounded-lg border border-amber-300">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-amber-900">Option Liquidity</span>
                          <span className="text-[10px] text-amber-800">
                            {optionsResult?.dataSource === "synthetic" ? "modeled" : optionsResult?.dataSource || ""}
                          </span>
                        </div>
                        {selectedOption && selectedOption.contract_type === "put" ? (
                          <div className="mt-2 grid grid-cols-2 gap-3 text-xs">
                            <div className="bg-amber-50/60 rounded p-2">
                              <p className="text-amber-900">OI</p>
                              <p className="font-bold text-amber-950">
                                {selectedOption.open_interest?.toLocaleString?.() ?? "—"}
                              </p>
                              <p className="text-[10px] text-amber-700">Rule: higher = easier fills</p>
                            </div>
                            <div className="bg-amber-50/60 rounded p-2">
                              <p className="text-amber-900">Daily Vol (DV)</p>
                              <p className="font-bold text-amber-950">
                                {selectedOption.volume?.toLocaleString?.() ?? "—"}
                              </p>
                              <p className="text-[10px] text-amber-700">Rule: higher = tighter markets</p>
                            </div>
                            <div className="bg-amber-50/60 rounded p-2">
                              <p className="text-amber-900">Bid–Ask Spread</p>
                              <p className="font-bold text-amber-950">
                                {selectedOptionLiquidity?.spreadAbs != null && selectedOptionLiquidity?.spreadPct != null
                                  ? `${formatCurrency(selectedOptionLiquidity.spreadAbs)} (${selectedOptionLiquidity.spreadPct.toFixed(1)}%)`
                                  : "—"}
                              </p>
                              <p className="text-[10px] text-amber-700">Rule: &lt;5% good • &gt;10% avoid</p>
                            </div>
                            <div className="bg-amber-50/60 rounded p-2">
                              <p className="text-amber-900">IV</p>
                              <p className="font-bold text-amber-950">
                                {selectedOption.implied_volatility?.toFixed?.(0) ?? "—"}%
                              </p>
                              <p className="text-[10px] text-amber-700">CSP: higher IV = more premium, more assignment risk</p>
                            </div>
                          </div>
                        ) : (
                          <p className="mt-2 text-xs text-amber-800">
                            Select a <strong>put</strong> contract to see OI, DV, spread, and IV.
                          </p>
                        )}
                      </div>

                      {/* Estimated Total Cash */}
                      <div className="mb-4 p-3 bg-white/80 rounded-lg border border-amber-300">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-amber-900">Estimated Total Cash on Hand:</span>
                          <span className="text-lg font-bold text-amber-900">
                            {new Intl.NumberFormat("en-US", {
                              style: "currency",
                              currency: "USD",
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            }).format(estimatedTotalCash)}
                          </span>
                        </div>
                        <p className="text-xs text-amber-700 mt-1">
                          Across all accounts (cash positions only)
                        </p>
                      </div>

                      <ul className="space-y-2 text-sm text-amber-800">
                        <li className="flex items-start gap-2">
                          <span className="text-green-500">✓</span>
                          Collect premium income immediately
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-green-500">✓</span>
                          Get paid to potentially buy stock at discount
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-green-500">✓</span>
                          Defined max risk (strike - premium)
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-yellow-500">⚠</span>
                          Must have cash secured (strike × 100)
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-yellow-500">⚠</span>
                          Assigned if stock drops below strike
                        </li>
                      </ul>

                      {/* Max Loss (per contract, scales with quantity) */}
                      <div className="mt-4 p-3 bg-white/80 rounded-lg border border-amber-300">
                        <p className="text-xs font-medium text-amber-900 mb-1">Max loss</p>
                        {buildOptionContract && buildOptionContract.contract_type === "put" ? (
                          <>
                            <p className="text-lg font-bold text-amber-950">
                              {formatCurrency((buildOptionContract.strike_price - buildOptionContract.premium) * 100)} per contract
                            </p>
                            {buildQuantity > 1 && (
                              <p className="text-xs text-amber-800 mt-1">
                                {formatCurrency((buildOptionContract.strike_price - buildOptionContract.premium) * 100 * buildQuantity)} total for {buildQuantity} contracts
                              </p>
                            )}
                          </>
                        ) : (
                          <p className="text-xs text-amber-700">Select expiration + strike to see max loss</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Recent Searches */}
                  <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Searches</h3>
                    {searchHistory.length === 0 ? (
                      <p className="text-gray-500 text-sm">No recent searches</p>
                    ) : (
                      <div className="space-y-3">
                        {searchHistory.map((ticker) => (
                          <button
                            key={ticker.symbol}
                            onClick={() => {
                              setSymbol(ticker.symbol);
                              setTickerData(ticker);
                              if (selectedAccount) {
                                if (userOutlook) {
                                  setAnalysis(analyzeCoveredCall(ticker, selectedAccount.riskLevel, userOutlook));
                                }
                              }
                            }}
                            className="w-full flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors text-left"
                          >
                            <div>
                              <p className="font-medium text-gray-900">{ticker.symbol}</p>
                              <p className="text-xs text-gray-500">{ticker.type}</p>
                            </div>
                            <div className="text-right">
                              <p className="font-medium text-gray-900">{formatCurrency(ticker.price)}</p>
                              <p className={`text-xs ${ticker.change >= 0 ? "text-green-600" : "text-red-600"}`}>
                                {ticker.change >= 0 ? "+" : ""}{ticker.changePercent.toFixed(2)}%
                              </p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
