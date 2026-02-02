import type { ReactElement } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { SessionProvider } from "next-auth/react";
import XStrategyBuilderPage from "./page";

const mockFetch = vi.fn();

function renderWithSession(ui: ReactElement) {
  return render(
    <SessionProvider session={null}>
      {ui}
    </SessionProvider>
  );
}
vi.stubGlobal("fetch", mockFetch);

describe("xStrategyBuilder Page", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("/api/symbols/search")) return Promise.resolve({ ok: true, json: async () => [] } as Response);
      if (url.includes("/api/ticker/")) return Promise.resolve({ ok: true, json: async () => ({ symbol: "TSLA", name: "Tesla", price: 250, change: 5, changePercent: 2 }) } as Response);
      if (url.includes("/api/options/expirations")) return Promise.resolve({ ok: true, json: async () => ({ expirationDates: ["2025-02-21", "2025-03-21"] }) } as Response);
      if (url.includes("/api/options")) return Promise.resolve({ ok: true, json: async () => ({ optionChain: [{ strike: 250, call: { premium: 10, last_quote: { ask: 10 } }, put: { premium: 8, last_quote: { ask: 8 } } }] }) } as Response);
      return Promise.resolve({ ok: false } as Response);
    });
  });

  it("renders page title and wizard", async () => {
    renderWithSession(<XStrategyBuilderPage />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "xStrategyBuilder" })).toBeInTheDocument();
    });
    expect(screen.getByText("Strategy Wizard")).toBeInTheDocument();
    expect(screen.getByText("Strategy Preview")).toBeInTheDocument();
  });

  it("shows Step 1 Symbol input by default", async () => {
    renderWithSession(<XStrategyBuilderPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Search symbol/)).toBeInTheDocument();
    });
    expect(screen.getByText(/Step 1: Select a symbol/)).toBeInTheDocument();
  });

  it("has step navigation for Symbol, Outlook, Strategy, Contract, Review order", async () => {
    renderWithSession(<XStrategyBuilderPage />);

    await waitFor(() => {
      expect(screen.getByText("Symbol")).toBeInTheDocument();
      expect(screen.getByText("Outlook")).toBeInTheDocument();
      expect(screen.getByText("Strategy")).toBeInTheDocument();
      expect(screen.getByText("Contract")).toBeInTheDocument();
      expect(screen.getByText("Review order")).toBeInTheDocument();
    });
  });
});
