// Captures real PNG screenshots of each screen for the README/docs.
//
//   node_modules/electron/dist/electron.exe scripts/screenshots.cjs
//
// Reuses electron/main.cjs so the window loads the packaged app over app:// with the
// real file-backed store, then drives it route by route with capturePage(). Requires a
// production build (npm run build) and demo data in the user-data store.

const { app, BrowserWindow, nativeTheme } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

nativeTheme.themeSource = 'light' // consistent light-mode shots

// Unpackaged electron derives userData from package.json "name" (nestworth), but the
// packaged app and its demo data use the productName ("Nestworth"). Point at that so
// screenshots show real data instead of the first-run onboarding screen.
app.setPath('userData', path.join(app.getPath('appData'), 'Nestworth'))

require('../electron/main.cjs') // registers scheme + IPC, creates the window

const OUT = path.join(__dirname, '..', '..', 'docs', 'screenshots')
fs.mkdirSync(OUT, { recursive: true })

// [route, file, wait-ms, optional in-page setup before capture]
const SHOTS = [
  ['/transactions', 'transactions', 2200],
  ['/cashflow', 'cashflow', 2600],
  ['/spending', 'spending', 2400],
  ['/networth', 'networth', 2400],
  ['/accounts', 'accounts', 1800],
  ['/household', 'household', 2000],
  ['/planning', 'planning', 2600],
  ['/property/prp_linden', 'property', 2600],
  ['/funds', 'funds', 5000],
  ['/assistant', 'assistant', 1800],
  ['/import', 'import', 1800],
  ['/settings', 'settings', 2000],
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function run(win) {
  win.setContentSize(1400, 880)
  if (win.webContents.isLoading()) await new Promise((r) => win.webContents.once('did-finish-load', r))
  await sleep(1500)

  for (const [route, name, wait] of SHOTS) {
    await win.webContents.executeJavaScript(`
      (() => {
        location.hash = ${JSON.stringify('#' + route)};
        // force light theme and scroll to top for a clean frame
        document.documentElement.dataset.theme = 'light';
        const c = document.querySelector('.content'); if (c) c.scrollTo(0, 0);
        return true;
      })()
    `)
    await sleep(wait)
    const img = await win.webContents.capturePage()
    const file = path.join(OUT, `${name}.png`)
    fs.writeFileSync(file, img.toPNG())
    console.log(`SHOT ${name}.png ${img.getSize().width}x${img.getSize().height} ${Math.round(fs.statSync(file).size / 1024)}KB`)
  }
}

app.whenReady().then(async () => {
  // main.cjs also runs on whenReady; give it a tick to create the window.
  await sleep(600)
  const win = BrowserWindow.getAllWindows()[0]
  if (!win) {
    console.error('SHOT FAIL: no window')
    app.exit(1)
    return
  }
  try {
    await run(win)
    console.log('SHOT OK')
    app.exit(0)
  } catch (e) {
    console.error('SHOT FAIL:', e && e.message)
    app.exit(1)
  }
})
