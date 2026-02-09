---
name: test-lint
version: "1.0.0"
description: Run npm test, npm run lint -- --fix, tsc --noEmit. On failure, fix code in-place and re-run until green. Use when validating changes, enforcing TDD, or when the user asks to run tests/lint/typecheck.
---

# Test-Lint Validation Loop

## Workflow

1. Run validation commands in order:
   ```bash
   npm test
   npm run lint -- --fix
   npx tsc --noEmit
   ```
2. If any command fails:
   - Parse the output for file paths and line numbers
   - Fix only touched/changed files (scope to the diff or files mentioned in errors)
   - Apply fixes as code diffs
   - Re-run the failing command(s) until all pass
3. Do not stop after the first fix—iterate until all three commands succeed.

## Scope

- Focus fixes on files that caused the failure (test files, source files, config files)
- Do not refactor unrelated code
- Prefer minimal, targeted edits

## Output Format

When done:

1. **Fixed code diffs** – Show only the changes made (unified diff or before/after snippets)
2. **Final terminal commands** – The three commands that now pass:
   ```bash
   npm test
   npm run lint -- --fix
   npx tsc --noEmit
   ```

## Notes

- `npm run lint -- --fix` passes `--fix` to ESLint (auto-fixes where possible)
- `tsc --noEmit` checks types without emitting output
- Run commands yourself; do not ask the user to run them
- For scanner changes, run the relevant test file: `npm test -- src/lib/__tests__/covered-call-analyzer.test.ts`, `npm test -- src/lib/__tests__/option-scanner.test.ts`, or `npm test -- src/lib/__tests__/unified-options-scanner.test.ts`
