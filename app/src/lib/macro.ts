// Macro-economic context for planning: inflation, growth and interest rates for the
// economy behind the user's base currency, plus the live FX rate (lib/fx.ts).
//
// Source: the World Bank open data API, which is keyless, CORS-open and free. Its
// series are ANNUAL and publish with a lag, so every figure carries the year it is
// for and the UI shows it. Cached for 30 days because the data only changes yearly.

export type MacroKey = 'inflation' | 'gdpGrowth' | 'lendingRate' | 'depositRate' | 'realRate'

export interface MacroPoint {
  /** Calendar year of the observation. */
  year: number
  /** Percent, e.g. 6.4 means 6.4%. */
  value: number
}

export interface MacroSeries {
  key: MacroKey
  label: string
  note: string
  latest?: MacroPoint
  history: MacroPoint[]
}

export interface MacroSnapshot {
  currency: string
  country: string
  countryName: string
  series: Record<MacroKey, MacroSeries>
  fetchedAt: number
  source: string
}

const INDICATORS: { key: MacroKey; code: string; label: string; note: string }[] = [
  { key: 'inflation', code: 'FP.CPI.TOTL.ZG', label: 'Inflation (CPI)', note: 'Annual consumer price change' },
  { key: 'gdpGrowth', code: 'NY.GDP.MKTP.KD.ZG', label: 'GDP growth', note: 'Real annual growth' },
  { key: 'lendingRate', code: 'FR.INR.LEND', label: 'Lending rate', note: 'Typical bank lending rate' },
  { key: 'depositRate', code: 'FR.INR.DPST', label: 'Deposit rate', note: 'Typical bank deposit rate' },
  { key: 'realRate', code: 'FR.INR.RINR', label: 'Real interest rate', note: 'Lending rate less inflation' },
]

/** Currency to the economy that issues it, for looking up national statistics. */
const CURRENCY_COUNTRY: Record<string, [iso3: string, name: string]> = {
  USD: ['USA', 'United States'], EUR: ['EMU', 'Euro area'], GBP: ['GBR', 'United Kingdom'],
  INR: ['IND', 'India'], JPY: ['JPN', 'Japan'], CNY: ['CHN', 'China'], AUD: ['AUS', 'Australia'],
  CAD: ['CAN', 'Canada'], CHF: ['CHE', 'Switzerland'], SGD: ['SGP', 'Singapore'],
  HKD: ['HKG', 'Hong Kong'], NZD: ['NZL', 'New Zealand'], AED: ['ARE', 'United Arab Emirates'],
  SAR: ['SAU', 'Saudi Arabia'], QAR: ['QAT', 'Qatar'], KWD: ['KWT', 'Kuwait'], BHD: ['BHR', 'Bahrain'],
  OMR: ['OMN', 'Oman'], ILS: ['ISR', 'Israel'], TRY: ['TUR', 'Turkiye'], SEK: ['SWE', 'Sweden'],
  NOK: ['NOR', 'Norway'], DKK: ['DNK', 'Denmark'], PLN: ['POL', 'Poland'], CZK: ['CZE', 'Czechia'],
  HUF: ['HUN', 'Hungary'], RON: ['ROU', 'Romania'], BGN: ['BGR', 'Bulgaria'], ISK: ['ISL', 'Iceland'],
  UAH: ['UKR', 'Ukraine'], BRL: ['BRA', 'Brazil'], MXN: ['MEX', 'Mexico'], ARS: ['ARG', 'Argentina'],
  CLP: ['CHL', 'Chile'], COP: ['COL', 'Colombia'], PEN: ['PER', 'Peru'], UYU: ['URY', 'Uruguay'],
  ZAR: ['ZAF', 'South Africa'], NGN: ['NGA', 'Nigeria'], KES: ['KEN', 'Kenya'], EGP: ['EGY', 'Egypt'],
  GHS: ['GHA', 'Ghana'], TZS: ['TZA', 'Tanzania'], UGX: ['UGA', 'Uganda'], MAD: ['MAR', 'Morocco'],
  DZD: ['DZA', 'Algeria'], TND: ['TUN', 'Tunisia'], KRW: ['KOR', 'South Korea'], TWD: ['TWN', 'Taiwan'],
  THB: ['THA', 'Thailand'], MYR: ['MYS', 'Malaysia'], IDR: ['IDN', 'Indonesia'], PHP: ['PHL', 'Philippines'],
  VND: ['VNM', 'Vietnam'], BDT: ['BGD', 'Bangladesh'], PKR: ['PAK', 'Pakistan'], LKR: ['LKA', 'Sri Lanka'],
  NPR: ['NPL', 'Nepal'], MMK: ['MMR', 'Myanmar'], KHR: ['KHM', 'Cambodia'], RUB: ['RUS', 'Russia'],
  KZT: ['KAZ', 'Kazakhstan'], GEL: ['GEO', 'Georgia'], AMD: ['ARM', 'Armenia'], AZN: ['AZE', 'Azerbaijan'],
  UZS: ['UZB', 'Uzbekistan'],
}

