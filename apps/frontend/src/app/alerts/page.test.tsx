import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { Account } from "@/types/portfolio";
import AlertsPage from "./page";

vi.mock("@/components/AppHeader", () => ({
  AppHeader: () => <header data-testid="app-header">AppHeader</header>,
}));

vi.mock("@/lib/data-server", () => ({
  getAccountsServer: vi.fn(),
  getAlertsServer: vi.fn(),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const { getAccountsServer, getAlertsServer } = await import("@/lib/data-server");

describe("Alerts Page", () => {
  const mockAlerts = [
    {
      _id: "alert1",
      accountId: "acc1",
      symbol: "TSLA",
      recommendation: "BTC",
      severity: "warning",
      reason: "DTE 5 days approaching expiry",
      details: {
        currentPrice: 255,
        entryPrice: 240,
        priceChange: 15,
        priceChangePercent: 6.25,
        daysToExpiration: 5,
      },
      suggestedActions: ["Buy to close the option"],
      createdAt: new Date().toISOString(),
      acknowledged: false,
    },
    {
      _id: "alert2",
      accountId: "acc1",
      symbol: "AAPL",
      recommendation: "HOLD",
      severity: "info",
      reason: "Adequate DTE",
      type: "option-scanner",
      metrics: {
        stockPrice: 185,
        callBid: 2.5,
        callAsk: 2.8,
        dte: 21,
        plPercent: 15,
      },
      createdAt: new Date().toISOString(),
      acknowledged: false,
    },
  ];

  const mockAccounts: Account[] = [
    { _id: "acc1", name: "Merrill", balance: 50000, riskLevel: "medium", strategy: "balanced", positions: [], recommendations: [] },
  ];

  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockImplementation((url: string | URL) => {
      const u = typeof url === "string" ? url : url.toString();
      if (u.includes("/api/profile")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ displayTimezone: "America/Chicago" }),
        } as Response);
      }
      return Promise.resolve({ ok: false } as Response);
    });
    vi.mocked(getAccountsServer).mockResolvedValue(mockAccounts);
  });

  async function renderAlertsPage() {
    const Page = await AlertsPage();
    render(Page);
  }

  it("renders page title and description", async () => {
    vi.mocked(getAlertsServer).mockResolvedValue([]);
    await renderAlertsPage();

    await waitFor(() => {
      expect(screen.getByText("Alerts")).toBeInTheDocument();
    });
    expect(
      screen.getByText(/View alerts from daily analysis, Option Scanner, Covered Call, and Protective Put scanners/)
    ).toBeInTheDocument();
  });

  it("shows empty state when no alerts", async () => {
    vi.mocked(getAlertsServer).mockResolvedValue([]);
    await renderAlertsPage();

    await waitFor(() => {
      expect(screen.getByText("No Alerts")).toBeInTheDocument();
    });
    expect(screen.getByText(/No active alerts. Acknowledged alerts are hidden/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Go to Setup/ })).toBeInTheDocument();
  });

  it("displays alerts when initial data from server", async () => {
    vi.mocked(getAlertsServer).mockResolvedValue(mockAlerts);
    await renderAlertsPage();

    await waitFor(() => {
      expect(screen.getByText("TSLA")).toBeInTheDocument();
    });
    expect(screen.getByText("AAPL")).toBeInTheDocument();
    expect(screen.getByText("BTC")).toBeInTheDocument();
    expect(screen.getByText("HOLD")).toBeInTheDocument();
    expect(screen.getByText("DTE 5 days approaching expiry")).toBeInTheDocument();
    expect(screen.getByText("Adequate DTE")).toBeInTheDocument();
    expect(screen.getAllByText("Daily Analysis").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Option Scanner").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Active Alerts (2)")).toBeInTheDocument();
  });

  it("displays alert details for watchlist-style alerts", async () => {
    vi.mocked(getAlertsServer).mockResolvedValue([mockAlerts[0]]);
    await renderAlertsPage();

    await waitFor(() => {
      expect(screen.getByText("TSLA")).toBeInTheDocument();
    });
    expect(screen.getByText("DTE 5 days approaching expiry")).toBeInTheDocument();
    expect(screen.getByText("Buy to close the option")).toBeInTheDocument();
  });

  it("displays alert metrics for option-scanner style alerts", async () => {
    vi.mocked(getAlertsServer).mockResolvedValue([mockAlerts[1]]);
    await renderAlertsPage();

    await waitFor(() => {
      expect(screen.getByText("AAPL")).toBeInTheDocument();
    });
    expect(screen.getByText("$185.00")).toBeInTheDocument();
    expect(screen.getByText("21 days")).toBeInTheDocument();
    expect(screen.getByText("+15.00%")).toBeInTheDocument();
  });

  it("calls acknowledge API when acknowledge button clicked", async () => {
    vi.mocked(getAlertsServer).mockResolvedValue(mockAlerts);
    mockFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes("/api/alerts/") && init?.method === "PUT") return Promise.resolve({ ok: true } as Response);
      if (url.includes("/api/alerts")) return Promise.resolve({ ok: true, json: async () => mockAlerts } as Response);
      return Promise.resolve({ ok: false } as Response);
    });
    await renderAlertsPage();

    await waitFor(() => {
      expect(screen.getByText("TSLA")).toBeInTheDocument();
    });

    const acknowledgeButtons = screen.getAllByTitle("Acknowledge");
    fireEvent.click(acknowledgeButtons[0]);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/alerts/alert1",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ acknowledged: true }),
        })
      );
    });
  });

  it("shows account filter when multiple accounts", async () => {
    const twoAccounts: Account[] = [
      ...mockAccounts,
      { _id: "acc2", name: "Fidelity", balance: 25000, riskLevel: "high", strategy: "aggressive", positions: [], recommendations: [] },
    ];
    vi.mocked(getAccountsServer).mockResolvedValue(twoAccounts);
    vi.mocked(getAlertsServer).mockResolvedValue([]);
    await renderAlertsPage();

    await waitFor(() => {
      const selects = screen.getAllByRole("combobox");
      expect(selects.length).toBeGreaterThanOrEqual(1);
    });
    const selects = screen.getAllByRole("combobox");
    const accountSelect = selects.find((s) => {
      const opts = (s as HTMLSelectElement).options;
      return opts?.[0]?.value === "" && opts?.[1]?.value === "acc1";
    }) ?? selects[0];
    expect(accountSelect).toHaveTextContent("Merrill");
    expect(accountSelect).toHaveTextContent("Fidelity");
  });
});
