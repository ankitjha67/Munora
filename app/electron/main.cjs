const { app, BrowserWindow, ipcMain, shell, protocol, net, session, safeStorage } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const fs = require('node:fs');
const fsp = fs.promises;

const DEV_URL = process.env.VITE_DEV_SERVER_URL;
const APP_ORIGIN = 'app://bundle';
const DIST_DIR = path.join(__dirname, '..', 'dist');

// Window/taskbar icon. dist/ is what ships; build/ is the source and covers a dev
// run before the first build.
const ICON_PATH = [path.join(DIST_DIR, 'icon.png'), path.join(__dirname, '..', 'build', 'icon.png')].find((p) => fs.existsSync(p));

// The packaged app is served from a private, standard, secure scheme instead of
// file:// so same-origin rules, workers, fetch and the CSP all behave normally,
// and a compromised page cannot wander the filesystem.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

const dataDir = () => app.getPath('userData');
const dataFile = () => path.join(dataDir(), 'fathom-data.json');

// ---------- secrets at rest ----------
// API keys, the IMAP app password and statement-PDF passwords are encrypted with
// the OS keychain (DPAPI on Windows) before the store touches disk, and decrypted
// on load. The rest of the file stays human-readable JSON. If the file is copied
// to another machine/user, encrypted fields cannot be decrypted and are dropped
// (the user re-enters them); financial data is unaffected.
const ENC_PREFIX = 'enc1:';

function encField(v) {
  if (typeof v !== 'string' || v === '' || v.startsWith(ENC_PREFIX)) return v;
  try {
    if (!safeStorage.isEncryptionAvailable()) return v;
    return ENC_PREFIX + safeStorage.encryptString(v).toString('base64');
  } catch {
    return v; // never lose data over encryption trouble
  }
}

function decField(v) {
  if (typeof v !== 'string' || !v.startsWith(ENC_PREFIX)) return v;
  try {
    return safeStorage.decryptString(Buffer.from(v.slice(ENC_PREFIX.length), 'base64'));
  } catch {
    return undefined; // wrong machine/user profile: drop rather than feed garbage to providers
  }
}

/** Apply fn to every secret field in a parsed store. fn returning undefined removes the field. */
function mapSecretFields(store, fn) {
  const s = store && typeof store === 'object' ? store.settings : null;
  if (!s || typeof s !== 'object') return store;
  if (s.llm && typeof s.llm === 'object' && typeof s.llm.apiKey === 'string') {
    const v = fn(s.llm.apiKey);
    if (v === undefined) delete s.llm.apiKey;
    else s.llm.apiKey = v;
  }
  if (s.emailInbox && typeof s.emailInbox === 'object' && typeof s.emailInbox.password === 'string') {
    const v = fn(s.emailInbox.password);
    if (v === undefined) delete s.emailInbox.password;
    else s.emailInbox.password = v;
  }
  if (Array.isArray(s.statementPasswords)) {
    s.statementPasswords = s.statementPasswords.map(fn).filter((x) => typeof x === 'string' && x !== '');
  }
  return store;
}

async function loadStore() {
  let raw;
  try {
    raw = await fsp.readFile(dataFile(), 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') {
      // Corrupt or unreadable primary file: fall back to the last good backup.
      try { raw = await fsp.readFile(dataFile() + '.bak', 'utf8'); } catch { /* no backup */ }
    }
    if (raw === undefined) return null;
  }
  try {
    return JSON.stringify(mapSecretFields(JSON.parse(raw), decField));
  } catch {
    return raw; // not JSON we understand: hand it to the renderer's migration as-is
  }
}

// Saves are serialized: two overlapping writes would share one temp path and could
// interleave, leaving a truncated data file.
let saveQueue = Promise.resolve();
function saveStore(_event, json) {
  const run = saveQueue.then(() => writeStore(json), () => writeStore(json));
  saveQueue = run.then(() => undefined, () => undefined);
  return run;
}

