# Nestworth, Product Requirements Document

> **Status:** Living document, updated as the product evolves.
> **Last updated:** 2026-09-27 (v0.6, schema v2). Built and verified this pass:
> an **AI assistant chat** grounded in the user's own numbers (§5.22), an **AI fund
> overlap checker** with grounded alternatives (§5.23), and **hardened always-on
> dedupe** (fuzzy + batch + commit guard) for shared/overlapping statements (§5.14).
> Prior pass: email statement & alert import, CRED-style, incl. password-protected PDFs
> (§5.21), a currency-match guard so imports land in the right currency (§5.21),
> Transactions Group By + advanced filters (§5.2), and higher LLM input/output
> token limits with active-model verification (§5.14). Earlier passes shipped the
> OCR statement pipeline (§5.14), profiles + household aggregation (§5.15),
> regional investment vehicles (§5.16), the slate/indigo theme + dark mode (§5.17),
> Planning/FIRE (§5.18), and Android/iOS via Capacitor (§5.20). Em dashes and
> sparkle/AI icons removed throughout. Stock Research integration and live
> bank-feed sync are still pending.
> **Name:** "Nestworth" (nest egg + net worth), applied across the app,
> package, and installer. Icon is an indigo growth-bars mark (`app/build/icon.svg`,
> rasterized to `icon.png` for the installer). Alternatives and generative-tool
> prompts are in `BRANDING.md`. Rename via `APP_NAME` + `package.json`.

---

## 1. Overview

Fathom is a **local-first household finance dashboard for Windows**, closely modeled on
"SharkFin" (a personal Monarch-style dashboard shared on Reddit, built on React +
Actual Budget + SimpleFin). Fathom reproduces the same experience as a standalone
desktop application:

- A beautiful, fast dashboard for **transactions, cash flow, spending, and net worth**.
- **All data stored locally** on the user's machine, full ownership, no cloud account.
- **Per-property tracking** (e.g. rentals) with their own mini-dashboards.
- Extensible sync layer so bank feeds (SimpleFin) and Actual Budget can be added later.

Reference screenshots live in the project root (`i-built-my-own-monarch-style-*.webp`)
and are the canonical visual spec.

## 2. Problem & goals

Monarch and similar tools are subscription cloud services; users give up data
ownership. Actual Budget owns the data problem but its UI is budget-centric, not
dashboard-centric. The goal is Monarch-quality *reporting and insight* on top of
locally owned data.

**Goals (v1):**
1. Windows desktop app that opens instantly to a household finance overview.
2. Four core analysis pages, Transactions, Cash flow, Spending, Net worth, at
   visual and functional parity with the reference screenshots.
3. Local JSON data file the user can read, back up, and version themselves.
4. Rich demo dataset out of the box so the app demos perfectly before any real data.
5. Manual data entry + CSV import as the first real data paths.

**Non-goals (v1):**
- No cloud sync, no accounts/login. ~~No mobile app~~ *(dropped 2026-09-27:
  Android + iOS apps ship via Capacitor from the same codebase, 100% on-device,
  offline-first, see §5.20 and `MOBILE.md`)*.
- No live bank connections (SimpleFin/Actual adapters are a later phase).
- No budgeting/envelope features, this is a *reporting* dashboard first.
- ~~No multi-currency~~ *(dropped 2026-09-27: multi-currency with live FX shipped, see §5.12)*. Historical
  balances still convert at the **current** rate (no per-date FX history), acceptable v1 limitation.

## 3. Target user

- A household "CFO" comfortable installing a desktop app; possibly owns rental
  property; wants month-over-month cash flow, spending drill-downs, and net worth
  trend without handing data to a SaaS.

## 4. Reference product analysis (from screenshots + Reddit post)

| Element | Observed behavior |
|---|---|
| Shell | Left sidebar: Transactions, Cash flow, Spending, Net worth, Accounts, Loans, Uncategorized (badge), PROPERTIES section (one entry per property), Sign out. Orange highlight for active item. |
| Header | Page title, sync-status line ("Synced with Actual …, Banks synced …"), date-range stepper `‹ Jan 2026 - Sep 2026 ›`, preset dropdown ("Year to date"), "Sync banks" button. |
| Transactions | Search, quick filter chips (All / Needs review / Uncategorized / Split / Hidden), dropdown filters (types, accounts, categories, tags), "+ Add transaction", summary line ("757 transactions · $250,906.78 in · $130,731.27 out · 9 need review"), date-grouped table: merchant w/ logo chip, category, account, amount. Split badge; "Uncategorized" rendered in orange. |
| Cash flow | "Where the money went": Sankey (income sources → Income node → Savings + expense groups) with Groups/Categories/Both toggle and Sankey vs Profit & loss view toggle. P&L table: expandable Income/Expenses rows, "% of income" column. Below: Income panel (Category/Merchant toggle) and Expenses panel (Group/Category/Merchant) as ranked bar lists. |
| Spending | Stat cards: Total spending, Average per month, Largest group (with % of spending), Transaction count. "Spending breakdown": donut (center total) + legend + ranked horizontal bars "Category · Group  $amount  %". Groups/Categories/Merchants toggle. "Spending trend" section: monthly bars / cumulative line; click a month → its transactions. |
| Net worth | Stat cards: Net worth (as-of note), Change this period (green, "+$120,175.51 since start"), Assets, Liabilities. "Net worth over time" area chart with dot markers; Net worth / By type toggle; account-scope dropdown. Assets & Liabilities sections listing type groups (Real estate, Retirement, Investments, Cash) → expandable to accounts, chart overlay pickers. |
| Properties | Each property gets a page: its cash flow month/month, biggest expenses; only *net* cash flow feeds the main budget (per the post). |
| Branding | Logo chip + wordmark, tagline ("Household finances at a glance"). Cream background, white cards, orange accent, green/red money semantics, Inter-like typeface. |

## 5. Feature specification (v1)

### 5.1 App shell
- Sidebar (240px): logo + name; nav items with icons and count badges
  (Transactions → needs-review count; Uncategorized → uncategorized count);
  PROPERTIES section auto-lists properties; Settings at bottom (replaces "Sign out").
- Header per page: title, data-status line ("Local file · saved 3:10 PM"), global
  **date-range control**: stepper arrows shift the window, label shows resolved
  range, preset menu: This month, Last month, Last 3 months, Last 6 months,
  Year to date, Last 12 months, All time. Range is global app state.
- Window: frameless-optional later; standard OS chrome v1; min 1100×700.

### 5.2 Transactions page
- Filter row: text search (merchant/notes/category/amount), chips (All, Needs
  review, Uncategorized, Split, Hidden), selects (type: income/expense/transfer,
  account, category, tag).
- Summary line: count, money in, money out, needs-review count (click → filter).
- Table grouped by day (sticky day headers with daily total), rows: merchant
  initial-chip (colored), merchant + note snippet, category pill (orange
  "Uncategorized" if none), account, signed amount (green for income).
- Row click → edit drawer: date, merchant, amount, account, category, tags,
  notes, needs-review toggle, hide, split editor (child rows must sum to parent).
