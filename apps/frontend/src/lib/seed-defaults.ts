/**
 * Load default user, portfolio, account, and broker type from config/seed-defaults.json if present.
 * Used when auto-creating a portfolio and by the seed script.
 * Tries repo root config/ and apps/frontend relative paths.
 */

import * as fs from "fs";
import * as path from "path";

export type SeedDefaults = {
  defaultUser: string;
  defaultPortfolioName: string;
  defaultAccountName: string;
  /** Default broker type for new accounts (e.g. Merrill | Fidelity). */
  defaultBrokerType: string;
};

const FALLBACKS: SeedDefaults = {
  defaultUser: "atxbogart",
  defaultPortfolioName: "Default",
  defaultAccountName: "Default",
  defaultBrokerType: "Merrill",
};

let cached: SeedDefaults | null = null;

function tryRead(p: string): SeedDefaults | null {
  try {
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p, "utf-8");
      const data = JSON.parse(raw) as Partial<SeedDefaults>;
      return {
        defaultUser: typeof data.defaultUser === "string" && data.defaultUser.trim() ? data.defaultUser.trim() : FALLBACKS.defaultUser,
        defaultPortfolioName: typeof data.defaultPortfolioName === "string" && data.defaultPortfolioName.trim() ? data.defaultPortfolioName.trim() : FALLBACKS.defaultPortfolioName,
        defaultAccountName: typeof data.defaultAccountName === "string" ? data.defaultAccountName.trim() : FALLBACKS.defaultAccountName,
        defaultBrokerType: typeof data.defaultBrokerType === "string" && data.defaultBrokerType.trim() ? data.defaultBrokerType.trim() : FALLBACKS.defaultBrokerType,
      };
    }
  } catch {
    // ignore
  }
  return null;
}

export function getSeedDefaults(): SeedDefaults {
  if (cached) return cached;
  const cwd = process.cwd();
  const pathsToTry = [
    path.join(cwd, "config", "seed-defaults.json"),
    path.join(cwd, "..", "..", "config", "seed-defaults.json"),
    path.join(cwd, "..", "config", "seed-defaults.json"),
  ];
  for (const p of pathsToTry) {
    const result = tryRead(p);
    if (result) {
      cached = result;
      return result;
    }
  }
  cached = FALLBACKS;
  return FALLBACKS;
}

/** Default portfolio owner X handle (e.g. atxbogart). From config/seed-defaults.json defaultUser or fallback. */
export function getDefaultPortfolioOwnerXHandle(): string {
  return getSeedDefaults().defaultUser;
}

/** Default broker type for new accounts (e.g. Merrill). From config/seed-defaults.json defaultBrokerType or fallback. */
export function getDefaultBrokerType(): string {
  return getSeedDefaults().defaultBrokerType;
}
