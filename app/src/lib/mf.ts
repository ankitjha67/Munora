// Mutual fund data client, AMFI data via the free, keyless mfapi.in API.
// NAVs are INR and independent of the app's display currency.

export interface MfSearchResult {
  schemeCode: number
  schemeName: string
}

export interface MfMeta {
  fund_house: string
  scheme_type: string
  scheme_category: string
  scheme_code: number
  scheme_name: string
  isin_growth?: string | null
  isin_div_reinvestment?: string | null
}

export interface MfNavPoint {
  date: string // ISO
  nav: number
}

export interface MfScheme {
  meta: MfMeta
  navs: MfNavPoint[] // ascending by date
}

const BASE = 'https://api.mfapi.in/mf'

/** AMFI publishes NAVs once per business day, treat cached NAV history stale after 6h. */
export const SCHEME_TTL_MS = 6 * 3600 * 1000

interface CacheEntry {
  promise: Promise<MfScheme>
  at: number
}
const schemeCache = new Map<number, CacheEntry>()

export async function searchSchemes(q: string): Promise<MfSearchResult[]> {
  const res = await fetch(`${BASE}/search?q=${encodeURIComponent(q)}`)
  if (!res.ok) throw new Error(`Search failed (HTTP ${res.status})`)
  const json = (await res.json()) as MfSearchResult[]
  return Array.isArray(json) ? json : []
}

function toISO(d: string): string {
  // "27-09-2026" → "2026-09-27"
  const [dd, mm, yyyy] = d.split('-')
  return `${yyyy}-${mm}-${dd}`
}

/** Fetch a scheme with its full NAV history. Cached; refetched once older than `maxAgeMs` (pass 0 to force). */
export function getScheme(code: number, maxAgeMs: number = SCHEME_TTL_MS): Promise<MfScheme> {
  const hit = schemeCache.get(code)
  if (hit && Date.now() - hit.at < Math.max(1, maxAgeMs)) return hit.promise
  const p = (async () => {
    const res = await fetch(`${BASE}/${code}`)
    if (!res.ok) throw new Error(`Fund ${code} failed (HTTP ${res.status})`)
    const json = (await res.json()) as { meta: MfMeta; data: { date: string; nav: string }[] }
    if (!json?.meta || !Array.isArray(json.data)) throw new Error('Unexpected API response')
    const navs = json.data
      .map((d) => ({ date: toISO(d.date), nav: Number(d.nav) }))
      .filter((p2) => Number.isFinite(p2.nav) && p2.nav > 0)
      .reverse()
    return { meta: json.meta, navs }
  })()
  p.catch(() => {
    // don't cache failures; keep whatever good entry existed before a forced refresh
    if (schemeCache.get(code)?.promise === p) {
      if (hit) schemeCache.set(code, hit)
      else schemeCache.delete(code)
    }
  })
  schemeCache.set(code, { promise: p, at: Date.now() })
  return p
}

// ---------- returns ----------
export interface MfReturns {
  latest: number
  latestDate: string
  r1m?: number
  r6m?: number
  r1y?: number
  r3y?: number
  r5y?: number
}

function shiftISO(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const total = y * 12 + (m - 1) + months
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  const last = new Date(ny, nm, 0).getDate()
  return `${ny}-${String(nm).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`
}

/** Latest NAV on or before the target date (binary search). */
function navOnOrBefore(navs: MfNavPoint[], iso: string): MfNavPoint | undefined {
  let lo = 0
  let hi = navs.length - 1
  let best: MfNavPoint | undefined
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (navs[mid].date <= iso) {
      best = navs[mid]
      lo = mid + 1
    } else hi = mid - 1
  }
  return best
}

export function computeReturns(s: MfScheme): MfReturns {
  const navs = s.navs
  const last = navs[navs.length - 1]
  const out: MfReturns = { latest: last?.nav ?? 0, latestDate: last?.date ?? '' }
  if (!last) return out
  const calc = (months: number): number | undefined => {
    const target = shiftISO(last.date, -months)
    if (navs[0].date > target) return undefined // fund too young
    const p = navOnOrBefore(navs, target)
    if (!p || p.nav <= 0) return undefined
    const growth = last.nav / p.nav
    const years = months / 12
    return years >= 1 ? Math.pow(growth, 1 / years) - 1 : growth - 1
  }
  out.r1m = calc(1)
  out.r6m = calc(6)
  out.r1y = calc(12)
  out.r3y = calc(36)
  out.r5y = calc(60)
  return out
}

