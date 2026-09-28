# CONTEXT.md, Engineering context for Nestworth

> Living companion to [PRD.md](PRD.md). Read this first when picking the project
> back up. **Keep both docs updated when anything here changes.**
> Last updated: 2026-09-27 (6th session block) · Status: **schema v2; Nestworth brand; statement import (file + email/CRED-style incl. password PDFs) with hardened always-on fuzzy dedupe; AI assistant chat + AI fund-overlap checker (both on the BYO-key LLM); universal BYO-key LLM w/ verified auto-discovery + token limits + timeouts; profiles/household, regional vehicles, multi-currency w/ import currency-match guard, Transactions Group By + filters, dark-mode, FIRE, and Android/iOS via Capacitor. All shipped and browser-verified. Imports flow into income/expense and every tab. Android `app/android` project generated.**

## What this is

Windows desktop clone of the "SharkFin" Monarch-style finance dashboard
(reference screenshots in project root, they are the visual spec), plus an
INVESTING module (Mutual Funds explorer; Stock Research integration planned).
Local-first: all data in one JSON file on disk. See PRD for full feature spec.

## Current status

- **All v1 pages built and browser-QA'd** with demo data: Transactions
  (filters/chips/bulk/drawer/splits/CSV import), Cash flow (Sankey + P&L +
  rankings), Spending (donut/breakdown/trend), Net worth (chart + asset groups),
  Accounts, Loans, per-Property pages, Settings, Mutual Funds (live AMFI data:
  search → fund modal with NAV chart + returns verified; watchlist persists;
  Explore top-5 per category works).
- **Electron desktop app runs** (`npm run dev`) and **NSIS installer built**:
  `app/release/Fathom Setup 0.1.0.exe`.
- **Multi-currency + live FX shipped & verified**: per-account `currency`,
  base-currency conversion in every selector, `lib/fx.ts` (open.er-api.com →
  frankfurter fallback, USD pivot, 12h TTL, cached in `store.fx`), Settings
  rates panel (live fetch verified: seed 88.20 → live 95.88 INR/USD), demo INR
  account (₹ lakh grouping + "≈ $" sublines), base-switch stamping (see gotchas).
- **Regional terms shipped**: `lib/terms.ts` region US/IN/UK/INTL → account-type
  labels, EMI column, lakh/crore compact INR axes (verified ₹6.8Cr-₹7.5Cr),
  Settings glossary table (US/UK/India equivalents).
- **MF freshness shipped**: 6h scheme TTL + focus revalidation, watchlist
  summary cache (instant paint + background refresh + "NAVs as of"), Explore
  auto-rerun post-24h, "New listings" tab diffing the full AMFI universe
  (baseline recorded live: 37,917 schemes).
- **Statement import shipped** (file + email): staged pipeline (ingest→…→commit),
  OCR, bank-format detection, retrieval categorization + optional BYO-key LLM,
  dedupe, editable review, rule learning. **Email/CRED-style** adds `.eml`/paste/IMAP
  ingest, an issuer registry, alert + statement parsing, and **password-protected PDF**
  reading (saved passwords). Committed rows flow into Transactions, Cash flow
  (income/expense), Spending, Sankey/P&L and Net worth automatically. An import
  **currency-match guard** warns + offers a matching account on mismatch.
- **Transactions Group By + filters shipped**: group by month/category/group/merchant/
  account/type/tag/owner/review with collapsible subtotals; sort + amount-range filters.
- Verified numbers with demo data (YTD Jan-Sep 2026): net worth ~$850k (incl.
  converted INR acct) · "9 need review". Email parser + UI verified end-to-end this pass.
- Not yet done: custom app icon, Stock Research page (Phase 12), live bank-feed sync
  adapters (Phase 13), polish backlog, historical FX for past net-worth points, and
  live IMAP testing (needs real mailbox credentials).

## How to run

```bash
cd app
npm run dev        # Vite (5173) + Electron window, hot reload
npm run dev:web    # browser-only mode at http://localhost:5173 (localStorage store)
npm run typecheck  # tsc --noEmit
npm run dist       # build + NSIS Windows installer into app/release/
```

There is also `.claude/launch.json` ("fathom-web") for previewing the web mode
in the Claude browser pane.

## Stack & why

