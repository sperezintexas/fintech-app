---
name: update-merrill
description: Prep a new broker import config file for a Merrill or Fidelity update and output the exact command line to run. Use when the user has a new CSV export and wants to run broker-import (activities and/or holdings).
---

# Update Merrill (Broker Import Config Prep)

When the user wants to run a broker import (Merrill or Fidelity) with a new CSV export, create a config file and show the command to execute.

## 1. Gather Input

- **CSV path**: Filename or path of the new export (e.g. `ExportData11022026120448.csv`). If the user gives a full path, use only the filename for the config (paths in config are relative to the config file directory).
- **Broker**: `merrill` or `fidelity`.
- **Scope**: Activities only (typical for “activity update”), or holdings + activities. For activities-only, omit `holdings` from the config.
- **Options** (defaults): `recomputePositions: true`, `replaceExisting: true` for a full replace/update.

If the user doesn’t specify, assume: **activities only**, **Merrill**, **replaceExisting + recomputePositions true**.

## 2. Config File Location and Name

- **Directory**: Prefer `data/merrill-test/` for Merrill or `data/fidelity-test/` (or `data/merrill-test/`) for Fidelity. Reuse existing dirs if present (e.g. `data/merrill-test/`).
- **Filename**: Descriptive and unique, e.g.:
  - `import-config-export-1102.json` (by short date)
  - `import-config-YYYYMMDD.json`
  - `import-config-ExportData1102.json`
  Avoid overwriting the default `import-config.json` unless the user asks to replace it.

## 3. Config JSON Shape

Paths inside the config are **relative to the config file’s directory**. So if the config is `data/merrill-test/import-config-export-1102.json`, use `"path": "ExportData11022026120448.csv"` (same folder).

**Activities only (typical for “activity update”):**

```json
{
  "activities": {
    "path": "YOUR_EXPORT.csv",
    "broker": "merrill",
    "recomputePositions": true,
    "replaceExisting": true
  }
}
```

**Holdings + activities:**

```json
{
  "holdings": {
    "path": "Holdings_MMDDYYYY.csv",
    "broker": "merrill"
  },
  "activities": {
    "path": "ExportData....csv",
    "broker": "merrill",
    "recomputePositions": true,
    "replaceExisting": true
  }
}
```

For Fidelity, set `"broker": "fidelity"`. If Fidelity holdings have no Account column, add under top level: `"fidelity": { "holdingsDefaultAccountRef": "ACCT_REF" }`.

## 4. Write the Config and Show Commands

1. Create the config file at the chosen path with valid JSON (no trailing commas, quoted keys).
2. Output the **exact command(s)** the user can copy-paste.

**Local (default .env.local):**

```bash
pnpm run broker-import data/merrill-test/import-config-export-1102.json
```

**Preview only (no DB write):**

```bash
pnpm run broker-import data/merrill-test/import-config-export-1102.json --preview
```

**Production DB:**

```bash
ENV_FILE=.env.prod pnpm run broker-import data/merrill-test/import-config-export-1102.json
```

Use the **actual config path** you created in place of `data/merrill-test/import-config-export-1102.json`.

## 5. Reminders to Include

- Ensure the CSV is in the **same directory** as the config file (or adjust `path` if using a subpath).
- App **accounts** must have **accountRef** matching the broker (e.g. `51X-98940`) so the import can map; create or fix accounts in the app first if needed.
