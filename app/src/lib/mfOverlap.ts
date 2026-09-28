// Fund-overlap analysis. AMFI/mfapi.in gives us each scheme's category and name
// but not its underlying holdings, so overlap is *estimated*: funds in the same
// category (or tracking the same index) hold largely the same securities. The
// heuristic runs instantly and offline; the AI layer (optional) adds a richer
// read and concrete diversifying alternatives, which we then ground by looking the
// suggested funds up on mfapi.

import { computeReturns, getScheme, searchSchemes } from './mf'
import type { MfReturns, MfScheme } from './mf'

export type AssetClass = 'equity' | 'debt' | 'hybrid' | 'commodity' | 'intl' | 'other'

export interface OverlapFund {
  code: number
  name: string
  fundHouse: string
  category: string
  bucket: string
  bucketLabel: string
  assetClass: AssetClass
  indexKey?: string
  returns: MfReturns
}

const BUCKETS: { key: string; label: string; assetClass: AssetClass; re: RegExp }[] = [
  { key: 'index', label: 'Index / ETF', assetClass: 'equity', re: /index|etf|nifty|sensex/i },
  { key: 'largecap', label: 'Large cap', assetClass: 'equity', re: /large\s*cap/i },
  { key: 'largemid', label: 'Large & mid cap', assetClass: 'equity', re: /large\s*&?\s*mid|large and mid/i },
  { key: 'midcap', label: 'Mid cap', assetClass: 'equity', re: /mid\s*cap/i },
  { key: 'smallcap', label: 'Small cap', assetClass: 'equity', re: /small\s*cap/i },
  { key: 'flexi', label: 'Flexi cap', assetClass: 'equity', re: /flexi\s*cap/i },
  { key: 'multicap', label: 'Multi cap', assetClass: 'equity', re: /multi\s*cap/i },
  { key: 'elss', label: 'ELSS (tax saver)', assetClass: 'equity', re: /elss|tax\s*saver/i },
  { key: 'focused', label: 'Focused', assetClass: 'equity', re: /focus/i },
  { key: 'value', label: 'Value / contra', assetClass: 'equity', re: /value|contra|dividend yield/i },
  { key: 'sectoral', label: 'Sectoral / thematic', assetClass: 'equity', re: /sector|thematic|banking|pharma|technology|infra|consumption|energy|fmcg|healthcare/i },
  { key: 'intl', label: 'International', assetClass: 'intl', re: /internat|global|us equity|nasdaq|greater china|overseas|world/i },
  { key: 'gold', label: 'Gold / commodity', assetClass: 'commodity', re: /gold|silver|commodit/i },
  { key: 'balanced_adv', label: 'Balanced advantage', assetClass: 'hybrid', re: /balanced advantage|dynamic asset/i },
  { key: 'hybrid_agg', label: 'Aggressive hybrid', assetClass: 'hybrid', re: /aggressive hybrid|equity savings|arbitrage|multi asset/i },
  { key: 'hybrid_cons', label: 'Conservative hybrid', assetClass: 'hybrid', re: /conservative hybrid|hybrid/i },
  { key: 'liquid', label: 'Liquid / money market', assetClass: 'debt', re: /liquid|money market|overnight|ultra short/i },
  { key: 'gilt', label: 'Gilt / govt debt', assetClass: 'debt', re: /gilt|government|g-sec|constant maturity/i },
  { key: 'debt', label: 'Debt / bond', assetClass: 'debt', re: /debt|bond|income|duration|corporate|credit|banking and psu|floater|dynamic bond/i },
]