- "+ Add transaction" → same drawer, blank.
- Checkbox multi-select → bulk bar: set category, mark reviewed, hide, delete.
- **Group By + advanced filters *(added + shipped 2026-09-27)*:** a Group By control
  (None, Month, Category, Category group, Merchant, Account, Type, Tag, Owner, Review
  status) renders collapsible sections with per-group counts and subtotals; auto-collapse
  when more than 10 groups. A Sort control (Newest/Oldest, Amount high/low, Merchant A–Z)
  and a min/max amount range join the existing filters, with a one-click Clear filters.

### 5.3 Cash flow page
- View toggle: **Sankey** | **Profit & loss**; grouping toggle: Groups | Categories | Both.
- Sankey: income category nodes → "Income" hub → expense group nodes (+ implicit
  **Savings** node = income − spending when positive); node labels show name,
  amount, % of income; hover highlights link; click node → transactions modal.
- P&L: table with Income (expandable to categories) and Expenses (expandable to
  groups → categories), columns: % of income, amount; Savings row at bottom.
- Income panel: ranked bars by category or merchant. Expenses panel: ranked bars
  by group / category / merchant. Both show amount + share %.

### 5.4 Spending page
- Stat cards: Total spending, Average per month (full months in range), Largest
  group + % share, Transaction count (expense tx only).
- Breakdown: donut with center total + ranked bar list, mode Groups /
  Categories / Merchants; clicking a slice/row toggles its inclusion in the
  trend chart below and reveals a per-item trend line.
- Spending trend: monthly bar chart (or cumulative line toggle) for the range;
  clicking a month opens that month's expense transactions (modal).

### 5.5 Net worth page
- Stat cards: Net worth (as of range end), Change this period (Δ vs range start,
  green/red), Assets, Liabilities.
- Chart: area/line of month-end net worth across range; toggle **Net worth** |
  **By type** (stacked lines per account type); account-scope dropdown (All
  accounts / just one type / single account).
- Assets & Liabilities panels: rows per type group (Real estate, Retirement,
  Investments, Cash / Credit, Loans, Mortgages) with current total and count,
  expandable to accounts with balance + trend sparkline.

### 5.6 Accounts page
- Card grid or list grouped by type: name, institution, masked number, balance,
  last-activity date, hidden toggle; add/edit account drawer (name, type,
  institution, opening balance/date, interest rate for loans, linked property).
- Balance history for non-transactional accounts (investments, real estate):
  editable month/valuation rows ("mark to market").

### 5.7 Loans page
- Table of loan/credit accounts: balance, rate, original principal, paid %,
  monthly payment (detected from transactions), payoff projection (simple
  amortization at current payment); balance-over-time chart per loan.

### 5.8 Properties
- Settings: create property (name, linked valuation account, linked mortgage
  account, linked income category, linked expense group).
- Property page: stat cards (This-range cash flow, Income, Expenses, Equity =
  valuation − mortgage), monthly income vs expense bars, net cash flow line,
  expense breakdown list, recent transactions.

### 5.9 Uncategorized (nav shortcut)
- Opens Transactions pre-filtered to uncategorized; badge shows count within
  **All time** (not current range) so nothing gets lost.

### 5.10 Investing module *(added 2026-09-27 per user request)*

New sidebar section **INVESTING** with two features:

**A. Mutual Funds explorer**, "all fund types and their details in one place"
- Data source: **AMFI via mfapi.in** (free, keyless, covers every Indian scheme , 
  equity, debt, hybrid, ELSS, index, FoF, liquid…). NAVs are INR; page renders ₹
  regardless of app currency. US/global funds: future provider seam.
- **Freshness model** *(added 2026-09-27)*: AMFI publishes NAVs once per business
  day. Per-scheme NAV history caches for **6h**, then revalidates on access; the
  **watchlist** persists a summary cache (localStorage) for instant paint, then
  refreshes stale rows in the background (stale-while-revalidate), revalidates on
  window focus, and has a manual "Refresh NAVs" + "NAVs as of <date>" indicator.
  Explore's category screens cache **24h** and re-run automatically after expiry.
- **Auto-discovery of new funds** *(added 2026-09-27)*: Explore rankings come from
  live searches, so newly tracked schemes rank in automatically; additionally a
  **"New listings"** tab downloads the full AMFI universe (~38k schemes, ~8 MB),
  diffs it against the saved baseline (auto ~weekly + manual "Scan now") and
  lists schemes AMFI started tracking since the last scan, click through to the
  fund modal / watchlist.
- Browse/search all schemes (name, AMC, category, scheme code); filter by
  scheme type & category.
- Fund detail: NAV chart (3M/1Y/3Y/5Y/Max), computed trailing returns (1M/6M/
  1Y/3Y/5Y CAGR), scheme info (AMC, category, ISIN, latest NAV & date).
- **Watchlist**: pin schemes; comparison table of watched funds (returns
  side-by-side, sortable).
- **Explore/top performers**: per-category leaders computed from a curated
  universe (~40 popular schemes) ranked by trailing returns, clearly labeled
  as data screens, **not personalized advice**; permanent disclaimer in UI:
  "Data from AMFI. Past performance ≠ future returns. Not investment advice."
- Caching: scheme list + NAV histories cached locally (24h TTL) so the page
  works offline after first load.

**B. Stock Research integration**, surface the user's existing
`E:\Python\Stock Research` command-center pipeline (TradingView screeners,
yfinance, 311-model quant engine, BUY/SELL/HOLD consensus scores) inside Fathom:
- **Phase A (file contract):** Fathom watches a `research/` drop folder for
  `market-report.json` (schema to be agreed: generated_at, indices[],
  commodities[], recommendations[] {symbol, market, verdict, confidence,
  models_agree}, regime). Renders a read-only "Stock Research" page; shows
  data age; deep-links to the full HTML artifact report.
- **Phase B (sidecar):** optional `uvicorn` FastAPI bridge in the Stock
  Research repo; Fathom triggers runs / pulls live JSON from
  `http://127.0.0.1:8787`. Out of scope until Phase A proves out.
- Fathom displays the pipeline's own signals verbatim with the same
  not-advice disclaimer; it never invents its own recommendations.

### 5.11 Multi-currency & live FX *(added + shipped 2026-09-27)*

- **Per-account currency** (`Account.currency`, ISO 4217; unset = base). All of an
  account's amounts, transactions, balances, loan figures, are denominated in it.
- **Base currency** (`settings.currencyCode`): every aggregate (spending, cash
  flow, Sankey, net worth, stat cards, day totals) converts into base.
- **Live rates**: keyless `open.er-api.com` (160+ currencies) with
  `frankfurter.dev` (ECB) fallback; USD-pivot table cached in the data file
  (`store.fx`); auto-refetched at launch when >12h old and any foreign-currency
  account exists; manual "Refresh rates" in Settings → Currency & live rates
  (shows source, timestamp, per-currency rates both directions). Offline → last
  cached table; unknown currency → 1:1 (flagged).
