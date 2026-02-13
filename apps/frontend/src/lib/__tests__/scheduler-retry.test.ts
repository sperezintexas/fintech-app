import { describe, it, expect, vi, beforeEach } from "vitest";
import { isTransientError, withRetry } from "../scheduler";

describe("scheduler retry", () => {
  describe("isTransientError", () => {
    it("returns true for timeout and network errors", () => {
      expect(isTransientError(new Error("request timeout"))).toBe(true);
      expect(isTransientError(new Error("ETIMEDOUT"))).toBe(true);
      expect(isTransientError(new Error("ECONNRESET"))).toBe(true);
      expect(isTransientError(new Error("Network error"))).toBe(true);
      expect(isTransientError(new Error("fetch failed"))).toBe(true);
    });

    it("returns true for 5xx errors", () => {
      expect(isTransientError(new Error("503 Service Unavailable"))).toBe(true);
      expect(isTransientError(new Error("502 Bad Gateway"))).toBe(true);
      expect(isTransientError(new Error("504 Gateway Timeout"))).toBe(true);
      expect(isTransientError(new Error("Server returned 500"))).toBe(true);
    });

    it("returns false for 4xx and auth/validation", () => {
      expect(isTransientError(new Error("401 Unauthorized"))).toBe(false);
      expect(isTransientError(new Error("403 Forbidden"))).toBe(false);
      expect(isTransientError(new Error("validation failed"))).toBe(false);
      expect(isTransientError(new Error("auth error"))).toBe(false);
    });
  });

  describe("withRetry", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("succeeds on first attempt", async () => {
      const fn = vi.fn().mockResolvedValue(42);
      const result = await withRetry(fn, { backoffMs: [0, 0], jobName: "test" });
      expect(result).toBe(42);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("retries on transient error and succeeds on third attempt", async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error("timeout"))
        .mockRejectedValueOnce(new Error("503"))
        .mockResolvedValueOnce("ok");
      const result = await withRetry(fn, {
        maxAttempts: 3,
        backoffMs: [0, 0],
        jobName: "test",
      });
      expect(result).toBe("ok");
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it("does not retry on permanent error", async () => {
      const fn = vi.fn().mockRejectedValue(new Error("401 Unauthorized"));
      await expect(
        withRetry(fn, { maxAttempts: 3, backoffMs: [0, 0], jobName: "test" })
      ).rejects.toThrow("401 Unauthorized");
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("throws after max attempts when all failures are transient", async () => {
      const fn = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
      await expect(
        withRetry(fn, { maxAttempts: 3, backoffMs: [0, 0], jobName: "test" })
      ).rejects.toThrow("ECONNRESET");
      expect(fn).toHaveBeenCalledTimes(3);
    });
  });
});
