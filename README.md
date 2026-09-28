# Nestworth

**Your whole household, one clear number.**

Nestworth is a local-first personal finance app for Windows, Android and iOS. It brings
your accounts, transactions, investments, loans and property into one place, and every
figure stays on your own device. There is no account to create and no server that holds
your data.

> Not affiliated with any commercial finance product. Not financial advice.

---

## Install

Grab the latest build from the [**Releases**](../../releases) page:

- **Windows** — download the `.exe` installer and run it.
- **Android** — download the `.apk` and install it (you may need to allow installs from
  your browser).
- **iOS** — build from source on a Mac (see below); there is no App Store build.

Inside the app, **Settings → Updates** checks this repository for newer releases and links
you straight to the download. It only ever asks GitHub for the latest release number; none
of your financial data leaves the device.

### Upgrading keeps your data

Your data lives in your operating system's user profile, not inside the installed program,
so installing a new version over an old one keeps every account, transaction and setting.
To move to a different machine, use **Settings → Your data → Download all my data** and
restore the file on the other device. See [RELEASING.md](RELEASING.md) for the details.

---

## What it does

- **Accounts, transactions, cash flow, spending and net worth** with a Sankey view and
  category breakdowns.
- **Households** — each person keeps their own accounts; totals roll up together.
- **Statement import** from PDF/CSV/image (with on-device OCR) and **from email**,
  CRED-style, including password-protected statement PDFs. Always-on fuzzy de-duplication.
- **Investments** — a mutual-fund explorer (AMFI data), a fund-overlap checker, and
  insurance-based vehicles.
- **Goal-based planning** funded by any mix of accounts and funds, with progress tracking,
  plus a FIRE projection.
- **Property valuation** — record a value, compute one from a local rate per unit area, or
  get an AI estimate, then track appreciation, yield and equity.
- **Multi-currency** with live rates and a "show everything in my base currency" mode, and
  **macro context** (inflation, growth, interest rates) for planning.
- An optional **AI assistant** and AI-assisted statement categorization, using an API key
  you bring and store locally. Nothing is required; the app is fully usable offline.

---

## Build from source

Requires Node.js 20+. For Android you also need the Android SDK and JDK 21; for iOS, a Mac
with Xcode.

```bash
cd app
npm install

# Desktop (Electron), development
npm run dev

# Windows installer -> app/release/
npm run dist

# Android APK
npm run build && npx cap sync android
cd android && ./gradlew assembleDebug   # app/android/app/build/outputs/apk/debug/
```

Other useful scripts: `npm run typecheck`, `npm run build`, `npm run smoke:electron`
(boots the packaged app and checks it renders).

---

## Privacy & security

- Data is stored on-device in a single JSON file; API keys and passwords in it are
  encrypted with the OS keychain on desktop.
- The packaged desktop app runs sandboxed, over a private `app://` scheme, with a strict
  Content-Security-Policy, and denies all Chromium permission prompts.
- OCR runs entirely on-device (no cloud). The only network calls are to services you
  choose: mutual-fund/FX/macro data, the GitHub release check, and your own AI provider.
- Exported backups exclude secrets by default.

---

## Documentation

- [PRD.md](PRD.md) — product requirements, feature by feature.
- [CONTEXT.md](CONTEXT.md) — engineering context and hard-won gotchas.
- [RELEASING.md](RELEASING.md) — how to cut a release and why upgrades keep user data.
- [BRANDING.md](BRANDING.md), [MOBILE.md](MOBILE.md).

## License

No license has been chosen yet, so all rights are reserved by the author. Add a `LICENSE`
file to permit reuse.
