# Message Templates

Edit these JSON files to customize report and alert message templates.

## Files

- **report-templates.json** – Watchlist report templates (Slack + X)
- **alert-templates.json** – Watchlist alert templates (Slack, X, SMS, push)

## Templates per channel

- **slackTemplate** – Used for Slack (includes `{account}`)
- **xTemplate** – Used for X (no `{account}` for privacy)

## Placeholders

### Report templates
- `{date}` – Report date/time
- `{reportName}` – Report definition name
- `{account}` – Account name (Slack only; omitted in xTemplate)
- `{stocks}` – Formatted stock list
- `{options}` – Formatted options list (or "No options")

### Alert templates
- `{account}` – Account name
- `{action}` – Recommendation (HOLD, BTC, STC, etc.)
- `{symbol}` – Ticker or option symbol
- `{reason}` – Alert reason
- `{severity}` – Severity level
- `{strategy}` – Strategy name
- `{currentPrice}` – Current price
- `{entryPrice}` – Entry price
- `{profitPercent}` – P/L percentage
- `{profitDollars}` – P/L in dollars
- `{dte}` – Days to expiration
- `{riskLevel}` – Risk level
- `{riskWarning}` – Risk warning text
- `{actions}` – Suggested actions
- `{disclosure}` – Risk disclosure

## Usage

1. Edit the JSON file
2. Restart the dev server (`npm run dev`) or rebuild for changes to take effect