- **Display**: transaction rows / account rows / loan rows show **native**
  amounts (₹12,50,000 with Indian digit grouping via per-currency locale);
  converted base value shown as a small "≈" subline where useful. Totals always base.
- **Changing base** stamps the old base onto currencyless accounts (denominations
  are preserved and convert), and collapses accounts matching the new base to
  "unset", switching back round-trips cleanly.
- Demo data includes an INR account ("NRE Savings, SBI") so conversion is
  visible out of the box.

### 5.12 Regional finance terminology & glossary *(added + shipped 2026-09-27)*

- **Region setting** (`settings.region`: US / IN / UK / INTL) adapts labels
  app-wide via `lib/terms.ts`: account-type names (Checking ↔ Current accounts,
  Real estate ↔ Property, Retirement (401k·IRA) ↔ (EPF·PPF·NPS) ↔ Pensions),
  loan payment column (Monthly payment ↔ **EMI** ↔ Monthly repayment).
- **Numbers**: base INR + region India switches compact axis labels to
  **lakh/crore** (₹1.2L, ₹7.5Cr); Indian digit grouping everywhere via en-IN.
- **Glossary** card in Settings: side-by-side US / UK / India equivalents for
  ~12 concepts (checking/current, 401(k)/EPF/NPS, CD/FD, SIP, Demat, CIBIL,
  PAN, lakh/crore…), so the terminology switch is also documentation.

### 5.13 Data & settings
- **Storage:** single JSON document (schema-versioned) at
  `%APPDATA%/fathom/fathom-data.json`, atomic writes, rolling `.bak`; "Open data
  folder", Export/Import JSON backup buttons. (In browser dev mode: localStorage.)
- **Demo data:** deterministic generator produces the demo household (2 earners,
  2 properties, ~21 months, ~1,000 transactions, realistic merchants); first-run
  choice: "Start with demo data" vs "Start empty". "Reset to demo data" and
  "Erase all data" in Settings (both confirm).
- **CSV import:** map columns (date, merchant, amount or debit/credit, notes) →
  preview → import into chosen account; simple merchant→category auto-rule
  learning (exact merchant match). Dedupe by (account, date, amount, merchant).
- **Settings:** currency (default USD; INR, EUR, GBP presets), first day of
  month for "monthly" math (v1: calendar month), manage categories/groups
  (rename, recolor, merge), manage tags, manage properties, data tools.
- **Sync (stub):** header shows "Local data · saved <time>"; Settings has a
  disabled "Connect bank feed (coming soon)" panel documenting the SimpleFin /
  Actual Budget roadmap.

### 5.14 Statement import (OCR + retrieval categorization) *(added + shipped 2026-09-27)*

A dedicated **Import statement** page turns a bank or mutual fund statement into
categorized transactions, fully local and free. Implemented as a transparent
staged graph (LangGraph-style, in TypeScript): **ingest, detect, extract,
normalize, dedupe, categorize, review, commit**, with each stage's result shown
as a pill row.

- **Ingest:** PDF text via `pdfjs-dist`; scanned pages fall back to `tesseract.js`
  OCR; CSV and pasted text also supported. Nothing leaves the machine.
- **Detect:** a bank-format registry (Chase, BoA, Wells Fargo, Amex, Capital One,
  Citi, HDFC, ICICI, SBI, Axis, Kotak, Barclays, HSBC, Lloyds, Monzo, Revolut)
  plus currency-symbol sniffing sets region, date order and currency.
- **Extract:** one layout-tolerant parser finds date + money tokens per line and
  infers sign from Dr/Cr markers, running-balance deltas, parentheses, then
  keywords. Handles dd/mm, mm/dd, ISO and "27 Sep 2026" dates and Indian digit
  grouping.
- **Categorize (retrieval-augmented):** for each row it retrieves the best match,
  most trusted first, from (1) the user's learned **import rules**, (2) the
  user's transaction **history** (merchant to category), (3) a seeded worldwide
  **merchant knowledge base** (word-boundary matched). A canonical merchant name
  is always assigned; unsure rows are left for review.
- **Optional LLM assist, bring-your-own-key, any provider:** a provider registry
  (`lib/llmProviders.ts`) covers **frontier** (OpenAI, Anthropic/Claude, Google
  Gemini, xAI Grok, DeepSeek, Mistral), **cloud & aggregators** (OpenRouter,
  Groq, Together, Fireworks, Perplexity), **NVIDIA NIM**, and **local/open
  source** (Ollama, LM Studio, Jan, llama.cpp, vLLM, GPT4All), plus custom
  endpoints. Three wire protocols are implemented: OpenAI-compatible (most),
  Anthropic native (Claude), and Ollama native. Selecting a provider auto-fills
  its base URL and a default model; users can override and add their key (stored
  locally only). Hosted calls are proxied through the Electron main process so
  browser-origin CORS does not block them (Electron main-process proxy; a Vite
  dev-server proxy in the browser preview; `CapacitorHttp` on mobile). A **Test**
  button in Settings verifies connectivity. The model fills only uncertain rows,
  only on an explicit button press on the Import page. The API key is editable
  anytime (show/hide, Clear); the Model row and the key/Test row are aligned.
- **Model auto-discovery + verification:** an **Auto-pick best** button queries the
  provider's models (`/v1/models`, Ollama `/api/tags`, Anthropic `/v1/models`) and
  selects a fast, current model for this cheap classification task via a ranking
  heuristic (prefers mini/flash/haiku/8b/small/latest, deprioritizes opus/405b/70b/
  large), so users never type a model name. Because a listed model is not always
  callable on a given account, Auto-pick then **probes the top candidates with a live
  request** (each under a 15s timeout) and keeps the first that actually responds, so
  it never lands on a 404/unavailable model. A datalist offers the ranked list, and
  `resolveLlm` falls back to a sensible per-provider default if discovery is skipped.
- **Token limits:** discovery and categorization requests set explicit input/output
  limits so richer, currently-active models respond fully (Ollama `num_predict`/
  `num_ctx`, Anthropic/OpenAI `max_tokens` with a `max_completion_tokens` fallback):
  probes use a small budget for speed, categorization uses a larger one so long
  statements are classified in one pass.
- **Dedupe (always on) *(hardened 2026-09-27)*:** because family members often share
  statements covering overlapping periods, dedupe matches each row against **all**
  previously held records (any date), not just recent ones, and is **fuzzy**: same
  amount + same normalized merchant within a few days counts as the same transaction
  (an alert and the final statement can post on different days). It also dedupes
  **within the import batch** (two shared statements read together), flagging repeats
  and excluding them by default. A final **commit-time guard** drops any row that
  exactly matches an existing transaction in the target account even if it was
  re-enabled, so re-importing the same statement can never double-post.
- **Review + commit:** an editable table (include, merchant, category, amount,
  confidence/source badge) commits into a chosen account and **learns rules** from
  confirmed categorizations so the next import is smarter.
