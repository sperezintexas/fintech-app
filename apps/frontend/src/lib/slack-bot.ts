/**
 * Slack bot: slash command and interactive handler.
 * Commands: "show TSLA covered calls", "roll 450 call to Feb" → portfolio query or NL order preview.
 */

import { getCoveredCallPositions } from "@/lib/covered-call-analyzer";
import { parseNaturalLanguageOrder } from "@/lib/xai-grok";
import {
  buildPortfolioPositionsBlocks,
  buildOrderPreviewBlocks,
  type SlackBlock,
} from "@/lib/slack-templates";

const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_URL?.trim() ?? "";

/** Detect if the user is asking to list positions (e.g. "show my TSLA covered calls"). */
function isPortfolioQuery(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    /\b(show|list|my|get)\s+(my\s+)?(tsla|aapl|positions?|calls?|covered\s+calls?|puts?)\b/.test(lower) ||
    /\b(covered\s+calls?|short\s+calls?)\s+(for\s+)?[A-Z]{1,5}\b/.test(lower)
  );
}

/** Extract symbol from query like "show TSLA covered calls" or "my TSLA cc". */
function extractSymbolFromQuery(text: string): string | null {
  const upper = text.toUpperCase();
  const symMatch = upper.match(/\b([A-Z]{2,5})\b/);
  return symMatch ? symMatch[1] : null;
}

/**
 * Handle slash command text (e.g. /invest show TSLA covered calls | roll 450 to Feb).
 * Returns Slack blocks for the response.
 */
export async function handleSlashCommand(text: string): Promise<{
  blocks: SlackBlock[];
  text: string;
}> {
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      blocks: [],
      text: "Try: *show TSLA covered calls* or *roll TSLA 450 call to Feb*",
    };
  }

  if (isPortfolioQuery(trimmed)) {
    const symbol = extractSymbolFromQuery(trimmed);
    const { pairs, standaloneCalls } = await getCoveredCallPositions(undefined);
    const forSymbol = symbol ? symbol.toUpperCase() : null;
    const filteredPairs = forSymbol
      ? pairs.filter((p) => p.symbol === forSymbol)
      : pairs;
    const filteredStandalone = forSymbol
      ? standaloneCalls.filter((c) => c.symbol === forSymbol)
      : standaloneCalls;
    const positions = [
      ...filteredPairs.map((p) => ({
        symbol: p.symbol,
        strike: p.callStrike,
        expiration: p.callExpiration,
        optionType: "call" as const,
        contracts: p.callContracts,
        premium: p.callPremiumReceived,
      })),
      ...filteredStandalone.map((c) => ({
        symbol: c.symbol,
        strike: c.callStrike,
        expiration: c.callExpiration,
        optionType: "call" as const,
        contracts: c.callContracts,
        premium: c.callPremiumReceived,
      })),
    ];
    const title = forSymbol
      ? `${forSymbol} covered calls`
      : "Covered call positions";
    const blocks = buildPortfolioPositionsBlocks(positions, title, APP_BASE_URL);
    const fallbackText =
      positions.length > 0
        ? positions.map((p) => `${p.symbol} $${p.strike} ${p.expiration}`).join(", ")
        : "No matching positions.";
    return { blocks, text: fallbackText };
  }

  const parseResult = await parseNaturalLanguageOrder(trimmed);
  if (parseResult.ok) {
    const blocks = buildOrderPreviewBlocks(parseResult.order, APP_BASE_URL);
    const o = parseResult.order;
    const summary = `${o.action} ${o.ticker} ${o.strike ?? "?"} ${o.optionType ?? "call"} ${o.expiration ?? ""}`;
    return { blocks, text: summary };
  }

  return {
    blocks: [],
    text: `Could not parse order: ${parseResult.error.message}. Try: *roll TSLA 450 call to Feb* or *sell TSLA 440 call next week*.`,
  };
}
