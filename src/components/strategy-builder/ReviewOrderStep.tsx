'use client';

import { useMemo, useState, useCallback } from 'react';
import { toYahooOptionSymbol } from '@/lib/strategy-builder';

type ReviewOrderStepProps = {
  strategyName: string;
  strategyId: string;
  symbol: string;
  stockPrice: number;
  change: number;
  changePercent: number;
  contractType: 'call' | 'put';
  action: 'buy' | 'sell';
  quantity: number;
  expiration: string;
  strike: number;
  limitPrice: string;
  bid: number;
  ask: number;
  onBack: () => void;
};

function formatExpiration(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function mockProbOtm(stockPrice: number, strike: number, isCall: boolean): number {
  if (!stockPrice || stockPrice <= 0) return 50;
  const otmPercent = isCall
    ? ((strike - stockPrice) / stockPrice) * 100
    : ((stockPrice - strike) / stockPrice) * 100;
  if (otmPercent <= 0) return 0;
  return Math.min(99, Math.round(50 + otmPercent * 2));
}

function mapStrategyToWatchlist(strategyId: string, contractType: 'call' | 'put'): { type: string; strategy: string } {
  if (strategyId === 'covered-call') return { type: 'covered-call', strategy: 'covered-call' };
  if (strategyId === 'cash-secured-put') return { type: 'csp', strategy: 'cash-secured-put' };
  if (strategyId === 'buy-call') return { type: 'call', strategy: 'leap-call' };
  if (strategyId === 'buy-put') return { type: 'put', strategy: 'cash-secured-put' };
  return { type: contractType === 'call' ? 'call' : 'put', strategy: 'long-stock' };
}

export function ReviewOrderStep({
  strategyName,
  strategyId,
  symbol,
  stockPrice,
  change,
  changePercent,
  contractType,
  action,
  quantity,
  expiration,
  strike,
  limitPrice,
  bid,
  ask,
  onBack,
}: ReviewOrderStepProps) {
  const premium = parseFloat(limitPrice) || (bid > 0 && ask > 0 ? (bid + ask) / 2 : 0);

  const { credit, breakeven, probOtm } = useMemo(() => {
    const prem = parseFloat(limitPrice) || (bid > 0 && ask > 0 ? (bid + ask) / 2 : 0);
    const qty = Math.max(1, quantity);
    const credit = action === 'sell' ? qty * prem * 100 : 0;
    let be: number | null = null;
    if (contractType === 'call') {
      be = action === 'sell' ? stockPrice - prem : strike + prem;
    } else {
      be = strike - prem;
    }
    const prob = mockProbOtm(stockPrice, strike, contractType === 'call');
    return { credit, breakeven: be, probOtm: prob };
  }, [action, quantity, limitPrice, bid, ask, stockPrice, strike, contractType]);

  const actionLabel = action === 'sell' ? 'Sell to open' : 'Buy to open';
  const contractLabel = contractType === 'call' ? 'call' : 'put';
  const yahooOptionSymbol = toYahooOptionSymbol(symbol, expiration, contractType, strike);

  const [addLoading, setAddLoading] = useState(false);
  const [addMessage, setAddMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [scannerLoading, setScannerLoading] = useState(false);
  const [scannerMessage, setScannerMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleAddToWatchlist = useCallback(async () => {
    setAddLoading(true);
    setAddMessage(null);
    setScannerMessage(null);
    try {
      const watchlistsRes = await fetch('/api/watchlists', { cache: 'no-store' });
      if (!watchlistsRes.ok) throw new Error('Failed to fetch watchlists');
      const watchlists = await watchlistsRes.json();
      const defaultWatchlist = watchlists.find((w: { name: string }) => w.name === 'Default') ?? watchlists[0];
      if (!defaultWatchlist) throw new Error('No watchlist found');

      const { type, strategy } = mapStrategyToWatchlist(strategyId, contractType);
      const premium = parseFloat(limitPrice) || (bid > 0 && ask > 0 ? (bid + ask) / 2 : 0);

      const res = await fetch('/api/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          watchlistId: defaultWatchlist._id,
          symbol: yahooOptionSymbol,
          underlyingSymbol: symbol,
          type,
          strategy,
          quantity,
          entryPrice: stockPrice,
          strikePrice: strike,
          expirationDate: expiration,
          entryPremium: premium,
          notes: `Added from xStrategyBuilder • ${strategyName} • ${symbol} ${expiration} ${contractType.toUpperCase()} $${strike}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to add to watchlist');
      setAddMessage({ type: 'success', text: `Added ${yahooOptionSymbol} to watchlist` });
      setTimeout(() => setAddMessage(null), 3000);
    } catch (err) {
      setAddMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to add to watchlist',
      });
    } finally {
      setAddLoading(false);
    }
  }, [strategyId, symbol, expiration, contractType, strike, limitPrice, bid, ask, quantity, stockPrice, strategyName, yahooOptionSymbol]);

  const handleRunOptionScanner = useCallback(async () => {
    setScannerLoading(true);
    setScannerMessage(null);
    setAddMessage(null);
    try {
      const res = await fetch('/api/report-types/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handlerKey: 'OptionScanner', accountId: null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to run Option Scanner');
      const channels = data.deliveredChannels?.length
        ? data.deliveredChannels.join(', ')
        : 'default channel';
      setScannerMessage({
        type: 'success',
        text: data.success
          ? `Option Scanner complete. Results sent to ${channels}.`
          : data.message ?? 'Option Scanner completed.',
      });
      setTimeout(() => setScannerMessage(null), 5000);
    } catch (err) {
      setScannerMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to run Option Scanner',
      });
    } finally {
      setScannerLoading(false);
    }
  }, []);

  const handleRunCoveredCallScanner = useCallback(async () => {
    setScannerLoading(true);
    setScannerMessage(null);
    setAddMessage(null);
    try {
      const premium = parseFloat(limitPrice) || (bid > 0 && ask > 0 ? (bid + ask) / 2 : 0);
      const res = await fetch('/api/covered-call/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          strike,
          expiration,
          entryPremium: premium,
          quantity,
          stockPurchasePrice: stockPrice,
          accountId: null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to run Covered Call Scanner');
      const channels = data.deliveredChannels?.length
        ? data.deliveredChannels.join(', ')
        : 'default channel';
      setScannerMessage({
        type: 'success',
        text: data.success
          ? `Covered Call Scanner complete. Results sent to ${channels}.`
          : data.message ?? 'Covered Call Scanner completed.',
      });
      setTimeout(() => setScannerMessage(null), 5000);
    } catch (err) {
      setScannerMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to run Covered Call Scanner',
      });
    } finally {
      setScannerLoading(false);
    }
  }, [symbol, strike, expiration, limitPrice, bid, ask, quantity, stockPrice]);

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Step 5: Review order</h2>

      {/* Header: Review + Symbol + Price + Expiration + Contracts */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-gray-50 rounded-xl border border-gray-200">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Review: {strategyName}</h3>
          <p className="text-sm text-gray-600 mt-1">
            Expiration: <strong>{formatExpiration(expiration)}</strong> ·{' '}
            <strong>{quantity}</strong> contract{quantity !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-bold text-gray-900">{symbol}</span>
          <span className="font-bold text-gray-900">${stockPrice.toFixed(2)}</span>
          <span className={change >= 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
            {change >= 0 ? '+' : ''}${change.toFixed(2)} ({change >= 0 ? '+' : ''}{changePercent.toFixed(2)}%)
          </span>
        </div>
      </div>

      {/* 1. Trade Summary Table (read-only, carried over from Contract step) */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <tbody>
            <tr className="border-b border-gray-200 border-dashed">
              <td className="px-4 py-3 text-gray-600 font-medium w-40">Action</td>
              <td className="px-4 py-3 text-right font-semibold">{actionLabel}</td>
            </tr>
            <tr className="border-b border-gray-200 border-dashed">
              <td className="px-4 py-3 text-gray-600 font-medium">Quantity</td>
              <td className="px-4 py-3 text-right font-semibold">{quantity}</td>
            </tr>
            <tr className="border-b border-gray-200 border-dashed">
              <td className="px-4 py-3 text-gray-600 font-medium">Expiration date</td>
              <td className="px-4 py-3 text-right font-semibold">{formatExpiration(expiration)}</td>
            </tr>
            <tr className="border-b border-gray-200 border-dashed">
              <td className="px-4 py-3 text-gray-600 font-medium">Strike price</td>
              <td className="px-4 py-3 text-right font-semibold">${strike.toFixed(2)}</td>
            </tr>
            <tr className="border-b border-gray-200 border-dashed">
              <td className="px-4 py-3 text-gray-600 font-medium">Limit price</td>
              <td className="px-4 py-3 text-right font-semibold">
                ${(parseFloat(limitPrice) || (bid > 0 && ask > 0 ? (bid + ask) / 2 : 0)).toFixed(2)}
              </td>
            </tr>
            {action === 'sell' && credit > 0 && (
              <tr>
                <td className="px-4 py-3 text-gray-600 font-medium">Credit</td>
                <td className="px-4 py-3 text-right font-semibold text-green-700">
                  ${credit.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </td>
              </tr>
            )}
            {action === 'sell' && credit > 0 && (
              <tr>
                <td className="px-4 py-3 text-gray-600 font-medium">Yahoo option name</td>
                <td className="px-4 py-3 text-right font-mono text-sm text-gray-800" title={yahooOptionSymbol}>
                  {yahooOptionSymbol}
                </td>
              </tr>
            )}
            {action === 'buy' && (
              <tr>
                <td className="px-4 py-3 text-gray-600 font-medium">Debit</td>
                <td className="px-4 py-3 text-right font-semibold">
                  $
                  {(quantity * premium * 100).toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                  })}
                </td>
              </tr>
            )}
            {action === 'buy' && (
              <tr>
                <td className="px-4 py-3 text-gray-600 font-medium">Yahoo option name</td>
                <td className="px-4 py-3 text-right font-mono text-sm text-gray-800" title={yahooOptionSymbol}>
                  {yahooOptionSymbol}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 2. Metrics Bar */}
      <div
        className="flex flex-wrap gap-6 p-4 bg-gray-50 rounded-xl border border-gray-200"
        role="region"
        aria-live="polite"
        aria-label="Order metrics"
      >
        <div>
          <span className="text-xs text-gray-500 uppercase tracking-wider">Bid</span>
          <p className="text-lg font-bold text-green-700">${bid.toFixed(2)}</p>
        </div>
        <div>
          <span className="text-xs text-gray-500 uppercase tracking-wider">Breakeven (BE)</span>
          <p className="text-lg font-bold text-gray-900">
            {breakeven != null ? `$${breakeven.toFixed(2)}` : '—'}
          </p>
        </div>
        <div>
          <span className="text-xs text-gray-500 uppercase tracking-wider">Probability OTM</span>
          <div className="flex items-center gap-2">
            <div className="w-24 h-3 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full transition-all"
                style={{ width: `${probOtm}%` }}
              />
            </div>
            <span className="text-lg font-bold text-gray-900">{probOtm}%</span>
          </div>
        </div>
      </div>

      {/* 3. Descriptive Summary (mobile-friendly paragraph) */}
      <div className="p-4 border border-gray-200 rounded-xl bg-white">
        <p className="text-sm text-gray-700 leading-relaxed">
          You are {action === 'sell' ? 'selling' : 'buying'}{' '}
          <strong>{quantity}</strong> {contractLabel}
          {quantity > 1 ? 's' : ''} to open with the strike price of{' '}
          <strong>${strike.toFixed(2)}</strong> that expires{' '}
          <strong>{formatExpiration(expiration)}</strong>.
          {action === 'sell' && credit > 0 && (
            <> This trade is expected to result in receiving a credit of{' '}
              <strong>${credit.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>.
            </>
          )}
          {action === 'buy' && (
            <> This trade is expected to result in a debit of{' '}
              <strong>
                $
                {(quantity * premium * 100).toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                })}
              </strong>.
            </>
          )}
          {' '}This trade has a <strong>{probOtm}%</strong> probability to be out of the money, which is{' '}
          {contractType === 'call' ? 'below' : 'above'} <strong>${strike.toFixed(2)}</strong>, at expiration.
          {action === 'sell' && contractType === 'call' && (
            <> If assigned anytime, you have the obligation to sell <strong>({quantity})</strong>{' '}
              {symbol} at the strike price of <strong>${strike.toFixed(2)}</strong>, for a total of{' '}
              <strong>
                $
                {(quantity * strike * 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </strong>.
            </>
          )}
        </p>
      </div>

      {/* 4. Risk Disclosure */}
      <details className="text-sm text-gray-600 border border-gray-200 rounded-xl p-4">
        <summary className="cursor-pointer font-medium hover:text-indigo-600">
          Risk / Assignment disclosure
        </summary>
        <p className="mt-3 text-gray-500">
          Options involve risk and are not suitable for all investors. Assignment on short options
          may result in obligation to buy or sell the underlying. Consult a financial advisor and
          read the options disclosure document before trading.
        </p>
      </details>

      {/* Add to Watchlist / Option Scanner messages */}
      {(addMessage || scannerMessage) && (
        <div
          className={`p-4 rounded-xl border ${
            (scannerMessage ?? addMessage)!.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          {(scannerMessage ?? addMessage)!.text}
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-between pt-4 border-t">
        <button
          type="button"
          onClick={onBack}
          className="px-6 py-3 rounded-xl border-2 border-gray-300 bg-white text-gray-700 font-medium hover:bg-gray-50 focus:outline-none focus:ring-4 focus:ring-gray-500"
        >
          ← Go back
        </button>
        <div className="flex gap-3">
          {strategyId === 'covered-call' ? (
            <button
              type="button"
              onClick={handleRunCoveredCallScanner}
              disabled={scannerLoading}
              className="px-6 py-3 rounded-xl border-2 border-indigo-600 bg-white text-indigo-600 font-medium hover:bg-indigo-50 focus:outline-none focus:ring-4 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {scannerLoading ? 'Running…' : 'Covered Call Scanner'}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleRunOptionScanner}
              disabled={scannerLoading}
              className="px-6 py-3 rounded-xl border-2 border-indigo-600 bg-white text-indigo-600 font-medium hover:bg-indigo-50 focus:outline-none focus:ring-4 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {scannerLoading ? 'Running…' : 'Option Scanner'}
            </button>
          )}
          <button
            type="button"
            onClick={handleAddToWatchlist}
            disabled={addLoading}
            className="px-6 py-3 rounded-xl bg-green-600 text-white font-medium hover:bg-green-700 focus:outline-none focus:ring-4 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {addLoading ? 'Adding…' : 'Add to Watchlist'}
          </button>
        </div>
      </div>
    </div>
  );
}