| Choice | Why |
|---|---|
| Electron + electron-builder | True Windows app + installer; same DNA as reference (React web UI; Actual Budget itself ships as Electron). |
| Vite + React 19 + TypeScript | Matches reference product; fast HMR. |
| Hand-rolled CSS (tokens in `styles/global.css`) | Design must match screenshots precisely; no framework fighting. |
| Recharts | Area/line/bar/donut charts. |
| d3-sankey (pure JS) + custom SVG | Cash-flow Sankey; Recharts has none. |
| JSON file store (not SQLite) | Zero native deps (no node-gyp pain on Windows); ~1k-50k tx is fine in memory; human-readable = data ownership. Swappable behind `storage.ts`. |
| lucide-react, @fontsource-variable/inter | Icon + type match for the reference look. |

## Architecture

```
app/
  electron/main.cjs      # BrowserWindow, IPC: store:load/save, openDataFolder
  electron/preload.cjs   # contextBridge → window.fathom
  index.html
  src/
    main.tsx             # React root, HashRouter
    styles/global.css    # ALL design tokens + component classes (single file)
    lib/
      types.ts           # Store schema (schemaVersion 1, + investing.mfWatchlist)
      storage.ts         # adapter: Electron IPC ←→ localStorage fallback
      seed.ts            # deterministic demo-household generator (mulberry32)
      selectors.ts       # pure derived math: balances, aggregates, sankey, net worth
      format.ts          # Intl money/date helpers (currency from settings)
      dates.ts           # month math, range presets
      csv.ts             # CSV parse + date/amount coercion for imports
      mf.ts              # mfapi.in client (6h TTL), returns math, Explore screens,
                         # watchlist summary cache, new-listing universe diff, ₹ fmt
      fx.ts              # live FX (er-api→frankfurter, USD pivot, 12h TTL), convert()
      terms.ts           # region (US/IN/UK/INTL) terminology + world glossary
      hooks.ts           # useMeasure (ResizeObserver), useDebounced
      store.tsx          # React context: load/save, mutations, useStore()
      range.tsx          # global date-range context
    components/          # Shell (sidebar+header+range), ui.tsx (StatCard/Seg/Modal/
                         # Drawer/BarList…), charts.tsx (Donut + tooltip helpers),
                         # SankeyChart, TxTable, TxDrawer (+splits), TxListModal,
                         # CsvImport, Onboarding
    pages/               # Transactions, CashFlow, Spending, NetWorth, Accounts,
                         # Loans, Property, MutualFunds, Settings
```

- **Data flow:** `store.tsx` loads once → mutations write through context →
  debounced persist via `storage.ts`. Selectors are pure `(store, range) →
  view-model` functions; pages never aggregate inline.
- **Amount convention:** integer-safe floats, **negative = outflow**; income
  positive. Transfers flagged and excluded from income/spend analytics.
- **Balances:** transactional accounts = openingBalance + Σ tx; valued accounts
  (investment/retirement/real_estate) use monthly `balanceHistory` points
  (step-interpolated); net worth series = month-end sum of all non-hidden accounts.
- **Dual-run:** if `window.fathom` (preload) exists → file store; else
  localStorage (`fathom-store-v1`). Browser mode is for dev/QA only.

## Conventions

- TS strict; no `any` unless commented.
- IDs: short prefixed nanoids (`acc_`, `txn_`, `cat_`, `grp_`, `tag_`, `prp_`).
- Dates as `YYYY-MM-DD` strings in the store; month keys `YYYY-MM`.
- Money formatting only via `format.ts` (`fmtMoney`, `fmtMoneySigned`, `fmtCompact`).
- CSS: BEM-ish flat class names (`.card`, `.statcard`, `.txrow`); design tokens
  as CSS vars in `:root` (PRD §8 lists them all).
- Charts always take pre-aggregated data from selectors.

## Decisions log

