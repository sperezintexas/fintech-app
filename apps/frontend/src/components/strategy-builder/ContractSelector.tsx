'use client';

import { useMemo, useState, useEffect } from 'react';
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from 'recharts';
import { generatePLData } from '@/lib/strategy-builder';
import {
  outlookEmoji,
  getVolatilityLevel,
  getOutlookLabel,
} from '@/lib/strategy-templates';

export type OptionChainRow = {
  strike: number;
  call: { premium: number; last_quote?: { bid: number; ask: number } } | null;
  put: { premium: number; last_quote?: { bid: number; ask: number } } | null;
};

type ContractSelectorProps = {
  symbol: string;
  stockPrice: number;
  outlook: string | null;
  strategyId: string | null;
  expirations: string[];
  expiration: string | null;
  optionChain: OptionChainRow[];
  contractType: 'call' | 'put';
  selectedStrike: number | null;
  quantity: number;
  limitPrice: string;
  chainLoading: boolean;
  onExpirationChange: (exp: string) => void;
  onStrikeChange: (strike: number) => void;
  onContractTypeChange: (t: 'call' | 'put') => void;
  onQuantityChange: (q: number) => void;
  onLimitPriceChange: (v: string) => void;
  onReviewOrder: () => void;
  onBack: () => void;
};

