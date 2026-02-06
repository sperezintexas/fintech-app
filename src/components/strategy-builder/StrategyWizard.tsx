'use client';

import { useState, useEffect, useCallback } from 'react';
import { STRATEGIES, OUTLOOKS } from '@/lib/strategy-builder';
import { ContractSelector, type OptionChainRow } from './ContractSelector';
import { ReviewOrderStep } from './ReviewOrderStep';
import type { Outlook } from '@/types/strategy';

type SymbolResult = { symbol: string; name: string; type: string };
export type TickerQuote = { symbol: string; name: string; price: number; change: number; changePercent: number };

function Button({
  children,
  onClick,
  variant = 'default',
  className = '',
  disabled = false,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'default' | 'outline';
  className?: string;
  disabled?: boolean;
}) {
  const base = 'px-6 py-3 rounded-xl font-medium shadow transition-all focus:outline-none focus:ring-4';
  const variants = {
    default: 'bg-indigo-600 text-white hover:bg-indigo-700 focus:ring-indigo-500',
    outline: 'border-2 border-gray-300 bg-white text-gray-700 hover:bg-gray-50 focus:ring-gray-500',
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${variants[variant]} ${className} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      {children}
    </button>
  );
}

type StrategyWizardProps = {
  onSymbolSelected?: (quote: TickerQuote | null) => void;
  onOutlookChange?: (outlook: Outlook | null) => void;
  onStrategyChange?: (strategyId: string | null) => void;
};

