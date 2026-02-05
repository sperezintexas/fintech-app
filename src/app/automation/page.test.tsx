import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import AutomationPage from "./page";

vi.mock("@/components/AppHeader", () => ({
  AppHeader: () => <header data-testid="app-header">AppHeader</header>,
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("Automation Page", () => {
  const mockAccounts = [{ _id: "acc1", name: "Merrill", balance: 50000, riskLevel: "medium", strategy: "balanced", positions: [], recommendations: [] }];
  const mockReportTypes = [
    { _id: "1", id: "smartxai", handlerKey: "smartxai", name: "SmartXAI Report", enabled: true, supportsPortfolio: false, supportsAccount: true },
    { _id: "2", id: "unifiedOptionsScanner", handlerKey: "unifiedOptionsScanner", name: "Unified Options Scanner", enabled: true, supportsPortfolio: false, supportsAccount: true },
  ];

  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("/api/accounts")) return Promise.resolve({ ok: true, json: async () => mockAccounts } as Response);
      if (url.includes("/api/alerts")) return Promise.resolve({ ok: true, json: async () => [] } as Response);
      if (url.includes("/api/report-types")) return Promise.resolve({ ok: true, json: async () => mockReportTypes } as Response);
      if (url.includes("/api/jobs")) return Promise.resolve({ ok: true, json: async () => [] } as Response);
      if (url.includes("/api/alert-templates")) return Promise.resolve({ ok: true, json: async () => ({ templates: {} }) } as Response);
      if (url.includes("/api/report-templates")) return Promise.resolve({ ok: true, json: async () => ({ templates: {} }) } as Response);
      if (url.includes("/api/app-config"))
        return Promise.resolve({
          ok: true,
          json: async () => ({
            cleanup: { storageLimitMB: 512, purgeThreshold: 0.8, purgeIntervalDays: 30 },
          }),
        } as Response);
      if (url.includes("/api/strategy-settings")) return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
      if (url.includes("/api/scheduler")) return Promise.resolve({ ok: true, json: async () => ({ status: "ok", jobs: [] }) } as Response);
      if (url.includes("/api/alert-preferences")) return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
      return Promise.resolve({ ok: false } as Response);
    });
  });

  it("renders page with main tabs", async () => {
    render(<AutomationPage />);

    await waitFor(() => {
      expect(screen.getByText("Alert Settings")).toBeInTheDocument();
    });
    expect(screen.getByText("Strategy")).toBeInTheDocument();
    expect(screen.getByText("Scheduled Jobs")).toBeInTheDocument();
  });

  it("renders Alert Settings tab content by default", async () => {
    render(<AutomationPage />);

    await waitFor(() => {
      expect(screen.getByText("Setup")).toBeInTheDocument();
    });
    expect(screen.getByText("Alert Settings")).toBeInTheDocument();
    expect(screen.getByText("Alert Delivery Channels")).toBeInTheDocument();
  });

  it("renders Scheduler, Job run history, Job types links when Scheduled Jobs tab is active", async () => {
    render(<AutomationPage />);

    await waitFor(() => {
      expect(screen.getByText("Scheduled Jobs")).toBeInTheDocument();
    });

    const scheduledJobsTab = screen.getByText("Scheduled Jobs");
    await act(async () => {
      scheduledJobsTab.click();
    });

    await waitFor(() => {
      expect(screen.getByText("Scheduler")).toBeInTheDocument();
    });
    expect(screen.getAllByRole("link", { name: /Job run history/ }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole("link", { name: /Job types/ }).length).toBeGreaterThanOrEqual(1);
  });
});
