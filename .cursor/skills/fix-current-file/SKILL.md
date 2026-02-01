---
name: fix-current-file
description: Fix all lint, type, and logical errors in the current file. Apply fixes directly. Use after writing or refactoring code, or when the user asks to fix errors in the active file. Mentally applies ESLint --fix patterns and type-check corrections.
---

# Fix Current File

## When to Use

- Right after writing or refactoring code in a file
- When the user asks to fix errors in the current/active file
- When lint or type diagnostics appear in the editor

## Workflow

1. **Read the current file** and any linter/type diagnostics.
2. **Apply fixes directly**—edit the file in place. Do not suggest; apply.
3. **Mentally run ESLint --fix**—apply auto-fixable patterns before or alongside manual fixes.
4. **Iterate** until lint, type, and logical errors are resolved.

## Fix Categories

### Lint (ESLint)

Apply these patterns proactively:

- **Unused vars/args**: Prefix with `_` (e.g. `_unused`, `_req`) per project config.
- **`any`**: Replace with proper types (`unknown`, specific types, or generics).
- **Formatting**: Match project style (Prettier preferences, semicolons, quotes).
- **Other auto-fixable rules**: Apply the fix ESLint would apply.

### Type (TypeScript)

- Add missing types to parameters, returns, and variables.
- Fix `null`/`undefined` handling (optional chaining, nullish coalescing, guards).
- Resolve type mismatches and narrowing issues.

### Logical

- Fix wrong conditionals, off-by-one, inverted logic.
- Add missing null/undefined checks.
- Correct async/await or promise handling.

## Rules

- **Apply fixes directly**—use search_replace or write; do not output "here's what to change" without editing.
- **Minimal scope**—fix only the current file; do not refactor unrelated code.
- **Prefer targeted edits**—small, precise changes over broad rewrites.
- **Run mentally**—simulate ESLint --fix and tsc; apply corrections without requiring the user to run commands first.

## After Fixing

Optionally run validation to confirm:

```bash
npm run lint -- --fix
npx tsc --noEmit
```

If errors remain, fix and re-run until green.
