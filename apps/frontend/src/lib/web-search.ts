/**
 * Web search executor for Smart Grok Chat.
 * Uses SerpAPI when WEB_SEARCH_API_KEY is set; otherwise returns empty results.
 */

export type WebSearchResult = {
  title: string;
  snippet: string;
  url: string;
};

export type WebSearchResponse = {
  results: WebSearchResult[];
  error?: string;
};

/**
 * Search the web for current information (weather, news, facts).
 * Requires WEB_SEARCH_API_KEY (SerpAPI key) in .env.local.
 */
export async function searchWeb(
  query: string,
  numResults: number = 5
): Promise<WebSearchResponse> {
  const apiKey = process.env.WEB_SEARCH_API_KEY || process.env.SERPAPI_API_KEY;
  if (!apiKey?.trim()) {
    return {
      results: [],
      error: "Web search not configured. Add WEB_SEARCH_API_KEY to .env.local (SerpAPI key).",
    };
  }

  try {
    const { getJson } = await import("serpapi");
    const data = await getJson({
      engine: "google",
      api_key: apiKey,
      q: query,
      num: Math.min(numResults, 10),
    });

    const organic = (data.organic_results ?? []) as Array<{
      title?: string;
      snippet?: string;
      link?: string;
    }>;

    const results: WebSearchResult[] = organic.slice(0, numResults).map((r) => ({
      title: r.title ?? "",
      snippet: r.snippet ?? "",
      url: r.link ?? "",
    }));

    return { results };
  } catch (err) {
    console.error("Web search error:", err);
    return {
      results: [],
      error: err instanceof Error ? err.message : "Web search failed",
    };
  }
}