export const macroCountry = (currency: string) => CURRENCY_COUNTRY[currency]

const CACHE_KEY = 'munora-macro-v1'
export const MACRO_TTL_MS = 30 * 24 * 3600 * 1000

type Cache = Record<string, MacroSnapshot>

function loadCache(): Cache {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}') as Cache
  } catch {
    return {}
  }
}

export function cachedMacro(currency: string): MacroSnapshot | null {
  const hit = loadCache()[currency]
  if (!hit) return null
  return Date.now() - hit.fetchedAt > MACRO_TTL_MS ? null : hit
}

function saveCache(snap: MacroSnapshot) {
  try {
    const all = loadCache()
    all[snap.currency] = snap
    localStorage.setItem(CACHE_KEY, JSON.stringify(all))
  } catch {
    /* quota: it is only a cache */
  }
}

interface WbRow {
  date: string
  value: number | null
}

async function fetchIndicator(iso3: string, code: string): Promise<MacroPoint[]> {
  const url = `https://api.worldbank.org/v2/country/${iso3}/indicator/${code}?format=json&per_page=20&date=2010:${new Date().getFullYear()}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`World Bank HTTP ${res.status}`)
  const json = (await res.json()) as [unknown, WbRow[] | null]
  const rows = Array.isArray(json) ? json[1] : null
  if (!rows) return []
  return rows
    .filter((r) => r.value !== null && Number.isFinite(r.value))
    .map((r) => ({ year: Number(r.date), value: Math.round((r.value as number) * 100) / 100 }))
    .sort((a, b) => a.year - b.year)
}

/** Fetch the macro snapshot for a currency's economy. Served from cache when fresh. */
export async function getMacro(currency: string, force = false): Promise<MacroSnapshot> {
  if (!force) {
    const hit = cachedMacro(currency)
    if (hit) return hit
  }
  const country = CURRENCY_COUNTRY[currency]
  if (!country) throw new Error(`No national statistics mapped for ${currency}`)
  const [iso3, countryName] = country

  const settled = await Promise.allSettled(INDICATORS.map((i) => fetchIndicator(iso3, i.code)))
  const series = {} as Record<MacroKey, MacroSeries>
  let any = false
  INDICATORS.forEach((ind, i) => {
    const r = settled[i]
    const history = r.status === 'fulfilled' ? r.value : []
    if (history.length) any = true
    series[ind.key] = { key: ind.key, label: ind.label, note: ind.note, latest: history[history.length - 1], history }
  })
  if (!any) throw new Error('No macro data returned')

  const snap: MacroSnapshot = { currency, country: iso3, countryName, series, fetchedAt: Date.now(), source: 'World Bank open data' }
  saveCache(snap)
  return snap
}

export function clearMacroCache() {
  try {
    localStorage.removeItem(CACHE_KEY)
  } catch {
    /* ignore */
  }
}

/** Latest inflation as a fraction (0.064), for planning maths. */
export function inflationFraction(snap?: MacroSnapshot | null): number | undefined {
  const v = snap?.series.inflation.latest?.value
  return v === undefined ? undefined : v / 100
}

/** Value of `amount` after `years` of `rate` inflation, i.e. what it will cost then. */
export function inflateBy(amount: number, rate: number, years: number): number {
  return amount * Math.pow(1 + rate, years)
}

/** A nominal return net of inflation, compounded properly rather than subtracted. */
export function realReturn(nominal: number, inflation: number): number {
  return (1 + nominal) / (1 + inflation) - 1
}
