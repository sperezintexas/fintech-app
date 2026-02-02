'use client';

import { useState, useEffect } from 'react';
import { AppHeader } from '@/components/AppHeader';
import { StrategyWizard } from '@/components/strategy-builder/StrategyWizard';

type TickerQuote = { symbol: string; name: string; price: number; change: number; changePercent: number };
type SMAData = { sma50: number; sma50Plus15: number; sma50Minus15: number };

export default function XStrategyBuilderPage() {
  const [selectedQuote, setSelectedQuote] = useState<TickerQuote | null>(null);
  const [smaData, setSmaData] = useState<SMAData | null>(null);
  const [smaLoading, setSmaLoading] = useState(false);

  useEffect(() => {
    if (!selectedQuote?.symbol) {
      setSmaData(null);
      return;
    }
    setSmaLoading(true);
    fetch(`/api/ticker/${encodeURIComponent(selectedQuote.symbol.toUpperCase())}/sma`)
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
  }, [selectedQuote?.symbol]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <AppHeader />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900">xStrategyBuilder</h2>
          <p className="text-gray-600 mt-1">
            Build sophisticated option strategies with real-time data and P/L analysis.
          </p>
          {selectedQuote && (
            <p className="mt-2 text-xs text-gray-500">
              <span className="font-medium text-gray-700">{selectedQuote.symbol}</span>
              {' · '}
              <span>${selectedQuote.price.toFixed(2)}</span>
              {' · '}
              <span className={selectedQuote.change >= 0 ? 'text-green-600' : 'text-red-600'}>
                {selectedQuote.change >= 0 ? '+' : ''}{selectedQuote.changePercent.toFixed(2)}%
              </span>
              {smaLoading && <span className="ml-2">50 MA…</span>}
              {!smaLoading && smaData && (
                <>
                  {' · '}
                  <span>50 MA ${smaData.sma50.toFixed(2)}</span>
                  {' · '}
                  <span className="text-red-600">−15% ${smaData.sma50Minus15.toFixed(2)}</span>
                  {' · '}
                  <span className="text-green-600">+15% ${smaData.sma50Plus15.toFixed(2)}</span>
                </>
              )}
            </p>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 sm:p-8">
          <StrategyWizard onSymbolSelected={setSelectedQuote} />
        </div>
      </main>
    </div>
  );
}
