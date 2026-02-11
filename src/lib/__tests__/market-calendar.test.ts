import { describe, it, expect, vi, afterEach } from "vitest";
import {
  getMarketState,
  isMarketOpen,
  isMarketHoliday,
  getMarketHolidays,
  getNextOpen,
  getNextClose,
} from "../market-calendar";

describe("market-calendar", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns closed on weekend", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-07T19:00:00Z")); // Saturday 2 PM ET
    expect(getMarketState()).toBe("closed");
    expect(isMarketOpen()).toBe(false);
  });

  it("returns open on weekday during session", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-11T15:30:00Z")); // Wed 10:30 AM ET
    expect(getMarketState()).toBe("open");
    expect(isMarketOpen()).toBe(true);
  });

  it("returns pre-market before 9:30 ET", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-11T14:00:00Z")); // Wed 9:00 AM ET
    expect(getMarketState()).toBe("pre-market");
  });

  it("returns closed on New Year holiday", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T15:30:00Z")); // Thu 10:30 AM ET = New Year
    expect(isMarketHoliday(new Date("2026-01-01T15:00:00Z"))).toBe(true);
    expect(getMarketState()).toBe("closed");
  });

  it("getMarketHolidays returns list for year", () => {
    const h2025 = getMarketHolidays(2025);
    expect(h2025).toContain("2025-01-01");
    expect(h2025).toContain("2025-12-25");
    const h2026 = getMarketHolidays(2026);
    expect(h2026).toContain("2026-07-03");
  });

  it("getNextOpen returns next 9:30 AM ET on trading day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-11T12:00:00Z")); // Wed 7 AM ET
    const next = getNextOpen();
    const et = next.toLocaleString("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hour12: false });
    expect(et).toMatch(/9:30/);
  });

  it("getNextClose returns next 4:00 PM ET on trading day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-11T12:00:00Z")); // Wed 7 AM ET
    const next = getNextClose();
    const et = next.toLocaleString("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hour12: false });
    expect(et === "4:00" || et === "16:00").toBe(true);
  });
});
