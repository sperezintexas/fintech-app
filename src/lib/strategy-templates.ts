// Strategy summary templates for Contract view (CSP, CC)

function pct(p?: number): string {
  return p != null ? `${Math.round(p * 100)}%` : '–';
}

function rsiEmoji(rsi: number): string {
  if (rsi > 70) return '🔥';
  if (rsi < 30) return '🟢';
  return '•';
}

function volEmoji(vol: number): string {
  if (vol > 50) return '🌪️';
  if (vol > 25) return '🌬️';
  return '☁️';
}

export function outlookEmoji(o: string): string {
  return o === 'Bullish' ? '↑' : o === 'Bearish' ? '↓' : '–';
}

function rsiLabel(rsi: number): string {
  return rsi > 70 ? '(overbought)' : rsi < 30 ? '(oversold)' : '';
}

function volLabel(vol: number): string {
  return vol > 50 ? '(high)' : vol > 25 ? '(mod)' : '(low)';
}

// ───────────────────────────────────────────────
// 1. Emoji-only ultra-mobile version (minimal text)
export function getCSPMobileEmoji(data: {
  rsi: number;
  volatility: number;
  cashOnHand: number;
  itmProb?: number;
  otmProb?: number;
}): string {
  return `
💵 CSP

RSI ${data.rsi.toFixed(0)} ${rsiEmoji(data.rsi)}
Vol ${data.volatility.toFixed(0)}% ${volEmoji(data.volatility)}

💰 $${data.cashOnHand.toLocaleString()}

ITM ${pct(data.itmProb)} • OTM ${pct(data.otmProb)}

✓ Premium now
✓ Discount buy?
⚠ Cash locked
⚠ Assigned ↓
  `.trim();
}

export function getCCMobileEmoji(data: {
  outlook: 'Bullish' | 'Neutral' | 'Bearish';
  volatilityLevel: 'High' | 'Moderate' | 'Low';
  suggestedStrike: number;
  incomePercent: number;
  breakeven: number;
  itmProb?: number;
  otmProb?: number;
  availableShares: number;
}): string {
  return `
📈 CC • ${data.outlook} ${outlookEmoji(data.outlook)}

Strike $${data.suggestedStrike}
Income ~${data.incomePercent.toFixed(1)}%
BE $${data.breakeven.toFixed(0)}

ITM ${pct(data.itmProb)} • OTM ${pct(data.otmProb)}

Shares: ${data.availableShares}

✓ Income ↑
⚠ Called away ↑
  `.trim();
}

// ───────────────────────────────────────────────
// 2. Compact readable version with probabilities (still mobile-friendly)
export function getCSPCompact(data: {
  rsi: number;
  volatility: number;
  cashOnHand: number;
  itmProb?: number;
  otmProb?: number;
}): string {
  return `
💵 Cash-Secured Put

RSI ${data.rsi.toFixed(0)} ${rsiLabel(data.rsi)}
Vol ${data.volatility.toFixed(0)}% ${volLabel(data.volatility)}

Cash: $${data.cashOnHand.toLocaleString()}

Prob: ITM ${pct(data.itmProb)} • OTM ${pct(data.otmProb)}

Pros: Premium now • Possible discount buy
Cons: Cash secured • Assigned if ↓
`.trim();
}

export function getCCCompact(data: {
  outlook: 'Bullish' | 'Neutral' | 'Bearish';
  volatilityLevel: 'High' | 'Moderate' | 'Low';
  suggestedStrike: number;
  incomePercent: number;
  maxProfit: number;
  breakeven: number;
  itmProb?: number;
  otmProb?: number;
  availableShares: number;
  account?: string;
}): string {
  return `
📈 Covered Call • ${data.outlook} ${outlookEmoji(data.outlook)}

Strike: $${data.suggestedStrike}
Income: ~${data.incomePercent.toFixed(1)}%
Max: $${data.maxProfit.toFixed(0)}
BE: $${data.breakeven.toFixed(0)}

Prob: ITM ${pct(data.itmProb)} • OTM ${pct(data.otmProb)}

Shares (${data.account || ''}): ${data.availableShares}

Pros: Income • Lower basis
Cons: Caps upside • Called away
`.trim();
}

// ───────────────────────────────────────────────
// Structured data for React UI (no string parsing)
export type CSPSummaryData = {
  rsi: number;
  volatility: number;
  cashOnHand: number;
  itmProb?: number;
  otmProb?: number;
};

export type CCSummaryData = {
  outlook: 'Bullish' | 'Neutral' | 'Bearish';
  volatilityLevel: 'High' | 'Moderate' | 'Low';
  suggestedStrike: number;
  incomePercent: number;
  maxProfit: number;
  breakeven: number;
  itmProb?: number;
  otmProb?: number;
  availableShares: number;
  account?: string;
};

export function getVolatilityLevel(vol: number): 'High' | 'Moderate' | 'Low' {
  if (vol > 50) return 'High';
  if (vol > 25) return 'Moderate';
  return 'Low';
}

export function getOutlookLabel(id: string): 'Bullish' | 'Neutral' | 'Bearish' {
  if (id === 'bullish') return 'Bullish';
  if (id === 'bearish') return 'Bearish';
  return 'Neutral';
}
