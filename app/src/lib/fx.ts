// Live FX rates, keyless sources, cached in the store (works offline after first fetch).
// Pivot is always USD: rates[C] = units of C per 1 USD (rates.USD === 1).
// convert(a, from, to) = a / rates[from] * rates[to]

import type { FxTable } from './types'

export const FX_TTL_MS = 12 * 3600 * 1000 // refetch after 12h

export function fxStale(fx?: FxTable): boolean {
  return !fx || Date.now() - fx.fetchedAt > FX_TTL_MS
}

/** open.er-api.com primary (160+ currencies), frankfurter.dev (ECB) fallback. */
export async function fetchFxTable(): Promise<FxTable> {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = (await res.json()) as { result?: string; rates?: Record<string, number>; time_last_update_unix?: number }
    if (json.result !== 'success' || !json.rates?.USD) throw new Error('Unexpected FX response')
    return { pivot: 'USD', rates: json.rates, fetchedAt: Date.now(), source: 'open.er-api.com' }
  } catch {
    const res = await fetch('https://api.frankfurter.dev/v1/latest?base=USD')
    if (!res.ok) throw new Error(`FX fetch failed (HTTP ${res.status})`)
    const json = (await res.json()) as { rates?: Record<string, number> }
    if (!json.rates) throw new Error('Unexpected FX response')
    return { pivot: 'USD', rates: { ...json.rates, USD: 1 }, fetchedAt: Date.now(), source: 'frankfurter.dev (ECB)' }
  }
}

/** Convert between any two currencies via the USD pivot. Unknown currency → 1:1 (flagged by hasRate). */
export function fxConvert(amount: number, from: string, to: string, fx?: FxTable): number {
  if (!from || !to || from === to || !fx) return amount
  const rf = fx.rates[from]
  const rt = fx.rates[to]
  if (!rf || !rt) return amount
  return (amount / rf) * rt
}

export function hasRate(currency: string, fx?: FxTable): boolean {
  return !!fx?.rates[currency]
}

/** "1 INR = 0.0113 USD" helper: units of `to` per 1 `from`. */
export function fxRate(from: string, to: string, fx?: FxTable): number | undefined {
  if (!fx) return undefined
  const rf = fx.rates[from]
  const rt = fx.rates[to]
  if (!rf || !rt) return undefined
  return rt / rf
}

/** Reasonable static seed so the demo works offline & deterministically until a live fetch lands. */
export function seedFxTable(fetchedAt: number): FxTable {
  return {
    pivot: 'USD',
    fetchedAt,
    source: 'built-in seed (refresh for live rates)',
    rates: {
      USD: 1, INR: 88.2, EUR: 0.92, GBP: 0.79, JPY: 148.5, AUD: 1.52, CAD: 1.36,
      SGD: 1.33, AED: 3.67, CHF: 0.88, CNY: 7.18, HKD: 7.8, NZD: 1.66, SAR: 3.75,
    },
  }
}
