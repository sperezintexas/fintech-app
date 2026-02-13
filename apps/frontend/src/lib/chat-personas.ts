/**
 * Default system prompts and example prompts for each chat persona (Grok).
 * Edit this file to change the built-in prompts. Selected persona is configurable
 * via Setup → AI Chat or the chat page; optional override in DB.
 */

export type PersonaKey = 'finance-expert' | 'medical-expert' | 'legal-expert' | 'tax-expert' | 'trusted-advisor';

export const PERSONAS: Record<PersonaKey, string> = {
  'finance-expert': `As the leading financial expert that takes into account the current, mid and future potential earnings for valuable companies like TESLA advise on how to maximize profits. When responding I provide brief answers, with no leading intro to each response and if asked will provide more details. My goal is to grow my portfolio account Merrill of 525 shares on Jan 26 to a more balanced portfolio of 1 million by 2030. I would like grok's financial expertise to help provide moderate and aggressive suggestions for maximizing profits. I also have a Fidelity Account that I have 25k and I want to use an aggressive high risk approach to maximize returns by end of 2026. Keep to using sound options strategies related around my TESLA, SpaceX, xAI, grok and defense related investments.`,

  'medical-expert': `You are a medical expert powered by Grok. Provide accurate, evidence-based health information from reputable sources. Always include disclaimers: "Not medical advice—consult a doctor." Focus on symptoms, treatments, prevention, latest research (post-2023). Use plain language, avoid jargon unless explained.`,

  'legal-expert': `You are a legal expert powered by Grok. Provide general legal information and principles based on US/common law. Always disclaim: "Not legal advice—consult an attorney." Cover contracts, finance regs (SEC, options trading), IP, etc. Reference statutes/cases when relevant. Be precise, neutral.`,

  'tax-expert': `You are a tax expert powered by Grok (US focus). Explain IRS rules, deductions, capital gains (stocks/options), 1099s, Roth/401k strategies. Always disclaim: "Not tax advice—consult CPA." Use 2026 tax code. Provide examples, thresholds. Brief, actionable.`,

  'trusted-advisor': `You are a trusted advisor powered by Grok: wise, balanced, long-term thinker. Integrate finance, health, legal, tax insights holistically. Prioritize user's goals (portfolio growth to $1M by 2030). Direct, no fluff, truth-seeking. Disclaimer when needed.`,
};

/** Example prompt groups shown in the chat UI when this persona is selected. */
export type PersonaExampleGroup = { tool: string; prompts: string[] };

const PERSONA_EXAMPLE_PROMPTS: Record<PersonaKey, PersonaExampleGroup[]> = {
  'finance-expert': [
    { tool: "News & research", prompts: ["TSLA news today", "NVDA earnings date", "Fed rate decision", "Defense sector outlook", "S&P 500 outlook this week"] },
    { tool: "Quotes & market", prompts: ["TSLA price", "AAPL quote", "Market outlook", "VIX level", "SPY and QQQ today"] },
    { tool: "Portfolio", prompts: ["Show my portfolio", "My holdings", "Account balance", "Top movers today", "Portfolio allocation"] },
    { tool: "Watchlist", prompts: ["My watchlist", "What am I watching?", "Watchlist performance", "Add TSLA to watchlist"] },
    { tool: "Covered calls & options", prompts: ["Covered call ideas", "Should I BTC my call?", "Roll my TSLA call", "CC recommendations", "Wheel strategy on NVDA"] },
    { tool: "Tasks & scan", prompts: ["Scheduled tasks", "Run scanner now", "When does scanner run?", "Options positions check", "Covered call scan results"] },
  ],
  'medical-expert': [
    { tool: "Symptoms & conditions", prompts: ["What are symptoms of seasonal allergies?", "How do I tell cold from flu?", "When should I worry about a headache?", "Signs of dehydration in adults"] },
    { tool: "Lifestyle & prevention", prompts: ["Best ways to improve sleep", "Exercise for lower back pain", "How to prevent the flu", "When to see a doctor for fever"] },
    { tool: "Treatments & evidence", prompts: ["Latest research on vitamin D", "Evidence on intermittent fasting", "New treatments for migraines", "OTC options for seasonal allergies"] },
    { tool: "General health", prompts: ["Normal blood pressure range", "How often should I get a checkup?", "Red flags for chest pain", "Stress and sleep connection"] },
  ],
  'legal-expert': [
    { tool: "Contracts & agreements", prompts: ["What makes a contract legally valid?", "Can I break my lease early?", "What is an NDA and when is it enforceable?", "Liability in a service agreement"] },
    { tool: "Investing & SEC", prompts: ["SEC rules for options trading", "What counts as insider trading?", "Disclosure requirements for investors", "Rule 144 and restricted stock"] },
    { tool: "Business & entity", prompts: ["LLC vs S-corp vs C-corp", "When do I need to hire a lawyer?", "Trademark vs copyright basics", "Contract dispute next steps"] },
    { tool: "General", prompts: ["Statute of limitations by state", "Small claims court process", "Power of attorney types", "Estate planning basics"] },
  ],
  'tax-expert': [
    { tool: "Investments", prompts: ["How are stock gains taxed?", "What is the wash sale rule?", "Tax treatment of options trading", "Roth vs 401k for 2026", "Cost basis for inherited stock"] },
    { tool: "Deductions & filing", prompts: ["Itemized vs standard deduction 2026", "Home office deduction rules", "When are estimated taxes due?", "1099-B and cost basis reporting"] },
    { tool: "Planning", prompts: ["Tax-loss harvesting basics", "2026 capital gains rates", "Backdoor Roth steps", "When to amend a return"] },
    { tool: "Specific situations", prompts: ["Tax on covered call premium", "Exercise vs sell option tax", "Qualified dividend rates", "State tax on investment income"] },
  ],
  'trusted-advisor': [
    { tool: "Goals & strategy", prompts: ["Am I on track for $1M by 2030?", "How do I balance risk and growth?", "Review my overall strategy", "Where should I focus next?"] },
    { tool: "Portfolio & execution", prompts: ["Show my portfolio", "Covered call ideas for my holdings", "Market outlook and my positions", "Rebalancing suggestions"] },
    { tool: "Tax & legal", prompts: ["Tax implications of my recent trades", "Estate planning basics", "Do I need an LLC for my trading?"] },
    { tool: "Broader picture", prompts: ["Health and wealth connection", "Insurance and emergency fund", "Prioritize: pay down debt vs invest?"] },
  ],
};

const DEFAULT_EXAMPLE_PROMPTS = PERSONA_EXAMPLE_PROMPTS["finance-expert"];

/** Returns example prompt groups for the given persona key; uses finance-expert set for custom/unknown keys. */
export function getPersonaExamplePrompts(personaKey: string): PersonaExampleGroup[] {
  if (!personaKey) return DEFAULT_EXAMPLE_PROMPTS;
  const key = personaKey as PersonaKey;
  return PERSONA_EXAMPLE_PROMPTS[key] ?? DEFAULT_EXAMPLE_PROMPTS;
}

export function getPersonaPrompt(key: string): string | undefined {
  return PERSONAS[key as PersonaKey];
}

export function getPersonaKeys(): PersonaKey[] {
  return Object.keys(PERSONAS) as PersonaKey[];
}
