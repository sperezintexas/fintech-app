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

    // Assert (PositionList renders desktop + mobile views; compact format "Qty @ Cost")
    expect(screen.getAllByText(/AAPL/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Stock").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/10\.000/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("$175.00").length).toBeGreaterThan(0);
    expect(screen.getAllByText("$1,750.00").length).toBeGreaterThan(0);
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

    // Assert (options display Call/Put, contracts count, formatted symbol; compact "Qty @ Cost")
    expect(screen.getAllByText(/TSLA/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Call").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/2\s*@/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("$6.00").length).toBeGreaterThan(0);
    expect(screen.getAllByText("$1,200.00").length).toBeGreaterThan(0);
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

    // Assert (cash displays "—" for qty, $5,000.00 for value)
    expect(screen.getAllByText("CASH").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Cash").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/\u2014/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/\$5,000\.00/).length).toBeGreaterThanOrEqual(2);
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
    expect(screen.getAllByText("Stock").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Call").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Cash").length).toBeGreaterThan(0);

    // Check all symbols (options use formatted symbol containing ticker)
    expect(screen.getAllByText(/AAPL/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/TSLA/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("CASH").length).toBeGreaterThan(0);
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

    // Assert (compact "Qty @ Cost" format)
    expect(screen.getAllByText(/\$150\.00/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/\$1,500\.00/).length).toBeGreaterThanOrEqual(2);
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

    // Assert (compact format)
    expect(screen.getAllByText(/\$5\.00/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/\$1,000\.00/).length).toBeGreaterThanOrEqual(2);
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

    // Assert (market value = 25 * 120 = $3,000)
    expect(screen.getAllByText(/\$3,000\.00/).length).toBeGreaterThan(0);
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

    // Assert (5 contracts, market value = 5 * 12 * 100 = $6,000; compact "Qty @ Cost")
    expect(screen.getAllByText(/5\s*@/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Put").length).toBeGreaterThan(0);
    expect(screen.getAllByText("$6,000.00").length).toBeGreaterThan(0);
  });
});
