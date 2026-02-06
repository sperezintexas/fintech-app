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

## 3. Project settings to verify

- **Framework Preset**: Next.js.
- **Build Command**: `npm run build` (or leave default).
- **Output Directory**: leave default (Vercel infers Next.js).
- **Install Command**: `npm ci --legacy-peer-deps` if you use it locally.
- **Node.js Version**: 22.x (or set via `package.json` `engines.node`).
- **Environment Variables**: All required vars (e.g. `MONGODB_URI`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`) set for the environment you’re deploying (Production / Preview).

## 4. Reproduce build locally

```bash
npm ci --legacy-peer-deps
npm run build
```

If this fails locally, fix the error first; same error will likely appear on Vercel.

## 5. Still stuck?

- Paste the **exact build error** (last 30 lines of the failed build log) and your **Project Settings → Build & Development** (screenshot or copy) so someone can pinpoint the issue.
- Check [Vercel Status](https://www.vercel-status.com/) for incidents.
