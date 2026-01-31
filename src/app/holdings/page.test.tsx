import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import HoldingsPage from "./page";

vi.mock("@/components/AppHeader", () => ({
  AppHeader: () => <header data-testid="app-header">AppHeader</header>,
}));

vi.mock("@/components/PositionForm", () => ({
  PositionForm: () => <div data-testid="position-form">PositionForm</div>,
}));

vi.mock("@/components/PositionList", () => ({
  PositionList: () => <div data-testid="position-list">PositionList</div>,
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("Holdings Page", () => {
  const mockAccounts = [{ _id: "acc1", name: "Merrill", balance: 50000, riskLevel: "medium", strategy: "balanced", positions: [], recommendations: [] }];
  const mockPositions = [
    { _id: "pos1", type: "stock", ticker: "TSLA", shares: 100, purchasePrice: 250, currentPrice: 255 },
  ];

  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("/api/accounts")) return Promise.resolve({ ok: true, json: async () => mockAccounts } as Response);
      if (url.includes("/api/positions")) return Promise.resolve({ ok: true, json: async () => mockPositions } as Response);
      return Promise.resolve({ ok: false } as Response);
    });
  });

  it("renders Holdings page with account selector when loaded", async () => {
    render(<HoldingsPage />);

    await waitFor(() => {
      expect(screen.getByText("Holdings")).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText(/Merrill/)).toBeInTheDocument();
    });
  });
});
