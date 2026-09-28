// The statement-processing graph. Runs the stages in order and records what each
// one did, so the UI can show the pipeline transparently:
//   ingest -> detect -> extract -> normalize -> dedupe -> categorize -> review -> commit

import type { Store, Transaction } from '../types'
import type { CategorizedRow, ParsedRow, PipelineState, RawInput, SourceKind, StageResult } from './types'
import { parseCsv } from '../csv'
import { detectFormat, extractRows } from './banks'
import { categorizeRows } from './categorize'
import { normalizeDesc } from './merchantKB'
import { extractImage, extractPdf } from './pdf'

function kindOf(file: File): SourceKind {
  const n = file.name.toLowerCase()
  if (n.endsWith('.pdf')) return 'pdf'
  if (file.type.startsWith('image/') || /\.(png|jpe?g|webp|bmp|tiff?)$/.test(n)) return 'image'
  if (n.endsWith('.csv') || n.endsWith('.tsv') || n.endsWith('.txt')) return 'csv'
  return 'text'
}

async function ingest(file: File | null, pasted: string, onProgress?: (m: string) => void, password?: string): Promise<RawInput> {
  if (!file) return { fileName: 'Pasted text', kind: 'text', text: pasted }
  const kind = kindOf(file)
  if (kind === 'pdf') {
    const { text, ocrUsed } = await extractPdf(file, onProgress, password)
    return { fileName: file.name, kind, text, ocrUsed }
  }
  if (kind === 'image') {
    const { text, ocrUsed } = await extractImage(file, onProgress)
    return { fileName: file.name, kind, text, ocrUsed }
  }
  const raw = await file.text()
  if (kind === 'csv') {
    // Flatten CSV cells into space-separated lines so the generic parser handles it.
    const text = parseCsv(raw)
      .map((cells) => cells.join('  '))
      .join('\n')
    return { fileName: file.name, kind, text }
  }
  return { fileName: file.name, kind: 'text', text: raw }
}

// Two statements shared within a family often cover overlapping periods, and the
// same transaction can post on a slightly different day in an alert vs. the final
// statement. So dedupe is fuzzy: same amount + same normalized merchant within a
// few days counts as the same transaction, checked against ALL previously held
// records (any date) and within the batch itself.
const DUP_WINDOW_DAYS = 4
const exactKey = (date: string, amount: number, merchant: string) => `${date}|${Math.abs(amount).toFixed(2)}|${normalizeDesc(merchant)}`
const fuzzyKey = (amount: number, merchant: string) => `${Math.abs(amount).toFixed(2)}|${normalizeDesc(merchant)}`
const daysApart = (a: string, b: string) => Math.abs((Date.parse(a) - Date.parse(b)) / 86_400_000)

function push<K, V>(m: Map<K, V[]>, k: K, v: V) {
  const arr = m.get(k)
  if (arr) arr.push(v)
  else m.set(k, [v])
}

/**
 * Flag rows already present in the store or repeated within this batch, and set
 * `include=false` on them. Matching is exact (date+amount+merchant) OR fuzzy
 * (same amount+merchant within DUP_WINDOW_DAYS), so re-importing an overlapping
 * period does not create duplicates. Returns how many were flagged.
 */
export function markDuplicates(rows: CategorizedRow[], store: Store): number {
  const exact = new Set(store.transactions.map((t) => exactKey(t.date, t.amount, t.merchant)))
  const byMerchantAmount = new Map<string, string[]>()
  for (const t of store.transactions) push(byMerchantAmount, fuzzyKey(t.amount, t.merchant), t.date)

  // batch-internal: the first occurrence is kept, later matches are flagged
  const batchExact = new Set<string>()
  const batchFuzzy = new Map<string, string[]>()

  let n = 0
  for (const r of rows) {
    const ek = exactKey(r.date, r.amount, r.merchant)
    const fk = fuzzyKey(r.amount, r.merchant)
    const inStore = exact.has(ek) || (byMerchantAmount.get(fk)?.some((d) => daysApart(d, r.date) <= DUP_WINDOW_DAYS) ?? false)
    const inBatch = batchExact.has(ek) || (batchFuzzy.get(fk)?.some((d) => daysApart(d, r.date) <= DUP_WINDOW_DAYS) ?? false)
    if (inStore || inBatch) {
      r.duplicate = true
      r.include = false
      n++
    } else {
      batchExact.add(ek)
      push(batchFuzzy, fk, r.date)
    }
  }
  return n
}

/**
 * Final safety net at commit time: never insert a transaction that exactly matches
 * one already in the target account (date+amount+merchant), even if the user
 * re-enabled a flagged row. Keeps imports idempotent for the same statement.
 */
export function dropExistingDuplicates(txs: Transaction[], existing: Transaction[], accountId: string): Transaction[] {
  const inAccount = new Set(existing.filter((t) => t.accountId === accountId).map((t) => exactKey(t.date, t.amount, t.merchant)))
  return txs.filter((t) => !inAccount.has(exactKey(t.date, t.amount, t.merchant)))
}

export async function runPipeline(file: File | null, pasted: string, store: Store, onProgress?: (m: string) => void, password?: string): Promise<PipelineState> {
  const stages: StageResult[] = []
  const add = (r: StageResult) => stages.push(r)

  const input = await ingest(file, pasted, onProgress, password)
  add({ id: 'ingest', label: 'Ingest', detail: `${input.kind.toUpperCase()} ${input.fileName}${input.ocrUsed ? ' (OCR)' : ''}, ${input.text.length.toLocaleString()} chars`, ok: input.text.length > 0 })

  const format = detectFormat(input.text)
  add({ id: 'detect', label: 'Detect format', detail: `${format.bank}, ${format.region}, ${format.dateOrder.toUpperCase()} dates`, ok: true })

  let rows0 = extractRows(input.text, format)
  add({ id: 'extract', label: 'Extract rows', detail: `${rows0.length} candidate transactions`, ok: rows0.length > 0 })

  rows0 = rows0.filter((r) => Math.abs(r.amount) >= 0.005)
  add({ id: 'normalize', label: 'Normalize', detail: `${rows0.length} rows after cleanup`, ok: true })

  const rows = categorizeRows(rows0, store)
  const dupes = markDuplicates(rows, store)
  add({ id: 'dedupe', label: 'Deduplicate', detail: `${dupes} already in your data`, ok: true })

  const categorized = rows.filter((r) => r.categoryId).length
  add({ id: 'categorize', label: 'Categorize', detail: `${categorized} of ${rows.length} auto-categorized`, ok: true })

  return { input, format, rows, stages }
}

/** Categorize + flag duplicates for a set of parsed rows (used by email import). */
export function categorizeAndDedupe(rows: ParsedRow[], store: Store): CategorizedRow[] {
  const cat = categorizeRows(rows, store)
  markDuplicates(cat, store)
  return cat
}

/** Build Transaction records from the confirmed rows for a chosen account. */
export function buildTransactions(rows: CategorizedRow[], accountId: string): Transaction[] {
  return rows
    .filter((r) => r.include)
    .map((r) => ({
      id: `txn_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
      date: r.date,
      merchant: r.merchant,
      amount: Math.round(r.amount * 100) / 100,
      accountId,
      categoryId: r.categoryId,
      transfer: r.transfer || undefined,
      needsReview: r.categoryId ? undefined : true,
      notes: r.description !== r.merchant ? r.description : undefined,
    }))
}