- **Committed transactions flow into every tab.** There is no separate "imported"
  bucket: commit appends ordinary `Transaction` records to the single store list, so
  they immediately populate the Transactions list, **Cash flow income/expense**
  (income when the assigned category is in an income group, else by amount sign),
  Spending, the Sankey and P&L, and account balances / **Net worth**
  (`openingBalance + Σ transactions`). Transfers detected during import are flagged so
  they are excluded from income/spending math. *Verified 2026-09-27: a pasted card
  email produced Salary → Paychecks (income), Shell → Gas and Swiggy → Restaurants
  (expenses), all appearing across Transactions, Cash flow and Spending.*
- **Currency-match guard *(added + shipped 2026-09-27)*:** amounts import in the
  target account's currency (no silent conversion), so the review step compares the
  statement's detected currency with the chosen account and, on a mismatch, shows a
  warning plus a one-click switch to an existing account in the statement's currency.
  Aggregates still roll every account up to the base currency via live FX. This keeps
  the numbers that flow into income/expense correct across currencies.

### 5.15 Profiles & household aggregation *(added + shipped 2026-09-27)*

- **Profiles** (people) own accounts (`Account.profileId`). A sidebar switcher
  scopes every page to one person or **Everyone (household)**, implemented as a
  memoized scoped-store view so the pure selectors need no changes.
- **Household combined total:** the Everyone view sums all profiles; Net worth
  adds a **By person** breakdown (each person's net worth + assets, with a
  combined total) so a family sees one revised number.
- Managed in Settings: add/rename/recolour people, set relationship
  (Self/Spouse/Partner/Child/Parent/Other), household name; deleting a person
  reassigns their accounts.

### 5.16 Investment vehicles by region *(added + shipped 2026-09-27)*

A vehicle catalog (`lib/vehicles.ts`) maps region-specific vehicles onto the
eight base account types, offered in the Add Account picker (region first):
US 401(k)/403(b)/Traditional & Roth IRA/HSA/529/I-Bonds; India
EPF/PPF/NPS/ELSS/MF-SIP/Demat/FD/RD/SSY/SGB/SCSS; UK ISA/Cash ISA/LISA/SIPP/
Premium Bonds/GIA; plus crypto, bonds, precious metals globally. The chosen
vehicle labels the account (e.g. "Fixed deposit (FD)") throughout.

### 5.17 Visual identity refresh *(added + shipped 2026-09-27)*

Redesigned away from the cream/orange reference look to a cool slate base with an
**indigo** primary and a full **dark mode** (light/dark/system, in Settings and a
header toggle). All colors are CSS tokens with a `[data-theme="dark"]` override.
Em dashes and sparkle/AI iconography removed across the UI; copy kept plain.

### 5.18 Planning / FIRE *(added + shipped 2026-09-27)*

The most-requested idea in the source thread. A **Planning** page computes the
FIRE number (annual spend / withdrawal rate), progress vs current net worth,
savings rate, and years/age to independence, with a projected-net-worth chart and
a target reference line. Assumptions (spending, withdrawal rate, real return,
age) are editable; investable assets exclude property. Respects the profile scope.

### 5.20 Android & iOS apps (added + shipped 2026-09-27)

The same React app runs as native mobile apps via **Capacitor**, staying 100%
local and offline-first.

- **Native project:** `app/android` (created with `cap add android`, branded via
  `@capacitor/assets`). iOS is added with `cap add ios` on a Mac. Scripts:
  `npm run cap:android` / `cap:ios` / `cap:sync`; `npm run mobile:assets`
  regenerates icons/splash from `build/icon.svg`. Full guide in `MOBILE.md`.
- **On-device storage:** a Capacitor storage adapter writes the single JSON store
  to app-private storage via `@capacitor/filesystem` (`nestworth-data.json`);
  `storage.ts` auto-selects it on native, Electron file store on desktop,
  localStorage in browser dev. Export/Import backup moves the file.
- **Offline + online:** everything (pages, charts, import, OCR, calculations) is
  local and works with no network. Optional online calls (mutual-fund NAVs, FX,
  import LLM) go through `CapacitorHttp` (native HTTP, no CORS) on device.
- **Responsive UI:** below 760px the sidebar becomes a slide-in drawer with a
  scrim, a top bar carries the menu/brand/theme, and a bottom tab bar carries
  Transactions / Cash flow / Spending / Net worth / More. Safe-area insets and
  `viewport-fit=cover` handle notches; stat grids and tables reflow/scroll.

### 5.19 Data & settings (updated)
- **Storage:** single JSON document at `%APPDATA%/fathom/fathom-data.json`
  (schema-versioned, migrated on load), atomic writes, rolling `.bak`. Browser
  dev mode uses localStorage.
- Settings now also manages: people & household, theme, AI model for import,
  learned import rules, saved **statement passwords**, and an optional **email
  inbox** (IMAP), in addition to currency, region, categories, tags, properties
  and data tools.

### 5.21 Email statement & alert import, CRED-style *(added + shipped 2026-09-27)*

Reads bank and credit-card **statements and transaction alerts straight from email**,
the way CRED ingests card statements, and feeds them through the same review/commit
pipeline as §5.14 so everything lands in the right tabs. Fully local: parsing happens
on the device and no mail contents leave it.

- **Three ways in, same pipeline.** (1) Drop or select exported `.eml` files;
  (2) paste an email body; (3) in the desktop app, **connect an inbox over IMAP**
  (`imapflow` in the Electron main process) with an app password and scan the last N
  days for known senders. Mobile uses share/export to `.eml` or paste (no always-on
  IMAP). `.eml` parsing uses `postal-mime`, which runs in the browser, Electron and the
  Capacitor WebView alike.
- **Sender registry + parser.** A registry of issuers (HDFC, ICICI, SBI, Axis, Chase,
  Amex, Citi, Barclays, HSBC and more) detects the bank, region and currency from the
  From address/subject. The parser handles both shapes: **transaction alerts**
  ("Rs 432 spent at Swiggy on 27-09-2026") extracted per line with spend/credit sign,
  clean merchant and date; and **statement emails** (total due, minimum due, due date,
  statement date, closing balance) surfaced as a summary card, with any line-item table
  falling back to the §5.14 bank extractor.
- **Password-protected statement PDFs.** Bank statement attachments are usually locked
  (name+DOB, PAN, card digits). Attachments are read with `pdfjs-dist`, trying no
  password first, then each **saved statement password**; still-locked files are counted
  and reported so the user can add the password in Settings and rescan. Locked files
  from the direct file-upload path prompt inline for the password with an option to
  remember it. No password is ever transmitted; decryption is local.
- **Same review, commit and guards.** Extracted rows are categorized and deduped, shown
  in the §5.14 review table with the statement summary card, and honor the
  currency-match guard before committing into the chosen account, from where they flow
  into income/expense and every other tab. *Verified 2026-09-27: pasted INR and GBP
  emails parsed to correct dates/merchants/summaries and rendered the review table,
  summary card and commit action.*

### 5.22 AI assistant (chat) *(added + shipped 2026-09-27)*

A conversational **Assistant** page that puts the user's bring-your-own-key LLM
(§5.14 provider registry) to work beyond statement categorization.

