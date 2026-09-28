// All money/date formatting goes through here.
// Base currency is set once from settings; per-account currencies use fmtMoneyIn.

import { getRegion } from './terms'

let currencyCode = 'USD'
let locale: string | undefined = 'en-US'

let fmt2: Intl.NumberFormat
let fmt0: Intl.NumberFormat
rebuild()

/** Sensible locale per currency so symbols/grouping look native ("$" not "US$", ₹ lakh grouping). */
export function localeFor(code: string): string {
  switch (code) {
    case 'INR':
      return 'en-IN'
    case 'EUR':
      return 'de-DE'
    case 'GBP':
      return 'en-GB'
    case 'JPY':
      return 'ja-JP'
    default:
      return 'en-US'
  }
}

function rebuild() {
  fmt2 = new Intl.NumberFormat(locale, { style: 'currency', currency: currencyCode, minimumFractionDigits: 2, maximumFractionDigits: 2 })
  fmt0 = new Intl.NumberFormat(locale, { style: 'currency', currency: currencyCode, maximumFractionDigits: 0 })
}

export function setCurrency(code: string, loc?: string) {
  currencyCode = code || 'USD'
  locale = loc ?? localeFor(currencyCode)
  rebuild()
}

export function getCurrency() {
  return currencyCode
}

/** "$75,063.32" (base currency) · negatives "-$125.91" */
export function fmtMoney(n: number, decimals: 0 | 2 = 2): string {
  const f = decimals === 2 ? fmt2 : fmt0
  if (Object.is(n, -0) || Math.abs(n) < 0.005) n = 0
  return f.format(n)
}

/** "+$120,175.51" / "-$125.91" (base currency) */
export function fmtMoneySigned(n: number, decimals: 0 | 2 = 2): string {
  const s = fmtMoney(Math.abs(n), decimals)
  return (n >= 0 ? '+' : '-') + s
}

// ---- per-currency formatting (multi-currency accounts) ----
const perCurrency = new Map<string, Intl.NumberFormat>()

function currencyFormatter(code: string, decimals: 0 | 2): Intl.NumberFormat {
  const key = `${code}_${decimals}`
  let f = perCurrency.get(key)
  if (!f) {
    f = new Intl.NumberFormat(localeFor(code), {
      style: 'currency',
      currency: code,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
    perCurrency.set(key, f)
  }
  return f
}

/**
 * Optional display conversion. When the user turns on "show everything in my base
 * currency", the store installs a converter here. Routing it through this one hook
 * means every existing `fmtMoneyIn` call site honours the setting, rather than each
 * view needing to remember to convert.
 */
let displayConversion: ((code: string, n: number) => number | null) | null = null

export function setDisplayConversion(fn: ((code: string, n: number) => number | null) | null) {
  displayConversion = fn
}

/** Format in a SPECIFIC currency (an account's own currency), e.g. "₹12,50,000.00". */
export function fmtMoneyIn(code: string | undefined, n: number, decimals: 0 | 2 = 2): string {
  let c = code || currencyCode
  if (c !== currencyCode && displayConversion) {
    const converted = displayConversion(c, n)
    if (converted !== null) {
      c = currencyCode
      n = converted
    }
  }
  if (c === currencyCode) return fmtMoney(n, decimals)
  if (Object.is(n, -0) || Math.abs(n) < 0.005) n = 0
  return currencyFormatter(c, decimals).format(n)
}

/** True when amounts are being shown converted into the base currency. */
export function convertingToBase(): boolean {
  return displayConversion !== null
}

/** Compact for axes: "$660k", "$1.4M", or "₹1.2L" / "₹3.4Cr" for INR in the India region. */
export function fmtCompact(n: number): string {
  const sign = n < 0 ? '-' : ''
  const a = Math.abs(n)
  const sym = currencySymbol()
  if (currencyCode === 'INR' && getRegion() === 'IN') {
    if (a >= 1_00_00_000) return `${sign}${sym}${trim(a / 1_00_00_000)}Cr`
    if (a >= 1_00_000) return `${sign}${sym}${trim(a / 1_00_000)}L`
    if (a >= 1_000) return `${sign}${sym}${trim(a / 1_000)}k`
    return `${sign}${sym}${Math.round(a)}`
  }
  if (a >= 1_000_000) return `${sign}${sym}${trim(a / 1_000_000)}M`
  if (a >= 1_000) return `${sign}${sym}${trim(a / 1_000)}k`
  return `${sign}${sym}${Math.round(a)}`
}

function trim(x: number): string {
  const r = Math.round(x * 10) / 10
  return r % 1 === 0 ? String(Math.round(r)) : r.toFixed(1)
}

export function currencySymbol(): string {
  const parts = fmt0.formatToParts(1)
  return parts.find((p) => p.type === 'currency')?.value ?? '$'
}

export function fmtPct(share: number, decimals = 1): string {
  return `${(share * 100).toFixed(decimals)}%`
}

/** "Sep 26, 2026" */
export function fmtDay(dateISO: string): string {
  const [y, m, d] = dateISO.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(locale ?? 'en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** "3:10 PM" */
export function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(locale ?? 'en-US', { hour: 'numeric', minute: '2-digit' })
}
