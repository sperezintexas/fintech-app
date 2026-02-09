import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import AutomationJobTypesPage from "./page";

vi.mock("@/components/AppHeader", () => ({
  AppHeader: () => <header data-testid="app-header">AppHeader</header>,
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("Automation Job Types Page", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [
        { _id: "1", id: "smartxai", name: "SmartXAI Report", enabled: true, supportsPortfolio: false, supportsAccount: true },
      ],
    });
  });

  it("renders page title and description", async () => {
    render(<AutomationJobTypesPage />);

    await waitFor(() => {
      expect(screen.getByText("Job types")).toBeInTheDocument();
    });
    expect(screen.getByText("Define report/job types used by scheduled jobs.")).toBeInTheDocument();
  });

  it("fetches job types and shows New job type button", async () => {
    render(<AutomationJobTypesPage />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/report-types?all=true", expect.any(Object));
    });
    expect(screen.getByRole("button", { name: /New job type/ })).toBeInTheDocument();
  });
});
