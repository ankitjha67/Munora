# Munora

Local-first household finance dashboard for Windows, a Monarch/SharkFin-style
app built with Electron + React. All data lives in one JSON file on your PC.

Docs: [PRD](../PRD.md) · [Engineering context](../CONTEXT.md)

## Run (development)

```bash
npm install
npm run dev        # Vite + Electron window with hot reload
```

Other commands:

| Command | What it does |
|---|---|
| `npm run dev:web` | Browser-only mode at http://localhost:5173 (data in localStorage) |
| `npm run typecheck` | TypeScript check |
| `npm run build` | Production renderer bundle → `dist/` |
| `npm run start` | Electron against the built `dist/` (no dev server) |
| `npm run dist` | Build + package NSIS Windows installer → `release/` |

First launch offers **demo data** (a realistic sample household: 2 earners,
2 properties, ~21 months of history) or an empty file.

## Where your data lives

- Desktop app: `%APPDATA%/Munora/munora-data.json` (+ `.bak` backup written on
  every save). Settings → Data → "Open data folder".
- Backup = copy that file, or Settings → Export backup.

## Features

- **Transactions**, search, filter chips (needs review / uncategorized / split
  / hidden), type/account/category/tag filters, add/edit drawer with splits,
  bulk categorize/review/hide/delete, CSV import with column mapping, dedupe
  and merchant-category learning.
- **Cash flow**, Sankey (income sources → hub → savings + expense groups) or
  expandable Profit & Loss table with % of income; income/expense rankings by
  category, group, or merchant; click anything to see its transactions.
- **Spending**, stat cards, donut + ranked breakdown (groups/categories/
  merchants), monthly/cumulative trend, click-to-chart categories, click a
  month for its transactions.
- **Net worth**, assets/liabilities stat cards, net-worth-over-time area chart
  (or by-type lines), expandable asset/liability groups.
- **Accounts**, grouped by type, hidden toggle, add/edit drawer; valued
  accounts (investments/retirement/real estate/loans) track month-end balances.
- **Loans**, rate, detected monthly payment, paid-off %, balance history chart.
- **Properties**, per-property page: cash flow, income vs expenses, equity,
  biggest expenses, transactions.
- **Mutual Funds** (INVESTING): live AMFI/mfapi.in data: search all ~40k
  schemes, fund detail with NAV chart + 1M/6M/1Y/3Y/5Y returns, watchlist
  comparison, per-category top-performer screens, new-listing discovery. Data
  screens only, not investment advice.
- **Import statement** (DATA): drop a PDF, CSV or image bank/mutual-fund
  statement. Text via pdfjs, scanned pages via Tesseract OCR, a bank-format
  detector, then retrieval categorization (your rules, your history, a built-in
  merchant list) with an optional local Ollama / OpenAI-compatible model for the
  uncertain rows. Review, then commit; confirmed categories become rules.
- **Profiles & household**: each account has an owner; a sidebar switcher scopes
  every page to one person or the combined household. Net worth shows a
  per-person breakdown with a combined total.
- **Planning / FIRE**: FIRE number, savings rate, progress, years to
  independence, and a projected-net-worth chart.
- **Multi-currency** with live FX conversion, **regional terminology** (US / IN /
  UK), region-specific **investment vehicles**, and a **dark mode** (light / dark
  / system).

## Notes

- If Electron says "failed to install correctly", run
  `node node_modules/electron/install.js` (or extract the cached zip from
  `%LOCALAPPDATA%/electron/Cache` into `node_modules/electron/dist` and write
  `path.txt` containing `electron.exe`).
- Vite is pinned to `127.0.0.1:5173` so the Electron dev launcher's `wait-on`
  works on machines where `localhost` resolves to IPv6 only.