function formatExpiration(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function mockProbOtm(stockPrice: number, strike: number, isCall: boolean): number {
  const otmPercent = isCall
    ? ((strike - stockPrice) / stockPrice) * 100
    : ((stockPrice - strike) / stockPrice) * 100;
  if (otmPercent <= 0) return 0;
  return Math.min(99, Math.round(50 + otmPercent * 2));
}

type SMAData = {
  sma50: number;
  sma50Plus15: number;
  sma50Minus15: number;
};

function pct(p?: number): string {
  return p != null ? `${Math.round(p * 100)}%` : '–';
}

export function ContractSelector({
  symbol,
  stockPrice,
  outlook,
  strategyId,
  expirations,
  expiration,
  optionChain,
  contractType,
  selectedStrike,
  quantity,
  limitPrice,
  chainLoading,
  onExpirationChange,
  onStrikeChange,
  onContractTypeChange,
  onQuantityChange,
  onLimitPriceChange,
  onReviewOrder,
  onBack,
}: ContractSelectorProps) {
  const [smaData, setSmaData] = useState<SMAData | null>(null);
  const [smaLoading, setSmaLoading] = useState(false);
  const [technicals, setTechnicals] = useState<{
    rsi14: number;
    volatility: number;
  } | null>(null);
  const [technicalsLoading, setTechnicalsLoading] = useState(false);
  const [accountsData, setAccountsData] = useState<{
    cashOnHand: number;
    sharesForSymbol: number;
  }>({ cashOnHand: 0, sharesForSymbol: 0 });
  /** Strike filter: 'all' = show all strikes (Yahoo "All Strike Prices"); number = show only that strike */
  const [strikeFilter, setStrikeFilter] = useState<'all' | number>('all');
  const [showAllStrikes, setShowAllStrikes] = useState(false);

  useEffect(() => {
    if (!symbol) return;
    setSmaLoading(true);
    fetch(`/api/ticker/${encodeURIComponent(symbol.toUpperCase())}/sma`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.sma50 != null) {
          setSmaData({
            sma50: data.sma50,
            sma50Plus15: data.sma50Plus15,
            sma50Minus15: data.sma50Minus15,
          });
        } else {
          setSmaData(null);
        }
      })
      .catch(() => setSmaData(null))
      .finally(() => setSmaLoading(false));
  }, [symbol]);

  useEffect(() => {
    if (!symbol) return;
    setTechnicalsLoading(true);
    fetch(`/api/ticker/${encodeURIComponent(symbol.toUpperCase())}/technicals`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.rsi14 != null && data?.volatility != null) {
          setTechnicals({ rsi14: data.rsi14, volatility: data.volatility });
        } else {
          setTechnicals(null);
        }
      })
      .catch(() => setTechnicals(null))
      .finally(() => setTechnicalsLoading(false));
  }, [symbol]);

  useEffect(() => {
    fetch('/api/accounts')
      .then((res) => (res.ok ? res.json() : []))
      .then((accounts: { balance?: number; positions?: { ticker?: string; shares?: number }[] }[]) => {
        const cashOnHand = (accounts ?? []).reduce((sum, a) => sum + (a.balance ?? 0), 0);
        const sharesForSymbol = (accounts ?? []).reduce((sum, a) => {
          const posShares = (a.positions ?? [])
            .filter((p) => p.ticker?.toUpperCase() === symbol?.toUpperCase())
            .reduce((s, p) => s + (p.shares ?? 0), 0);
          return sum + posShares;
        }, 0);
        setAccountsData({ cashOnHand, sharesForSymbol });
      })
      .catch(() => setAccountsData({ cashOnHand: 0, sharesForSymbol: 0 }));
  }, [symbol]);

  const selectedContract = optionChain.find((c) => c.strike === selectedStrike);
  const contract = contractType === 'call' ? selectedContract?.call : selectedContract?.put;
  const bid = contract?.last_quote?.bid ?? contract?.premium ?? 0;
  const ask = contract?.last_quote?.ask ?? contract?.premium ?? 0;
  const premium = bid > 0 && ask > 0 ? (bid + ask) / 2 : contract?.premium ?? 0;

  const breakeven = useMemo(() => {
    if (!selectedStrike || !premium) return null;
    return contractType === 'call' ? selectedStrike + premium : selectedStrike - premium;
  }, [selectedStrike, premium, contractType]);

  const plData = useMemo(() => {
    if (!selectedStrike || !premium || !stockPrice) return [];
    const raw = generatePLData(selectedStrike, premium, contractType === 'call', quantity, 0.3);
    return raw.map((d) => ({
      ...d,
      profit: d.pnl >= 0 ? d.pnl : null,
      loss: d.pnl < 0 ? d.pnl : null,
    }));
  }, [selectedStrike, premium, contractType, quantity, stockPrice]);

  const maxProfit = useMemo(() => {
    if (plData.length === 0) return null;
    return Math.max(...plData.map((d) => d.pnl));
  }, [plData]);

  /** X-axis ticks in hundreds of dollars (e.g. 200, 250, 300) for stock price scale */
  const xAxisTicks = useMemo(() => {
    if (plData.length === 0) return [];
    const prices = plData.map((d) => d.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const span = max - min;
    // Step in hundreds: 25 for narrow range, 50 for mid, 100 for wide (avoid thousands-scale steps)
    const step =
      span <= 75 ? 25 : span <= 150 ? 50 : span <= 500 ? 100 : Math.max(100, Math.round(span / 15));
    const low = Math.floor(min / step) * step;
    const high = Math.ceil(max / step) * step;
    const ticks: number[] = [];
    for (let v = low; v <= high; v += step) ticks.push(v);
    return ticks;
  }, [plData]);

  const filteredChain = useMemo(() => {
    if (strategyId === 'cash-secured-put') {
      // CSP: show only OTM (and ATM) puts — strikes at or below stock price. Floor 50% below so far OTM still visible.
      const min = stockPrice * 0.5;
      const max = stockPrice;
      return optionChain.filter((c) => c.strike >= min && c.strike <= max);
    }
    // Covered call / others: symmetric range ±15% around stock
    const rangePct = 0.15;
    const range = stockPrice * rangePct;
    const min = stockPrice - range;
    const max = stockPrice + range;
    return optionChain.filter((c) => c.strike >= min && c.strike <= max);
  }, [optionChain, stockPrice, strategyId]);

  /** Chain to choose from: full chain when "Show all strikes" is on, otherwise range around stock */
  const chainForSelection = showAllStrikes ? optionChain : filteredChain;

  /** Rows to show: all strikes or single strike when "Strike price" dropdown filters to one */
  const displayChain = useMemo(() => {
    if (strikeFilter === 'all') return chainForSelection;
    return chainForSelection.filter((c) => c.strike === strikeFilter);
  }, [chainForSelection, strikeFilter]);

  useEffect(() => {
    if (strikeFilter === 'all') return;
    const hasStrike = chainForSelection.some((c) => c.strike === strikeFilter);
    if (!hasStrike) setStrikeFilter('all');
  }, [chainForSelection, strikeFilter]);

  /** When "Show all strikes" is on and user selects a strike, set limit price to that strike's mid (bid+ask)/2 */
  useEffect(() => {
    if (!showAllStrikes || selectedStrike == null || optionChain.length === 0) return;
    const row = optionChain.find((c) => c.strike === selectedStrike);
    const c = contractType === 'call' ? row?.call : row?.put;
    const b = c?.last_quote?.bid ?? c?.premium ?? 0;
    const a = c?.last_quote?.ask ?? c?.premium ?? 0;
    const mid = b > 0 && a > 0 ? (b + a) / 2 : c?.premium;
    if (mid != null && mid > 0) {
      onLimitPriceChange(mid.toFixed(4));
    }
  }, [showAllStrikes, selectedStrike, contractType, optionChain, onLimitPriceChange]);

  const isItm = (strike: number) =>
    contractType === 'call' ? strike < stockPrice : strike > stockPrice;

  const canReview = !!expiration && !!selectedStrike;

  const effectivePremium = useMemo(() => {
    const lp = parseFloat(limitPrice);
    if (Number.isFinite(lp) && lp > 0) return lp;
    return premium;
  }, [limitPrice, premium]);

  const assignmentCost = useMemo(() => {
    if (!selectedStrike || !quantity) return null;
    const gross = selectedStrike * 100 * quantity;
    const prem = effectivePremium * 100 * quantity;
    if (contractType === 'put') {
      return { label: 'Net cost if assigned', value: gross - prem };
    }
    return { label: 'Total proceeds if called away', value: gross + prem };
  }, [selectedStrike, quantity, effectivePremium, contractType]);

  const outlookLabel = outlook ? getOutlookLabel(outlook) : 'Neutral';
  const volLevel = technicals ? getVolatilityLevel(technicals.volatility) : 'Moderate';
  const itmProb = selectedStrike
    ? (100 - mockProbOtm(stockPrice, selectedStrike, contractType === 'call')) / 100
    : undefined;
  const otmProb = selectedStrike
    ? mockProbOtm(stockPrice, selectedStrike, contractType === 'call') / 100
    : undefined;

  const showCSPSummary = strategyId === 'cash-secured-put' && technicals;
  const showCCSummary =
    strategyId === 'covered-call' &&
    selectedStrike &&
    premium > 0 &&
    maxProfit != null &&
    breakeven != null;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Step 4: Choose contract</h2>

      {/* Strategy summary card (CSP / CC) */}
      {showCSPSummary && (
        <div className="p-4 bg-amber-50 rounded-xl border border-amber-200">
          <div className="flex items-start gap-2">
            <span className="text-2xl">💵</span>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-amber-900">Cash-Secured Put</h3>
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                <div>
                  <span className="text-amber-700">RSI</span>{' '}
                  <span className="font-medium">
                    {technicals.rsi14.toFixed(0)}{' '}
                    {technicals.rsi14 > 70 ? '🔥' : technicals.rsi14 < 30 ? '🟢' : '•'}
                  </span>
                  {technicals.rsi14 > 70 && (
                    <span className="text-xs text-amber-600">(overbought)</span>
                  )}
                  {technicals.rsi14 < 30 && (
                    <span className="text-xs text-amber-600">(oversold)</span>
                  )}
                </div>
                <div>
                  <span className="text-amber-700">Vol</span>{' '}
                  <span className="font-medium">
                    {technicals.volatility.toFixed(0)}%{' '}
                    {technicals.volatility > 50 ? '🌪️' : technicals.volatility > 25 ? '🌬️' : '☁️'}
                  </span>
                  <span className="text-xs text-amber-600">
                    ({volLevel.toLowerCase()})
                  </span>
                </div>
                <div>
                  <span className="text-amber-700">Cash</span>{' '}
                  <span className="font-medium">
                    ${accountsData.cashOnHand.toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-amber-700">Prob</span>{' '}
                  ITM {pct(itmProb)} • OTM {pct(otmProb)}
                </div>
              </div>
              <p className="mt-2 text-xs text-amber-700">
                ✓ Premium now • Possible discount buy | ⚠ Cash secured • Assigned if ↓
              </p>
            </div>
          </div>
        </div>
      )}

      {showCCSummary && selectedStrike && (
        <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200">
          <div className="flex items-start gap-2">
            <span className="text-2xl">📈</span>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-emerald-900">
                Covered Call • {outlookLabel} {outlookEmoji(outlookLabel)}
              </h3>
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                <div>
                  <span className="text-emerald-700">Strike</span>{' '}
                  <span className="font-medium">${selectedStrike.toFixed(0)}</span>
                </div>
                <div>
                  <span className="text-emerald-700">Income</span>{' '}
                  <span className="font-medium">
                    ~{((premium / stockPrice) * 100).toFixed(1)}%
                  </span>
                </div>
                <div>
                  <span className="text-emerald-700">Max</span>{' '}
                  <span className="font-medium">
                    ${maxProfit?.toFixed(0) ?? '–'}
                  </span>
                </div>
                <div>
                  <span className="text-emerald-700">BE</span>{' '}
                  <span className="font-medium">${breakeven?.toFixed(0) ?? '–'}</span>
                </div>
                <div>
                  <span className="text-emerald-700">Prob</span>{' '}
                  ITM {pct(itmProb)} • OTM {pct(otmProb)}
                </div>
                <div>
                  <span className="text-emerald-700">Shares</span>{' '}
                  <span className="font-medium">{accountsData.sharesForSymbol}</span>
                </div>
              </div>
              <p className="mt-2 text-xs text-emerald-700">
                ✓ Income • Lower basis | ⚠ Caps upside • Called away
              </p>
            </div>
          </div>
        </div>
      )}

      {strategyId === 'cash-secured-put' && technicalsLoading && (
        <div className="p-4 bg-amber-50/50 rounded-xl border border-amber-200 text-sm text-amber-700">
          Loading RSI & volatility…
        </div>
      )}

      {/* Compact: current price + strike targets ±5/10/15% + 50 MA & +20% when available */}
      <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <div>
            <span className="text-xs text-gray-500 uppercase tracking-wider">Price</span>
            <span className="ml-2 text-xl font-bold text-gray-900">${stockPrice.toFixed(2)}</span>
          </div>
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
            <span className="text-gray-500 font-medium">Strikes:</span>
            {[
              [-15, 0.85],
              [-10, 0.9],
              [-5, 0.95],
              [5, 1.05],
              [10, 1.1],
              [15, 1.15],
            ].map(([pct, mult]) => (
              <span key={String(pct)} className="text-gray-700">
                {pct > 0 ? '+' : ''}{pct}% <span className="font-medium text-gray-900">${(stockPrice * mult).toFixed(2)}</span>
              </span>
            ))}
          </div>
          {smaLoading ? (
            <span className="text-xs text-gray-500">50 MA…</span>
          ) : smaData ? (
            <div className="flex flex-wrap items-baseline gap-x-3 text-xs">
              <span className="text-gray-500">50 MA:</span>
              <span className="text-red-700">${smaData.sma50Minus15.toFixed(2)}</span>
              <span className="text-indigo-700 font-medium">${smaData.sma50.toFixed(2)}</span>
              <span className="text-green-700">${smaData.sma50Plus15.toFixed(2)}</span>
            </div>
          ) : null}
          <div className="text-xs text-gray-600">
            +20% <span className="font-medium text-indigo-700">${(stockPrice * 1.2).toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Option chain filters note */}
      <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 text-xs text-gray-600">
        <span className="font-medium text-gray-700">Option chain:</span> Live data for selected expiration (all strikes from source). Scanner filters (min OI, min volume) in Setup → Strategy apply to recommendations only.
      </div>

      {/* Controls row — compact, mobile-friendly */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        <div className="min-w-0">
          <label htmlFor="expiration" className="block text-xs font-medium text-gray-600 mb-0.5">
            Expiry
          </label>
          <select
            id="expiration"
            value={expiration ?? ''}
            onChange={(e) => onExpirationChange(e.target.value)}
            className="w-full min-w-0 px-2 py-1.5 border border-gray-300 rounded-md text-sm"
            aria-label="Select expiration date"
          >
            {expirations.map((d) => (
              <option key={d} value={d}>
                {formatExpiration(d)}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-0">
          <label htmlFor="strike-filter" className="block text-xs font-medium text-gray-600 mb-0.5">
            Strike
          </label>
          <select
            id="strike-filter"
            value={strikeFilter === 'all' ? 'all' : strikeFilter}
            onChange={(e) => {
              const v = e.target.value;
              if (v === 'all') {
                setStrikeFilter('all');
              } else {
                const strike = parseFloat(v);
                if (Number.isFinite(strike)) {
                  setStrikeFilter(strike);
                  onStrikeChange(strike);
                }
              }
            }}
            className="w-full min-w-0 px-2 py-1.5 border border-gray-300 rounded-md text-sm"
            aria-label="Filter or select strike price"
          >
            <option value="all">All</option>
            {chainForSelection.map((c) => (
              <option key={c.strike} value={c.strike}>
                ${c.strike.toFixed(2)}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-0">
          <label htmlFor="limit" className="block text-xs font-medium text-gray-600 mb-0.5">
            Limit $
          </label>
          <div className="flex items-center gap-0.5">
            <input
              id="limit"
              type="number"
              step="0.0001"
              min="0"
              value={limitPrice}
              onChange={(e) => onLimitPriceChange(e.target.value)}
              placeholder={premium > 0 ? premium.toFixed(4) : '0.0650'}
              className="w-full min-w-0 px-2 py-1.5 border border-gray-300 rounded-md text-sm"
              aria-label="Limit price"
            />
          </div>
          {bid > 0 && ask > 0 && (
            <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5 truncate">
              B ${bid.toFixed(2)} / A ${ask.toFixed(2)}
            </p>
          )}
        </div>
        <div className="min-w-0">
          <label htmlFor="quantity" className="block text-xs font-medium text-gray-600 mb-0.5">
            Qty
          </label>
          <input
            id="quantity"
            type="number"
            min={1}
            step={1}
            value={quantity}
            onChange={(e) => onQuantityChange(Math.max(1, parseInt(e.target.value, 10) || 1))}
            className="w-full min-w-0 px-2 py-1.5 border border-gray-300 rounded-md text-sm"
            aria-label="Contract quantity"
          />
        </div>
        <div className="col-span-2 sm:col-span-4 flex items-center pt-0.5">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showAllStrikes}
              onChange={(e) => setShowAllStrikes(e.target.checked)}
              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 sm:w-4 sm:h-4"
              aria-label="Show all strike prices for this expiration"
            />
            <span className="text-xs sm:text-sm font-medium text-gray-700">Show all strikes</span>
          </label>
          <p className="sr-only">When on, displays every strike for calls and puts for the selected expiration</p>
        </div>
      </div>

      {/* Contract type toggle */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onContractTypeChange('call')}
          className={`px-4 py-2 rounded-lg border-2 text-sm font-medium ${
            contractType === 'call'
              ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
              : 'border-gray-200 hover:border-indigo-300'
          }`}
        >
          Call
        </button>
        <button
          type="button"
          onClick={() => onContractTypeChange('put')}
          className={`px-4 py-2 rounded-lg border-2 text-sm font-medium ${
            contractType === 'put'
              ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
              : 'border-gray-200 hover:border-indigo-300'
          }`}
        >
          Put
        </button>
      </div>

      {/* Dual-pane: Option chain table + Payoff graph */}
      <div className="grid grid-cols-1 lg:grid-cols-[55%_1fr] gap-6">
        {/* Option chain table */}
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          {/* Current underlying price reference above table */}
          <div className="px-3 py-2 bg-indigo-50 border-b border-gray-200 flex items-center gap-2">
            <span className="text-xs font-medium text-indigo-800 uppercase tracking-wider">Current (underlying)</span>
            <span className="text-lg font-bold text-indigo-900">${stockPrice.toFixed(2)}</span>
            <span className="text-xs text-indigo-600">— compare strikes to this price</span>
          </div>
          <div className="overflow-x-auto max-h-80">
            {chainLoading ? (
              <div className="p-8 flex items-center justify-center text-gray-500">
                <span className="animate-spin mr-2">⟳</span> Loading option chain…
              </div>
            ) : displayChain.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <p className="font-medium">No strikes in range.</p>
                <p className="text-sm mt-1">Underlying: ${stockPrice.toFixed(2)}. Try a different expiration or symbol.</p>
              </div>
            ) : (
              <table className="w-full text-sm" role="grid" aria-label="Option chain">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="w-10 px-2 py-2 text-left font-medium text-gray-600" scope="col" />
                    <th className="px-3 py-2 text-left font-medium text-gray-600" scope="col">
                      Strike
                    </th>
                    <th className="px-3 py-2 text-right font-medium text-gray-600" scope="col">
                      Bid
                    </th>
                    <th className="px-3 py-2 text-right font-medium text-gray-600" scope="col">
                      Ask
                    </th>
                    <th className="px-3 py-2 text-right font-medium text-gray-600" scope="col">
                      Breakeven (BE)
                    </th>
                    <th className="px-3 py-2 text-right font-medium text-gray-600" scope="col">
                      Prob OTM
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {displayChain.map((row) => {
                    const strike = Number.isFinite(row.strike) ? row.strike : (row as { call?: { strike_price?: number }; put?: { strike_price?: number } }).call?.strike_price ?? (row as { put?: { strike_price?: number } }).put?.strike_price ?? 0;
                    const c = contractType === 'call' ? row.call : row.put;
                    const bidVal = c?.last_quote?.bid ?? c?.premium ?? 0;
                    const askVal = c?.last_quote?.ask ?? c?.premium ?? 0;
                    const prem = c?.premium ?? ((bidVal + askVal) / 2 || 0);
                    const be = contractType === 'call' ? strike + prem : strike - prem;
                    const probOtm = mockProbOtm(stockPrice, strike, contractType === 'call');
                    const selected = selectedStrike === strike;
                    const itm = isItm(strike);

                    return (
                      <tr
                        key={strike}
                        role="row"
                        tabIndex={0}
                        onClick={() => {
                          setStrikeFilter('all');
                          onStrikeChange(strike);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === ' ' || e.key === 'Enter') {
                            e.preventDefault();
                            setStrikeFilter('all');
                            onStrikeChange(strike);
                          }
                        }}
                        className={`cursor-pointer border-b border-gray-100 hover:bg-indigo-50/50 ${
                          selected ? 'bg-indigo-50' : ''
                        } ${itm ? 'bg-amber-50/30' : ''}`}
                      >
                        <td className="px-2 py-2">
                          <input
                            type="radio"
                            name="strike"
                            checked={selected}
                            onChange={() => {
                              setStrikeFilter('all');
                              onStrikeChange(strike);
                            }}
                            className="sr-only"
                            aria-label={`Select strike $${strike.toFixed(2)}`}
                          />
                          <span
                            className={`inline-block w-4 h-4 rounded-full border-2 ${
                              selected ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300'
                            }`}
                            aria-hidden
                          />
                        </td>
                        <td className="px-3 py-2">
                          <span className={itm ? 'font-bold text-amber-800' : ''}>
                            ${strike.toFixed(2)}
                          </span>
                          {itm && (
                            <span className="ml-1 text-xs text-amber-600">ITM</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">${bidVal.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right">${askVal.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right">${be.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right">{probOtm}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          <p className="text-xs text-gray-500 px-3 py-2 bg-gray-50 border-t">
            Bid/Ask are current market prices for the option at each strike.
          </p>
        </div>

        {/* Payoff graph */}
        <div className="border border-gray-200 rounded-lg p-4 min-h-80">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-sm font-medium text-gray-700">P/L at expiration</h3>
            {maxProfit != null && (
              <span className="text-sm font-semibold text-green-600">
                Max profit: ${maxProfit.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
            )}
          </div>
          {plData.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={plData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                  <defs>
                    <linearGradient id="profitFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor="#22c55e" stopOpacity={0.4} />
                      <stop offset="1" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="lossFill" x1="0" y1="1" x2="0" y2="0">
                      <stop offset="0" stopColor="#ef4444" stopOpacity={0.4} />
                      <stop offset="1" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    dataKey="price"
                    type="number"
                    domain={['dataMin', 'dataMax']}
                    ticks={xAxisTicks.length > 0 ? xAxisTicks : undefined}
                    tickFormatter={(v: number) =>
                      `$${Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
                    }
                    label={{ value: 'Stock price ($)', position: 'insideBottom', offset: -4 }}
                  />
                  <YAxis
                    tickFormatter={(v: number) => `$${v}`}
                    label={{ value: 'Profit / Loss', angle: -90, position: 'insideLeft' }}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length || label == null) return null;
                      const pnlEntry = payload.find((p) => p.dataKey === 'pnl');
                      const pnl = pnlEntry?.value != null ? Number(pnlEntry.value) : null;
                      return (
                        <div className="rounded border border-gray-200 bg-white px-3 py-2 shadow-sm">
                          <div className="text-xs text-gray-500">Stock: ${label}</div>
                          <div className="font-medium">
                            P/L: {pnl != null ? `$${pnl.toFixed(2)}` : '—'}
                          </div>
                        </div>
                      );
                    }}
                  />
                  <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="4 4" />
                  {breakeven != null && (
                    <ReferenceLine
                      x={breakeven}
                      stroke="#6366f1"
                      strokeDasharray="2 2"
                      label={{ value: '◇ Breakeven', position: 'top' }}
                    />
                  )}
                  {selectedStrike != null && (
                    <ReferenceLine
                      x={selectedStrike}
                      stroke="#f59e0b"
                      strokeDasharray="2 2"
                      label={{ value: '◇ Strike', position: 'top' }}
                    />
                  )}
                  <Area
                    type="monotone"
                    dataKey="profit"
                    stroke="none"
                    fill="url(#profitFill)"
                    fillOpacity={1}
                    baseValue={0}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="loss"
                    stroke="none"
                    fill="url(#lossFill)"
                    fillOpacity={1}
                    baseValue={0}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="pnl"
                    stroke="#6366f1"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: '12px' }}
                    formatter={() => (
                      <span className="text-gray-600">
                        x: Stock price · y: P/L · ◇ Strike · ● Breakeven
                      </span>
                    )}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-gray-400 border-2 border-dashed border-gray-200 rounded-lg">
              Select a strike to view payoff diagram
            </div>
          )}
        </div>
      </div>

      {/* Total proceeds / net cost — non-collapsible, above How to pick options */}
      {assignmentCost && selectedStrike && (
        <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-200">
          <p className="text-sm font-medium text-indigo-900">{assignmentCost.label}</p>
          <p className="text-2xl font-bold text-indigo-700 mt-1">
            ${assignmentCost.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-indigo-600 mt-1">
            {contractType === 'put'
              ? `Strike $${selectedStrike.toFixed(2)} × 100 × ${quantity} − premium $${(effectivePremium * 100 * quantity).toFixed(2)}`
              : `Strike $${selectedStrike.toFixed(2)} × 100 × ${quantity} + premium $${(effectivePremium * 100 * quantity).toFixed(2)}`}
          </p>
        </div>
      )}

      {/* Expandable: Breakeven (BE) and calculation */}
      <details className="border border-gray-200 rounded-xl bg-gray-50 overflow-hidden group">
        <summary className="cursor-pointer p-3 font-medium text-gray-900 hover:bg-gray-100 list-none flex items-center justify-between">
          <span>Breakeven (BE) & calculation</span>
          <span className="text-gray-400 group-open:rotate-180 transition-transform" aria-hidden>▼</span>
        </summary>
        <div className="px-3 pb-3 pt-0 border-t border-gray-200 space-y-2">
          {breakeven != null && selectedStrike ? (
            <>
              <p className="text-sm font-medium text-gray-900 pt-2">
                Breakeven: <strong>${breakeven.toFixed(2)}</strong>
              </p>
              <p className="text-xs text-gray-600">
                {contractType === 'call'
                  ? `Call: BE = Strike + Premium ⇒ $${selectedStrike.toFixed(2)} + $${(premium).toFixed(4)} = $${breakeven.toFixed(2)}. Above this stock price at expiration the call is in the money.`
                  : `Put: BE = Strike − Premium ⇒ $${selectedStrike.toFixed(2)} − $${(premium).toFixed(4)} = $${breakeven.toFixed(2)}. Below this stock price at expiration the put is in the money.`}
              </p>
            </>
          ) : (
            <p className="text-sm text-gray-500 pt-2">Select a strike to see breakeven and formula.</p>
          )}
        </div>
      </details>

      {/* Helper tooltips - compact */}
      <details className="text-sm text-gray-600">
        <summary className="cursor-pointer hover:text-indigo-600">How to pick options</summary>
        <ul className="mt-2 space-y-1 list-disc list-inside text-gray-500">
          <li>Expiration: Longer dates = more time value, higher premium</li>
          <li>Strike: ITM = in the money; OTM = out of the money</li>
          <li>Limit price: Your max (call) or min (put) acceptable price</li>
          <li>Graph: Green = profit zone, red = loss zone at expiration</li>
        </ul>
      </details>

      {/* Actions */}
      <div className="flex justify-between pt-4 border-t">
        <button
          type="button"
          onClick={onBack}
          className="px-6 py-3 rounded-xl border-2 border-gray-300 bg-white text-gray-700 font-medium hover:bg-gray-50 focus:outline-none focus:ring-4 focus:ring-gray-500"
        >
          ← Back
        </button>
        <button
          type="button"
          onClick={onReviewOrder}
          disabled={!canReview}
          className="px-6 py-3 rounded-xl bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-4 focus:ring-indigo-500"
        >
          Review order
        </button>
      </div>
    </div>
  );
}