- **Grounded in the user's own numbers.** Before each turn the app builds a compact,
  local snapshot (net worth, per-person breakdown, cash flow, top spending/income,
  loans, account mix, tracked funds) and sends it as the system message, so answers
  use real figures in the base currency. Only that summary plus the conversation is
  sent, to the provider the user configured with their own key, never to us.
- **Free-text, multi-turn.** A new `chatModel` in the LLM layer supports all three
  protocols (OpenAI-compatible, Anthropic native with a `system` field, Ollama native)
  without JSON coercion, over the same CORS-safe transports. Suggested starter prompts,
  a clear/reset control, and a bounded 90s timeout so a slow model never wedges the UI.
- **Guardrails.** Concise, practical answers; will not invent numbers; states it is not
  a licensed advisor and cannot place trades or move money. *Verified 2026-09-27: live
  reply used the real snapshot ("net worth $878,761, savings rate 25%").*

### 5.23 Fund overlap checker *(added + shipped 2026-09-27)*

Checks whether the funds a family holds **overlap** with each other and suggests
concrete alternatives that actually diversify. Reachable under Investing.

- **Pick the funds:** the mutual-fund watchlist loads by default; add or remove any
  scheme via search. Each is fetched from AMFI/mfapi (category, house, live returns).
- **Instant heuristic (offline).** AMFI does not publish per-fund holdings, so overlap
  is *estimated* from category, mandate and index tracked: two funds in the same
  category hold largely the same securities, and two index funds on the same index are
  near-identical. Renders a colour-coded **overlap matrix**, a ranked list of the most
  overlapping pairs with severity labels, and plain-language insights (redundant pairs,
  category concentration, asset classes not represented).
- **AI analysis + grounded alternatives (optional).** With a model configured, an
  analysis returns a written overlap read, the redundant holdings, concentration risk,
  and 3-5 **specific alternative funds** to diversify. Each suggestion is then looked up
  on mfapi so it shows the real fund house, NAV and trailing returns, with one-click
  "Compare" and "Watch". *Verified 2026-09-27: correct category classification and
  overlap scores (large-cap/flexi/index high, liquid vs equity ~4%); alternatives
  grounded against live AMFI data.*
- Not investment advice; overlap is an estimate, clearly disclaimed.

### 5.24 Household roll-up *(added + shipped 2026-09-27)*

A **Household** page (under Accounts) that keeps each person's accounts their own while
combining the totals.

- **Per person:** assets, debt and net worth, their share of household net worth as a
  bar, and an expandable list of the accounts they own shown in each account's own
  currency, each linking to its editor.
- **Collective:** investments and loans across everyone, each line attributed to its
  owner, with combined totals. Accounts with no owner fall to the default person, which
  the page states.
- Built on the existing `Profile` / `Account.profileId` model, so no migration.
  *Verified 2026-09-27 on the demo household: net worth $878,761 across 3 people and 16
  accounts, matching the Net worth page and the assistant's own figure.*

### 5.25 Goal-based planning *(added + shipped 2026-09-27)*

Planning is now two tabs: **Goals** and the existing **Financial independence**
projection (§5.18).

- **A goal** has a name, type (retirement, education, home, vehicle, travel, emergency,
  wealth, other), target amount, optional deadline, monthly saving, expected return and
  an owner (a person or the whole household). New optional `Store.plans`, so older
  stores load unchanged.
- **Funded by anything:** tick any mix of existing **accounts** (their live balances
  count) and add specific **mutual funds** by AMFI search, recording what was invested
  and optionally units. With units, the holding is **marked to the live NAV** and shows
  its gain.
- **Per-goal analytics:** current value split into "from accounts" and "from funds",
  percent funded, amount still needed, the monthly contribution actually required, a
  projection chart against the target line, and a plain verdict, e.g. "Off pace:
  projected $96,163 by Jun 2034, short by $23,837. Saving $594 a month would close it."
- **Across goals:** count, total saved, combined target, and how many are off pace.
  *Verified 2026-09-27: projection and required-contribution figures checked by hand.*

### 5.26 One display currency everywhere *(added + shipped 2026-09-27)*

Accounts each carry their own currency and aggregates convert to the base, which is
right for someone genuinely holding several currencies but meant that picking a base
currency left individual transactions, accounts and loans still reading in their old
one. Settings now has **Show amounts in**:

- **"<BASE> everywhere (convert)"** converts every per-account amount at display time,
  so one choice really does flow through the whole app.
- **"Each account's own currency"** is the previous behaviour, kept for real
  multi-currency holdings.

Implemented as a single conversion hook inside the format layer (`setDisplayConversion`),
so every existing call site honours it rather than each view having to remember; it
returns the native amount untouched when no FX rate is known, never a wrong one. The
base-currency list also went from 14 to 66 currencies. *Verified 2026-09-27: with base
INR, Transactions/Accounts/Loans went from 400 dollar-denominated figures to zero, all
rendered in rupees with correct lakh grouping.*

### 5.27 Macro-economic context *(added + shipped 2026-09-27)*

Plans are only as good as their assumptions, so the real numbers are now in the app.
`lib/macro.ts` pulls **inflation (CPI), GDP growth, lending rate, deposit rate and the
real interest rate** for the economy behind the base currency from the **World Bank**
open data API (keyless, CORS-open, free), cached 30 days.

- **Economy card** on Planning: each indicator with the year it is for and the change
  against the prior year, plus the live value of 1 unit of the base currency in USD from
  the existing FX table. Missing series read "n/a" rather than being faked, and the card
  states that national statistics publish with a lag.
- **Currency drives the economy shown:** 66 currencies are mapped to their country, so
  choosing INR shows India, USD shows the United States, EUR the Euro area.
- **Adopt with one click:** "Use 2.4% from 2025" writes that inflation into settings.
- **Inflation-aware goals:** a goal can treat its target as today's money and grow it to
  the target date, so it keeps real purchasing power. The card shows both figures.
  *Verified: a ₹10,00,000 target for Sep 2036 at 2.4% becomes ₹12,67,651, exactly
  1,000,000 x 1.024^10.*
- **FIRE** already projected in real terms; it now also shows what nominal return that
  implies at the current inflation rate.
- Not advice: the figures are published statistics, shown with their source and date.

### 5.28 Property valuation & performance *(added + shipped 2026-09-27)*

Each property page now reports how it is doing as an **investment**, not just its cash
flow.

- **Three ways to record a value**, all landing on the same month-end point of the
  property's valuation account (so net worth stays consistent): type a figure, compute
  it from a **local rate per unit area** (circle rate, guidance value, or what similar
  places fetch), or ask the configured AI model for an estimate.
- **Performance:** current value, appreciation against purchase price in money and
  percent, **annualised growth (CAGR)**, equity and loan-to-value against the linked
  mortgage, **gross and net rental yield** from the last 12 months of rent and costs,
  value per unit area, and a valuation history chart. Missing inputs prompt for what
  they need ("add what it cost") instead of showing a wrong number.
  *Verified: a 2,400 sq ft property valued at 220/sq ft = 528,000 against a 380,000
  purchase in Jun 2018 gave +148,000 (+38.9%) and 4.1% CAGR over 8.3 years, all checked
  by hand.*
