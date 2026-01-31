import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import WatchlistPage from "./page";

vi.mock("@/components/AppHeader", () => ({
  AppHeader: () => <header data-testid="app-header">AppHeader</header>,
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("Watchlist Page", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("renders page with Watchlists sidebar when loaded", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => [] } as Response)
      .mockResolvedValue({ ok: true, json: async () => [] } as Response);

    render(<WatchlistPage />);

    await waitFor(() => {
      expect(screen.getByText("Watchlists")).toBeInTheDocument();
    });
  });

  it("renders watchlist content when watchlists exist", async () => {
    const mockWatchlists = [
      { _id: "wl1", name: "Default", purpose: "Main watchlist", createdAt: "", updatedAt: "" },
    ];
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => mockWatchlists } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => [] } as Response)
      .mockResolvedValue({ ok: true, json: async () => [] } as Response);

    render(<WatchlistPage />);

    await waitFor(() => {
      expect(screen.getAllByText("Default").length).toBeGreaterThan(0);
    });
  });
});
