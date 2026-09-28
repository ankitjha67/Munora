// PDF text extraction with support for password-protected statements and a
// Tesseract OCR fallback for scanned pages. pdfjs and tesseract load lazily.
// OCR runs fully on-device: the worker, wasm core and English model ship with
// the app under /ocr (see scripts/copy-ocr-assets.mjs), so no remote code is
// ever fetched and OCR works offline and under the production CSP.

import type { Worker as TessWorker } from 'tesseract.js'

type TextItem = { str?: string; transform?: number[] }

let ocrWorkerP: Promise<TessWorker> | null = null
let ocrIdleTimer: ReturnType<typeof setTimeout> | undefined
let ocrChain: Promise<void> = Promise.resolve()
/** The engine holds tens of MB of wasm, so drop it once OCR has been idle a while. */
const OCR_IDLE_MS = 120_000

async function getOcrWorker(): Promise<TessWorker> {
  if (!ocrWorkerP) {
    ocrWorkerP = (async () => {
      const T = await import('tesseract.js')
      const base = document.baseURI
      return T.createWorker('eng', T.OEM.LSTM_ONLY, {
        workerPath: new URL('ocr/worker.min.js', base).href,
        corePath: new URL('ocr/core/tesseract-core-simd-lstm.wasm.js', base).href,
        langPath: new URL('ocr/lang', base).href,
        gzip: true,
        workerBlobURL: false, // real same-origin worker, no blob indirection
      })
    })()
    ocrWorkerP.catch(() => {
      ocrWorkerP = null // a failed init must not poison later attempts
    })
  }
  return ocrWorkerP
}

function scheduleOcrRelease() {
  clearTimeout(ocrIdleTimer)
  ocrIdleTimer = setTimeout(() => {
    const pending = ocrWorkerP
    ocrWorkerP = null
    void pending?.then((w) => w.terminate()).catch(() => {})
  }, OCR_IDLE_MS)
}

/**
 * Run one OCR job. A Tesseract worker handles a single recognize at a time, so
 * jobs are queued rather than run concurrently (a multi-page PDF and a dropped
 * image can otherwise overlap and interleave their results).
 */
function runOcr<T>(fn: (w: TessWorker) => Promise<T>): Promise<T> {
  const job = ocrChain.then(async () => {
    clearTimeout(ocrIdleTimer) // do not release the engine mid-queue
    const worker = await getOcrWorker()
    try {
      return await fn(worker)
    } finally {
      scheduleOcrRelease()
    }
  })
  // Keep the queue alive after a failed job, without swallowing it for the caller.
  ocrChain = job.then(
    () => undefined,
    () => undefined,
  )
  return job
}

/** Thrown when a PDF needs a password (incorrect=false) or the one given is wrong (incorrect=true). */
export class PdfPasswordError extends Error {
  constructor(public incorrect: boolean) {
    super(incorrect ? 'Incorrect PDF password' : 'This PDF is password protected')
    this.name = 'PdfPasswordError'
  }
}

/** Reconstruct line-structured text from positioned PDF text items. */
function itemsToLines(items: TextItem[]): string {
  const parts = items
    .filter((it) => typeof it.str === 'string' && it.str.trim() !== '' && it.transform)
    .map((it) => ({ x: it.transform![4], y: it.transform![5], s: it.str as string }))
  parts.sort((a, b) => (Math.abs(a.y - b.y) > 2 ? b.y - a.y : a.x - b.x))
  const lines: { y: number; text: string }[] = []
  for (const p of parts) {
    const line = lines.find((l) => Math.abs(l.y - p.y) <= 2.5)
    if (line) line.text += ' ' + p.s
    else lines.push({ y: p.y, text: p.s })
  }
  return lines.map((l) => l.text.replace(/\s+/g, ' ').trim()).join('\n')
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadPdfjs(): Promise<any> {
  const pdfjs = await import('pdfjs-dist')
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  ;(pdfjs.GlobalWorkerOptions as { workerSrc: string }).workerSrc = workerUrl
  return pdfjs
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function openDoc(pdfjs: any, data: ArrayBuffer, password?: string): Promise<any> {
  try {
    // Clone the buffer: pdfjs may transfer/detach it, which breaks password retries.
    return await pdfjs.getDocument({ data: data.slice(0), password }).promise
  } catch (e) {
    const err = e as { name?: string; code?: number }
    if (err && err.name === 'PasswordException') throw new PdfPasswordError(err.code === 2)
    throw e
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ocrPage(page: any): Promise<string> {
  const viewport = page.getViewport({ scale: 2 })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  await page.render({ canvasContext: ctx, viewport }).promise
  const { data } = await runOcr((w) => w.recognize(canvas))
  return data.text ?? ''
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function docToText(doc: any, onProgress?: (msg: string) => void): Promise<{ text: string; ocrUsed: boolean }> {
  let out = ''
  let ocrUsed = false
  for (let i = 1; i <= doc.numPages; i++) {
    onProgress?.(`Reading page ${i} of ${doc.numPages}`)
    const page = await doc.getPage(i)
    const tc = await page.getTextContent()
    const text = itemsToLines(tc.items as TextItem[])
    if (text.replace(/\s/g, '').length > 24) {
      out += text + '\n'
    } else {
      onProgress?.(`No embedded text on page ${i}, running OCR`)
      out += (await ocrPage(page)) + '\n'
      ocrUsed = true
    }
  }
  return { text: out, ocrUsed }
}

/** Extract text from PDF bytes. Pass a password for protected statements. */
export async function extractPdfBuffer(buf: ArrayBuffer, onProgress?: (msg: string) => void, password?: string): Promise<{ text: string; ocrUsed: boolean }> {
  const pdfjs = await loadPdfjs()
  const doc = await openDoc(pdfjs, buf, password)
  return docToText(doc, onProgress)
}

export async function extractPdf(file: File, onProgress?: (msg: string) => void, password?: string): Promise<{ text: string; ocrUsed: boolean }> {
  return extractPdfBuffer(await file.arrayBuffer(), onProgress, password)
}

export async function extractImage(file: File, onProgress?: (msg: string) => void): Promise<{ text: string; ocrUsed: boolean }> {
  onProgress?.('Running OCR on image')
  const { data } = await runOcr((w) => w.recognize(file))
  return { text: data.text ?? '', ocrUsed: true }
}
