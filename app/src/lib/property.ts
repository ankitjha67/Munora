// How a property is performing as an investment: appreciation against what it cost,
// annualised growth, equity against the mortgage, and rental yield.
//
// Valuations are the user's own numbers. Nestworth does not scrape listing portals:
// those feeds are unreliable and their terms forbid it, and a stale scrape would be
// worse than no number on something this consequential. Instead you record a value
// yourself, compute one from a local rate per unit area (the circle/market rate), or
// ask your configured AI model for a clearly-labelled estimate to sanity-check.

import type { AreaUnit, Property, Store } from './types'
import { accountBalanceOn, balanceToBase } from './selectors'
import { todayISO } from './dates'

export const AREA_UNITS: { key: AreaUnit; label: string }[] = [
  { key: 'sqft', label: 'sq ft' },
  { key: 'sqm', label: 'sq m' },
  { key: 'sqyd', label: 'sq yd' },
]

export const areaUnitLabel = (u?: AreaUnit) => AREA_UNITS.find((x) => x.key === u)?.label ?? 'sq ft'

export interface PropertyPerformance {
  /** Latest recorded valuation, in base currency. */
  value: number
  /** Month of the latest valuation, when known. */
  valueAsOf?: string
  purchasePrice?: number
  purchaseDate?: string
  /** Value minus purchase price. */
  gain?: number
  /** Gain as a fraction of purchase price. */
  gainPct?: number
  /** Years held, fractional. */
  years?: number
  /** Annualised growth rate as a fraction. */
  cagr?: number
  mortgageBalance: number
  /** Value less what is still owed. */
  equity: number
  /** Owed as a fraction of value. */
  ltv?: number
  /** Rent booked over the last 12 months, in base currency. */
  annualRent: number
  /** Property costs over the last 12 months (excluding mortgage principal). */
  annualCosts: number
  /** Annual rent as a fraction of current value. */
  grossYield?: number
  /** Rent less costs, as a fraction of current value. */
  netYield?: number
  /** Value per unit of area at the latest valuation. */
  ratePerArea?: number
  /** Month-end valuation history, base currency. */
  history: { month: string; value: number }[]
}

function monthsBetween(aISO: string, bISO: string): number {
  const [ay, am] = aISO.slice(0, 7).split('-').map(Number)
  const [by, bm] = bISO.slice(0, 7).split('-').map(Number)
  return (by - ay) * 12 + (bm - am)
}

/**
 * Roll a property up into investment terms. `annualRent` / `annualCosts` come from the
 * caller because they depend on the selected date range logic already in selectors.
 */
export function propertyPerformance(store: Store, p: Property, annualRent: number, annualCosts: number): PropertyPerformance {
  const today = todayISO()
  const valAcc = p.valuationAccountId ? store.accounts.find((a) => a.id === p.valuationAccountId) : undefined
  const mortAcc = p.mortgageAccountId ? store.accounts.find((a) => a.id === p.mortgageAccountId) : undefined

  const history = (valAcc?.balanceHistory ?? [])
    .slice()
    .sort((a, b) => (a.month < b.month ? -1 : 1))
    .map((pt) => ({ month: pt.month, value: valAcc ? balanceToBase(store, valAcc, pt.balance) : pt.balance }))

  const value = valAcc ? balanceToBase(store, valAcc, accountBalanceOn(store, valAcc, today)) : 0
  const valueAsOf = history.length ? history[history.length - 1].month : undefined

  // A mortgage is held as a negative balance; report what is owed as a positive number.
  const mortgageBalance = mortAcc ? Math.max(0, -balanceToBase(store, mortAcc, accountBalanceOn(store, mortAcc, today))) : 0

  const out: PropertyPerformance = {
    value,
    valueAsOf,
    purchasePrice: p.purchasePrice,
    purchaseDate: p.purchaseDate,
    mortgageBalance,
    equity: value - mortgageBalance,
    ltv: value > 0 ? mortgageBalance / value : undefined,
    annualRent,
    annualCosts,
    grossYield: value > 0 ? annualRent / value : undefined,
    netYield: value > 0 ? (annualRent - annualCosts) / value : undefined,
    ratePerArea: p.area && p.area > 0 && value > 0 ? value / p.area : undefined,
    history,
  }

  if (p.purchasePrice && p.purchasePrice > 0) {
    out.gain = value - p.purchasePrice
    out.gainPct = out.gain / p.purchasePrice
    if (p.purchaseDate) {
      const years = monthsBetween(p.purchaseDate, today) / 12
      out.years = years
      // CAGR is meaningless below roughly a year, and explodes as years approaches 0.
      if (years >= 0.75 && value > 0) out.cagr = Math.pow(value / p.purchasePrice, 1 / years) - 1
    }
  }
  return out
}

/** Value implied by a local rate per unit of area. */
export function valueFromRate(area: number, ratePerArea: number): number {
  return Math.max(0, area * ratePerArea)
}

export interface AiValuation {
  /** Mid-point estimate in the base currency. */
  estimate: number
  low: number
  high: number
  /** Rate per unit area the model assumed. */
  ratePerArea?: number
  confidence: 'low' | 'medium' | 'high'
  reasoning: string
  caveats: string
}

/**
 * Prompt for a sanity-check estimate. The model has no live listing access, so it is
 * asked for a range from general knowledge and told to say when it is unsure; the UI
 * labels the result an estimate, never an appraisal.
 */
export function valuationPrompt(p: Property, perf: PropertyPerformance, currency: string, inflationPct?: number): string {
  const bits: string[] = []
  bits.push(`Property: ${p.name}`)
  if (p.locality || p.city) bits.push(`Location: ${[p.locality, p.city].filter(Boolean).join(', ')}`)
  if (p.area) bits.push(`Area: ${p.area} ${areaUnitLabel(p.areaUnit)}`)
  if (p.purchasePrice) bits.push(`Bought for ${p.purchasePrice} ${currency}${p.purchaseDate ? ` on ${p.purchaseDate}` : ''}`)
  if (perf.value > 0) bits.push(`Last recorded value: ${Math.round(perf.value)} ${currency}${perf.valueAsOf ? ` (as of ${perf.valueAsOf})` : ''}`)
  if (perf.annualRent > 0) bits.push(`Rent booked in the last 12 months: ${Math.round(perf.annualRent)} ${currency}`)
  if (inflationPct !== undefined) bits.push(`Local consumer inflation is about ${inflationPct.toFixed(1)}% a year`)

  return [
    'You are a property analyst. Estimate the current market value of this property.',
    'You do NOT have live listing data. Use general knowledge of the area and typical price levels, and be explicit about uncertainty.',
    '',
    bits.join('\n'),
    '',
    `All amounts are in ${currency}. Reply with JSON only:`,
    '{',
    '  "estimate": <number, mid-point current market value>,',
    '  "low": <number, lower end of a plausible range>,',
    '  "high": <number, upper end of a plausible range>,',
    `  "ratePerArea": <number or null, implied value per ${areaUnitLabel(p.areaUnit)}>,`,
    '  "confidence": "low" | "medium" | "high",',
    '  "reasoning": "<2-3 sentences on what drove the number>",',
    '  "caveats": "<one sentence on what would change it most>"',
    '}',
    'If you do not know the area well, say so in the reasoning, widen the range and set confidence to "low".',
  ].join('\n')
}
