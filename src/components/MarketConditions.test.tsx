import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MarketConditions } from "./MarketConditions";
import type { MarketConditions as MarketConditionsType } from "@/types/portfolio";

const mockMarket: MarketConditionsType = {
  status: "open",
  lastUpdated: "2026-01-25T10:00:00Z",
  indices: [
    {
      symbol: "SPY",
      name: "S&P 500",
      price: 4800,
      change: 25,
      changePercent: 0.52,
    },
    {
      symbol: "QQQ",
      name: "Nasdaq 100",
      price: 17000,
      change: -50,
      changePercent: -0.29,
    },
  ],
};

describe("MarketConditions", () => {
  it("renders market status", () => {
    render(<MarketConditions market={mockMarket} />);
    expect(screen.getByText("Market Open")).toBeInTheDocument();
  });

  it("renders index names", () => {
    render(<MarketConditions market={mockMarket} />);
    expect(screen.getByText("S&P 500")).toBeInTheDocument();
    expect(screen.getByText("Nasdaq 100")).toBeInTheDocument();
  });

  it("renders index prices", () => {
    render(<MarketConditions market={mockMarket} />);
    expect(screen.getByText("4,800.00")).toBeInTheDocument();
    expect(screen.getByText("17,000.00")).toBeInTheDocument();
  });

  it("renders positive change with plus sign", () => {
    render(<MarketConditions market={mockMarket} />);
    expect(screen.getByText("+25.00")).toBeInTheDocument();
    expect(screen.getByText("+0.52%")).toBeInTheDocument();
  });

  it("renders negative change", () => {
    render(<MarketConditions market={mockMarket} />);
    expect(screen.getByText("-50.00")).toBeInTheDocument();
    expect(screen.getByText("-0.29%")).toBeInTheDocument();
  });

  it("renders closed market status", () => {
    const closedMarket = { ...mockMarket, status: "closed" as const };
    render(<MarketConditions market={closedMarket} />);
    expect(screen.getByText("Market Closed")).toBeInTheDocument();
  });

  it("ticker variant shows market status pill", () => {
    render(<MarketConditions market={mockMarket} variant="ticker" />);
    expect(screen.getByText("Market Open")).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});