- **2026-09-27 (4th block)** Mobile + LLM polish.
  - **Capacitor** wraps the same `dist/` into native apps. `capacitor.config.ts`
    (appId com.nestworth.app, webDir dist, `CapacitorHttp.enabled` so fetch is
    native and CORS-free on device). `storage.ts` adds a `capacitor` adapter
    (Filesystem `nestworth-data.json`, Directory.Data) selected via
    `Capacitor.isNativePlatform()`; kind union now electron|browser|capacitor.
    `app/android` generated; iOS is `cap add ios` on a Mac. Icons/splash via
    `@capacitor/assets` from `build/icon.svg` (`npm run mobile:assets`). Scripts:
    cap:android / cap:ios / cap:sync. See `MOBILE.md`.
  - **Responsive Shell** (Shell.tsx + global.css `@media (max-width:760px)`):
    sidebar becomes a slide-in drawer (scrim, closes on link tap), a
    `.mobile-topbar` and a `.bottombar` (Transactions/Cash flow/Spending/Net
    worth/More) appear, safe-area insets + `viewport-fit=cover`. `.desktop-only`
    hides the duplicate header theme toggle on phones.
  - **Mobile layout bug fixes** (all in the `@media (max-width:760px)` blocks at
    the end of global.css, + small JSX hooks): Spending donut+list stack
    (`.breakdown-row`); Cash flow header controls wrap (`.card-title`/`.row`
    wrap) and the Sankey renders at `minWidth=560` inside an overflow-x scroller
    (SankeyChart `w = max(width, minWidth)`); Transactions rows reflow to
    merchant+amount with category beneath and account hidden (grid-area rules on
    `.txrow.tx-cols`, `.tx-head` hidden); Loans table gets `.table-scroll` +
    min-width; Accounts rows ellipsize names and hide owner avatar + "Hidden"
    label (`.owner-badge`/`.hide-label`); fund modal mini-stats use
    `auto-fit minmax(92px)`; drawers go full-width and stack `.field-row`s.
  - **LLM fixes:** the "Failed to fetch" was browser CORS. Added a Vite
    dev-server proxy (`/__llm/fetch` middleware in vite.config.ts) so the preview
    works too; `send()` in statements/llm.ts picks transport
    Electron IPC -> Vite dev proxy -> plain fetch (CapacitorHttp patches fetch on
    mobile). AI card realigned (Model+Auto-pick on one row; key + show/hide +
    Clear + Test aligned). Keys editable anytime with an eye toggle and Clear.
    NOTE: NVIDIA NIM shared endpoint rotates models fast (many hit EOL/410 or
    404-per-account); Auto-pick best fetches the live list, but the user still
    must choose a model their account can call.
- **2026-09-27 (3rd block)** Big feature pass. Schema bumped **v1 -> v2**
  (`lib/migrate.ts`, run by `storage.ts` on load and by backup import): adds
  `profiles`, `households`, `importRules`, `account.profileId`+`subtype`, and
  settings `theme`/`llm`/planning fields. New modules: `lib/profiles.tsx`
  (scope context + memoized `scopedStore`), `lib/vehicles.ts`, `lib/fire.ts`,
  `lib/terms.ts` (already existed), `lib/statements/*` (pdf, banks, categorize,
  llm, parse, merchantKB, types). New pages: `Import.tsx`, `Fire.tsx`. New
  components: `ProfileSwitcher.tsx`.
  - **Statement import** is a TS staged graph (not literal Python LangGraph;
    that would not fit an Electron app). OCR via lazy `pdfjs-dist` +
    `tesseract.js`. Categorization is retrieval-augmented: rules -> history ->
    seeded merchant KB (word-boundary matched) -> optional LLM, opt-in. Fully
    local and free by default.
  - **Renamed Fathom -> Nestworth** (APP_NAME, package.json name/productName/
    appId, index.html title, seed appName). New app icon: indigo growth-bars
    mark in `build/icon.svg` + `public/favicon.svg` + in-app `Logo` (Shell.tsx);
    `npm run icon` (sharp) rasterizes to `build/icon.png` which electron-builder
    turns into the Windows .ico (`build.win.icon`). Concept + Midjourney/DALL-E/
    SD prompts + name shortlist in `BRANDING.md`.
  - **Model auto-discovery** (`statements/llm.ts` `listModels`/`rankModels`/
    `autoPickModel`): "Auto-pick best" in Settings queries `/v1/models` (or
    Ollama `/api/tags`, Anthropic `/v1/models`) and ranks for a cheap/fast/latest
    model; a datalist offers suggestions; `resolveLlm` falls back to a per-provider
    default so a model is always set without typing.
  - **Universal LLM** (`lib/llmProviders.ts` registry + `statements/llm.ts`):
    bring-your-own-key for frontier (OpenAI, Anthropic, Gemini, xAI, DeepSeek,
    Mistral), aggregators (OpenRouter, Groq, Together, Fireworks, Perplexity),
    NVIDIA NIM, and local (Ollama, LM Studio, Jan, llama.cpp, vLLM, GPT4All) +
    custom. Three protocols: openai-compatible, anthropic (`/v1/messages`,
    x-api-key, dangerous-direct-browser-access header), ollama (`/api/chat`).
    `resolveLlm()` merges provider defaults with overrides and tolerates legacy
    configs. Hosted calls go through an Electron main-process proxy
    (`ipcMain 'llm:fetch'` + `preload llmFetch`) to bypass browser CORS; falls
    back to direct `fetch` in browser dev (local providers only). `testLlm()`
    powers the Settings Test button. Keys stored only in the local data file.
  - **Profiles/household:** analytics pages call `useScopedStore()` instead of
    `useStore()`; mutations still go through base `useStoreCtx().mutate`.
    "Everyone" = base store; a profile = filtered scoped view. Net worth adds a
    per-profile breakdown (`netWorthByProfile`, base store).
  - **Theme:** `applyTheme()` in store.tsx sets `document.documentElement
    .dataset.theme`; CSS `:root[data-theme="dark"]` overrides tokens; all cream
    hexes tokenized (surface-2/hover/seg-bg/pill-*).
  - **Design + copy:** cream/orange -> slate + indigo (`ACCENT #4F46E5`). Em/en
    dashes and sparkle/AI icons stripped from `src` (sed pass + manual).
