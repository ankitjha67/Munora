# Munora on Android & iOS

Munora ships as one codebase (`app/`) that runs as a Windows desktop app
(Electron) and as native Android/iOS apps (Capacitor). The same React UI runs in
all of them; only the storage and HTTP layers differ, and both are handled
automatically.

## What "100% local" means here

- All financial data is stored **on the device**, in a single JSON file in the
  app's private storage (`munora-data.json` via Capacitor Filesystem). No
  account, no server, no cloud sync.
- The app works **fully offline**. Every page, chart, import, and calculation is
  local. Only three optional features reach the network, and only with your
  input: mutual-fund NAVs (AMFI/mfapi.in), FX rates, and the optional import LLM
  (your own key). On mobile these go through the native HTTP stack
  (`CapacitorHttp`), so there are no browser CORS limits.
- Back up or move your data with Settings, Export backup (a plain JSON file) and
  Import backup.

## Prerequisites

- Node 20+ and the repo installed: `cd app && npm install`
- Android: Android Studio (SDK + platform tools) and a JDK 17+.
- iOS: a Mac with Xcode and CocoaPods (`sudo gem install cocoapods`). iOS cannot
  be built on Windows or Linux.

## Android

The Android project already exists at `app/android` (created with `npx cap add
android`) and is branded with the Munora icon and splash.

```bash
cd app
npm run cap:android      # builds the web bundle, syncs, and opens Android Studio
```

Then in Android Studio press Run to install on a device/emulator, or build an
APK/AAB from Build, Build Bundle(s) / APK(s).

Command-line debug APK (no Android Studio UI):

```bash
cd app && npm run build && npx cap sync android
cd android && ./gradlew assembleDebug
# output: android/app/build/outputs/apk/debug/app-debug.apk
```

Release build (signed): create a keystore, set signing in
`android/app/build.gradle`, then `./gradlew assembleRelease` (APK) or
`bundleRelease` (AAB for the Play Store).

## iOS (on a Mac)

```bash
cd app
npm i            # ensure deps
npx cap add ios  # one time, creates app/ios (Mac only)
npm run mobile:assets   # optional: brand the icon/splash
npm run cap:ios         # builds, syncs, opens Xcode
```

In Xcode select a team under Signing & Capabilities, pick a device/simulator, and
Run. Archive from Product, Archive for TestFlight/App Store.

## Updating the app after code changes

```bash
npm run cap:sync     # rebuild web + copy into android/ and ios/
```

Then rebuild in Android Studio / Xcode. During development you can also point the
native app at the Vite dev server by setting `server.url` in
`capacitor.config.ts`, but the default (bundled `dist/`) is what keeps it offline.

## Branding assets

`npm run mobile:assets` regenerates Android (and iOS, on a Mac) launcher icons and
splash screens from `build/icon.svg`. Source images land in `app/assets/`.

## Changing your AI API key on mobile

Settings, AI model for import: pick a provider, tap Auto-pick best to choose a
model, paste your key (show/hide with the eye, Clear to remove), then Test. Keys
are stored only in the on-device data file.