- **Deliberately not scraped.** Listing portals forbid scraping in their terms and their
  markup changes constantly; a silently stale scrape would be worse than no number on an
  asset this size. The AI route is labelled an estimate with a range, a confidence level
  and its caveats, is told it has no live listing access, and is saved as the user's own
  figure. No property data leaves the device except the prompt the user triggers.

### 5.30 Fit-to-screen pass *(2026-09-28)*

The previous alignment pass checked page-level scrolling and the viewport edge, which
missed the real problem: content being **clipped inside** its container. Re-audited every
page at 320, 375, 768, 1010 and 1440px for content wider than its box, elements crossing
the screen edge, and controls collapsed below a usable size.

Root causes found and fixed:

- **Flex and grid children default to `min-width: auto`**, so a long input or a
  two-column grid refuses to shrink and bursts its container ("grid blowout"). The
  elements that should give way now may; buttons deliberately may not, since a shrunk
  button clips its own label.
- **Fixed-width inputs.** The LLM **Model** and **API key** fields were pinned at 200px,
  which together with the adjacent "Auto-pick best" button exceeded a phone-width card,
  so the button sat outside the app margin. Both are now flexible and the button drops to
  its own full-width line.
- **A dead zone between layouts.** Mobile styles stopped at 760px while the sidebar stayed
  on screen up to 1000px, so tablets and narrow windows got the desktop layout without
  room for it. The breakpoint now matches the `.grid2` switch at **1000px**, so no width
  has one changed and the other not. The desktop window's 1120px minimum means this only
  affects browsers and tablets.
- **Clipping instead of wrapping.** Account names and subtitles, category names, merchant
  names and fund names were `nowrap` + ellipsis, so on a phone they were cut rather than
  read. They now wrap.
- **A six-column loans table** cannot fit a phone, and sideways scrolling hides columns.
  It restacks into one block per loan with the column name beside each value.
- **Tables in scrollers** were pinned to their container width, so their columns clipped
  instead of scrolling. `.table-scroll` now applies at every width and lets the table size
  to its content.
- Very small phones (<= 400px) get single-column stat cards and a tighter page gutter.

Result: at **320, 375, 768, 1010 and 1440px** no page scrolls sideways, nothing is
silently cut off, and no control is collapsed below a usable size. Intentional ellipsis
truncation and horizontally scrollable charts/tables are excluded, since those tell the
reader there is more.

### 5.29 Layout alignment pass *(2026-09-27)*

Audited every page programmatically at phone (375), tablet and desktop (1180 / 1600)
widths for horizontal overflow, uneven grid-row heights, elements escaping their card,
and controls sitting off the line within a row. Two real issues found and fixed:

- Rows of form fields were vertically centred, so a field carrying helper text pushed
  its neighbours' labels and controls out of line. Fields now align from the top and
  wrapped rows keep consistent spacing.
- The Mutual funds tab strip grew a fifth tab and overflowed a phone screen, making the
  whole page scroll sideways. Tab strips now scroll horizontally on narrow screens.

Result: **no page scrolls horizontally at 375px**, and no control is off its line at any
tested width.

### 5.31 Distribution, updates and data portability *(added + shipped 2026-09-28)*

How a new version reaches users, and how their data follows them. Full runbook in
[RELEASING.md](RELEASING.md).

- **Upgrades keep data automatically.** The desktop store lives in the OS user-data
  directory keyed on `productName` (`%APPDATA%\Nestworth\fathom-data.json`), not inside
  the installed program, so installing a newer build leaves it untouched. Android keeps
  private storage across an in-place upgrade provided the `appId` and signing key match.
  `productName`, `appId` and the signing key are therefore load-bearing and documented
  as such.
- **Download all my data.** One JSON file with every account, transaction, category,
  person, property, goal, tag and rule, wrapped in a header recording app version,
  schema version, export date and item counts. Secrets are excluded by default because a
  backup file travels; a separate "Moving to a new machine?" option includes them for a
  one-step move. Settings shows live counts of what would be exported.
- **Restore** accepts both the new format and bare stores from early versions, migrates
  old schemas, and states what the file holds plus any warnings before replacing
  anything. The same file moves data between desktop and mobile in either direction.
- **In-app update check** against the GitHub Releases API for a configured `owner/repo`.
  It compares the published tag with the build-time app version, shows the release notes
  and offers the installer matching the current platform, with **Skip this version**. It
  offers no download when the release has no matching installer, rather than handing over
  the wrong file.
- **Privacy:** this is the only request the app makes to a server the user did not
  configure. It is off by default, the automatic on-launch check is opt-in, the card
  states plainly that only the latest release number is requested, and no financial data
  is sent.
- **No silent self-update.** Auto-install needs code signing to avoid SmartScreen
  warnings, and silently replacing a finance app is a bigger promise than is warranted
  here. The electron-builder `publish` config already points at GitHub, so
  `electron-updater` can be added later without moving the feed.

## 6. Data model (schema v2)

```
Store {
  schemaVersion: 2,
  settings { currencyCode /* base */, locale, appName, onboarded,
             region: US|IN|UK|INTL, theme: light|dark|system,
             llm?: { provider: none|ollama|openai, baseUrl?, model?, apiKey? },
             currentAge?, fireWithdrawalRate?, expectedReturn?, fireMonthlyExpenses? }
  profiles[]      { id, name, color, relationship? }        // people
  households[]    { id, name, profileIds[] }                // a family
  fx?             { pivot:'USD', rates{code->per-USD}, fetchedAt, source }
  accounts[]      { id, name, type: checking|savings|credit|investment|retirement|
                    real_estate|loan|cash, subtype? /* vehicle key */,
                    profileId? /* owner */, institution?, mask?, openingBalance,
                    openingDate, currency? /* ISO 4217; unset = base */,
                    interestRate?, originalPrincipal?, hidden,
                    balanceHistory?: [{month, balance}] }   // for valued accts
  categoryGroups[]{ id, name, kind: income|expense, color, propertyId? }
  categories[]    { id, groupId, name, emoji? }
  tags[]          { id, name }
  properties[]    { id, name, profileId?, valuationAccountId?, mortgageAccountId?,
                    incomeCategoryId?, expenseGroupId? }
  transactions[]  { id, date, merchant, notes?, amount,     // negative = outflow
                    accountId, categoryId?, tagIds[], needsReview, hidden,
                    transfer?, splits?: [{id, amount, categoryId?, notes?}] }
  importRules[]   { id, match /* lower-case substring */, categoryId?, merchant?, createdAt }
}
```

Derived (never stored): account balances (opening + Σtx, or balanceHistory
interpolation), monthly aggregates, net worth series, Sankey flows.

## 7. Architecture

- **Shell:** Electron (Chromium + Node) → packaged with electron-builder (NSIS
  installer). Main process owns the data file; typed IPC (`store:load`,
  `store:save`, `data:openFolder`, dialogs).