- **2026-09-27** (mid-session) User added two features: **Mutual Funds
  explorer** (all types + details + screeners in one place) and future
  **Stock Research integration**. MF data source = mfapi.in (AMFI, free,
  keyless, INR NAVs; CORS-open, fetched from renderer; cached 24h in
  localStorage `fathom-mf-cache`). "Recommendations" framed strictly as
  data-driven top-performer screens + the user's own pipeline signals , 
  the app never generates advice; permanent disclaimer shown.
- **2026-09-27** Stock Research (`E:\Python\Stock Research`) is a Python
  command-center pipeline (tradingview-screener, yfinance,
  TradingViewAntigravity quant engine, 311 models → BUY/SELL/HOLD consensus,
  HTML artifact reports). Integration = file contract first
  (`research/market-report.json` drop folder rendered read-only), FastAPI
  sidecar later. Its own PRD/CONTEXT live in that repo.

- **2026-09-27** Electron over Tauri (no Rust toolchain assumption) and over
  pywebview (product is React; Node 24 present). Python not used despite folder
  name `E:\Python\Finance App`, folder is just the user's projects area.
- **2026-09-27** JSON store over SQLite for v1 (native-module risk on Windows;
  scale fine). Revisit at >50k transactions.
- **2026-09-27** Name "Fathom" chosen as neutral working title (SharkFin is the
  reference author's brand; ocean-adjacent). Rename = `APP_NAME` in
  `src/lib/constants.ts` + `productName` in `package.json`.
- **2026-09-27** Demo dataset mirrors the screenshots' household shape
  (2 earners, 2 properties incl. rental, ~21 months history ending today,
  ≈$790k net worth) so charts look "lived in" immediately.
- **2026-09-27** Reference phone frames = out of scope; desktop-only v1
  (window min 1100×700), but layout uses fluid grids so a narrow window
  degrades gracefully.

## Known issues / gotchas

- **Statement KB matching must be word-boundary**, not raw substring. Bug found
  and fixed: keyword `tfl` (Transport for London) matched inside "ne**tfl**ix".
  `categorize.ts` now matches `\b<kw>`. Add new KB keywords mindful of this.
- **pdfjs worker** is imported as `pdfjs-dist/build/pdf.worker.min.mjs?url` and
  set on `GlobalWorkerOptions.workerSrc`. `src/vite-env.d.ts` provides the
  `?url` typing. tesseract.js is dynamic-imported only on scanned pages.
- **Browser-pane QA**: `window.confirm` returns false (destructive buttons
  no-op) AND screenshots can lag one render after navigate/click, so take a
  second screenshot. HMR also preserves page component state across edits, so
  after editing a module, Discard/reload to re-run (e.g. the import review kept
  stale rows until Discard). None of this affects the Electron app.
- Scoped-store analytics: `scopedStore` is memoized per (base, scope) in a
  WeakMap; a new base object (any mutation) invalidates it correctly.
- **Electron postinstall is flaky on this machine**: `npm install` can leave
  `node_modules/electron/dist` empty/partial ("Electron failed to install
  correctly"). Fix: extract `%LOCALAPPDATA%\electron\Cache\<hash>\*.zip` into
  `node_modules/electron/dist` (PowerShell `Expand-Archive` works) and write
  `node_modules/electron/path.txt` containing `electron.exe`.
- **electron-builder EPERM** renaming `release\win-unpacked.tmp` →
  `win-unpacked` (something, likely AV, holds the freshly-extracted dir).
  Solved permanently via `"electronDist": "node_modules/electron/dist"` in
  package.json `build` config (skips its own extract; do not remove). A stale
  locked `release/win-unpacked.tmp` may linger; builds still succeed.
- **Vite must bind IPv4**: `server.host = 127.0.0.1` in vite.config.ts, and
  `dev:electron` uses `wait-on http-get://localhost:5173`. On this machine bare
  `localhost` binding was IPv6-only and `wait-on tcp:127.0.0.1` hung forever.
- **HMR artifact**: editing `store.tsx`/context files can throw
  "useStoreCtx outside provider" in the dev overlay, stale Fast Refresh
  boundary, NOT a real bug. Hard-reload the page.
- Recharts v3 Tooltip `formatter` value type includes arrays/undefined, use
  `tv()` + `TooltipValue` from `components/charts.tsx`.
- mfapi.in is CORS-open and keyless; Explore fires ~40 NAV-history fetches on
  first load (~10s), then in-memory + 24h localStorage summary cache.
  Scheme search needs ≥3 chars. NAVs always rendered as ₹ via `fmtInr`.
- Demo seed intentionally mirrors the reference screenshots' household; it is
  deterministic (mulberry32, seed 20260927), don't "fix" the RNG.
- **`window.confirm` is suppressed (returns false) in the Claude browser pane**,
  so destructive buttons (reset/erase/delete) no-op there. Electron shows real
  dialogs, this is a pane artifact, not a bug. For pane QA, clear
  `localStorage['fathom-store-v1']` instead.
- **Base-currency switch stamps denominations**: accounts with unset currency
  get the OLD base stamped explicitly (amounts must keep their denomination and
  convert), and accounts matching the new base collapse to unset. Without this,
  a $2,684 payment "becomes" ₹2,684, that bug shipped for ~5 minutes and is
  why the stamping exists (Settings.tsx base-currency onChange).
- Conversion happens in selectors via `Flow.base` / `balanceToBase`, never
  format-layer. Historical months use the CURRENT rate (no FX history yet).
- FX auto-refresh runs once per app launch (`fxTried` ref) when stale + a
  foreign-currency account exists; manual refresh always available in Settings.
- The MF "New listings" scan stores the full scheme-code baseline (~300KB) in
  localStorage `fathom-mf-known-v1`; "Clear mutual fund cache" wipes it (next
  scan re-baselines).
- **Imported statements flow into every tab automatically** because commit appends
  plain `Transaction`s to the one store list; all analytics read
  `s.transactions.filter(!hidden && !transfer && !acct.hidden)` (`selectors.ts`).
  Income vs expense: `flowKind` uses the category's group kind, else amount sign.
  Net worth: `accountBalanceOn` = `openingBalance + Σ tx` for transaction accounts.
  So there is no separate "import" store, do not add one.
- **Import currency semantics**: transaction amounts are stored in the *target
  account's* currency with no conversion at commit; aggregation to base happens in
  selectors via FX. The Import review therefore guards against a statement/account
  currency mismatch (`Import.tsx` `detectedCurrency` state vs `account.currency ??
  settings.currencyCode`) and offers a matching account. Detected currency comes from
  `state.format.currency` (file path) or `EmailImportResult.currency` (email path,
  the mode of per-email `parseEmail().currency`); alert-only emails have no statement
  summary, so do NOT derive currency from `summaries`.
- **Email import is cross-platform via `postal-mime`** (browser/Electron/WebView) for
  `.eml`; **IMAP (`imapflow`) is Electron-main-only** (`email:scan` IPC, exposed as
  `window.fathom.scanEmail`), so the "Connect an inbox" card only shows when
  `window.fathom?.scanEmail` exists. `parseEmail` handles alerts (line-based, last
  `at/to/from` anchor wins as merchant, `cleanMerchant` strips leading filler) and
  statement summaries; region/currency detection must match `\bGBP\b`/`\bINR\b` as
  words (a US default otherwise flips GBP dates to mdy). Needs real credentials to
  live-test IMAP; parser is unit-verified via dynamic import in the pane.
- **Password-protected PDFs**: `pdf.ts` `openDoc` throws `PdfPasswordError` on
  pdfjs `PasswordException`; callers retry with `['', ...savedPasswords]`. Clone the
  buffer (`data.slice(0)`) before each retry, pdfjs transfers/neuters the ArrayBuffer.
  Saved passwords live in `settings.statementPasswords` (Import prompt adds them).
- **LLM token limits + verified auto-pick** (`statements/llm.ts`): `callModel` sets
  per-protocol limits (Ollama `num_predict`/`num_ctx`, Anthropic/OpenAI `max_tokens`
  with `max_completion_tokens` fallback). `autoPickModel` probes candidates with a real
  request under a 15s `Promise.race` timeout and keeps the first that responds, fixing
  NVIDIA "model not found for account" 404s from picking a listed-but-uncallable model.
- **Dedupe is always on and fuzzy** (`statements/parse.ts` `markDuplicates`): matches
  against ALL `store.transactions` (any date) by exact key (date+amount+normalizedMerchant)
  OR fuzzy (same amount+merchant within `DUP_WINDOW_DAYS`=4), plus batch-internal dedupe
  (first kept, repeats flagged) for shared/overlapping statements. `dropExistingDuplicates`
  is the commit-time guard (exact match within the TARGET account) used in `Import.tsx`
  `commit`, so re-importing the same statement can't double-post even if a row is re-enabled.
  Verified: exact/fuzzy/batch flagged; same-merchant-different-amount kept.
- **AI chat + JSON helpers** (`statements/llm.ts`): `chatModel(cfg, ChatMsg[], maxTokens,
  timeoutMs=90s)` is free-text multi-turn (Anthropic gets a top-level `system` from any
  system messages; Ollama/OpenAI take the messages array; no JSON coercion). `promptJson`
  is one-shot JSON (used by fund overlap, 120s timeout). Both use module-level `withTimeout`
  (hoisted out of autoPickModel) so a slow/hung provider never wedges the UI — important:
  the configured NVIDIA `glm-5.3-flash` took ~1 min for a 2048-token JSON call in testing.
  Chat grounding lives in `lib/assistant.ts` `buildFinanceContext` (net worth, cash flow,
  top spend/income, loans via selectors) + `ASSISTANT_SYSTEM`. Page: `pages/Assistant.tsx`
  (ephemeral, not persisted; `Rich` renders **bold**/`code`/newlines only, no HTML).
- **SECURITY (2026-09-27 full pass) — do not regress:**
  (1) `main.cjs` encrypts `settings.llm.apiKey` / `settings.emailInbox.password` /
  `settings.statementPasswords` with `safeStorage` on save (`enc1:<b64>` prefix) and
  decrypts on load; renderer never sees ciphertext. A store file copied to another
  machine drops those fields on load by design (DPAPI is per-user). Keep secret-field
  paths in `mapSecretFields` in sync with the schema.
  (2) Packaged Electron serves dist over the **`app://bundle` scheme**
  (`registerSchemesAsPrivileged` MUST run before `app.whenReady`; handler uses
  `net.fetch(pathToFileURL(...))` + traversal guard). This is what makes real Workers,
  fetch of local assets (OCR/pdf.js) and CSP `'self'` work in prod — file:// broke all
  three. Window: `sandbox:true`, nav locked to app origin, `setWindowOpenHandler`
  http(s)→openExternal only, all permission requests denied.
  (3) IPC `llm:fetch` only http(s) + GET/POST, 10MB body / 32MB response / 5min timeout;
  `store:save` string ≤64MB; `email:scan` validates host/port/caps, never logs creds.
  (4) Vite dev proxy `/__llm/fetch` requires same-origin Origin + `application/json`
  content type + http(s) target (SSRF fence). `send()` in llm.ts already sets that
  content type; keep it if adding transports.
  (5) **CSP injected at build only** (`cspPlugin`, apply:'build') — dev needs inline
  HMR. `script-src 'self' 'wasm-unsafe-eval'` (wasm needed by OCR), no inline script.
  (6) **OCR fully local**: assets copied to `public/ocr` by
  `scripts/copy-ocr-assets.mjs` (wired into `prebuild`; sources: tesseract.js worker,
  tesseract.js-core **simd-lstm pair only**, `@tesseract.js-data/eng 4.0.0_best_int`).
  `pdf.ts` uses one cached worker with `workerBlobURL:false` and URLs resolved off
  `document.baseURI`. Verified: OCR with zero CDN requests. If OCR errors, check these
  four files exist in dist/ocr.
  (7) Android `allowBackup="false"` (cap sync never touches the manifest, safe);
  Export backup strips secrets (`Settings.tsx exportJson`).
  (8) Known-accepted: browser-dev localStorage store is plaintext (dev only);
  Capacitor store is plaintext but app-sandboxed (keystore plugin = future).
  (9) **Electron is now 44.4.5.** `npm run smoke:electron` boots the real main against
  built dist/ and asserts app:// URL + React mounted + preload bridge + NO node leak +
  safeStorage — run it after any electron/main.cjs change. The flaky postinstall hit
  again on upgrade (empty `dist/`, no path.txt): fix is `cd node_modules/electron &&
  node install.js`, then ensure `path.txt` contains `electron.exe`. Kill running
  electron first or npm fails EBUSY on v8_context_snapshot.bin.
  (10) **RESOLVED: Capacitor upgraded 6 → 7**, which fixed the last `tar` advisory
  (cli ≥7.5 uses tar ^7.5.3). `npm audit` is now **0 vulnerabilities, whole tree**.
  What the upgrade needed, all applied: `android/variables.gradle` minSdk 22→23,
  compile/targetSdk 34→35 plus androidx bumps; AGP 8.2.1→8.7.2 in `android/build.gradle`;
  Gradle wrapper 8.2.1→8.11.1; Java 21 (already present). Install all
  `@capacitor/*` packages in ONE npm command or peer resolution fails. Do NOT
  re-add a `tar` override, it breaks `cap sync`.
  (12) **Auto-pick must never save an unverified model.** It used to write
  `ranked[0]` even when every probe failed, leaving every AI feature on a model the
  account cannot call (NVIDIA 404 "not found for account"). `Settings.tsx` now only
  saves when `res.verified`; `autoPickModel` probes 20 candidates (10s each, 90s
  budget) and reports `tried`. Provider HTTP errors go through `friendlyHttpError`
  so users see what to do, not raw JSON.
  (13) **Sankey labels:** every node shows its amount. Thin bands have no room for a
  second line, so name+amount render inline; the `extent()` side gutters (190 left /
  185 right) are sized for that and must not be shrunk or left labels clip.
  (11) **Every build path must go through `npm run build`**, never bare `vite build` —
  the `prebuild` hook stages `public/ocr`. `dist`/`cap:*` scripts were fixed for this;
  a fresh clone running `vite build` directly would ship a silently broken OCR.
- **Fund overlap** (`lib/mfOverlap.ts` + `pages/FundOverlap.tsx`): AMFI has NO holdings
  data, so overlap is ESTIMATED from `scheme_category` bucket + tracked-index detection
  (`estimateOverlap` 0..1; same index ~0.97, same equity bucket ~0.75-0.8, equity vs
  debt/gold ~0.04). Do not claim real holdings overlap. `enrichAlternatives` grounds
  AI-suggested fund names by `searchSchemes`+`getScheme` (prefers Direct-Growth) to attach
  real house/NAV/returns. Watchlist (`store.investing.mfWatchlist`) loads by default.

## Next steps

1. Custom `.ico` + `build.win.icon` for the installer (currently default icon).
2. Phase 7: agree `market-report.json` contract with `E:\Python\Stock Research`,
   add drop-folder watcher (`research/` under userData or repo path) + read-only
   Research page.
3. Phase 8/9 per PRD roadmap (SimpleFin/Actual import; rules engine, Ctrl+K…).
4. Keep this file + PRD roadmap current after each phase.
