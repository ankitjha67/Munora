// Orchestrates turning a batch of emails into transactions: parse each message
// for alerts/summary, then read any PDF attachments (trying candidate passwords
// for protected statements) and extract their line items.

import { parseEmail } from './parseEmail'
import type { EmailMessage, StatementSummary } from './parseEmail'
import type { ParsedRow } from '../statements/types'
import { extractPdfBuffer, PdfPasswordError } from '../statements/pdf'
import { detectFormat, extractRows } from '../statements/banks'

export interface EmailAttachment {
  filename: string
  mimeType: string
  content: ArrayBuffer
}
export interface EmailInput extends EmailMessage {
  attachments?: EmailAttachment[]
}

export interface EmailImportResult {
  rows: ParsedRow[]
  summaries: StatementSummary[]
  locked: number // attachments still locked after trying all passwords
  emails: number
  currency?: string // dominant currency detected across the parsed emails
}

async function pdfRows(buf: ArrayBuffer, passwords: string[]): Promise<{ rows: ParsedRow[]; locked: boolean }> {
  for (const pw of ['', ...passwords]) {
    try {
      const { text } = await extractPdfBuffer(buf, undefined, pw || undefined)
      const fmt = detectFormat(text)
      return { rows: extractRows(text, fmt).filter((r) => Math.abs(r.amount) >= 0.005), locked: false }
    } catch (e) {
      if (e instanceof PdfPasswordError) continue // wrong/needed password, try the next
      return { rows: [], locked: false } // corrupt or unreadable, skip
    }
  }
  return { rows: [], locked: true }
}

export async function importEmails(msgs: EmailInput[], passwords: string[], onProgress?: (m: string) => void): Promise<EmailImportResult> {
  const rows: ParsedRow[] = []
  const summaries: StatementSummary[] = []
  const curCount = new Map<string, number>()
  let locked = 0
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i]
    onProgress?.(`Reading email ${i + 1} of ${msgs.length}`)
    const res = parseEmail(m)
    if (res.statement) summaries.push(res.statement)
    if (res.currency) curCount.set(res.currency, (curCount.get(res.currency) ?? 0) + 1)
    rows.push(...res.rows)
    for (const att of m.attachments ?? []) {
      if (!/pdf/i.test(att.mimeType) && !/\.pdf$/i.test(att.filename)) continue
      onProgress?.(`Reading attachment ${att.filename}`)
      const pr = await pdfRows(att.content, passwords)
      if (pr.locked) locked++
      rows.push(...pr.rows)
    }
  }
  const currency = [...curCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  return { rows, summaries, locked, emails: msgs.length, currency }
}
