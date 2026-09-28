// Bank-format detection and a generic, layout-tolerant row extractor.
// A single heuristic parser handles most bank and card statements worldwide:
// find a date, the money tokens, and infer the sign from Dr/Cr markers, running
// balance deltas, parentheses, or keywords. Named hints tune date order/currency.

import type { DetectedFormat, ParsedRow } from './types'

const BANK_HINTS: { kw: RegExp; bank: string; region: DetectedFormat['region']; dateOrder: DetectedFormat['dateOrder']; currency?: string }[] = [
  { kw: /\bhdfc\b/i, bank: 'HDFC Bank', region: 'IN', dateOrder: 'dmy', currency: 'INR' },
  { kw: /\bicici\b/i, bank: 'ICICI Bank', region: 'IN', dateOrder: 'dmy', currency: 'INR' },
  { kw: /state bank of india|\bsbi\b/i, bank: 'State Bank of India', region: 'IN', dateOrder: 'dmy', currency: 'INR' },
  { kw: /\baxis bank\b/i, bank: 'Axis Bank', region: 'IN', dateOrder: 'dmy', currency: 'INR' },
  { kw: /\bkotak\b/i, bank: 'Kotak', region: 'IN', dateOrder: 'dmy', currency: 'INR' },
  { kw: /chase|jpmorgan/i, bank: 'Chase', region: 'US', dateOrder: 'mdy', currency: 'USD' },
  { kw: /bank of america|bofa/i, bank: 'Bank of America', region: 'US', dateOrder: 'mdy', currency: 'USD' },
  { kw: /wells fargo/i, bank: 'Wells Fargo', region: 'US', dateOrder: 'mdy', currency: 'USD' },
  { kw: /american express|amex/i, bank: 'American Express', region: 'US', dateOrder: 'mdy', currency: 'USD' },
  { kw: /\bcapital one\b/i, bank: 'Capital One', region: 'US', dateOrder: 'mdy', currency: 'USD' },
  { kw: /\bciti\b/i, bank: 'Citi', region: 'US', dateOrder: 'mdy', currency: 'USD' },
  { kw: /barclays/i, bank: 'Barclays', region: 'UK', dateOrder: 'dmy', currency: 'GBP' },
  { kw: /\bhsbc\b/i, bank: 'HSBC', region: 'UK', dateOrder: 'dmy', currency: 'GBP' },
  { kw: /\blloyds\b/i, bank: 'Lloyds', region: 'UK', dateOrder: 'dmy', currency: 'GBP' },
  { kw: /\bmonzo\b/i, bank: 'Monzo', region: 'UK', dateOrder: 'dmy', currency: 'GBP' },
  { kw: /\brevolut\b/i, bank: 'Revolut', region: 'INTL', dateOrder: 'dmy' },
]

export function detectFormat(text: string): DetectedFormat {
  for (const h of BANK_HINTS) if (h.kw.test(text)) return { bank: h.bank, region: h.region, dateOrder: h.dateOrder, currency: h.currency }
  // Fall back to currency-symbol sniffing.
  if (/₹|\bINR\b|\bRs\.?\b/.test(text)) return { bank: 'Unknown (India)', region: 'IN', dateOrder: 'dmy', currency: 'INR' }
  if (/£|\bGBP\b/.test(text)) return { bank: 'Unknown (UK)', region: 'UK', dateOrder: 'dmy', currency: 'GBP' }
  if (/\$|\bUSD\b/.test(text)) return { bank: 'Unknown (US)', region: 'US', dateOrder: 'mdy', currency: 'USD' }
  return { bank: 'Unknown', region: 'INTL', dateOrder: 'dmy' }
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
}
const pad = (n: number) => String(n).padStart(2, '0')

