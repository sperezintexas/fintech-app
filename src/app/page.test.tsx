import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import Home from "./page";

vi.mock("@/components/AppHeader", () => ({
  AppHeader: () => <header data-testid="app-header">AppHeader</header>,
}));

vi.mock("@/components/Footer", () => ({
  Footer: () => <footer data-testid="app-footer">Footer</footer>,
}));

vi.mock("@/components/Dashboard", () => ({
  Dashboard: () => <div data-testid="dashboard">Dashboard</div>,
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("Home Page", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({ ok: false });
  });

  it("renders page title and welcome message", () => {
    render(<Home />);

    expect(screen.getByText(/Good afternoon|Good morning|Good evening/i)).toBeInTheDocument();
    expect(screen.getByText(/portfolio|performing/i)).toBeInTheDocument();
  });

  it("renders Dashboard component", () => {
    render(<Home />);

    expect(screen.getByTestId("dashboard")).toBeInTheDocument();
  });

  it("renders AppHeader and Footer", () => {
    render(<Home />);

    expect(screen.getByTestId("app-header")).toBeInTheDocument();
    expect(screen.getByTestId("app-footer")).toBeInTheDocument();
  });
});
