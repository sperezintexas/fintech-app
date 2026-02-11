# Market Calendar

US equity market calendar (NYSE/NASDAQ style), used for market open/closed state across the app (e.g. Yahoo market conditions, price cache TTL, scheduler).

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
- **Home page** — Market Conditions block shows a status pill (Market Open / Closed / Pre-Market / After Hours) from the API when loaded; `MarketStatusPill` uses the calendar client-side so status is visible while market data is loading.
