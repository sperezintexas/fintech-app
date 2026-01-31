import { describe, it, expect, vi, beforeEach } from "vitest";
import { searchWeb } from "../web-search";

vi.mock("serpapi", () => ({
  getJson: vi.fn(),
}));

describe("web-search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.WEB_SEARCH_API_KEY;
    delete process.env.SERPAPI_API_KEY;
  });

  it("returns empty results when no API key", async () => {
    const result = await searchWeb("weather Austin");
    expect(result.results).toEqual([]);
    expect(result.error).toContain("not configured");
  });

  it("returns results when API key and SerpAPI succeeds", async () => {
    process.env.WEB_SEARCH_API_KEY = "test-key";
    const { getJson } = await import("serpapi");
    vi.mocked(getJson).mockResolvedValue({
      organic_results: [
        { title: "Weather Austin", snippet: "75°F sunny", link: "https://example.com/weather" },
        { title: "Austin TX Weather", snippet: "Partly cloudy", link: "https://example.com/2" },
      ],
    });

    const result = await searchWeb("weather Austin", 5);
    expect(result.results).toHaveLength(2);
    expect(result.results[0]).toEqual({
      title: "Weather Austin",
      snippet: "75°F sunny",
      url: "https://example.com/weather",
    });
    expect(result.error).toBeUndefined();
  });

  it("falls back to SERPAPI_API_KEY", async () => {
    process.env.SERPAPI_API_KEY = "serp-key";
    const { getJson } = await import("serpapi");
    vi.mocked(getJson).mockResolvedValue({ organic_results: [] });

    const result = await searchWeb("test");
    expect(result.results).toEqual([]);
    expect(getJson).toHaveBeenCalledWith(
      expect.objectContaining({ api_key: "serp-key", q: "test" })
    );
  });
});
