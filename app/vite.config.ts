import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Dev-server proxy so the app can call LLM providers from the browser preview
// without hitting CORS. In the packaged apps this is handled natively: Electron
// proxies through the main process, and mobile uses CapacitorHttp.
//
// Hardened: although the dev server binds 127.0.0.1, any web page open in the
// same browser could still fire cross-site POSTs at it and use it as a relay
// into the local network. So the proxy only accepts same-origin requests
// (Origin header absent or this dev server), requires a JSON content type, and
// only forwards to http(s) endpoints, with bounded request/response sizes.
function llmProxy(): Plugin {
  const SELF_ORIGINS = new Set(['http://localhost:5173', 'http://127.0.0.1:5173'])
  const MAX_REQUEST = 10 * 1024 * 1024
  const MAX_RESPONSE = 32 * 1024 * 1024
  return {
    name: 'nestworth-llm-proxy',
    configureServer(server) {
      server.middlewares.use('/__llm/fetch', (req, res) => {
        const deny = (code: number, msg: string) => {
          res.statusCode = code
          res.end(msg)
        }
        if (req.method !== 'POST') return deny(405, 'POST only')
        const origin = req.headers.origin
        if (origin && !SELF_ORIGINS.has(origin)) return deny(403, 'forbidden origin')
        if (!/^application\/json\b/i.test(String(req.headers['content-type'] ?? ''))) return deny(415, 'application/json only')
        let raw = ''
        let overflow = false
        req.on('data', (c) => {
          raw += c
          if (raw.length > MAX_REQUEST) {
            overflow = true
            req.destroy()
          }
        })
        req.on('end', async () => {
          if (overflow) return
          res.setHeader('Content-Type', 'application/json')
          try {
            const { url, method, headers, body } = JSON.parse(raw || '{}')
            const target = new URL(String(url))
            if (target.protocol !== 'http:' && target.protocol !== 'https:') throw new Error('only http(s) endpoints are allowed')
            const m = String(method || 'POST').toUpperCase()
            if (m !== 'GET' && m !== 'POST') throw new Error('method not allowed')
            const r = await fetch(target, { method: m, headers: headers || {}, body, signal: AbortSignal.timeout(300000) })
            const text = await r.text()
            if (text.length > MAX_RESPONSE) throw new Error('response too large')
            res.end(JSON.stringify({ ok: r.ok, status: r.status, body: text }))
          } catch (e) {
            res.end(JSON.stringify({ ok: false, status: 0, body: String((e as Error)?.message ?? e) }))
          }
        })
      })
    },
  }
}

// Production Content-Security-Policy, injected only into built output so Vite
// dev/HMR (inline preamble, websocket) keeps working. Blocks remote/inline
// script entirely; 'wasm-unsafe-eval' is needed by the bundled OCR engine.
// connect-src allows https plus localhost http because LLM endpoints are
// bring-your-own (Ollama/LM Studio run on http://localhost).
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https: http://localhost:* http://127.0.0.1:* http://[::1]:*",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  "frame-src 'none'",
].join('; ')

function cspPlugin(): Plugin {
  return {
    name: 'nestworth-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`)
    },
  }
}

// The running version is shown in Settings and compared against the latest GitHub
// release, so it is injected from package.json at build time.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [react(), llmProxy(), cspPlugin()],
  base: './',
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  build: { outDir: 'dist', chunkSizeWarningLimit: 1600 },
})
