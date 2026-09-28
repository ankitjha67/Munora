# Shipping a new version of Munora

How a new build reaches users, and why their data survives it.

---

## The short version

1. Bump the version in `app/package.json`.
2. Build the Windows installer and the Android APK.
3. Publish a GitHub release tagged `v<version>` with both files attached.
4. Users press **Check now** in Settings, or get told on launch if they opted in, and
   download the installer. They install it over the old one and everything is still
   there.

---

## Why user data survives an upgrade

This is the part worth being confident about.

**Desktop.** The data file lives in the operating system's user-data directory, keyed on
the product name:

```
%APPDATA%\Munora\munora-data.json      (plus munora-data.json.bak)
```

That is **not** inside the installed program, so replacing the program leaves it alone.
Installing 0.2.0 over 0.1.0 keeps every account, transaction, goal and setting. API keys
and passwords inside that file are encrypted with the Windows account, and stay readable
to the same user after the upgrade.

Two things would break that, so do not change them casually:

- `build.productName` in `app/package.json` (currently `Munora`) decides the folder
  name. Rename it and the new version looks at an empty folder.
- `build.appId` (`com.munora.app`) identifies the app to Windows for
  install/upgrade. Keep it stable so a new version replaces the old one instead of
  installing alongside it.

**Android.** Installing a newer APK with the same `appId` and a **matching signing key**
upgrades in place and keeps the app's private storage. A debug-signed APK cannot upgrade
a release-signed install (and vice versa): Android refuses the install.

Release signing is set up: a git-ignored keystore under `app/android/app/`, with its path
and credentials recorded in `app/android/key.properties`. Both are git-ignored. **Back them up somewhere safe and
never change them** — every future release must be signed with this same keystore, or
existing users cannot update in place (they would have to uninstall, which erases their
on-device data). If you ever lose it, that is unrecoverable for installed users. To build
a signed APK, `./gradlew assembleRelease` (the Gradle config picks up `key.properties`
automatically; without it, builds fall back to debug signing).

**Schema changes.** If the store shape changes, raise `CURRENT_SCHEMA` in
`app/src/lib/migrate.ts` and add the upgrade step. `migrate()` runs on load and on every
restore, so old files and old backups are brought forward automatically.

---

## Cutting a release

### 1. Version

```bash
cd app
npm version 0.2.0 --no-git-tag-version
```

The renderer reads this at build time (`__APP_VERSION__`), so Settings shows it and the
update check compares against it.

### 2. Sanity checks

```bash
cd app
npm run typecheck
npm run build
npm run smoke:electron    # boots the real app and asserts it renders
npm audit --omit=dev      # should report 0 vulnerabilities
```

### 3. Build the artefacts

Windows installer (NSIS), written to `app/release/`:

```bash
cd app
npm run dist
```

Android APK:

```bash
cd app
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug      # or assembleRelease when signing
```

### 4. Publish

Either attach the files to a release by hand at
`https://github.com/<owner>/<repo>/releases/new`, or let electron-builder do it:

```bash
cd app
set GH_TOKEN=<a token with repo scope>
npm run release
```

Requirements for the in-app check to find it:

- The tag is the version, conventionally `v0.2.0`. A leading `v` is fine, the app strips it.
- The release is **published**, not a draft. Drafts are invisible to the API.
- The Windows installer ends in `.exe` (or `.msi`) and the Android build in `.apk`, so
  the app can offer the right one. If neither is present it links to the release page
  instead of guessing.

Write the release notes for users, not for git: they are shown verbatim in Settings.

---

## What the in-app check does

Set **Settings → Updates → Release repository** to `owner/repo`.

- **Check now** requests `https://api.github.com/repos/<owner>/<repo>/releases/latest`.
  That is the only server the app contacts which the user did not configure, and no
  financial data is sent. It is off by default; automatic checking on launch is opt-in.
- If the release tag is newer than the running version, the app shows the notes and a
  download button for the matching installer, plus a **Skip this version** option.
- Public repositories need no token. GitHub rate-limits unauthenticated requests per IP,
  which a once-per-launch check will not come close to.

The app does **not** silently download or self-install. That needs code signing to avoid
Windows SmartScreen warnings, and silent replacement of a finance app is a bigger promise
than is warranted here. `electron-updater` can be added later; the `publish` config in
`package.json` already points at GitHub, so the feed would be in the right place.

---

## Moving a user between machines

Upgrades keep data automatically, but moving computers does not. In **Settings → Your
data**:

- **Download all my data** writes a single JSON file containing every account,
  transaction, category, person, property, goal and rule, wrapped in a header recording
  the app version, schema version, date and item counts. It leaves out the AI key,
  mailbox password and statement passwords, because a backup file travels.
- **Moving to a new machine?** offers the same download **including** those secrets, for
  a one-step move. Delete the file once the new machine is set up.
- **Restore from a file** reads either form, migrates old schemas, shows what is in the
  file, and asks before replacing anything.

The same file moves data between desktop and mobile in either direction.

---

## Release checklist

- [ ] Version bumped in `app/package.json`
- [ ] `npm run typecheck`, `npm run build`, `npm run smoke:electron` all pass
- [ ] `npm audit --omit=dev` reports 0 vulnerabilities
- [ ] `CURRENT_SCHEMA` raised and a migration added, if the store shape changed
- [ ] `productName` and `appId` unchanged
- [ ] Installer and APK built
- [ ] Release published (not draft), tagged `v<version>`, both files attached
- [ ] Notes written for users
- [ ] Verified: install over the previous version and confirm the data is still there
