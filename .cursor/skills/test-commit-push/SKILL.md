---
name: test-commit-push
version: "1.0.7"
description: Safe local dev → git workflow. Run tests, typecheck, lint, gitleaks; fix failures; bump app version when asked; generate conventional commit; suggest git add/commit/push. Use when preparing to commit, pushing changes, or when the user asks to test-commit-push.
---

# Test-Commit-Push Workflow

Safe, fast local development → git workflow. Follow this exact sequence — do NOT skip steps.

## 1. Validate (Simulate / Run)

Run these in order and reason about results (from repo root):

- **pnpm projects:** `pnpm test`, `pnpm run typecheck`, `pnpm run lint`
- **npm-only:** `npm test` (or `vitest run`, `jest`), `npm run typecheck` or `npx tsc --noEmit`, `npm run lint` (or `eslint src`)
- **Secrets check:** `pre-commit run gitleaks --all-files` or `gitleaks protect --no-git --config .gitleaks.toml --staging` (if pre-commit not installed). Must pass before commit so the commit hook does not block.

**Never assume tests pass without reasoning.** Inspect output and mentally verify.

## 2. Fix Failures

If any test, typecheck, lint, or gitleaks check would fail:

- **Tests/typecheck/lint:** Propose fixes as diffs; iterate until everything would pass.
- **Gitleaks (leaks found):** Remove or externalize real secrets (env vars, secrets manager). For known-safe values (e.g. localhost MongoDB fallback in a script), add the path to the allowlist in `.gitleaks.toml` under `[allowlist] paths`.
- If tests would clearly fail and you cannot fix in one shot, say so and stop.

## 3. Commit & Push (Only After Validation Passes)

Pre-commit hooks (including gitleaks) will run on `git commit`. Running the gitleaks check in step 1 avoids surprises at commit time.

### App Version Bump (When Requested)

If the user asks to **bump app version** (or "bump version", "update version"):

1. **Before** `git add`, bump the version:
   - **Single package:** `npm version patch --no-git-tag-version` (updates `package.json` and optionally `package-lock.json`).
   - **pnpm workspace with frontend app:** Bump both root `package.json` and `apps/frontend/package.json` to the same new version (e.g. `2.0.0` → `2.0.1`). Root holds the workspace; frontend version is used for `NEXT_PUBLIC_APP_VERSION`. Run from root: `npm version patch --no-git-tag-version`, then set the same `"version"` in `apps/frontend/package.json`.
2. Include updated `package.json` (and lockfile if changed) in the commit.
3. Optionally mention the new version in the commit message, e.g. `chore(release): bump v2.0.1`

### Conventional Commit Message (One Line)

- Angular-style: `feat:`, `fix:`, `refactor:`, `chore:`, `test:`, `docs:`, etc.
- **One line only**, max 72 characters: `type(scope): short description`
- No body; if change touches multiple areas, use a more generic type or suggest multiple commits

### Git Commands (Exact Order)

If you bumped version in this run, `git add` will include `package.json` (and `package-lock.json`).

```bash
git add .
git commit -m "type(scope): short description"
git push origin HEAD
```

For a new branch: `git push --set-upstream origin <branch>` instead of `git push origin HEAD`.

## 4. Output Format

1. **Code fixes** (as diffs) — if any
2. **Proposed commit message** — one line (max 72 chars)
3. **Exact terminal commands** — in the order above
4. **(Optional)** One-sentence explanation for the commit message

## Constraints

- **Never run destructive commands**: no `rebase -i`, `reset --hard`, `push --force`, etc.
- **Current branch**: Assume user is on a feature/bugfix branch unless told otherwise
- **Project context**: Next.js, TypeScript; pnpm workspace (root + apps/frontend) or npm; typically vitest or jest
