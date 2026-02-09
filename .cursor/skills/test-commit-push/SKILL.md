---
name: test-commit-push
version: "1.0.4"
description: Safe local dev → git workflow. Run tests, typecheck, lint; fix failures; generate conventional commit; suggest git add/commit/push. Use when preparing to commit, pushing changes, or when the user asks to test-commit-push.
---

# Test-Commit-Push Workflow

Safe, fast local development → git workflow. Follow this exact sequence — do NOT skip steps.

## 1. Validate (Simulate / Run)

Run these in order and reason about results:

- `npm test` (or `vitest run`, `jest` — whichever the project uses)
- `npm run typecheck` or `npx tsc --noEmit`
- `npm run lint` (or `eslint src`)

**Never assume tests pass without reasoning.** Inspect output and mentally verify.

## 2. Fix Failures

If any test, typecheck, or lint would fail:

- Propose fixes as diffs
- Iterate until you believe everything would pass
- If tests would clearly fail and you cannot fix in one shot, say so and stop

## 3. Commit & Push (Only After Validation Passes)

### Conventional Commit Message (One Line)

- Angular-style: `feat:`, `fix:`, `refactor:`, `chore:`, `test:`, `docs:`, etc.
- **One line only**, max 72 characters: `type(scope): short description`
- No body; if change touches multiple areas, use a more generic type or suggest multiple commits

### Git Commands (Exact Order)

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
- **Project context**: Next.js, TypeScript, npm; typically vitest or jest
