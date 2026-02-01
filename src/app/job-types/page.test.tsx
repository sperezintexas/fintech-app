import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import JobTypesPage from "./page";

const mockReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

describe("Job Types Page", () => {
  it("redirects to automation jobs tab", async () => {
    render(<JobTypesPage />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/automation?tab=jobs");
    });
  });

  it("shows loading spinner while redirecting", () => {
    const { container } = render(<JobTypesPage />);

    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
  });
});
