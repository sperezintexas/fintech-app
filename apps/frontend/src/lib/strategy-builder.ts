import type { Outlook } from '@/types/strategy';
import type { ParsedOrder } from '@/types/order';

/** Prefill for StrategyWizard from a parsed NL order (symbol, contract, quantity, optional strategy). */
export type OrderPrefill = {
  symbol: string;
  strike: number | null;
  expiration: string | null;
  contractType: 'call' | 'put';
  quantity: number;
  /** Strategy id from STRATEGIES (e.g. covered-call, buy-call). */
  strategyId: string | null;
  /** buy = open long, sell = open short (e.g. covered call). */
  action: 'buy' | 'sell';
  /** For ROLL: target strike/expiration. */
  rollToStrike: number | null;
  rollToExpiration: string | null;
};

/**
 * Build wizard prefill from a ParsedOrder. Maps action to strategyId and action (buy/sell).
 * Used after NL parse to jump to contract step or review.
 */
export function buildOrderFromParsed(order: ParsedOrder): OrderPrefill {
  const optionType = order.optionType ?? 'call';
  const contracts = order.contracts ?? 1;
  let strategyId: string | null = null;
  let action: 'buy' | 'sell' = 'buy';

  switch (order.action) {
    case 'SELL_NEW_CALL':
      strategyId = 'covered-call';
      action = 'sell';
      break;
    case 'BUY_TO_CLOSE':
    case 'SELL_TO_CLOSE':
      action = 'buy';
      break;
    case 'ROLL':
      strategyId = 'covered-call';
      action = 'sell';
      break;
    case 'BUY_NEW_PUT':
      strategyId = 'buy-put';
      action = 'buy';
      break;
    case 'HOLD':
    case 'NONE':
      break;
    default:
      if (optionType === 'call') strategyId = 'buy-call';
      else strategyId = 'buy-put';
  }

  return {
    symbol: order.ticker,
    strike: order.strike ?? null,
    expiration: order.expiration ?? null,
    contractType: optionType,
    quantity: contracts,
    strategyId,
    action,
    rollToStrike: order.rollToStrike ?? null,
    rollToExpiration: order.rollToExpiration ?? null,
  };
}

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

/** OCC/Yahoo option symbol: SYMBOL + YYMMDD + C/P + strike*1000 (8 digits) */
export function toYahooOptionSymbol(
  underlying: string,
  expiration: string,
  contractType: 'call' | 'put',
  strikePrice: number
): string {
  const expDate = expiration.replace(/-/g, '').slice(2); // YYMMDD
  const typeChar = contractType === 'call' ? 'C' : 'P';
  const strikeStr = String(Math.round(strikePrice * 1000)).padStart(8, '0');
  return `${underlying}${expDate}${typeChar}${strikeStr}`;
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