/** Which broad index a scheme tracks, for near-identical detection. */
function indexKeyOf(name: string): string | undefined {
  const n = name.toLowerCase()
  if (/nifty\s*next\s*50/.test(n)) return 'niftynext50'
  if (/nifty\s*50|nifty50/.test(n)) return 'nifty50'
  if (/sensex/.test(n)) return 'sensex'
  if (/nifty\s*100/.test(n)) return 'nifty100'
  if (/nifty\s*500/.test(n)) return 'nifty500'
  if (/midcap\s*150|nifty midcap/.test(n)) return 'midcap150'
  if (/smallcap\s*250|nifty smallcap/.test(n)) return 'smallcap250'
  if (/bank\s*nifty|nifty bank/.test(n)) return 'niftybank'
  if (/nifty\s*it/.test(n)) return 'niftyit'
  if (/nasdaq|nasdaq 100/.test(n)) return 'nasdaq100'
  if (/s&p\s*500|sp 500/.test(n)) return 'sp500'
  return undefined
}
/** Broad large-cap Indian indices overlap heavily with each other. */
const BROAD_LARGE = new Set(['nifty50', 'sensex', 'nifty100'])
/** Indices of foreign markets: no meaningful overlap with Indian equity. */
const FOREIGN_INDEX = new Set(['nasdaq100', 'sp500'])

/**
 * AMFI's `scheme_category` names the scheme family ("Debt Scheme - Banking and PSU
 * Fund", "Equity Scheme - Large Cap Fund", ...). That family is authoritative and is
 * resolved first, because several bucket keywords are ambiguous across families:
 * without this, a "Banking and PSU Debt Fund" matches the sectoral (equity) pattern
 * on "banking" and would be reported as overlapping with stock funds.
 */
function familyOf(category: string): AssetClass | undefined {
  const c = category.toLowerCase()
  if (c.includes('debt scheme')) return 'debt'
  if (c.includes('hybrid scheme')) return 'hybrid'
  if (c.includes('equity scheme') || c.includes('solution oriented')) return 'equity'
  // "Other Scheme - ..." (index funds, gold ETFs, overseas FoFs) and anything else.
  if (/gold|silver|commodit/.test(c)) return 'commodity'
  if (/overseas|internat|global/.test(c)) return 'intl'
  if (/index|etf/.test(c)) return 'equity'
  return undefined
}

/** Generic bucket used when the family is known but no specific bucket matched. */
const FAMILY_FALLBACK: Record<string, { bucket: string; label: string }> = {
  debt: { bucket: 'debt', label: 'Debt / bond' },
  hybrid: { bucket: 'hybrid_cons', label: 'Hybrid' },
  equity: { bucket: 'equity_other', label: 'Other equity' },
  commodity: { bucket: 'gold', label: 'Gold / commodity' },
  intl: { bucket: 'intl', label: 'International' },
}

function classify(category: string, name: string): { bucket: string; label: string; assetClass: AssetClass } {
  const hay = `${category} ${name}`
  const family = familyOf(category)
  // Only consider buckets belonging to the scheme's own family when we know it.
  for (const b of BUCKETS) {
    if (family && b.assetClass !== family) continue
    if (b.re.test(hay)) return { bucket: b.key, label: b.label, assetClass: b.assetClass }
  }
  if (family) {
    const f = FAMILY_FALLBACK[family]
    return { bucket: f.bucket, label: f.label, assetClass: family }
  }
  // Unknown family: fall back to matching any bucket by keyword.
  for (const b of BUCKETS) if (b.re.test(hay)) return { bucket: b.key, label: b.label, assetClass: b.assetClass }
  return { bucket: 'other', label: category || 'Other', assetClass: 'other' }
}

export function toOverlapFund(s: MfScheme): OverlapFund {
  const name = s.meta.scheme_name
  const category = s.meta.scheme_category || ''
  const indexKey = indexKeyOf(name)
  let { bucket, label, assetClass } = classify(category, name)
  // A fund tracking a foreign index is international exposure, whatever AMFI files
  // it under, so it must not be compared as if it held Indian equity.
  if (indexKey && FOREIGN_INDEX.has(indexKey)) {
    assetClass = 'intl'
    label = 'International index'
    bucket = 'intl_index'
  }
  return { code: s.meta.scheme_code, name, fundHouse: s.meta.fund_house, category, bucket, bucketLabel: label, assetClass, indexKey, returns: computeReturns(s) }
}