- **Renderer:** React 19 + TypeScript + Vite; react-router (hash); Recharts for
  line/area/bar/donut; d3-sankey for the cash-flow Sankey; lucide-react icons;
  Inter variable font; hand-rolled CSS design tokens (no framework).
- **Dual-run:** renderer also runs in a plain browser (Vite dev server) with a
  localStorage adapter, used for rapid development/visual QA. Electron adds the
  file-backed store.
- **State:** single Store context + pure selector functions (`src/lib/selectors.ts`)
  memoized per (store, range), no external state library.

### 7.1 Security & privacy hardening *(full pass 2026-09-27)*

Threat model: a finance app whose value is that data never leaves the device. The
pass covered secrets at rest, the Electron attack surface, the dev server, untrusted
input (emails/PDFs), remote code, backups, and dependencies.

- **Secrets encrypted at rest (desktop).** The LLM API key, IMAP app password and
  statement-PDF passwords are encrypted with the OS keychain (Windows DPAPI via
  Electron `safeStorage`, `enc1:` prefix) before the store is written; the rest of the
  file stays human-readable JSON. Copied to another machine/user, encrypted fields are
  dropped on load (re-enter), never fed to providers as garbage. On Android the store
  lives in the app-private sandbox; on the browser dev store it stays plaintext
  (dev-only, documented).
- **Backups never contain secrets.** "Export backup" strips the API key, mailbox
  password and statement passwords; the Data card says so.
- **Electron surface locked down.** Renderer runs with `sandbox: true` +
  `contextIsolation`, no Node. The packaged app is served over a private `app://`
  scheme (path-traversal-guarded) instead of `file://`. The window can never navigate
  away from the app (an external page would inherit the IPC bridge and with it the
  data file); external links open only in the OS browser and only for http(s). All
  Chromium permission prompts (camera, mic, location, …) are auto-denied.
- **IPC validated.** `llm:fetch` forwards only http(s) GET/POST with bounded
  headers/body (10 MB) and response (32 MB) under a 5-minute timeout, so the bridge
  cannot be used as a general proxy. `store:save` takes bounded strings only.
  `email:scan` validates host/port/types, caps inputs, and never logs or echoes
  credentials.
- **Dev-server proxy fenced.** `/__llm/fetch` (dev only, bound to 127.0.0.1) now
  rejects cross-origin callers (Origin allowlist), non-JSON content types, non-http(s)
  targets and oversized payloads, closing the local-relay (SSRF) hole.
- **Production CSP.** Injected at build: `script-src 'self' 'wasm-unsafe-eval'` (no
  inline or remote script), `object-src 'none'`, `frame-src 'none'`, `base-uri 'self'`,
  bounded connect/img/font/worker sources. Dev/HMR unaffected.
- **OCR is now 100% local.** tesseract.js previously fetched its worker, wasm engine
  and language model from a CDN at runtime (remote code + broken offline). The runtime
  now ships with the app (`public/ocr`, ~10 MB, `scripts/copy-ocr-assets.mjs`, wired
  into `prebuild`); verified OCR with zero CDN requests.
- **Untrusted-input guards.** Email parsing caps HTML (2 MB), text (1 MB) and line
  length (2 K) before any regex runs; a 5 MB adversarial input parses in ~20 ms. No
  `innerHTML`/`eval` anywhere; the chat renderer emits text nodes only.
- **Android.** `allowBackup="false"` (finance data and keys cannot leave via system
  backup/transfer), permissions limited to INTERNET, cleartext HTTP stays disabled
  (platform default), WebView debugging off in release builds.
- **Dependencies & repo.** Repo/docs scanned: no committed keys, no hardcoded secrets,
  no sensitive logging. **Electron upgraded 38 → 44.4.5** (closes the use-after-free,
  clipboard and `window.open`-scoping advisories); verified by a real boot smoke test.
  `sharp` upgraded to 0.35.4 and `@capacitor/assets` removed from the dependency tree
  (its one-off icon generation now runs via `npx`), which cleared the sharp/tar/uuid
  advisories it dragged in. Result: **0 vulnerabilities in shipped dependencies, and
  9 → 2 across the whole tree.**
- **Known residual (accepted, documented).** `@capacitor/cli` 6 pins `tar@6`, which
  carries path-traversal advisories. It is **build-time only** (never shipped) and in
  our usage only extracts Capacitor's own bundled template archive, not attacker
  controlled, so it is not reachable with hostile input. Forcing `tar@7` breaks the CLI
  (`tar.extract` was restructured, verified: `cap sync` fails), and the real fix is
  Capacitor 6 → 7, a major upgrade requiring Java 21 / AGP 8.7 / minSdk changes that
  cannot be validated here without a device. Tracked as a dedicated future task.
- **Boot smoke test.** `npm run smoke:electron` boots the real main process against the
  built `dist/` and asserts the app is served from `app://bundle`, React mounted, the
  preload bridge exists, **Node did not leak into the renderer**, and `safeStorage` is
  available. This is the regression guard for future Electron upgrades.

## 8. Design language (tokens)

- Background `#F7F5F1` (cream), cards `#FFFFFF`, border `#E9E4DC`,
  sidebar `#FBFAF7`.
- Ink `#211D16`, secondary `#6F6A60`, faint `#9C968A`.
- Accent orange `#E8590C` (active nav, badges, primary buttons, uncategorized),
  hover tint `#FDEEE3`.
- Money: income green `#2F9E44`, loss/negative red `#E03131` (used sparingly , 
  expenses render in ink, per reference).
- Chart palette: blue `#3B82F6`, amber `#F59E0B`, green `#10B981`, pink `#EC4899`,
  violet `#8B5CF6`, teal `#14B8A6`, red `#EF4444`, slate `#64748B` (+ gray for
  Uncategorized).
- Type: Inter variable; 13px base UI, 20px page titles, 24-28px stat values
  (tabular-nums for all money).
- Radii 10-14px; soft shadows `0 1px 2px rgba(33,29,22,.05)`; generous card padding (20px).

## 9. Roadmap & status

