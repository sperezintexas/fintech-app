# GitHub Actions: Hourly Cron (Unified Options Scanner)

Use a **scheduled GitHub Actions workflow** to call your app’s unified-options-scanner endpoint at :15 past the hour during market hours (14:15–20:15 UTC ≈ 9:15–3:15 ET) on weekdays. Works with **AWS EB** (Agenda runs natively) or **Vercel** (no Vercel Pro needed for hourly cron).

## 1. Add GitHub secrets and variables

In your repo:

1. Go to **Settings → Secrets and variables → Actions**.
2. **Secrets** tab:
   - **New repository secret** → Name: `CRON_SECRET`, Value: same as `CRON_SECRET` in your app env (EB: `eb setenv` / Console; Vercel: Project env). Generate with `openssl rand -hex 32` if needed.
3. **Variables** tab:
   - **New repository variable** → Name: `APP_URL`, Value: your production URL (e.g. EB: `https://myinvestments-prod.us-east-1.elasticbeanstalk.com` or Vercel: `https://your-app.vercel.app`), no trailing slash. Same as CI health check.

## 2. Workflow file

The workflow is in `.github/workflows/cron-unified-scanner.yml`. It:

- Runs on a **schedule**: 14:15, 15:15, 16:15, 17:15, 18:15, 19:15, 20:15 UTC, Mon–Fri.
- Can also be run **manually**: Actions → “Cron – Unified Options Scanner” → “Run workflow”.

Each run does a single `GET` to `APP_URL/api/cron/unified-options-scanner` with `Authorization: Bearer <CRON_SECRET>`.

## 3. Vercel only: keep cron once per day (optional)

If you use Vercel: with GitHub Actions hitting the endpoint hourly, you can leave the Vercel cron in `vercel.json` as **once per day** (`15 15 * * 1-5`) or remove it and rely only on GitHub Actions. On **AWS EB**, Agenda runs natively—no cron route needed for scheduler jobs.

## 4. Change schedule

To run at different times, edit `.github/workflows/cron-unified-scanner.yml` and adjust the `schedule` entries (POSIX cron, UTC). Example: only 15:15 and 19:15 UTC:

```yaml
on:
  schedule:
    - cron: "15 15 * * 1-5"
    - cron: "15 19 * * 1-5"
  workflow_dispatch:
```

## 5. Troubleshooting

- **401 Unauthorized:** `CRON_SECRET` in GitHub must match `CRON_SECRET` in your app (EB or Vercel env).
- **Empty APP_URL / CRON_SECRET:** Add `vars.APP_URL` and `secrets.CRON_SECRET` under Settings → Secrets and variables → Actions.
- **Runs not firing:** Scheduled workflows run on the **default branch**; ensure the workflow file is on that branch.