async function writeStore(json) {
  if (typeof json !== 'string') throw new Error('store:save expects a string');
  if (json.length > 64 * 1024 * 1024) throw new Error('store too large');
  let out = json;
  try {
    out = JSON.stringify(mapSecretFields(JSON.parse(json), encField));
  } catch {
    /* keep the payload untouched if it is not parseable JSON */
  }
  const file = dataFile();
  const tmp = file + '.tmp';
  await fsp.mkdir(dataDir(), { recursive: true });
  await fsp.writeFile(tmp, out, 'utf8');
  try { await fsp.copyFile(file, file + '.bak'); } catch { /* first save */ }
  await fsp.rename(tmp, file);
  return true;
}

// ---------- window ----------
function createWindow() {
  const win = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1120,
    minHeight: 700,
    backgroundColor: '#F7F5F1',
    autoHideMenuBar: true,
    title: 'Nestworth',
    ...(ICON_PATH ? { icon: ICON_PATH } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  if (DEV_URL) {
    win.loadURL(DEV_URL);
  } else {
    win.loadURL(APP_ORIGIN + '/index.html');
  }

  const appOrigin = DEV_URL ? new URL(DEV_URL).origin : APP_ORIGIN;

  // The window shows this app and nothing else. Any attempt to navigate the
  // window elsewhere is blocked (an external page here would inherit the
  // preload bridge, i.e. the user's financial data), and links open in the OS
  // browser only for plain web URLs.
  win.webContents.on('will-navigate', (e, url) => {
    let target;
    try {
      target = new URL(url);
    } catch {
      e.preventDefault(); // unparseable: fail closed
      return;
    }
    if (target.origin === appOrigin) return;
    e.preventDefault();
    if (/^https?:$/.test(target.protocol)) shell.openExternal(url);
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      if (/^https?:$/.test(new URL(url).protocol)) shell.openExternal(url);
    } catch { /* malformed URL: drop */ }
    return { action: 'deny' };
  });
}

// ---------- IPC input limits ----------
const LLM_METHODS = new Set(['GET', 'POST']);
const LLM_TIMEOUT_MS = 300000;
const LLM_MAX_BODY = 10 * 1024 * 1024;
const LLM_MAX_RESPONSE = 32 * 1024 * 1024;

