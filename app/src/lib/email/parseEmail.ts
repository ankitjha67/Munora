// Turn a bank/card email into a statement summary and/or transactions.
// Handles two shapes: transaction-alert emails ("Rs 432 spent at Swiggy on ...")
// and statement emails (totals, due dates, and line-item tables). Statement
// bodies fall back to the generic bank line extractor.

import type { ParsedRow } from '../statements/types'
import { detectFormat, extractRows } from '../statements/banks'
import { detectIssuer } from './senders'

export interface StatementSummary {
  issuer?: string
  kind?: 'card' | 'bank'
  statementDate?: string
  dueDate?: string
  totalDue?: number
  minDue?: number
  closingBalance?: number
  currency?: string
}

export interface EmailMessage {
  from: string
  subject: string
  date?: string
  text?: string
  html?: string
}

export interface EmailParseResult {
  issuer?: string
  region?: string
  currency?: string
  statement?: StatementSummary
  rows: ParsedRow[]
  note: string
}

// Untrusted input guards: emails come from outside, so bound how much text the
// regex passes ever chew on. Real statements and alerts are far below these.
const MAX_HTML = 2_000_000
const MAX_TEXT = 1_000_000
const MAX_LINE = 2_000

export function htmlToText(html: string): string {
  return html
    .slice(0, MAX_HTML)
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|table|li|h[1-6])>/gi, '\n')
    .replace(/<td[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#8377;|&rupee;|&#x20b9;/gi, '₹')
    .replace(/&(?:pound|#163);/gi, '£')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

const num = (s: string) => Number(s.replace(/[,\s]/g, ''))
const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 }
const pad = (n: number) => String(n).padStart(2, '0')

/** Parse a loose date token like "27 Sep 2026", "27-09-2026", "09/27/2026", "2026-09-27". */
function parseDate(raw: string, order: 'dmy' | 'mdy'): string | undefined {
  const s = raw.trim()
  let m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`
  m = s.match(/(\d{1,2})[\s-]([A-Za-z]{3,9})[\s,-]+(\d{2,4})/)
  if (m && MONTHS[m[2].slice(0, 3).toLowerCase()]) {
    let y = +m[3]
    if (y < 100) y += 2000
    return `${y}-${pad(MONTHS[m[2].slice(0, 3).toLowerCase()])}-${pad(+m[1])}`
  }
  m = s.match(/([A-Za-z]{3,9})[\s-](\d{1,2})[\s,-]+(\d{2,4})/)
  if (m && MONTHS[m[1].slice(0, 3).toLowerCase()]) {
    let y = +m[3]
    if (y < 100) y += 2000
    return `${y}-${pad(MONTHS[m[1].slice(0, 3).toLowerCase()])}-${pad(+m[2])}`
  }
  m = s.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/)
  if (m) {
    let y = +m[3]
    if (y < 100) y += 2000
    const a = +m[1]
    const b = +m[2]
    const day = order === 'mdy' ? b : a
    const mon = order === 'mdy' ? a : b
    if (mon >= 1 && mon <= 12 && day >= 1 && day <= 31) return `${y}-${pad(mon)}-${pad(day)}`
  }
  return undefined
}

const CUR_RE = '(?:INR|Rs\\.?|₹|USD|US\\$|\\$|GBP|£|EUR|€)'
function findAmount(text: string, labels: RegExp): number | undefined {
  const re = new RegExp(`(?:${labels.source})[^0-9₹$£]{0,40}${CUR_RE}?\\s?([0-9][0-9,]*(?:\\.[0-9]{1,2})?)`, 'i')
  const m = text.match(re)
  return m && m[1] ? num(m[1]) : undefined
}
function findDate(text: string, labels: RegExp, order: 'dmy' | 'mdy'): string | undefined {
  const re = new RegExp(`(?:${labels.source})[^0-9A-Za-z]{0,20}([0-9]{1,2}[\\s/-][A-Za-z0-9]{2,9}[\\s/,-]+[0-9]{2,4}|[0-9]{4}-[0-9]{2}-[0-9]{2})`, 'i')
  const m = text.match(re)
  return m && m[1] ? parseDate(m[1], order) : undefined
}

function currencyOf(text: string, region: string): string {
  if (/₹|\bINR\b|\bRs\.?\b/.test(text) || region === 'IN') return 'INR'
  if (/£|\bGBP\b/.test(text) || region === 'UK') return 'GBP'
  if (/€|\bEUR\b/.test(text)) return 'EUR'
  return 'USD'
}

let seq = 0
const rowId = () => `erow_${(++seq).toString(36)}`

const SPEND_KW = /\b(spent|debited|paid|charged|withdrawn|purchase|debit of|txn of|used|deducted)\b/i
const CREDIT_KW = /\b(credited|received|deposited|added|refunded|refund of|salary)\b/i
const AMOUNT_RE = new RegExp(`${CUR_RE}\\s?([0-9][0-9,]*(?:\\.[0-9]{1,2})?)`, 'i')
// Merchant sits after "at/to/towards/from/via/for", up to "on <date>"/ref/end.
const MERCHANT_RE = /\b(?:at|to|towards|from|via|for)\s+([A-Za-z0-9][A-Za-z0-9 .&*'@/-]{1,39}?)(?=\s+(?:on|at|to|towards|from|via|for|ref|txn|dated|using|with|info)\b|[.,;]|$)/i
const ALERT_DATE_RE = /\bon\s+([0-9]{1,2}[\s/-][A-Za-z0-9]{2,9}[\s/,-]+[0-9]{2,4}|[0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2,4})/i

const FILLER = new Set(['your', 'the', 'a', 'an', 'to', 'from', 'via', 'at', 'towards', 'for', 'account', 'acct', 'a/c', 'my', 'you'])
function cleanMerchant(s: string): string {
  let out = s
    .replace(/\b(card|credit card|debit card|a\/c|account|acct|ending|ends?|no\.?|xx+[0-9]*|\*+[0-9]*)\b/gi, ' ')
    .replace(/\b[0-9]{3,}\b/g, ' ')
    .replace(/[^A-Za-z0-9 .&'@/-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const words = out.split(' ')
  while (words.length && FILLER.has(words[0].toLowerCase())) words.shift()
  out = words.join(' ')
  return out
}

/** Line-based alert extraction: one transaction per line that names an amount and a spend/credit verb. */
function extractAlerts(text: string, order: 'dmy' | 'mdy'): ParsedRow[] {
  const rows: ParsedRow[] = []
  const seen = new Set<string>()
  for (const line of text.split(/\n+/).map((l) => l.trim().slice(0, MAX_LINE))) {
    if (line.length < 8) continue
    const isCredit = CREDIT_KW.test(line)
    const isSpend = SPEND_KW.test(line)
    if (!isCredit && !isSpend) continue
    const am = line.match(AMOUNT_RE)
    if (!am) continue
    const amount = num(am[1])
    if (!amount) continue
    // last at/to/... anchor tends to be the real merchant
    let merchant = ''
    const g = new RegExp(MERCHANT_RE.source, 'gi')
    let mm: RegExpExecArray | null
    while ((mm = g.exec(line))) merchant = mm[1]
    merchant = cleanMerchant(merchant)
    if (merchant.length < 2) continue
    const dm = line.match(ALERT_DATE_RE)
    const date = (dm && parseDate(dm[1], order)) || ''
    const sign = isCredit && !isSpend ? 1 : -1
    const key = `${amount}|${merchant.toLowerCase()}|${date}`
    if (seen.has(key)) continue
    seen.add(key)
    rows.push({ id: rowId(), date: date || new Date().toISOString().slice(0, 10), description: merchant, amount: sign * amount, raw: line })
  }
  return rows
}

export function parseEmail(msg: EmailMessage): EmailParseResult {
  const text = ((msg.text && msg.text.trim().length > 20 ? msg.text : htmlToText(msg.html ?? '')) || msg.text || '').slice(0, MAX_TEXT)
  const sender = detectIssuer(msg.from, msg.subject)
  const region = sender?.region ?? (/(₹|\bINR\b|\bRs\.?\b)/.test(text) ? 'IN' : /(£|\bGBP\b)/.test(text) ? 'UK' : /(€|\bEUR\b)/.test(text) ? 'INTL' : 'US')
  const order: 'dmy' | 'mdy' = region === 'US' ? 'mdy' : 'dmy'
  const currency = currencyOf(text, region)

  const statement: StatementSummary = {
    issuer: sender?.issuer,
    kind: sender?.kind,
    currency,
    totalDue: findAmount(text, /total\s+(?:amount\s+)?(?:payment\s+)?due|total\s+dues|total\s+payable/i),
    minDue: findAmount(text, /min(?:imum)?\s+(?:amount\s+)?(?:payment\s+)?due/i),
    closingBalance: findAmount(text, /closing\s+balance|statement\s+balance|new\s+balance|available\s+balance/i),
    dueDate: findDate(text, /(?:payment\s+)?due\s+date/i, order),
    statementDate: findDate(text, /statement\s+date|statement\s+generated|bill\s+date/i, order),
  }
  const hasStatement = statement.totalDue !== undefined || statement.dueDate !== undefined || statement.closingBalance !== undefined

  // Transactions: alerts first, then statement line-items as a fallback.
  let rows = extractAlerts(text, order)
  if (rows.length === 0) {
    const fmt = detectFormat(text)
    rows = extractRows(text, { ...fmt, dateOrder: order, region: region as 'US' | 'IN' | 'UK' | 'INTL' }).filter((r) => Math.abs(r.amount) >= 0.005)
  }

  const parts: string[] = []
  if (sender) parts.push(`${sender.issuer} ${sender.kind}`)
  if (hasStatement) parts.push('statement summary found')
  parts.push(`${rows.length} transaction${rows.length === 1 ? '' : 's'}`)

  return {
    issuer: sender?.issuer,
    region,
    currency,
    statement: hasStatement ? statement : undefined,
    rows,
    note: parts.join(' · '),
  }
}
