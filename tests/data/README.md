# Test data for broker import tests

Checked-in, **randomized/sanitized** fixtures only. Same structure as `data/merrill-test` and `data/fidelity` but with placeholder account refs and symbols so CI and remote tests pass without real data.

- **merrill/** — Merrill Edge format: `Holdings.csv`, `Activities.csv`, `import-config.json`. Account refs: `AA-11111`, `BB-22222`. Symbols: `XYZ`, `ABC`, `DEF`, `IIAXX`.
- **fidelity/** — Fidelity format: `FidelityActOrdersHistory.csv`, `import-config.json` (activities-only). Account refs from Account Number last 4: `1111`, `3333`, `4444`.
- **fidelity/importActOrders/** — Same format; `FidelityActOrdersHistory.csv` + `import-config.json`.

Do not add real account numbers or real symbols here. Use these paths in tests via `path.join(REPO_ROOT, "tests", "data", ...)`.
