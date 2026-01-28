import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PositionList } from "@/components/PositionList";
import { Position } from "@/types/portfolio";

describe("PositionList - Position Calculations", () => {
  const mockOnEdit = vi.fn();
  const mockOnDelete = vi.fn();

  it("should display positions with correct calculations for stock positions", () => {
    // Arrange
    const mockPositions: Position[] = [
      {
        _id: "pos1",
        type: "stock",
        ticker: "AAPL",
        shares: 10,
        purchasePrice: 150.0,
        currentPrice: 175.0,
      },
    ];

    // Act
    render(
      <PositionList
        positions={mockPositions}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />
    );

    // Assert
    expect(screen.getByText("AAPL")).toBeInTheDocument();
    expect(screen.getByText("Stock")).toBeInTheDocument();
    // Shares: 10
    expect(screen.getByText("10.000")).toBeInTheDocument();
    // Last Price: $175.00
    expect(screen.getByText("$175.00")).toBeInTheDocument();
    // Total Cost: $1,500.00 (10 * 150)
    expect(screen.getByText("$1,500.00")).toBeInTheDocument();
    // Market Value: $1,750.00 (10 * 175)
    expect(screen.getByText("$1,750.00")).toBeInTheDocument();
  });

  it("should display positions with correct calculations for option positions", () => {
    // Arrange
    const mockPositions: Position[] = [
      {
        _id: "pos1",
        type: "option",
        ticker: "TSLA",
        contracts: 2,
        premium: 5.0,
        currentPrice: 6.0,
        strike: 250.0,
        expiration: "2026-03-20",
        optionType: "call",
      },
    ];

    // Act
    render(
      <PositionList
        positions={mockPositions}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />
    );

    // Assert
    expect(screen.getByText("TSLA")).toBeInTheDocument();
    expect(screen.getByText("Option")).toBeInTheDocument();
    // Shares: 200 (2 contracts * 100)
    expect(screen.getByText("200.000")).toBeInTheDocument();
    // Last Price: $6.00
    expect(screen.getByText("$6.00")).toBeInTheDocument();
    // Total Cost: $1,000.00 (2 * 5 * 100)
    expect(screen.getByText("$1,000.00")).toBeInTheDocument();
    // Market Value: $1,200.00 (2 * 6 * 100)
    expect(screen.getByText("$1,200.00")).toBeInTheDocument();
  });

  it("should display positions with correct calculations for cash positions", () => {
    // Arrange
    const mockPositions: Position[] = [
      {
        _id: "pos1",
        type: "cash",
        ticker: "CASH",
        amount: 5000.0,
        currency: "USD",
      },
    ];

    // Act
    render(
      <PositionList
        positions={mockPositions}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />
    );

    // Assert
    expect(screen.getByText("CASH")).toBeInTheDocument();
    expect(screen.getByText("Cash")).toBeInTheDocument();
    // Shares: — (not applicable for cash)
    expect(screen.getByText("—")).toBeInTheDocument();
    // Last Price, Total Cost, Market Value: $5,000.00
    expect(screen.getAllByText("$5,000.00").length).toBeGreaterThanOrEqual(2);
  });

  it("should handle multiple position types correctly", () => {
    // Arrange
    const mockPositions: Position[] = [
      {
        _id: "pos1",
        type: "stock",
        ticker: "AAPL",
        shares: 10,
        purchasePrice: 150.0,
        currentPrice: 175.0,
      },
      {
        _id: "pos2",
        type: "option",
        ticker: "TSLA",
        contracts: 1,
        premium: 5.0,
        currentPrice: 6.0,
        strike: 250.0,
        expiration: "2026-03-20",
        optionType: "call",
      },
      {
        _id: "pos3",
        type: "cash",
        ticker: "CASH",
        amount: 3000.0,
        currency: "USD",
      },
    ];

    // Act
    render(
      <PositionList
        positions={mockPositions}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />
    );

    // Assert
    // Check all position types are displayed
    expect(screen.getByText("Stock")).toBeInTheDocument();
    expect(screen.getByText("Option")).toBeInTheDocument();
    expect(screen.getByText("Cash")).toBeInTheDocument();

    // Check all symbols
    expect(screen.getByText("AAPL")).toBeInTheDocument();
    expect(screen.getByText("TSLA")).toBeInTheDocument();
    expect(screen.getByText("CASH")).toBeInTheDocument();
  });

  it("should display empty state when no positions exist", () => {
    // Arrange
    const mockPositions: Position[] = [];

    // Act
    render(
      <PositionList
        positions={mockPositions}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />
    );

    // Assert
    expect(screen.getByText("No holdings yet")).toBeInTheDocument();
    expect(
      screen.getByText("Add a stock, option, or cash holding to get started")
    ).toBeInTheDocument();
  });

  it("should handle missing current price by using purchase price for stocks", () => {
    // Arrange
    const mockPositions: Position[] = [
      {
        _id: "pos1",
        type: "stock",
        ticker: "AAPL",
        shares: 10,
        purchasePrice: 150.0,
        // No currentPrice - should use purchasePrice
      },
    ];

    // Act
    render(
      <PositionList
        positions={mockPositions}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />
    );

    // Assert
    // Last Price should fallback to purchase price: $150.00
    expect(screen.getByText("$150.00")).toBeInTheDocument();
    // Total Cost and Market Value: 10 * 150 = $1,500.00
    expect(screen.getAllByText("$1,500.00").length).toBe(2);
  });

  it("should handle missing current price by using premium for options", () => {
    // Arrange
    const mockPositions: Position[] = [
      {
        _id: "pos1",
        type: "option",
        ticker: "TSLA",
        contracts: 2,
        premium: 5.0,
        // No currentPrice - should use premium
        strike: 250.0,
        expiration: "2026-03-20",
        optionType: "call",
      },
    ];

    // Act
    render(
      <PositionList
        positions={mockPositions}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />
    );

    // Assert
    // Last Price should fallback to premium: $5.00
    expect(screen.getByText("$5.00")).toBeInTheDocument();
    // Total Cost and Market Value: 2 * 5 * 100 = $1,000.00
    expect(screen.getAllByText("$1,000.00").length).toBe(2);
  });

  it("should calculate total cost correctly for stock positions", () => {
    // Arrange
    const mockPositions: Position[] = [
      {
        _id: "pos1",
        type: "stock",
        ticker: "AAPL",
        shares: 25,
        purchasePrice: 100.0,
        currentPrice: 120.0,
      },
    ];

    // Act
    render(
      <PositionList
        positions={mockPositions}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />
    );

    // Assert
    // Total Cost: 25 * 100 = $2,500.00
    expect(screen.getByText("$2,500.00")).toBeInTheDocument();
    // Market Value: 25 * 120 = $3,000.00
    expect(screen.getByText("$3,000.00")).toBeInTheDocument();
  });

  it("should calculate option positions with contract multiplier correctly", () => {
    // Arrange
    const mockPositions: Position[] = [
      {
        _id: "pos1",
        type: "option",
        ticker: "TSLA",
        contracts: 5,
        premium: 10.0,
        currentPrice: 12.0,
        strike: 300.0,
        expiration: "2026-06-20",
        optionType: "put",
      },
    ];

    // Act
    render(
      <PositionList
        positions={mockPositions}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />
    );

    // Assert
    // Shares: 5 * 100 = 500
    expect(screen.getByText("500.000")).toBeInTheDocument();
    // Total Cost: 5 * 10 * 100 = $5,000.00
    expect(screen.getByText("$5,000.00")).toBeInTheDocument();
    // Market Value: 5 * 12 * 100 = $6,000.00
    expect(screen.getByText("$6,000.00")).toBeInTheDocument();
  });
});
