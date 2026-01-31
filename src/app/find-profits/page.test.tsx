import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import FindProfitsPage from "./page";

vi.mock("@/components/AppHeader", () => ({
  AppHeader: () => <header data-testid="app-header">AppHeader</header>,
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("Find Profits (xAIProfitBuilder) Page", () => {
  const mockAccounts = [{ _id: "acc1", name: "Merrill", balance: 50000, riskLevel: "medium", strategy: "balanced", positions: [], recommendations: [] }];

  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("/api/accounts")) return Promise.resolve({ ok: true, json: async () => mockAccounts } as Response);
      if (url.includes("/api/strategy-settings")) return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
      return Promise.resolve({ ok: false } as Response);
    });
  });

  it("renders xAIProfitBuilder page title when loaded", async () => {
    render(<FindProfitsPage />);

    await waitFor(() => {
      expect(screen.getByText("xAIProfitBuilder")).toBeInTheDocument();
    });
  });

  it("renders strategy cards", async () => {
    render(<FindProfitsPage />);

    await waitFor(() => {
      expect(screen.getByText("Covered Calls")).toBeInTheDocument();
    });
    expect(screen.getByText("Cash-Secured Puts")).toBeInTheDocument();
  });
});