// Pairwise overlap between equity buckets (0..1). Symmetric, so lookups sort the
// two bucket keys; the table below is normalized the same way at load time rather
// than relying on every literal being written in sorted order (half of them were
// not, which silently dropped those pairs to the generic default).
const EQUITY_PAIR_RAW: Record<string, number> = {
  'largecap|largecap': 0.8, 'largecap|index': 0.72, 'largecap|flexi': 0.6, 'largecap|multicap': 0.58,
  'largecap|largemid': 0.55, 'largecap|elss': 0.55, 'largecap|focused': 0.55, 'largecap|value': 0.5,
  'index|index': 0.85, 'index|flexi': 0.55, 'index|multicap': 0.55, 'index|largemid': 0.5, 'index|elss': 0.5,
  'flexi|flexi': 0.78, 'flexi|multicap': 0.72, 'flexi|elss': 0.62, 'flexi|largemid': 0.6, 'flexi|focused': 0.6, 'flexi|value': 0.5,
  'multicap|multicap': 0.78, 'multicap|largemid': 0.62, 'multicap|elss': 0.6,
  'largemid|largemid': 0.72, 'largemid|midcap': 0.55, 'largemid|elss': 0.5,
  'midcap|midcap': 0.8, 'midcap|smallcap': 0.35, 'midcap|flexi': 0.42, 'midcap|multicap': 0.45, 'midcap|largemid': 0.55,
  'smallcap|smallcap': 0.78, 'smallcap|flexi': 0.3, 'smallcap|multicap': 0.32,
  'elss|elss': 0.7, 'focused|focused': 0.6, 'value|value': 0.65,
  'sectoral|sectoral': 0.4, 'sectoral|largecap': 0.25, 'sectoral|flexi': 0.25,
}

const pairKey = (a: string, b: string) => [a, b].sort().join('|')
const EQUITY_PAIR: Record<string, number> = Object.fromEntries(
  Object.entries(EQUITY_PAIR_RAW).map(([k, v]) => [pairKey(...(k.split('|') as [string, string])), v]),
)

/** Estimated holdings overlap between two funds, 0 (none) to 1 (nearly identical). */
export function estimateOverlap(a: OverlapFund, b: OverlapFund): number {
  if (a.code === b.code) return 1
  // Index funds tracking the same index are effectively the same portfolio.
  if (a.indexKey && b.indexKey) {
    if (a.indexKey === b.indexKey) return 0.97
    if (BROAD_LARGE.has(a.indexKey) && BROAD_LARGE.has(b.indexKey)) return 0.85
    // One tracks a foreign market and the other does not: different universes.
    if (FOREIGN_INDEX.has(a.indexKey) !== FOREIGN_INDEX.has(b.indexKey)) return 0.03
    return 0.15
  }
  if (a.assetClass !== b.assetClass) return 0.04
  if (a.assetClass === 'commodity') return 0.9 // both gold/commodity
  if (a.assetClass === 'intl') return a.bucket === b.bucket ? 0.6 : 0.2
  if (a.assetClass === 'debt') return a.bucket === b.bucket ? 0.6 : 0.4
  if (a.assetClass === 'hybrid') return a.bucket === b.bucket ? 0.6 : 0.4
  if (a.assetClass === 'equity') {
    const key = pairKey(a.bucket, b.bucket)
    if (EQUITY_PAIR[key] !== undefined) return EQUITY_PAIR[key]
    return a.bucket === b.bucket ? 0.75 : 0.4 // same/other equity default
  }
  return a.bucket === b.bucket ? 0.6 : 0.2
}

export interface OverlapPair {
  a: OverlapFund
  b: OverlapFund
  score: number
}

export function overlapPairs(funds: OverlapFund[]): OverlapPair[] {
  const pairs: OverlapPair[] = []
  for (let i = 0; i < funds.length; i++) for (let j = i + 1; j < funds.length; j++) pairs.push({ a: funds[i], b: funds[j], score: estimateOverlap(funds[i], funds[j]) })
  return pairs.sort((x, y) => y.score - x.score)
}

export const overlapLabel = (s: number) => (s >= 0.8 ? 'Very high' : s >= 0.6 ? 'High' : s >= 0.4 ? 'Moderate' : s >= 0.2 ? 'Low' : 'Minimal')

