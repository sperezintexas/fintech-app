import type { Outlook } from '@/types/strategy';

export const OUTLOOKS: { id: Outlook; label: string; icon: string }[] = [
  { id: 'bullish', label: 'Bullish / Up', icon: 'trending-up' },
  { id: 'neutral', label: 'Neutral / Flat', icon: 'minus' },
  { id: 'bearish', label: 'Bearish / Down', icon: 'trending-down' },
];

export const STRATEGIES = [
  { id: 'buy-call', name: 'Buy Call', description: 'Long call for upside leverage', outlooks: ['bullish'] as Outlook[], legs: 'single' as const },
  { id: 'buy-put', name: 'Buy Put', description: 'Long put for downside protection or bearish bet', outlooks: ['bearish'] as Outlook[], legs: 'single' as const },
  { id: 'covered-call', name: 'Covered Call', description: 'Sell call against shares for income', outlooks: ['neutral', 'bullish'] as Outlook[], legs: 'single' as const },
  { id: 'cash-secured-put', name: 'Cash-Secured Put', description: 'Sell put to collect premium or acquire shares', outlooks: ['neutral', 'bullish'] as Outlook[], legs: 'single' as const },
  { id: 'bull-call-spread', name: 'Bull Call Spread', description: 'Debit spread: buy call, sell higher call', outlooks: ['bullish'] as Outlook[], legs: 'multi' as const },
  { id: 'bear-put-spread', name: 'Bear Put Spread', description: 'Debit spread: buy put, sell lower put', outlooks: ['bearish'] as Outlook[], legs: 'multi' as const },
  { id: 'iron-condor', name: 'Iron Condor', description: 'Sell OTM put spread + OTM call spread', outlooks: ['neutral'] as Outlook[], legs: 'multi' as const },
  { id: 'straddle', name: 'Straddle', description: 'Buy call + put same strike for volatility', outlooks: ['neutral'] as Outlook[], legs: 'multi' as const },
];

export function calculatePL(
  stockPrice: number,
  strike: number,
  premium: number,
  isCall: boolean,
  quantity: number = 1
): number {
  const intrinsic = isCall
    ? Math.max(0, stockPrice - strike)
    : Math.max(0, strike - stockPrice);
  const pnl = (intrinsic - premium) * quantity * 100;
  return pnl;
}

export function generatePLData(
  strike: number,
  premium: number,
  isCall: boolean,
  quantity: number = 1,
  rangePercent: number = 0.3
): { price: number; pnl: number }[] {
  const basePrice = strike;
  const minPrice = basePrice * (1 - rangePercent);
  const maxPrice = basePrice * (1 + rangePercent);
  const step = (maxPrice - minPrice) / 20;
  const data: { price: number; pnl: number }[] = [];

  for (let p = minPrice; p <= maxPrice; p += step) {
    const pnl = calculatePL(p, strike, premium, isCall, quantity);
    data.push({ price: Math.round(p * 100) / 100, pnl: Math.round(pnl * 100) / 100 });
  }
  return data;
}
