import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { SessionProvider } from "next-auth/react";
import { HomePage } from "@/components/HomePage";

vi.mock("@/components/AppHeader", () => ({
  AppHeader: () => <header data-testid="app-header">AppHeader</header>,
}));

vi.mock("@/components/Footer", () => ({
  Footer: () => <footer data-testid="app-footer">Footer</footer>,
}));

vi.mock("@/components/Dashboard", () => ({
  Dashboard: () => <div data-testid="dashboard">Dashboard</div>,
}));

vi.mock("next-auth/react", async (importOriginal) => {
  const mod = await importOriginal<typeof import("next-auth/react")>();
  return {
    ...mod,
    signIn: vi.fn(),
  };
});

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const mockSession = {
  user: { name: "Test User", username: "testuser" },
  expires: "",
};

describe("Home Page", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({ ok: false });
  });

  it("renders page title and welcome message when authenticated", () => {
    render(
      <SessionProvider session={mockSession}>
        <HomePage session={mockSession} />
      </SessionProvider>
    );

    expect(screen.getByRole("heading", { name: /Hello, Test User/i })).toBeInTheDocument();
  });

  it("renders Dashboard component when authenticated", () => {
    render(
      <SessionProvider session={mockSession}>
        <HomePage session={mockSession} />
      </SessionProvider>
    );

    expect(screen.getByTestId("dashboard")).toBeInTheDocument();
  });

  it("renders AppHeader and Footer when authenticated", () => {
    render(
      <SessionProvider session={mockSession}>
        <HomePage session={mockSession} />
      </SessionProvider>
    );

    expect(screen.getByTestId("app-header")).toBeInTheDocument();
    expect(screen.getByTestId("app-footer")).toBeInTheDocument();
  });

  it("renders X sign-in when unauthenticated", () => {
    render(<HomePage session={null} />);

    expect(screen.getByLabelText("Sign in with X")).toBeInTheDocument();
    expect(screen.getByText("Sign in with X")).toBeInTheDocument();
  });

  it("renders dashboard when skipAuth is true and unauthenticated", () => {
    render(<HomePage session={null} skipAuth />);

    expect(screen.getByTestId("dashboard")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Hello, there/i })).toBeInTheDocument();
  });
});