/** Downsample NAV history for charting (~maxPoints evenly spaced + always the last). */
export function sampleNavs(navs: MfNavPoint[], fromISO: string, maxPoints = 320): MfNavPoint[] {
  const window = navs.filter((p) => p.date >= fromISO)
  if (window.length <= maxPoints) return window
  const step = window.length / maxPoints
  const out: MfNavPoint[] = []
  for (let i = 0; i < maxPoints; i++) out.push(window[Math.floor(i * step)])
  if (out[out.length - 1] !== window[window.length - 1]) out.push(window[window.length - 1])
  return out
}

// ---------- Explore (curated category screens, discovered via search) ----------
export interface ExploreCategory {
  key: string
  title: string
  query: string
  note: string
}

export const EXPLORE_CATEGORIES: ExploreCategory[] = [
  { key: 'index', title: 'Index funds', query: 'nifty 50 index fund direct growth', note: 'Passive large-cap trackers' },
  { key: 'flexi', title: 'Flexi cap', query: 'flexi cap fund direct growth', note: 'Go-anywhere equity' },
  { key: 'large', title: 'Large cap', query: 'large cap fund direct growth', note: 'Blue-chip equity' },
  { key: 'mid', title: 'Mid cap', query: 'midcap fund direct growth', note: 'Higher growth, higher risk' },
  { key: 'small', title: 'Small cap', query: 'small cap fund direct growth', note: 'Aggressive equity' },
  { key: 'elss', title: 'ELSS (tax saver)', query: 'elss tax saver direct growth', note: '80C-eligible, 3y lock-in' },
  { key: 'hybrid', title: 'Aggressive hybrid', query: 'aggressive hybrid fund direct growth', note: 'Equity + debt mix' },
  { key: 'liquid', title: 'Liquid / money market', query: 'liquid fund direct growth', note: 'Parking cash' },
  { key: 'gold', title: 'Gold funds', query: 'gold fund direct growth', note: 'Commodity exposure' },
]

export interface ExploreRow {
  code: number
  name: string
  category: string
  fundHouse: string
  returns: MfReturns
}

const looksDirect = (n: string) => /direct/i.test(n) && /growth/i.test(n)

/** Top funds for a category: search → prefer Direct-Growth plans → fetch → rank by 1Y. */
export async function exploreCategory(cat: ExploreCategory, take = 5): Promise<ExploreRow[]> {
  const results = await searchSchemes(cat.query)
  const direct = results.filter((r) => looksDirect(r.schemeName))
  const pool = (direct.length >= take ? direct : results).slice(0, Math.max(10, take * 2))
  const settled = await Promise.allSettled(pool.map((r) => getScheme(r.schemeCode)))
  const rows: ExploreRow[] = []
  for (const s of settled) {
    if (s.status !== 'fulfilled') continue
    const returns = computeReturns(s.value)
    if (returns.r1y === undefined) continue
    rows.push({
      code: s.value.meta.scheme_code,
      name: s.value.meta.scheme_name,
      category: s.value.meta.scheme_category,
      fundHouse: s.value.meta.fund_house,
      returns,
    })
  }
  rows.sort((a, b) => (b.returns.r1y ?? -1) - (a.returns.r1y ?? -1))
  return rows.slice(0, take)
}

// ---------- small persistent summary cache (Explore results, 24h) ----------
const EXPLORE_CACHE_KEY = 'fathom-mf-explore-v1'
interface ExploreCache {
  ts: number
  rows: Record<string, ExploreRow[]>
}

