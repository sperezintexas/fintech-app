import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ChatPage from "./page";

vi.mock("@/components/AppHeader", () => ({
  AppHeader: () => <header data-testid="app-header">AppHeader</header>,
}));

vi.mock("@/components/ChatInterface", () => ({
  ChatInterface: () => <div data-testid="chat-interface">ChatInterface</div>,
}));

describe("Chat Page", () => {
  it("renders Smart Grok Chat title and description", () => {
    render(<ChatPage />);

    expect(screen.getByText("Smart Grok Chat")).toBeInTheDocument();
    expect(screen.getByText(/Ask about stocks, market outlook, portfolio, or investment strategies/)).toBeInTheDocument();
  });

  it("renders ChatInterface component", () => {
    render(<ChatPage />);

    expect(screen.getByTestId("chat-interface")).toBeInTheDocument();
  });
});
