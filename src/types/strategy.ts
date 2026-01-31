export type Outlook = 'bullish' | 'neutral' | 'bearish';

export type StrategyLeg = {
  id: string;
  action: 'buy' | 'sell';
  type: 'call' | 'put';
  strike: number;
  expiration: string;
  quantity: number;
  premium: number;
};

export type StrategyDefinition = {
  id: string;
  name: string;
  description: string;
  outlooks: Outlook[];
  legs: 'single' | 'multi';
};