export function StrategyWizard({ onSymbolSelected, onOutlookChange, onStrategyChange }: StrategyWizardProps) {
  const [step, setStep] = useState(1);
  const STEPS = ['Symbol', 'Outlook', 'Strategy', 'Contract', 'Review order'];

  // Step 1: Symbol
  const [symbolQuery, setSymbolQuery] = useState('');
  const [symbolResults, setSymbolResults] = useState<SymbolResult[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState<TickerQuote | null>(null);
  const [symbolLoading, setSymbolLoading] = useState(false);
  const [symbolSearchLoading, setSymbolSearchLoading] = useState(false);
  const [topWatchlistSymbols, setTopWatchlistSymbols] = useState<Array<{ symbol: string; ivRank: number }>>([]);
  const [topWatchlistLoading, setTopWatchlistLoading] = useState(false);

  // Step 2: Outlook
  const [outlook, setOutlook] = useState<Outlook | null>(null);

  // Step 3: Strategy
  const [strategyId, setStrategyId] = useState<string | null>(null);

  // Step 4: Contract
  const [expirations, setExpirations] = useState<string[]>([]);
  const [expiration, setExpiration] = useState<string | null>(null);
  const [optionChain, setOptionChain] = useState<OptionChainRow[]>([]);
  const [strike, setStrike] = useState<number | null>(null);
  const [contractType, setContractType] = useState<'call' | 'put'>('call');
  const [quantity, setQuantity] = useState(1);
  const [limitPrice, setLimitPrice] = useState('');
  const [chainLoading, setChainLoading] = useState(false);

  const selectedStrategy = STRATEGIES.find((s) => s.id === strategyId);
  const filteredStrategies = outlook ? STRATEGIES.filter((s) => s.outlooks.includes(outlook)) : [];

  useEffect(() => {
    onOutlookChange?.(outlook);
  }, [outlook, onOutlookChange]);

  useEffect(() => {
    onStrategyChange?.(strategyId);
  }, [strategyId, onStrategyChange]);

  const searchSymbols = useCallback(async (q: string) => {
    if (!q || q.length < 2) {
      setSymbolResults([]);
      return;
    }
    setSymbolSearchLoading(true);
    try {
      const res = await fetch(`/api/symbols/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setSymbolResults(Array.isArray(data) ? data : []);
    } catch {
      setSymbolResults([]);
    } finally {
      setSymbolSearchLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => searchSymbols(symbolQuery), 300);
    return () => clearTimeout(t);
  }, [symbolQuery, searchSymbols]);

  useEffect(() => {
    if (step !== 1) return;
    setTopWatchlistLoading(true);
    fetch('/api/watchlist/top-for-options?limit=10')
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setTopWatchlistSymbols(Array.isArray(data) ? data : []))
      .catch(() => setTopWatchlistSymbols([]))
      .finally(() => setTopWatchlistLoading(false));
  }, [step]);

  const fetchQuote = async (sym: string) => {
    setSymbolLoading(true);
    try {
      const res = await fetch(`/api/ticker/${encodeURIComponent(sym.toUpperCase())}`);
      if (!res.ok) throw new Error('Ticker not found');
      const data = await res.json();
      setSelectedSymbol({
        symbol: data.symbol,
        name: data.name || data.symbol,
        price: data.price,
        change: data.change ?? 0,
        changePercent: data.changePercent ?? 0,
      });
      setSymbolQuery('');
      setSymbolResults([]);
    } catch {
      setSelectedSymbol(null);
    } finally {
      setSymbolLoading(false);
    }
  };

  const fetchExpirations = useCallback(async (sym: string) => {
    try {
      const res = await fetch(`/api/options/expirations?underlying=${encodeURIComponent(sym)}`);
      const data = await res.json();
      const raw = (data.expirationDates ?? []) as string[];
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const maxDate = new Date(today);
      maxDate.setDate(maxDate.getDate() + 52 * 7);

      // Prefer Fridays (weekly expirations); fallback to all future dates if none
      const fridays = raw.filter((d) => {
        const date = new Date(d + 'T12:00:00Z');
        if (date < today) return false;
        if (date > maxDate) return false;
        return date.getUTCDay() === 5;
      });
      const fallback = raw.filter((d) => {
        const date = new Date(d + 'T12:00:00Z');
        return date >= today && date <= maxDate;
      });
      const filtered = fridays.length > 0 ? fridays : fallback;
      const sorted = [...filtered].sort((a, b) => a.localeCompare(b));

      setExpirations(sorted);
      if (sorted.length > 0) {
        setExpiration(sorted[0]);
      } else {
        setExpiration(null);
      }
    } catch {
      setExpirations([]);
      setExpiration(null);
    }
  }, []);

  const fetchOptionChain = useCallback(async (sym: string, exp: string, targetStrike: number) => {
    setChainLoading(true);
    try {
      const res = await fetch(
        `/api/options?underlying=${encodeURIComponent(sym)}&expiration=${encodeURIComponent(exp)}&strike=${targetStrike}`
      );
      const data = await res.json();
      const chain: OptionChainRow[] = data.optionChain ?? [];
      setOptionChain(chain);
      if (chain.length > 0 && !strike) {
        const atm = chain.reduce((a, b) =>
          Math.abs(b.strike - targetStrike) < Math.abs(a.strike - targetStrike) ? b : a
        );
        setStrike(atm.strike);
      }
    } catch {
      setOptionChain([]);
    } finally {
      setChainLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedSymbol && step === 4) {
      fetchExpirations(selectedSymbol.symbol);
    }
  }, [selectedSymbol, step, fetchExpirations]);

  // Default to puts when Cash-Secured Put is selected
  useEffect(() => {
    if (step === 4 && strategyId === 'cash-secured-put') {
      setContractType('put');
    }
  }, [step, strategyId]);

  useEffect(() => {
    if (expiration && step === 4) setStrike(null);
  }, [expiration, step]);

  useEffect(() => {
    if (step === 5 && strike != null && optionChain.length > 0) {
      const hasStrike = optionChain.some((c) => c.strike === strike);
      if (!hasStrike) {
        const atm = optionChain.reduce((a, b) =>
          Math.abs(b.strike - (selectedSymbol?.price ?? 0)) <
          Math.abs(a.strike - (selectedSymbol?.price ?? 0))
            ? b
            : a
        );
        setStrike(atm.strike);
      }
    }
  }, [step, strike, optionChain, selectedSymbol?.price]);

  useEffect(() => {
    if (selectedSymbol && expiration) {
      const targetStrike = Math.round(selectedSymbol.price * 2) / 2;
      fetchOptionChain(selectedSymbol.symbol, expiration, targetStrike);
    }
  }, [selectedSymbol, expiration, fetchOptionChain]);

  useEffect(() => {
    onSymbolSelected?.(selectedSymbol ?? null);
  }, [selectedSymbol, onSymbolSelected]);

  const canProceedStep1 = !!selectedSymbol;
  const canProceedStep2 = !!outlook;
  const canProceedStep3 = !!strategyId;
  const _canProceedStep4 = !!expiration && !!strike;

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-2 border-b border-gray-200 pb-4 flex-wrap">
        {STEPS.map((label, i) => (
          <button
            key={label}
            onClick={() => setStep(i + 1)}
            className={`flex items-center gap-1 px-4 py-2 rounded-lg font-medium transition-all ${
              step === i + 1 ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            {step > i + 1 && <span className="text-green-600" aria-hidden>✓</span>}
            {label}
          </button>
        ))}
      </div>

      {/* Step 1: Symbol Input */}
      {step === 1 && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Step 1: Select a symbol</h2>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
            <input
              placeholder="Search symbol (e.g. TSLA, AAPL)"
              value={symbolQuery}
              onChange={(e) => setSymbolQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {symbolSearchLoading && (
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 animate-spin">⟳</span>
            )}
          </div>
          {symbolResults.length > 0 && (
            <ul data-testid="symbol-search-results" className="border border-gray-200 rounded-xl divide-y max-h-48 overflow-auto">
              {symbolResults.map((r, i) => (
                <li key={`sym-${i}`}>
                  <button
                    type="button"
                    onClick={() => fetchQuote(r.symbol)}
                    disabled={symbolLoading}
                    className="w-full px-4 py-3 text-left hover:bg-indigo-50 flex justify-between items-center"
                  >
                    <span className="font-medium">{r.symbol}</span>
                    <span className="text-sm text-gray-500">{r.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {selectedSymbol && (
            <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-200">
              <p className="font-semibold text-indigo-800">
                {selectedSymbol.symbol} — {selectedSymbol.name}
              </p>
              <p className="text-sm text-gray-600 mt-1">
                ${selectedSymbol.price.toFixed(2)} ({selectedSymbol.change >= 0 ? '+' : ''}
                {selectedSymbol.changePercent.toFixed(2)}%)
              </p>
            </div>
          )}
          <div className="flex justify-end">
            <Button onClick={() => canProceedStep1 && setStep(2)} disabled={!canProceedStep1}>
              Next
            </Button>
          </div>

          {/* Top 10 from watchlist by volatility (CSP/CC) */}
          <div className="border-t border-gray-200 pt-6 mt-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Top from watchlist (CSP/CC volatility)</h3>
            {topWatchlistLoading ? (
              <p className="text-sm text-gray-500">Loading…</p>
            ) : topWatchlistSymbols.length === 0 ? (
              <p className="text-sm text-gray-500">No watchlist symbols with volatility data. Add symbols to your watchlist.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {topWatchlistSymbols.map(({ symbol, ivRank }) => (
                  <button
                    key={symbol}
                    type="button"
                    onClick={() => fetchQuote(symbol)}
                    disabled={symbolLoading}
                    className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-800 transition-colors disabled:opacity-50"
                  >
                    {symbol}
                    <span className="ml-1.5 text-xs text-gray-500">IV {ivRank}%</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Risk disclosure */}
          <div className="border-t border-gray-200 pt-6 mt-6">
            <p className="text-sm text-gray-600 italic">
              Options involve substantial risk and are not suitable for all investors. Review the OCC booklet &quot;Characteristics and Risks of Standardized Options&quot; before trading. Potential for full capital loss; no guarantees. Past performance is not indicative of future results.
            </p>
          </div>
        </div>
      )}

      {/* Step 2: Outlook */}
      {step === 2 && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Step 2: Market outlook</h2>
          <div className="flex flex-wrap gap-4">
            {OUTLOOKS.map((o) => (
              <button
                key={o.id}
                onClick={() => setOutlook(o.id)}
                className={`flex items-center gap-2 px-6 py-4 rounded-xl border-2 transition-all ${
                  outlook === o.id
                    ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                    : 'border-gray-200 hover:border-indigo-300'
                }`}
              >
                {o.id === 'bullish' && <span className="text-lg">↑</span>}
                {o.id === 'neutral' && <span className="text-lg">—</span>}
                {o.id === 'bearish' && <span className="text-lg">↓</span>}
                {o.label}
              </button>
            ))}
          </div>
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(1)}>
              ← Back
            </Button>
            <Button onClick={() => canProceedStep2 && setStep(3)} disabled={!canProceedStep2}>
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Strategy */}
      {step === 3 && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Step 3: Choose strategy</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredStrategies.map((s) => (
              <button
                key={s.id}
                onClick={() => setStrategyId(s.id)}
                className={`p-4 rounded-xl border-2 text-left transition-all ${
                  strategyId === s.id ? 'border-indigo-600 bg-indigo-50' : 'border-gray-200 hover:border-indigo-300'
                }`}
              >
                <p className="font-semibold">{s.name}</p>
                <p className="text-sm text-gray-600 mt-1">{s.description}</p>
              </button>
            ))}
          </div>
          {filteredStrategies.length === 0 && outlook && (
            <p className="text-gray-500">No strategies match this outlook.</p>
          )}
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(2)}>
              ← Back
            </Button>
            <Button onClick={() => canProceedStep3 && setStep(4)} disabled={!canProceedStep3}>
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Step 4: Contract */}
      {step === 4 && selectedSymbol && selectedStrategy && (
        <ContractSelector
          symbol={selectedSymbol.symbol}
          stockPrice={selectedSymbol.price}
          outlook={outlook}
          strategyId={strategyId}
          expirations={expirations}
          expiration={expiration}
          optionChain={optionChain}
          contractType={contractType}
          selectedStrike={strike}
          quantity={quantity}
          limitPrice={limitPrice}
          chainLoading={chainLoading}
          onExpirationChange={(exp) => setExpiration(exp)}
          onStrikeChange={setStrike}
          onContractTypeChange={setContractType}
          onQuantityChange={setQuantity}
          onLimitPriceChange={setLimitPrice}
          onReviewOrder={() => setStep(5)}
          onBack={() => setStep(3)}
        />
      )}

      {/* Step 5: Review order */}
      {step === 5 && selectedSymbol && selectedStrategy && expiration && strike && (
        <ReviewOrderStep
          strategyName={selectedStrategy.name}
          strategyId={selectedStrategy.id}
          symbol={selectedSymbol.symbol}
          stockPrice={selectedSymbol.price}
          change={selectedSymbol.change}
          changePercent={selectedSymbol.changePercent}
          contractType={contractType}
          action={['covered-call', 'cash-secured-put'].includes(selectedStrategy.id) ? 'sell' : 'buy'}
          quantity={quantity}
          expiration={expiration}
          strike={strike}
          limitPrice={limitPrice}
          bid={
            (optionChain.find((c) => c.strike === strike)?.[contractType]?.last_quote?.bid ??
              optionChain.find((c) => c.strike === strike)?.[contractType]?.premium) ??
            0
          }
          ask={
            (optionChain.find((c) => c.strike === strike)?.[contractType]?.last_quote?.ask ??
              optionChain.find((c) => c.strike === strike)?.[contractType]?.premium) ??
            0
          }
          onBack={() => setStep(4)}
        />
      )}
    </div>
  );
}
