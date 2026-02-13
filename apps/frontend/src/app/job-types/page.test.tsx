import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import JobTypesRedirect from "./page";

const redirectMock = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    redirectMock(url);
    throw new Error("REDIRECT");
  },
}));

describe("Task Types redirect (root /job-types → /automation/task-types)", () => {
  it("redirects to /automation/task-types", () => {
    try {
      render(<JobTypesRedirect />);
    } catch (e) {
      expect((e as Error).message).toBe("REDIRECT");
    }
    expect(redirectMock).toHaveBeenCalledWith("/automation/task-types");
  });
});