export function loadExploreCache(): Record<string, ExploreRow[]> | null {
  try {
    const raw = localStorage.getItem(EXPLORE_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as ExploreCache
    if (Date.now() - parsed.ts > 24 * 3600 * 1000) return null
    return parsed.rows
  } catch {
    return null
  }
}

export function saveExploreCache(rows: Record<string, ExploreRow[]>) {
  try {
    localStorage.setItem(EXPLORE_CACHE_KEY, JSON.stringify({ ts: Date.now(), rows } satisfies ExploreCache))
  } catch {
    /* quota, fine, it's a cache */
  }
}

// ---------- watchlist summary cache (instant paint, then revalidate) ----------
const WATCH_SUM_KEY = 'fathom-mf-watch-sum-v1'
export const WATCH_TTL_MS = 6 * 3600 * 1000

export interface WatchSummary {
  code: number
  name: string
  fundHouse: string
  category: string
  returns: MfReturns
  fetchedAt: number
}

export function loadWatchSummaries(): Record<number, WatchSummary> {
  try {
    return JSON.parse(localStorage.getItem(WATCH_SUM_KEY) ?? '{}') as Record<number, WatchSummary>
  } catch {
    return {}
  }
}

export function saveWatchSummary(s: WatchSummary) {
  try {
    const all = loadWatchSummaries()
    all[s.code] = s
    localStorage.setItem(WATCH_SUM_KEY, JSON.stringify(all))
  } catch {
    /* quota, cache only */
  }
}

// ---------- new-listing discovery (diff the full AMFI scheme list) ----------
const KNOWN_KEY = 'fathom-mf-known-v1'
const NEW_SCAN_KEY = 'fathom-mf-newscan-v1'
export const NEW_SCAN_TTL_MS = 7 * 24 * 3600 * 1000

export interface NewScanResult {
  baseline: boolean
  newSchemes: MfSearchResult[]
  total: number
  prevTotal: number
  scannedAt: number
  /** Highest scheme codes in the universe. AMFI issues codes roughly in order, so
   * these are the most recently listed schemes. Shown when nothing is new since the
   * last scan, so the tab is still useful instead of empty. */
  recent?: MfSearchResult[]
}

/** Full AMFI scheme list (~40k entries, ~8 MB), only fetched by explicit/weekly scans. */
export async function getAllSchemes(): Promise<MfSearchResult[]> {
  const res = await fetch(BASE)
  if (!res.ok) throw new Error(`Scheme list failed (HTTP ${res.status})`)
  const json = (await res.json()) as MfSearchResult[]
  if (!Array.isArray(json) || json.length === 0) throw new Error('Unexpected scheme list response')
  return json
}

export function loadLastScan(): NewScanResult | null {
  try {
    const raw = localStorage.getItem(NEW_SCAN_KEY)
    return raw ? (JSON.parse(raw) as NewScanResult) : null
  } catch {
    return null
  }
}

export function newScanStale(): boolean {
  const last = loadLastScan()
  return !last || Date.now() - last.scannedAt > NEW_SCAN_TTL_MS
}

/**
 * Download the current scheme universe, diff against the saved baseline and
 * return schemes AMFI started tracking since the last scan. First run only
 * records the baseline.
 */
export async function scanNewSchemes(): Promise<NewScanResult> {
  const all = await getAllSchemes()
  let known: number[] | null = null
  try {
    const raw = localStorage.getItem(KNOWN_KEY)
    if (raw) known = (JSON.parse(raw) as { codes: number[] }).codes
  } catch {
    known = null
  }

  const recent = [...all].sort((a, b) => b.schemeCode - a.schemeCode).slice(0, 60)

  let result: NewScanResult
  if (!known || known.length === 0) {
    result = { baseline: true, newSchemes: [], total: all.length, prevTotal: 0, scannedAt: Date.now(), recent }
  } else {
    const seen = new Set(known)
    const fresh = all.filter((r) => !seen.has(r.schemeCode))
    result = { baseline: false, newSchemes: fresh.slice(0, 200), total: all.length, prevTotal: known.length, scannedAt: Date.now(), recent }
  }
  try {
    localStorage.setItem(KNOWN_KEY, JSON.stringify({ ts: Date.now(), codes: all.map((r) => r.schemeCode) }))
    localStorage.setItem(NEW_SCAN_KEY, JSON.stringify(result))
  } catch {
    /* quota, scan still returned */
  }
  return result
}

export function clearMfCaches() {
  schemeCache.clear()
  try {
    localStorage.removeItem(EXPLORE_CACHE_KEY)
    localStorage.removeItem(WATCH_SUM_KEY)
    localStorage.removeItem(KNOWN_KEY)
    localStorage.removeItem(NEW_SCAN_KEY)
  } catch {
    /* ignore */
  }
}

// ---------- INR formatting (independent of app currency) ----------
const inr2 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const fmtInr = (n: number) => inr2.format(n)
export const fmtRet = (r?: number) => (r === undefined ? 'n/a' : `${r >= 0 ? '+' : ''}${(r * 100).toFixed(1)}%`)
