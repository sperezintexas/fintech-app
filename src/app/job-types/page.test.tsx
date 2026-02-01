import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import JobTypesPage from "./page";

vi.mock("@/components/AppHeader", () => ({
  AppHeader: () => <header data-testid="app-header">AppHeader</header>,
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("Job Types Page", () => {
  const mockJobTypes = [
    { _id: "1", id: "smartxai", handlerKey: "smartxai", name: "SmartXAI Report", description: "AI analysis", supportsPortfolio: false, supportsAccount: true, order: 0, enabled: true },
    { _id: "2", id: "coveredCallScanner", handlerKey: "coveredCallScanner", name: "Covered Call Scanner", description: "Covered call scan", supportsPortfolio: false, supportsAccount: true, order: 6, enabled: true },
  ];

  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("/api/report-types")) return Promise.resolve({ ok: true, json: async () => mockJobTypes } as Response);
      return Promise.resolve({ ok: false } as Response);
    });
  });

  it("renders page title and job types list", async () => {
    render(<JobTypesPage />);

    await waitFor(() => {
      expect(screen.getByText("Job Types")).toBeInTheDocument();
    });
    expect(screen.getByText(/Manage report\/job types used by scheduled jobs/)).toBeInTheDocument();
    expect(screen.getByText("SmartXAI Report")).toBeInTheDocument();
    expect(screen.getByText("Covered Call Scanner")).toBeInTheDocument();
  });

  it("shows New button", async () => {
    render(<JobTypesPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /New/i })).toBeInTheDocument();
    });
  });
});
