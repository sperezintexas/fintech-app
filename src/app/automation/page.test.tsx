import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import AutomationPage from "./page";
import AutomationLayout from "./layout";

vi.mock("@/components/AppHeader", () => ({
  AppHeader: () => <header data-testid="app-header">AppHeader</header>,
}));

const mockSearchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams,
  usePathname: () => "/automation",
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
      if (url.includes("/api/x-allowed-usernames") && !url.includes("/seed")) return Promise.resolve({ ok: true, json: async () => [] } as Response);
      return Promise.resolve({ ok: false } as Response);
    });
  });

  it("renders page with main tabs when rendered with layout", async () => {
    render(
      <AutomationLayout>
        <AutomationPage />
      </AutomationLayout>
    );

    await waitFor(() => {
      expect(screen.getByText("Auth Users")).toBeInTheDocument();
    });
    expect(screen.getByText("Alert Settings")).toBeInTheDocument();
    expect(screen.getByText("Strategy")).toBeInTheDocument();
    expect(screen.getByText("Scheduled Jobs")).toBeInTheDocument();
  });

  it("renders Auth Users tab content by default", async () => {
    render(
      <AutomationLayout>
        <AutomationPage />
      </AutomationLayout>
    );

    await waitFor(() => {
      expect(screen.getByText("Setup")).toBeInTheDocument();
    });
    expect(screen.getByText("Auth Users")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/X allowed usernames/)).toBeInTheDocument();
    });
  });

  it("renders Alert Settings tab content when tab=settings in URL", async () => {
    mockSearchParams.set("tab", "settings");
    render(
      <AutomationLayout>
        <AutomationPage />
      </AutomationLayout>
    );

    await waitFor(() => {
      expect(screen.getByText("Alert Delivery Channels")).toBeInTheDocument();
    });
    mockSearchParams.delete("tab");
  });

  it("renders Job run history and Job types links in nav", async () => {
    render(
      <AutomationLayout>
        <AutomationPage />
      </AutomationLayout>
    );

    await waitFor(() => {
      expect(screen.getByText("Scheduled Jobs")).toBeInTheDocument();
    });
    expect(screen.getAllByRole("link", { name: /Job run history/ }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole("link", { name: /Job types/ }).length).toBeGreaterThanOrEqual(1);
  });
});
