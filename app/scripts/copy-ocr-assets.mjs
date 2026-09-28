// Copies the Tesseract OCR runtime (worker, wasm core, English language data)
// from node_modules into public/ocr so OCR runs fully locally: no CDN fetch,
// no remote code, works offline, and passes the production CSP (script-src 'self').
// Idempotent; wired into `prebuild`.

import { copyFileSync, mkdirSync, existsSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const nm = join(root, 'node_modules')
const out = join(root, 'public', 'ocr')

const FILES = [
  // [source (in node_modules), destination (under public/ocr)]
  ['tesseract.js/dist/worker.min.js', 'worker.min.js'],
  ['tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'core/tesseract-core-simd-lstm.wasm.js'],
  ['tesseract.js-core/tesseract-core-simd-lstm.wasm', 'core/tesseract-core-simd-lstm.wasm'],
  // Same integerized "best" English model tesseract.js would otherwise pull from its CDN.
  ['@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', 'lang/eng.traineddata.gz'],
]

let copied = 0
for (const [src, dst] of FILES) {
  const from = join(nm, src)
  const to = join(out, dst)
  if (!existsSync(from)) {
    console.error(`[ocr-assets] missing ${src} — run npm install`)
    process.exitCode = 1
    continue
  }
  if (existsSync(to) && statSync(to).size === statSync(from).size) continue // up to date
  mkdirSync(dirname(to), { recursive: true })
  copyFileSync(from, to)
  copied++
}
console.log(`[ocr-assets] ${copied ? `copied ${copied} file(s)` : 'up to date'} -> public/ocr`)
