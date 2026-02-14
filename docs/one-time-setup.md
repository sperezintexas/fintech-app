# One-time setup script

The **one-time-setup** script wipes tenant and auth data and seeds a single default user and portfolio from **config/seed-defaults.json**. Use it for a fresh environment or after resetting the database.

## What it does

1. **Deletes** (in order): activities, alerts, alertPreferences, scheduledAlerts, reportJobs, watchlist, accounts, portfolios, userSettings, auth_users.
2. **Seeds auth_users** with one username from config: `defaultUser` (e.g. `atxbogart`).
3. **Creates one portfolio** with:
   - `name` from `defaultPortfolioName`
   - `ownerId` / `ownerXHandle` / `authorizedUserIds` / `authorizedUsers` set to the default user
   - `defaultAccountName`, `defaultBrokerName` from config

## Config: config/seed-defaults.json

At repo root (or `config/` relative to cwd). Example:

```json
{
  "defaultUser": "atxbogart",
  "defaultPortfolioName": "Default",
  "defaultAccountName": "Default",
  "defaultBrokerType": "Merrill"
}
```

- **defaultUser** — X username that can sign in and owns the initial portfolio (must exist in auth_users after run).
- **defaultPortfolioName** — Name of the single portfolio created.
- **defaultAccountName** — Default account name for the portfolio.
- **defaultBrokerType** — Default broker type (e.g. Merrill) for new accounts.

If the file is missing, the script uses fallbacks (atxbogart, Default, Merrill).

## Run

From repo root:

```bash
pnpm run one-time-setup
```

Requires **MONGODB_URI** (or **MONGODB_URI_B64**) and **MONGODB_DB** in the environment; `.env.local` is loaded if present.

## After running

When the default user (e.g. atxbogart) signs in with X (Twitter), they will see the one portfolio. No accounts are created; add accounts from the app after sign-in.
