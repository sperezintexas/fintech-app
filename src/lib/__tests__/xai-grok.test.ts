import { describe, it, expect, vi, beforeEach } from "vitest";
import { executeWebSearch, getXaiClient, WEB_SEARCH_TOOL } from "../xai-grok";

vi.mock("../web-search", () => ({
  searchWeb: vi.fn(),
}));

describe("xai-grok", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("WEB_SEARCH_TOOL", () => {
    it("has correct schema", () => {
      const tool = WEB_SEARCH_TOOL as { type: string; function: { name: string; parameters: { required?: string[]; properties?: Record<string, unknown> } } };
      expect(tool.type).toBe("function");
      expect(tool.function.name).toBe("web_search");
      expect(tool.function.parameters.required).toContain("query");
      expect(tool.function.parameters.properties).toHaveProperty("query");
      expect(tool.function.parameters.properties).toHaveProperty("num_results");
    });
  });

  describe("getXaiClient", () => {
    it("returns null when XAI_API_KEY is missing", () => {
      delete process.env.XAI_API_KEY;
      expect(getXaiClient()).toBeNull();
    });
  });

  describe("executeWebSearch", () => {
    it("returns error when query is missing", async () => {
      const result = await executeWebSearch({});
      expect(result).toContain("Missing query");
    });

    it("returns formatted results from searchWeb", async () => {
      const { searchWeb } = await import("../web-search");
      vi.mocked(searchWeb).mockResolvedValue({
        results: [
          { title: "Weather Austin", snippet: "75°F sunny", url: "https://example.com" },
        ],
      });

      const result = await executeWebSearch({ query: "weather Austin", num_results: 5 });
      expect(result).toContain("Weather Austin");
      expect(result).toContain("75°F sunny");
      expect(result).toContain("https://example.com");
    });

    it("handles search error", async () => {
      const { searchWeb } = await import("../web-search");
      vi.mocked(searchWeb).mockResolvedValue({
        results: [],
        error: "API rate limit",
      });

      const result = await executeWebSearch({ query: "test" });
      expect(result).toContain("API rate limit");
    });
  });
});