/** Instant, offline read: redundant pairs and category concentration. */
export function overlapInsights(funds: OverlapFund[], pairs: OverlapPair[]): string[] {
  const out: string[] = []
  const high = pairs.filter((p) => p.score >= 0.6)
  if (high.length === 0) out.push('No strongly overlapping pairs. Your funds look reasonably diversified across categories.')
  else out.push(`${high.length} fund pair${high.length > 1 ? 's' : ''} likely hold most of the same securities (60%+ estimated overlap). Holding both adds cost and concentration without extra diversification.`)

  const byBucket = new Map<string, OverlapFund[]>()
  for (const f of funds) {
    const arr = byBucket.get(f.bucketLabel)
    if (arr) arr.push(f)
    else byBucket.set(f.bucketLabel, [f])
  }
  for (const [label, list] of byBucket) if (list.length >= 2) out.push(`${list.length} funds in "${label}": ${list.map((f) => shortName(f.name)).join(', ')}.`)

  const classes = new Set(funds.map((f) => f.assetClass))
  const missing = (['equity', 'debt', 'hybrid', 'commodity', 'intl'] as AssetClass[]).filter((c) => !classes.has(c))
  if (missing.length) out.push(`Not represented: ${missing.join(', ')}. A different asset class is the most reliable way to actually cut overlap.`)
  return out
}

export function shortName(name: string): string {
  return name.replace(/\s*-?\s*(direct|regular)\s*(plan)?\s*-?\s*(growth|idcw|dividend|payout|reinvest.*)?\s*$/i, '').replace(/\s+plan\s*$/i, '').trim()
}

// ---------------- AI layer ----------------

export interface AiAlternative {
  name: string
  category: string
  why: string
}
export interface AiOverlap {
  assessment: string
  redundancies: { funds: string[]; overlap: string; why: string }[]
  concentration: string
  alternatives: AiAlternative[]
}

export function overlapAiPrompt(funds: OverlapFund[]): string {
  const list = funds
    .map((f, i) => `${i + 1}. ${f.name} | house: ${f.fundHouse} | category: ${f.category || f.bucketLabel} | 1Y: ${f.returns.r1y !== undefined ? (f.returns.r1y * 100).toFixed(1) + '%' : 'n/a'} | 3Y: ${f.returns.r3y !== undefined ? (f.returns.r3y * 100).toFixed(1) + '%' : 'n/a'}`)
    .join('\n')
  return [
    'You are a mutual-fund portfolio analyst. Analyze holdings overlap across the funds a family holds and suggest how to diversify.',
    'These are Indian mutual funds (AMFI). You do not have their exact holdings, so estimate overlap from category, mandate and typical top holdings.',
    '',
    'Funds:',
    list,
    '',
    'Return JSON only, no prose, in exactly this shape:',
    '{',
    '  "assessment": "2-3 sentence overall read of how diversified vs overlapping this set is",',
    '  "redundancies": [{"funds": ["<fund name>", "<fund name>"], "overlap": "high|moderate|low", "why": "one line"}],',
    '  "concentration": "one or two lines on category/sector/asset-class concentration risk",',
    '  "alternatives": [{"name": "<a specific, real, well-known Indian fund or index fund to add or switch to>", "category": "<its category>", "why": "how it reduces overlap or fills a gap"}]',
    '}',
    'Give 3 to 5 alternatives that genuinely reduce overlap (e.g. a different asset class, market cap, or a low-cost index fund). Prefer Direct-Growth plans. Keep every string short.',
  ].join('\n')
}

export interface AltDetail extends AiAlternative {
  code?: number
  matchedName?: string
  fundHouse?: string
  returns?: MfReturns
}

const looksDirect = (n: string) => /direct/i.test(n) && /growth/i.test(n)

/** Ground each AI-suggested alternative by finding it on mfapi and attaching real data. */
export async function enrichAlternatives(alts: AiAlternative[]): Promise<AltDetail[]> {
  return Promise.all(
    alts.map(async (alt) => {
      try {
        const results = await searchSchemes(alt.name)
        if (results.length === 0) return { ...alt }
        const direct = results.find((r) => looksDirect(r.schemeName)) ?? results[0]
        const scheme = await getScheme(direct.schemeCode)
        return { ...alt, code: direct.schemeCode, matchedName: scheme.meta.scheme_name, fundHouse: scheme.meta.fund_house, returns: computeReturns(scheme) }
      } catch {
        return { ...alt }
      }
    }),
  )
}
