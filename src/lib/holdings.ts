/**
 * Holdings / Positions with market values
 * Enriches positions with Yahoo Finance prices (stocks) and option chain premiums (options).
 * Reads from priceCache and optionPriceCache when fresh (see refreshHoldingsPrices job); otherwise falls back to live Yahoo.
 */

import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { getMultipleTickerPrices, getOptionPremiumForPosition } from "@/lib/yahoo";
import {
  getCachedStockPrices,
  getCachedOptionPremiums,
  isPriceCacheFresh,
  optionCacheKey,
} from "@/lib/holdings-price-cache";
import {
  hasActivitiesForAccount,
  recomputePositionsFromActivities,
} from "@/lib/activities";
import type { Account, Position } from "@/types/portfolio";

/** Extract underlying symbol from option ticker (e.g. TSLA250117C250 -> TSLA). */
export function getUnderlyingFromTicker(ticker: string): string {
  return ticker?.replace(/\d.*$/, "").toUpperCase() ?? ticker?.toUpperCase() ?? "";
}

/** Build set of symbols held (stock tickers + option underlyings). When accountId is set, only that account's positions are considered. */
export function getHeldSymbols(
  accounts: Array<{ _id?: ObjectId | string; positions?: Position[] }>,
  accountId?: string
): Set<string> {
  const set = new Set<string>();
  const filtered =
    accountId != null
      ? accounts.filter((a) => (a._id instanceof ObjectId ? a._id.toString() : a._id) === accountId)
      : accounts;
  for (const acc of filtered) {
    const positions = acc.positions ?? [];
    for (const p of positions) {
      if (!p.ticker) continue;
      if (p.type === "stock") {
        set.add(p.ticker.toUpperCase());
      } else if (p.type === "option") {
        set.add(getUnderlyingFromTicker(p.ticker));
      }
    }
  }
  return set;
}

export type EnhancedPosition = Position & {
  marketValue: number;
  unrealizedPL: number;
  unrealizedPLPercent: number;
  isExpired?: boolean;
};

// Parse YYYY-MM-DD as local calendar date (avoids UTC midnight showing as previous day)
function parseLocalDate(isoDate: string): Date {
  const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number);
  return new Date(y ?? 0, (m ?? 1) - 1, d ?? 1);
}

function isOptionExpired(expiration: string | undefined): boolean {
  if (!expiration) return false;
  const expDate = parseLocalDate(expiration);
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return expDate.getTime() < todayStart.getTime();
}

function intrinsicValue(
  stockPrice: number,
  strike: number,
  optionType: "call" | "put"
): number {
  if (optionType === "call") return Math.max(0, stockPrice - strike);
  return Math.max(0, strike - stockPrice);
}

