/**
 * Short company theme descriptions (relationship to Tesla, Space, or Defense)
 * for display on the watchlist page. Key: symbol uppercase.
 */
export const WATCHLIST_THEME_DESCRIPTIONS: Record<string, string> = {
  TSLA: "Tesla",
  RIVN: "EV / Tesla peer",
  LCID: "EV / Tesla peer",
  NIO: "EV / Tesla peer",
  F: "Auto / EV",
  GM: "Auto / EV",
  RKLB: "Space",
  SPCE: "Space",
  ASTS: "Space",
  BA: "Aerospace & Defense",
  LMT: "Defense",
  RTX: "Defense",
  NOC: "Defense",
  GD: "Defense",
  LDOS: "Defense",
  HII: "Defense",
  LHX: "Defense",
  TXT: "Aerospace",
  SPX: "Aerospace",
};

export function getThemeDescription(symbol: string | undefined): string | undefined {
  if (!symbol) return undefined;
  return WATCHLIST_THEME_DESCRIPTIONS[symbol.toUpperCase()];
}
