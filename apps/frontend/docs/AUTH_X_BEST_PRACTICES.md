# Auth via X (Twitter) – best practices

## Current setup (summary)

- **NextAuth v5** with **Twitter (X) provider** (OAuth 2.0) + **Credentials** (access key / email–password).
- **JWT session** in an **httpOnly cookie** with `path: "/"`, `sameSite: "lax"`.
- **Allowlist**: only X usernames in `auth_users` can sign in with X.
- **Middleware (proxy)** runs on some routes and redirects to `/contact` when it doesn’t see a session; many app/API routes are excluded so they don’t depend on middleware for auth.

## X (Twitter) OAuth – good practices you’re already following

1. **OAuth 2.0** – NextAuth’s Twitter provider uses X’s OAuth 2.0; no need to change.
2. **Restricted sign-in** – `signIn` callback + `isAllowedXUsername()` so only allowlisted X users can sign in.
3. **Custom sign-in/error page** – `pages: { signIn: "/contact", error: "/contact" }` for a single entry point.
4. **Session cookie** – `path: "/"` so the cookie is sent on all same-origin requests (pages and API). New logins get this; existing sessions may need a fresh sign-in.
5. **No secrets in client** – JWT in httpOnly cookie; client only talks to your API and `/api/auth/*`.

## Recommended patterns

### 1. Session in one place: cookie with path=/

- Use a **single session cookie** with **path: "/"** so every same-origin request (page + API) sends it. You’ve set this in `cookies.sessionToken.options` in `auth.ts`.
- Avoid any cookie with a path like `/api/auth` only; that causes 401s on other API routes and “redirect to login” when middleware can’t see the session.

### 2. Prefer route-level auth over middleware for “must be logged in”

- **Middleware** is best for: security headers, redirects for *public* vs *private* **pages** when the session is reliably available. When the middleware doesn’t receive the same cookie (e.g. due to how Next.js passes the request), you get redirects to login even when the user is logged in.
- **Route-level auth** is more reliable for:
  - **API routes**: in the handler, call `getSessionFromRequest(request)` (or the auth wrapper when it works) and return 401 when there’s no session.
  - **Pages**: in the page or layout, call `auth()` and redirect to `/contact` or show a “Sign in” state if no session.
- Your current approach (excluding many routes from the proxy and using `getSessionFromRequest` in API handlers) follows this idea: don’t rely on middleware for session checks on those routes.

### 3. X Developer Portal and env

- **Callback URL**: must match exactly what you use, e.g. `https://yourdomain.com/api/auth/callback/twitter` (and same for localhost in dev). You already normalize `AUTH_URL`/`NEXTAUTH_URL` to the origin in `auth.ts`.
- **App permissions**: request only what you need (e.g. read user identity). No need for tweet/post if you only do “Sign in with X”.
- **Env**: use `X_CLIENT_ID` and `X_CLIENT_SECRET` (or `AUTH_TWITTER_ID` / `AUTH_TWITTER_SECRET` if you prefer). Keep them in `.env.local` and never in the client.

### 4. Credentials provider (access key / email–password)

- Validating credentials via your own `/api/auth/validate-credentials` with a server-side secret is a good pattern.
- Keep **access keys** and **passwords** out of the JWT; store only what’s needed for identity (e.g. user id, name) in the session.

### 5. If cookie/session issues persist: database sessions (optional)

- With **JWT strategy**, the session is in the cookie; decoding is stateless. If you keep hitting issues with the cookie not being sent or read in some contexts, you can consider **database sessions** (NextAuth `session: { strategy: "database" }` + an adapter). Then the cookie only holds a session id; the server looks up the session on each request. That can behave more consistently across middleware, API routes, and server components, at the cost of a DB read per request.
- For most apps, fixing the cookie (path=/, re-login) and using route-level auth is enough; only consider DB sessions if you need stricter consistency or revoke-on-logout semantics.

## What to avoid

- **Don’t** rely on middleware as the only place that “protects” app pages if the same middleware can’t read the session cookie; you’ll get “redirect to login” loops.
- **Don’t** set the session cookie to `path: "/api/auth"`; then only auth routes get the cookie.
- **Don’t** put X API keys or secrets in the client; they belong only in server env.

## Summary

Your setup (X OAuth + Credentials, JWT, cookie path=/, allowlist, custom pages) is aligned with good practice. The main improvements are: (1) keep session cookie at `path: "/"` and have users re-login once to pick it up, and (2) do auth in route handlers (and optionally in page/layout) rather than depending on middleware for session checks on API and key app routes. Optionally consider database sessions only if cookie/session consistency remains a problem after that.