export async function getPositionsWithMarketValues(
  accountId: string
): Promise<{ account: Account; positions: EnhancedPosition[] }> {
  const db = await getDb();
  type AccountDoc = Omit<Account, "_id"> & { _id: ObjectId };
  const account = await db
    .collection<AccountDoc>("accounts")
    .findOne({ _id: new ObjectId(accountId) });

  if (!account) {
    throw new Error("Account not found");
  }

  const storedPositions: Position[] = account.positions ?? [];
  let positions: Position[];

  const useActivities = await hasActivitiesForAccount(accountId);
  if (useActivities) {
    const derived = await recomputePositionsFromActivities(accountId);
    const cashPositions = storedPositions.filter((p) => p.type === "cash");
    positions = [...derived, ...cashPositions];
  } else {
    positions = storedPositions;
  }

  // Stock tickers and option underlyings for price lookup
  const stockTickers = positions
    .filter((p) => p.type === "stock" && p.ticker)
    .map((p) => p.ticker!.toUpperCase());
  const uniqueStockTickers = Array.from(new Set(stockTickers));
  const optionUnderlyingSymbols = positions
    .filter((p) => p.type === "option" && p.ticker)
    .map((p) => getUnderlyingFromTicker(p.ticker!));
  const uniqueUnderlyingSymbols = Array.from(new Set(optionUnderlyingSymbols)).filter(Boolean);
  const allSymbols = Array.from(new Set([...uniqueStockTickers, ...uniqueUnderlyingSymbols]));

  // Try cache first; fall back to Yahoo for missing or stale
  const stockPrices = new Map<string, { price: number; change: number; changePercent: number }>();
  const cachedStocks = await getCachedStockPrices(allSymbols);
  const symbolsToFetch: string[] = [];
  for (const sym of allSymbols) {
    const entry = cachedStocks.get(sym);
    if (entry && isPriceCacheFresh(entry.updatedAt)) {
      stockPrices.set(sym, {
        price: entry.price,
        change: entry.change,
        changePercent: entry.changePercent,
      });
    } else {
      symbolsToFetch.push(sym);
    }
  }
  if (symbolsToFetch.length > 0) {
    try {
      const live = await getMultipleTickerPrices(symbolsToFetch);
      for (const [sym, data] of live) {
        stockPrices.set(sym, data);
      }
    } catch (e) {
      console.error("holdings: getMultipleTickerPrices failed:", e);
    }
  }

  const underlyingPrices = new Map<string, number>();
  for (const sym of uniqueUnderlyingSymbols) {
    const data = stockPrices.get(sym);
    if (data) underlyingPrices.set(sym, data.price);
  }

  // Option premium cache: keys for all option positions
  const optionKeys = positions
    .filter((p) => p.type === "option" && p.ticker && p.expiration && p.strike != null)
    .map((p) => ({
      symbol: getUnderlyingFromTicker(p.ticker!),
      expiration: p.expiration!,
      strike: p.strike!,
      optionType: (p.optionType ?? "call") as "call" | "put",
    }));
  const cachedOptions = await getCachedOptionPremiums(optionKeys);

  const enhanced: EnhancedPosition[] = await Promise.all(
    positions.map(async (position): Promise<EnhancedPosition> => {
      if (position.type === "cash") {
        const amount = position.amount ?? 0;
        return {
          ...position,
          marketValue: amount,
          unrealizedPL: 0,
          unrealizedPLPercent: 0,
        };
      }

      if (position.type === "stock") {
        const shares = position.shares ?? 0;
        const purchasePrice = position.purchasePrice ?? 0;
        const priceData = position.ticker
          ? stockPrices.get(position.ticker.toUpperCase())
          : undefined;
        const currentPrice = priceData?.price ?? position.currentPrice ?? purchasePrice;
        const totalCost = shares * purchasePrice;
        const marketValue = shares * currentPrice;
        const unrealizedPL = marketValue - totalCost;
        const unrealizedPLPercent =
          totalCost > 0 ? (unrealizedPL / totalCost) * 100 : 0;

        return {
          ...position,
          currentPrice,
          dailyChange: priceData?.change,
          dailyChangePercent: priceData?.changePercent,
          marketValue,
          unrealizedPL,
          unrealizedPLPercent,
        };
      }

      // Option
      const contracts = position.contracts ?? 0;
      const premium = position.premium ?? 0;
      const strike = position.strike ?? 0;
      const expiration = position.expiration;
      const optionType = position.optionType ?? "call";
      const underlyingSymbol = position.ticker ? getUnderlyingFromTicker(position.ticker) : "";

      const expired = isOptionExpired(expiration);
      const underlyingPrice = underlyingSymbol ? underlyingPrices.get(underlyingSymbol) ?? undefined : undefined;
      let currentPremium: number;

      if (expired) {
        const stockPrice = underlyingPrice ?? 0;
        currentPremium = intrinsicValue(stockPrice, strike, optionType);
      } else if (underlyingSymbol && expiration && strike) {
        const cacheKey = optionCacheKey(underlyingSymbol, expiration, strike, optionType);
        const cached = cachedOptions.get(cacheKey);
        if (cached && isPriceCacheFresh(cached.updatedAt)) {
          currentPremium = cached.price;
        } else {
          const fetched = await getOptionPremiumForPosition(
            underlyingSymbol,
            expiration,
            strike,
            optionType
          );
          currentPremium = fetched ?? premium;
        }
      } else {
        currentPremium = premium;
      }

      const totalCost = contracts * premium * 100;
      const marketValue = contracts * currentPremium * 100;
      const unrealizedPL = marketValue - totalCost;
      const unrealizedPLPercent =
        totalCost > 0 ? (unrealizedPL / totalCost) * 100 : 0;

      return {
        ...position,
        currentPrice: currentPremium,
        underlyingPrice,
        marketValue,
        unrealizedPL,
        unrealizedPLPercent,
        isExpired: expired,
      };
    })
  );

  const accountWithId: Account = {
    ...account,
    _id: account._id.toString(),
  };

  return { account: accountWithId, positions: enhanced };
}