- [x] **Phase 0, Docs & scaffold:** PRD, CONTEXT, Electron+Vite+React+TS skeleton runs. *(2026-09-27)*
- [x] **Phase 1, Foundation:** design tokens, app shell (sidebar/header/date range), store + demo seed, storage adapters. *(2026-09-27)*
- [x] **Phase 2, Core pages:** Transactions (read + filters), Spending, Cash flow, Net worth. *(2026-09-27, all verified in browser QA)*
- [x] **Phase 3, Breadth:** Accounts, Loans, Properties, Uncategorized shortcut. *(2026-09-27)*
- [x] **Phase 4, Editing & data:** transaction add/edit/split drawer, bulk actions, CSV import (verified: mixed date formats, quoted fields, dedupe, merchant learning), settings (currency, categories, data tools, first-run onboarding). *(2026-09-27)*
- [x] **Phase 5, Mutual Funds explorer:** mfapi.in client + cache, search all schemes, fund detail (NAV chart, trailing returns, verified live), watchlist + compare, category top-performer screens, disclaimer. *(2026-09-27)*
- [x] **Phase 6, Windows packaging:** NSIS installer via electron-builder → `app/release/Fathom Setup 0.1.0.exe` (96MB) built successfully. *Remaining nice-to-have: custom .ico (currently default Electron icon).* *(2026-09-27)*
- [x] **Phase 6a, Multi-currency + live FX (§5.11):** per-account currency, base-currency conversion across all analytics, live keyless rates w/ 12h cache + Settings panel, INR demo account. Verified live (open.er-api.com fetch swapped seed 88.20 → live 95.88). *(2026-09-27)*
- [x] **Phase 6b, Regional terminology + glossary (§5.12):** region setting, EMI/current-account/pension labels, lakh/crore axes, world-terms glossary. *(2026-09-27)*
- [x] **Phase 6c, MF freshness & auto-discovery (§5.10A):** 6h NAV TTL + focus revalidation, watchlist SWR cache with as-of indicator, Explore auto-rerun after 24h, "New listings" universe diff (baseline 37,917 schemes recorded live). *(2026-09-27)*
- [x] **Phase 7, Statement import (§5.14):** OCR-capable ingest (pdfjs + tesseract), bank-format detection, layout-tolerant extraction, retrieval categorization + optional LLM, dedupe, review, commit, rule learning. Verified on a pasted HDFC statement (8 rows, correct signs and categories). *(2026-09-27)*
- [x] **Phase 8, Profiles & household (§5.15):** per-account owners, sidebar scope switcher, per-person net worth breakdown + combined total, People management in Settings. Verified (Everyone $880k; Jordan $129.7k). *(2026-09-27)*
- [x] **Phase 9, Regional investment vehicles (§5.16):** catalog + Add Account picker + demo subtypes. *(2026-09-27)*
- [x] **Phase 10, Visual refresh + dark mode (§5.17):** slate/indigo tokens, dark theme, dashes and AI icons removed. *(2026-09-27)*
- [x] **Phase 11, Planning / FIRE (§5.18).** *(2026-09-27)*
- [x] **Phase 11a, Universal LLM + model auto-discovery (§5.14):** provider registry, 3 protocols, CORS proxies (Electron / Vite dev / CapacitorHttp), Auto-pick best, Test, editable keys with show/clear. Verified live against NVIDIA NIM (70 models fetched; real API responses). *(2026-09-27)*
- [x] **Phase 11b, Android & iOS apps (§5.20):** Capacitor, on-device Filesystem store, native HTTP, responsive drawer + bottom-tab layout, branded icons/splash, `android/` project generated (iOS added on a Mac). *(2026-09-27)*
- [x] **Phase 11c, Model verification + token limits (§5.14):** Auto-pick probes candidates with a live request (15s timeout each) and keeps the first that responds, fixing NVIDIA 404 "model not found for account"; explicit input/output token limits per protocol so active models respond fully. Verified live (selected `z-ai/glm-5.3-flash`, Test "Connected"). *(2026-09-27)*
- [x] **Phase 11d, Transactions Group By + filters (§5.2):** Group By (month, category, group, merchant, account, type, tag, owner, review), sort, amount range, collapsible groups with subtotals. Verified in browser QA. *(2026-09-27)*
- [x] **Phase 11e, Email statement & alert import (§5.21):** `.eml`/paste/IMAP ingest (`postal-mime` + `imapflow`), issuer registry, alert + statement parsing, password-protected PDF reading with saved passwords, into the §5.14 review/commit pipeline. Parser verified on INR/GBP/US emails; UI verified end-to-end (paste → summary card + review table → commit). IMAP path builds; needs real credentials to live-test. *(2026-09-27)*
- [x] **Phase 11f, Import currency-match guard (§5.21):** review step warns when the statement currency differs from the target account and offers a one-click switch to a matching account, so amounts flow into income/expense correctly. Verified live (INR→USD warning + "Use NRE Savings (INR)"; GBP→USD warning). *(2026-09-27)*
- [x] **Phase 11g, Hardened always-on dedupe (§5.14):** fuzzy (amount+merchant within ±4 days) against all history, batch-internal dedupe for shared statements, and a commit-time exact-match guard per account. Verified via the pipeline (exact/fuzzy/batch flagged, different-amount control kept). *(2026-09-27)*
- [x] **Phase 11h, AI assistant chat (§5.22):** `chatModel` (3 protocols, CORS-safe, 90s timeout), local finance-context snapshot as system prompt, suggested prompts, guardrails. Verified live (real net worth/savings-rate answer). *(2026-09-27)*
- [x] **Phase 11j, Security & privacy pass (§7.1):** safeStorage-encrypted secrets at rest, secret-free backups, sandboxed renderer + `app://` scheme + navigation lock + permission denial, validated/bounded IPC, fenced dev proxy, production CSP, fully-local OCR (no CDN code), untrusted-input caps, `allowBackup=false`; prod deps audit clean. Verified live (proxy 415/403 fences, 5MB adversarial email in 20ms, OCR with zero CDN hits). *Open: Electron 38→44 major upgrade in a dedicated pass.* *(2026-09-27)*
- [x] **Phase 11i, Fund overlap checker (§5.23):** heuristic overlap matrix + ranked pairs + insights from AMFI category/index, plus optional AI analysis with alternatives grounded on mfapi. Verified live (classification, scores, grounded alternatives). *(2026-09-27)*
- [ ] **Phase 12, Stock Research integration:** `market-report.json` contract with the Stock Research repo, drop-folder watcher, read-only Research page.
- [ ] **Phase 13, Bank-feed sync (future):** SimpleFin bridge / Plaid dev / Actual Budget import; scheduled refresh; per-account sync status. (Reddit thread: SimpleFin ~$15/yr once-daily, Plaid 10 free connections then ~$0.30/account, self-host on a mini PC or free cloud tier.)
- [ ] **Phase 9, Polish backlog:** transaction rules engine, merchant logos, keyboard palette (Ctrl+K), report export (PNG/CSV), multi-file "households".

## 10. Success criteria (v1)

1. `npm run dev` opens the Electron app on Windows with demo data and all four
   core pages matching the reference layouts.
2. A user can: add an account, import a CSV, categorize transactions, and see
   every chart update instantly.
3. Data survives restart in a single human-readable JSON file; backup = copy file.
4. Installer artifact (`Fathom Setup.exe`) installs and launches on a clean
   Windows 11 machine.

## 11. Open questions

- ~~Rename "Fathom"?~~ **Resolved:** the product is **Nestworth** across the UI, package
  (`com.nestworth.app`) and installer. The on-disk store path and code bridge still use
  the `fathom` identifier (`window.fathom`, `fathom-data.json`) to avoid a migration; a
  rename there is cosmetic and deferred.
- SQLite vs JSON beyond ~50k transactions (JSON fine for v1 scale; adapter seam
  exists in `storage.ts`).
- Whether transfers should be auto-paired (two-sided) in v1, currently a simple
  `transfer` flag excluded from income/spending math.
