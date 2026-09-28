// Boots the real main process against the built dist/ and asserts the window
// actually renders the app. Exercises the pieces most likely to break on an
// Electron upgrade: the privileged app:// scheme, its protocol handler, the
// sandboxed preload bridge and safeStorage.
//
//   node_modules/electron/dist/electron.exe scripts/smoke-electron.cjs
//
// Exits 0 on success, 1 with a reason on failure.

const { app, BrowserWindow, safeStorage } = require('electron');

require('../electron/main.cjs'); // registers schemes, IPC and creates the window

const TIMEOUT_MS = 30000;
const fail = (msg) => {
  console.error('SMOKE FAIL: ' + msg);
  app.exit(1);
};

const timer = setTimeout(() => fail(`timed out after ${TIMEOUT_MS}ms`), TIMEOUT_MS);

app.whenReady().then(async () => {
  const [win] = BrowserWindow.getAllWindows();
  if (!win) return fail('no window was created');

  win.webContents.on('did-fail-load', (_e, code, desc, url) => fail(`did-fail-load ${code} ${desc} ${url}`));
  win.webContents.on('render-process-gone', (_e, d) => fail('renderer gone: ' + d.reason));

  if (win.webContents.isLoading()) {
    await new Promise((res) => win.webContents.once('did-finish-load', res));
  }

  try {
    const report = await win.webContents.executeJavaScript(`(() => {
      const root = document.getElementById('root');
      return {
        url: location.href,
        mounted: !!root && root.children.length > 0,
        // the preload bridge must be present and must NOT leak Node
        bridge: typeof window.fathom === 'object' && typeof window.fathom.loadStore === 'function',
        nodeLeak: typeof window.require !== 'undefined' || typeof window.process !== 'undefined',
        text: (document.body.innerText || '').slice(0, 120).replace(/\\s+/g, ' ').trim(),
      };
    })()`);

    clearTimeout(timer);
    const problems = [];
    if (!report.mounted) problems.push('React did not mount (#root empty)');
    if (!report.bridge) problems.push('preload bridge missing');
    if (report.nodeLeak) problems.push('Node leaked into the renderer');
    if (!/^app:\/\/bundle\//.test(report.url)) problems.push('not served from app:// (got ' + report.url + ')');

    console.log('SMOKE url:        ' + report.url);
    console.log('SMOKE mounted:    ' + report.mounted);
    console.log('SMOKE bridge:     ' + report.bridge);
    console.log('SMOKE nodeLeak:   ' + report.nodeLeak);
    console.log('SMOKE safeStorage:' + safeStorage.isEncryptionAvailable());
    // BrowserWindow has no icon getter, so assert the asset main.cjs resolves exists.
    const fs = require('node:fs');
    const path = require('node:path');
    const iconPath = [path.join(__dirname, '..', 'dist', 'icon.png'), path.join(__dirname, '..', 'build', 'icon.png')].find((p) => fs.existsSync(p));
    console.log('SMOKE icon:       ' + (iconPath ? path.basename(path.dirname(iconPath)) + '/icon.png' : 'MISSING'));
    if (!iconPath) problems.push('window icon file missing');
    console.log('SMOKE body:       ' + report.text);

    if (problems.length) return fail(problems.join('; '));
    console.log('SMOKE OK');
    app.exit(0);
  } catch (err) {
    fail('executeJavaScript threw: ' + (err && err.message));
  }
});
