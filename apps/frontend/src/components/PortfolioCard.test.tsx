import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PortfolioCard } from "./PortfolioCard";
import type { Portfolio } from "@/types/portfolio";

const mockPortfolio: Portfolio = {
  _id: "test-portfolio",
  name: "Test Portfolio",
  totalValue: 100000,
  dailyChange: 1500,
  dailyChangePercent: 1.5,
  accounts: [
    {
      _id: "acc-1",
      name: "Test Account",
      balance: 50000,
      riskLevel: "medium",
      strategy: "growth",
      positions: [
        {
          _id: "pos-1",
          type: "stock",
          ticker: "AAPL",
          shares: 100,
          purchasePrice: 150,
          currentPrice: 175,
        },
      ],
      recommendations: [],
    },
  ],
};

describe("PortfolioCard", () => {
  it("renders portfolio name", () => {
    render(<PortfolioCard portfolio={mockPortfolio} />);
    expect(screen.getByText("Test Portfolio")).toBeInTheDocument();
  });

  it("renders total value formatted as currency", () => {
    render(<PortfolioCard portfolio={mockPortfolio} />);
    expect(screen.getByText("$100,000.00")).toBeInTheDocument();
  });

  it("renders daily change with positive indicator", () => {
    render(<PortfolioCard portfolio={mockPortfolio} />);
    expect(screen.getByText("+$1,500.00")).toBeInTheDocument();
    expect(screen.getByText("+1.50%")).toBeInTheDocument();
  });

  it("renders account information", () => {
    render(<PortfolioCard portfolio={mockPortfolio} />);
    expect(screen.getByText("Test Account")).toBeInTheDocument();
    expect(screen.getByText("growth · medium risk")).toBeInTheDocument();
  });

  it("renders stock positions", () => {
    render(<PortfolioCard portfolio={mockPortfolio} />);
    expect(screen.getByText("AAPL")).toBeInTheDocument();
    expect(screen.getByText("100 shares")).toBeInTheDocument();
  });
});
