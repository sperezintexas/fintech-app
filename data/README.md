# Data

## Merrill Edge CSV

`MerrillEdge.csv` is a broker export from Merrill Edge. Columns include Trade Date, Settlement Date, Account #, Type, Description 1, Description 2, Symbol/CUSIP #, Quantity, Price ($), Amount ($).

### Import as activities

To format the CSV for the app’s **Import Activities** API:

```bash
pnpm run merrill-to-activities                    # print JSON to stdout
pnpm run merrill-to-activities -- --output=out.json   # write to file
pnpm run merrill-to-activities path/to/export.csv --output=out.json
```

Output shape:

```json
{
  "accounts": [
    { "accountRef": "51X-98940", "label": "IRA-Edge", "activities": [ ... ] },
    { "accountRef": "79Z-79494", "label": "Roth IRA-Edge", "activities": [ ... ] }
  ]
}
```

- Map `accountRef` (or use the account nickname) to your app account’s MongoDB `_id`.
- For each account, call:

  `POST /api/import/activities`
  Body: `{ "accountId": "<your account _id>", "activities": <that account’s activities array>, "recomputePositions": true }`

The script:

- Uses **Trade Date** for `date` (ISO YYYY-MM-DD).
- Maps **Description 1** to activity type: Option Sale/Sale/Sell → SELL, Option Purchase → BUY, Option Expired → SELL @ 0, Interest → INTEREST.
- Derives **symbol** from Symbol/CUSIP (e.g. `TSLA#B1326C425000` → TSLA).
- Parses **option** details from Description 2 (CALL/PUT, strike, EXP date) when present.
- Uses **Quantity** as absolute value; **Price ($)** for unitPrice (or Amount/Quantity when Price is --).
- Skips rows: Transfer / Adjustment, Withdrawal (no security).
