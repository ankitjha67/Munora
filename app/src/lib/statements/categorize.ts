// Retrieval-augmented categorization. For each parsed row we retrieve the best
// match from three knowledge sources, most trusted first:
//   1. the user's own import rules,
//   2. the user's transaction history (merchant to category),
//   3. the seeded merchant knowledge base.
// A canonical merchant name is always assigned; category may be left blank
// (needs review) when nothing is confident.

import type { Store } from '../types'
import type { CategorizedRow, ParsedRow } from './types'
import type { KbEntry } from './merchantKB'
import { MERCHANT_KB, normalizeDesc } from './merchantKB'

// Match knowledge-base keywords on a word boundary so short keys like "tfl"
// don't match inside "netflix". First matching entry wins (KB is ordered).
const kbReCache = new Map<string, RegExp>()
function kbRe(kw: string): RegExp {
  let r = kbReCache.get(kw)
  if (!r) {
    r = new RegExp('\\b' + kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    kbReCache.set(kw, r)
  }
  return r
}
function kbMatch(norm: string): KbEntry | undefined {
  for (const e of MERCHANT_KB) if (kbRe(e.kw.trim()).test(norm)) return e
  return undefined
}

const TRANSFER_RE = /\btransfer\b|credit card (payment|autopay)|payment to card|to savings|own a\/c|self a\/c|to loan|card payment/i
const NOISE_RE = /\b(pos|upi|ach|neft|imps|rtgs|visa|mastercard|purchase|debit card|payment|ref|txn|trans|no|id|online|www|ltd|pvt|inc|the)\b/gi

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .slice(0, 4)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function cleanMerchant(desc: string): string {
  const cleaned = desc.replace(NOISE_RE, ' ').replace(/[^A-Za-z0-9 &']/g, ' ').replace(/\s+/g, ' ').trim()
  return titleCase(cleaned || desc) || 'Transaction'
}

function categoryResolver(store: Store): (hint: string) => string | undefined {
  const cats = store.categories
  const cache = new Map<string, string | undefined>()
  return (hint: string) => {
    const h = hint.toLowerCase()
    if (cache.has(h)) return cache.get(h)
    const found =
      cats.find((c) => c.name.toLowerCase() === h) ??
      cats.find((c) => c.name.toLowerCase().includes(h) || h.includes(c.name.toLowerCase()))
    cache.set(h, found?.id)
    return found?.id
  }
}

function historyMap(store: Store): Map<string, string> {
  const counts = new Map<string, Map<string, number>>()
  for (const t of store.transactions) {
    if (!t.categoryId) continue
    const key = normalizeDesc(t.merchant)
    if (!key) continue
    const m = counts.get(key) ?? new Map<string, number>()
    m.set(t.categoryId, (m.get(t.categoryId) ?? 0) + 1)
    counts.set(key, m)
  }
  const best = new Map<string, string>()
  for (const [k, m] of counts) {
    let top: string | undefined
    let n = 0
    for (const [cat, c] of m) if (c > n) ((top = cat), (n = c))
    if (top) best.set(k, top)
  }
  return best
}

export function categorizeRows(rows: ParsedRow[], store: Store): CategorizedRow[] {
  const resolve = categoryResolver(store)
  const history = historyMap(store)
  const rules = [...store.importRules].sort((a, b) => b.match.length - a.match.length)

  return rows.map((r) => {
    const norm = normalizeDesc(r.description)
    let merchant = ''
    let categoryId: string | undefined
    let confidence: 'high' | 'low' = 'low'
    let source: CategorizedRow['source'] = 'none'
    const transfer = TRANSFER_RE.test(r.description)

    // 1. user rules
    const rule = rules.find((ru) => ru.match && norm.includes(ru.match.toLowerCase()))
    if (rule) {
      merchant = rule.merchant ?? ''
      categoryId = rule.categoryId
      confidence = 'high'
      source = 'rule'
    }

    // KB match (always used for a good merchant name; category only if still empty)
    const kb = kbMatch(norm)
    if (!merchant && kb) merchant = kb.merchant

    // 2. history by merchant / description
    if (!categoryId) {
      const key = normalizeDesc(merchant || r.description)
      const hist = history.get(key) ?? [...history.entries()].find(([k]) => key.includes(k) || k.includes(key))?.[1]
      if (hist) {
        categoryId = hist
        confidence = 'high'
        source = 'history'
      }
    }

    // 3. KB hint
    if (!categoryId && kb) {
      const resolved = resolve(kb.hint)
      if (resolved) {
        categoryId = resolved
        confidence = 'low'
        source = 'kb'
      }
    }

    if (!merchant) merchant = cleanMerchant(r.description)

    return { ...r, merchant, categoryId, confidence, source, transfer, include: true }
  })
}
