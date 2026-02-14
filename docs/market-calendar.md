# Market Calendar

US equity market calendar (NYSE/NASDAQ style), used for market open/closed state across the app (e.g. Yahoo market conditions, price cache TTL, scheduler).

The **tracker** (dashboard) shows market status on the **home page**: a **market open/closed status pill** in the Market Conditions block (see [Goal Progress](goal-progress.md) for how the rest of the tracker uses goals and portfolio summary).

Goal configuration (e.g. $10M by 2030) is under **Setup → Goals**.

## Source

- **Module:** `src/lib/market-calendar.ts`
- **Tests:** `src/lib/__tests__/market-calendar.test.ts`

## Hours (Eastern Time)

| Period       | ET window        | State         |
|-------------|------------------|---------------|
| Pre-market  | 4:00 AM – 9:30 AM| `pre-market`  |
| Regular     | 9:30 AM – 4:00 PM| `open`        |
| After-hours | 4:00 PM – 8:00 PM| `after-hours` |
| Otherwise   | —                | `closed`      |

Regular session is weekdays only; weekends and US market holidays are `closed`.

## Holidays

Closed days are defined for 2025, 2026, and 2027 (New Year, MLK Day, Presidents Day, Good Friday, Memorial Day, Juneteenth, Independence Day, Labor Day, Thanksgiving, Christmas). See `MARKET_HOLIDAYS` in `market-calendar.ts`. Early closes (e.g. 1 PM ET) are not modeled.

## API

- **`getMarketState(date?)`** — `"open" | "closed" | "pre-market" | "after-hours"`
- **`isMarketOpen(date?)`** / **`isMarketHours(date?)`** — `true` only during regular session (weekdays, non-holiday)
- **`isMarketHoliday(date)`** — `true` if that ET date is a known holiday
- **`getMarketHolidays(year)`** — list of `YYYY-MM-DD` for that year
- **`getNextOpen(after?)`** / **`getNextClose(after?)`** — next 9:30 AM ET or 4:00 PM ET on a trading day

All times use `America/New_York` (EST/EDT).

## Usage

- **Yahoo market conditions** (`src/lib/yahoo.ts`) — `getMarketStatus()` delegates to `getMarketState()`.
- **Holdings price cache** (`src/lib/holdings-price-cache.ts`) — `isMarketHours()` uses the calendar for cache TTL and is re-exported for the scheduler.
- **Home page (Dashboard)** — Market snapshot includes a **market open/closed status pill** (Market Open / Closed / Pre-Market / After Hours). The Market Conditions block uses the calendar; `MarketStatusPill` uses it client-side so status is visible while market data is loading. The same page shows portfolio summary and goal probability (see [Goal Progress](goal-progress.md)).