function validLlmRequest(req) {
  if (!req || typeof req !== 'object' || typeof req.url !== 'string') return 'bad request';
  let u;
  try { u = new URL(req.url); } catch { return 'invalid URL'; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return 'only http(s) endpoints are allowed';
  const method = (req.method || 'POST').toUpperCase();
  if (!LLM_METHODS.has(method)) return 'method not allowed';
  if (req.body !== undefined && (typeof req.body !== 'string' || req.body.length > LLM_MAX_BODY)) return 'body too large';
  if (req.headers !== undefined) {
    if (typeof req.headers !== 'object' || Array.isArray(req.headers)) return 'bad headers';
    const entries = Object.entries(req.headers);
    if (entries.length > 32) return 'too many headers';
    for (const [k, v] of entries) if (typeof k !== 'string' || typeof v !== 'string' || (k + v).length > 8192) return 'bad headers';
  }
  return null;
}

// Windows groups taskbar buttons and picks the icon by this id.
if (process.platform === 'win32') app.setAppUserModelId('com.nestworth.app');

app.whenReady().then(() => {
  // Serve the built app from dist/ over app:// with a path-traversal guard.
  if (!DEV_URL) {
    protocol.handle('app', (req) => {
      let pathname;
      try { pathname = decodeURIComponent(new URL(req.url).pathname); } catch { return new Response('bad request', { status: 400 }); }
      if (pathname === '/' || pathname === '') pathname = '/index.html';
      const file = path.normalize(path.join(DIST_DIR, pathname));
      if (file !== DIST_DIR && !file.startsWith(DIST_DIR + path.sep)) return new Response('forbidden', { status: 403 });
      return net.fetch(pathToFileURL(file).toString()).catch(() => new Response('not found', { status: 404 }));
    });
  }

  // This app never needs camera, microphone, location, notifications or any
  // other Chromium permission. Deny everything, both the async request path and
  // the synchronous check path.
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);

  // Nothing in this app embeds a <webview>; refuse any attempt to create one.
  app.on('web-contents-created', (_e, contents) => {
    contents.on('will-attach-webview', (event) => event.preventDefault());
  });

  ipcMain.handle('store:load', loadStore);
  ipcMain.handle('store:save', saveStore);
  ipcMain.handle('data:openFolder', async () => {
    await fsp.mkdir(dataDir(), { recursive: true });
    shell.openPath(dataDir());
    return true;
  });

  // Proxy LLM HTTP calls through the main process so bring-your-own-key requests
  // to frontier providers work (browser-origin CORS would otherwise block them).
  // http(s) only, GET/POST only, bounded request/response sizes and a hard
  // timeout, so the bridge cannot be turned into a general-purpose proxy.
  ipcMain.handle('llm:fetch', async (_event, req) => {
    const bad = validLlmRequest(req);
    if (bad) return { ok: false, status: 0, body: bad };
    try {
      const res = await fetch(req.url, {
        method: (req.method || 'POST').toUpperCase(),
        headers: req.headers || {},
        body: req.body,
        signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
        redirect: 'follow',
      });
      const text = await res.text();
      if (text.length > LLM_MAX_RESPONSE) return { ok: false, status: 0, body: 'response too large' };
      return { ok: res.ok, status: res.status, body: text };
    } catch (err) {
      return { ok: false, status: 0, body: String((err && err.message) || err) };
    }
  });

  // Scan an IMAP mailbox for bank/card statement and alert emails. Direct to the
  // user's mail server with an app password; nothing goes through any third party.
  // Credentials are used for this one connection and never logged or echoed back.
  ipcMain.handle('email:scan', async (_event, req) => {
    if (!req || typeof req !== 'object') return { ok: false, error: 'bad request', messages: [] };
    const host = typeof req.host === 'string' ? req.host.trim() : '';
    const port = Number.isInteger(req.port) && req.port >= 1 && req.port <= 65535 ? req.port : 993;
    const user = typeof req.user === 'string' ? req.user : '';
    const password = typeof req.password === 'string' ? req.password : '';
    const sinceDays = Math.min(Math.max(Number(req.sinceDays) || 90, 1), 3650);
    const domains = Array.isArray(req.domains) ? req.domains.filter((d) => typeof d === 'string' && d.length <= 255).slice(0, 100) : [];
    if (!host || host.length > 255 || !/^[A-Za-z0-9.-]+$/.test(host)) return { ok: false, error: 'invalid mail server host', messages: [] };
    if (!user) return { ok: false, error: 'missing mailbox user', messages: [] };

    let client;
    try {
      const { ImapFlow } = require('imapflow');
      client = new ImapFlow({ host, port, secure: !!req.secure, auth: { user, pass: password }, logger: false });
      await client.connect();
      const since = new Date(Date.now() - sinceDays * 86400000);
      const messages = [];
      const lock = await client.getMailboxLock('INBOX');
      try {
        const uidSet = new Set();
        for (const d of domains) {
          try {
            const uids = await client.search({ since, from: d }, { uid: true });
            if (Array.isArray(uids)) for (const u of uids) uidSet.add(u);
          } catch { /* skip this domain */ }
        }
        const uids = [...uidSet].sort((a, b) => a - b).slice(-300);
        if (uids.length) {
          for await (const msg of client.fetch(uids, { uid: true, envelope: true, source: true }, { uid: true })) {
            messages.push({
              from: (msg.envelope && msg.envelope.from && msg.envelope.from[0] && msg.envelope.from[0].address) || '',
              subject: (msg.envelope && msg.envelope.subject) || '',
              date: msg.envelope && msg.envelope.date ? new Date(msg.envelope.date).toISOString() : undefined,
              source: msg.source ? Buffer.from(msg.source).toString('base64') : '',
            });
          }
        }
      } finally {
        lock.release();
      }
      await client.logout().catch(() => {});
      return { ok: true, messages };
    } catch (err) {
      try { if (client) await client.logout(); } catch { /* ignore */ }
      return { ok: false, error: String((err && err.message) || err), messages: [] };
    }
  });

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