/** Match a leading date on a line; return [iso, restOfLine] or null. */
function matchDate(line: string, order: DetectedFormat['dateOrder']): [string, string] | null {
  // 2026-09-27
  let m = line.match(/^\s*(\d{4})-(\d{1,2})-(\d{1,2})\b(.*)$/)
  if (m) return [`${m[1]}-${pad(+m[2])}-${pad(+m[3])}`, m[4]]
  // 27 Sep 2026 / 27-Sep-26 / Sep 27, 2026
  m = line.match(/^\s*(\d{1,2})[\s-]([A-Za-z]{3,4})[\s-,]+(\d{2,4})\b(.*)$/)
  if (m && MONTHS[m[2].toLowerCase()]) {
    let y = +m[3]
    if (y < 100) y += 2000
    return [`${y}-${pad(MONTHS[m[2].toLowerCase()])}-${pad(+m[1])}`, m[4]]
  }
  m = line.match(/^\s*([A-Za-z]{3,4})[\s-](\d{1,2})[\s-,]+(\d{2,4})\b(.*)$/)
  if (m && MONTHS[m[1].toLowerCase()]) {
    let y = +m[3]
    if (y < 100) y += 2000
    return [`${y}-${pad(MONTHS[m[1].toLowerCase()])}-${pad(+m[2])}`, m[4]]
  }
  // 27/09/2026 or 09/27/2026 or 27-09-26
  m = line.match(/^\s*(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b(.*)$/)
  if (m) {
    let a = +m[1]
    let b = +m[2]
    let y = +m[3]
    if (y < 100) y += 2000
    let day: number, mon: number
    if (order === 'mdy') {
      mon = a
      day = b
    } else {
      day = a
      mon = b
    }
    if (a > 12 && order === 'mdy') {
      day = a
      mon = b
    } // guard obviously-wrong mdy
    if (b > 12 && order !== 'mdy') {
      mon = a
      day = b
    }
    if (mon < 1 || mon > 12 || day < 1 || day > 31) return null
    return [`${y}-${pad(mon)}-${pad(day)}`, m[4]]
  }
  return null
}

interface MoneyTok {
  value: number
  paren: boolean
  drcr?: 'dr' | 'cr'
  index: number
  length: number
}

function moneyTokens(s: string): MoneyTok[] {
  const re = /(-)?(\()?\s*(?:[₹$£€]|Rs\.?)?\s?(\d{1,3}(?:,\d{2,3})*(?:\.\d{1,2})?|\d+\.\d{1,2})\s*(\))?\s*(Dr|Cr|DR|CR|dr|cr)?/g
  const out: MoneyTok[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(s))) {
    const digits = m[3]
    if (!digits || !/\d/.test(digits)) continue
    // require a decimal or a grouping comma to avoid catching plain reference ints
    if (!digits.includes('.') && !digits.includes(',')) continue
    const value = Number(digits.replace(/,/g, ''))
    if (!Number.isFinite(value)) continue
    out.push({
      value,
      paren: !!m[2] || !!m[4] || !!m[1],
      drcr: m[5] ? (m[5].toLowerCase() as 'dr' | 'cr') : undefined,
      index: m.index,
      length: m[0].length,
    })
  }
  return out
}

const POSITIVE_KW = /\b(credit|deposit|salary|payroll|refund|interest|cashback|received|reversal|neft cr|imps.*cr|dividend|cr\b)/i

export function extractRows(text: string, format: DetectedFormat): ParsedRow[] {
  const lines = text.split('\n')
  const rows: ParsedRow[] = []
  let prevBalance: number | undefined
  let seq = 0

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.length < 6) continue
    const d = matchDate(trimmed, format.dateOrder)
    if (!d) continue
    const [iso, rest] = d
    const toks = moneyTokens(rest)
    if (toks.length === 0) continue

    let amountTok: MoneyTok
    let balanceAfter: number | undefined
    if (toks.length === 1) {
      amountTok = toks[0]
    } else {
      // Last money token is usually the running balance.
      balanceAfter = toks[toks.length - 1].value
      const rest2 = toks.slice(0, -1)
      amountTok = rest2.find((t) => t.drcr) ?? rest2[rest2.length - 1]
    }

    let amount = Math.abs(amountTok.value)
    // Sign resolution, most reliable first.
    let sign: number | undefined
    if (amountTok.drcr) sign = amountTok.drcr === 'cr' ? 1 : -1
    else if (balanceAfter !== undefined && prevBalance !== undefined) {
      const up = Math.abs(balanceAfter - (prevBalance + amount)) < Math.max(0.02, amount * 0.001)
      const down = Math.abs(balanceAfter - (prevBalance - amount)) < Math.max(0.02, amount * 0.001)
      if (up && !down) sign = 1
      else if (down && !up) sign = -1
    }
    if (sign === undefined && amountTok.paren) sign = -1
    if (sign === undefined) sign = POSITIVE_KW.test(rest) ? 1 : -1
    if (balanceAfter !== undefined) prevBalance = balanceAfter

    // Description: strip all money tokens and Dr/Cr words.
    let desc = rest
    for (const t of [...toks].sort((a, b) => b.index - a.index)) desc = desc.slice(0, t.index) + ' ' + desc.slice(t.index + t.length)
    desc = desc
      .replace(/\b(Dr|Cr|DR|CR)\b/g, ' ')
      .replace(/[|]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (!desc) desc = 'Transaction'

    rows.push({ id: `row_${++seq}`, date: iso, description: desc, amount: sign * amount, balanceAfter, raw: trimmed })
  }
  return rows
}
