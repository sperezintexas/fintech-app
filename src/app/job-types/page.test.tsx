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

describe("Job Types Redirect Page", () => {
  it("redirects to /automation/job-types", () => {
    try {
      render(<JobTypesRedirect />);
    } catch (e) {
      expect((e as Error).message).toBe("REDIRECT");
    }
    expect(redirectMock).toHaveBeenCalledWith("/automation/job-types");
  });
});
