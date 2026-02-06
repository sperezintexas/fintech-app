# Vercel deployment debugging

Use this when a deployment fails or the app "still not deploying".

## 1. Get the actual error

1. Open [Vercel Dashboard](https://vercel.com/dashboard) → your project.
2. Go to **Deployments**.
3. Open the **failed** deployment (red X).
4. Check:
   - **Building** tab: scroll to the bottom. The last 20–30 lines usually show the failure (e.g. `npm run build` error, OOM, missing env).
   - **Logs** / **Runtime Logs**: for runtime errors after a “successful” build.
5. Copy the **exact error message** (and a few lines above) so you can search or share it.

## 2. Common causes and fixes

| Symptom | Likely cause | Fix |
|--------|----------------|-----|
| Build fails at `npm run build` | Wrong Node version, OOM, or missing build env | Set **Project Settings → General → Node.js Version** to **22.x** (or add `"engines": { "node": "22.x" }` in `package.json`). Ensure **Build & Development Settings** use `npm run build` and no custom output path. |
| Build fails during “Generating static pages” | A page throws during SSG (e.g. missing env, DB call) | Check which page is last in the log; make that page tolerate missing env or use dynamic rendering. |
| “Module not found” or “Cannot find package” | Dependency not installed or wrong install command | Use **Install Command** `npm ci --legacy-peer-deps` in Project Settings if you use `--legacy-peer-deps` locally. |
| Deployment “succeeds” but site 504 / blank | Runtime error (e.g. MongoDB connection, serverless timeout) | Check **Runtime Logs** and **Functions** for the failing route. Add required **Environment Variables** (e.g. `MONGODB_URI`, `NEXTAUTH_SECRET`) for Production/Preview. |
| Cron or serverless timeout | Function exceeds 10s (Hobby) / 60s (Pro) | Optimize the route or switch to a background job / external cron. |

## 3. Environment variables for a valid Vercel deployment

Set these in **Vercel → Project → Settings → Environment Variables** for **Production** (and **Preview** if you want preview deploys to work the same).

### Required (app will fail or be unusable without them)

| Variable | Purpose | Example / notes |
|----------|---------|------------------|
| `MONGODB_URI` | MongoDB connection string | use `MONGODB_URI_B64` (base64-encoded) if the URI has special chars that Vercel mangles. |
| `AUTH_SECRET` | NextAuth session signing | Generate: `npx auth secret` — required for Sign in with X. |
| `NEXTAUTH_URL` | Auth callback base URL | `https://your-app.vercel.app` (no trailing slash). In X Developer Portal, set callback to `https://your-app.vercel.app/api/auth/callback/twitter`. |
| `X_CLIENT_ID` | X (Twitter) OAuth app | From [developer.x.com](https://developer.x.com/) → your app → OAuth 2.0. |
| `X_CLIENT_SECRET` | X (Twitter) OAuth app | Same app → OAuth 2.0. |

### Recommended (cron + links)

| Variable | Purpose | Example / notes |
|----------|---------|------------------|
| `CRON_SECRET` | Protects cron routes | Random string (e.g. `openssl rand -hex 32`). Same value in GitHub Actions secret if you use the scheduled workflow. If unset, cron routes accept any request. |
| `NEXT_PUBLIC_APP_URL` | Links in Slack / UI | `https://your-app.vercel.app` — used for “View Dashboard” and similar links. Falls back to `VERCEL_URL` if unset. |

### Optional (features work without them, with reduced behavior)

| Variable | Purpose | Default / notes |
|----------|---------|------------------|
| `MONGODB_DB` | Database name | `SmartTrader` (code) / often `myinvestments` in practice. |
| `MONGODB_URI_B64` | Base64-encoded MongoDB URI | Use if `MONGODB_URI` has special characters. |
| `MONGODB_STORAGE_LIMIT_MB` | Cleanup threshold (MB) | `512`. |
| `MONGODB_PURGE_THRESHOLD` | Purge when storage at this fraction | `0.75`. |
| `XAI_API_KEY` | Grok chat | Chat shows “Add XAI_API_KEY” if unset. |
| `XAI_MODEL` | Grok model | `grok-4`. |
| `WEB_SEARCH_API_KEY` or `SERPAPI_API_KEY` | Web search in chat | From [serpapi.com](https://serpapi.com/). |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Push notifications | From web-push; optional. |
| `SKIP_AUTH` | Bypass X sign-in | Set to `true` only for local/dev; do **not** use in production. |

**Note:** Slack webhook URLs are stored **per account** in the app (Automation → Alert Settings), not as env vars. CI build notifications use GitHub secret `SLACK_WEBHOOK_URL`, not Vercel.

## 4. Project settings to verify

- **Framework Preset**: Next.js.
- **Build Command**: `npm run build` (or leave default).
- **Output Directory**: leave default (Vercel infers Next.js).
- **Install Command**: `npm ci --legacy-peer-deps` if you use it locally.
- **Node.js Version**: 22.x (or set via `package.json` `engines.node`).
- **Environment Variables**: All required vars above set for Production (and Preview if needed).

## 5. Reproduce build locally

```bash
npm ci --legacy-peer-deps
npm run build
```

If this fails locally, fix the error first; same error will likely appear on Vercel.

## 6. Still stuck?

- Paste the **exact build error** (last 30 lines of the failed build log) and your **Project Settings → Build & Development** (screenshot or copy) so someone can pinpoint the issue.
- Check [Vercel Status](https://www.vercel-status.com/) for incidents.
