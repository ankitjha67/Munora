// Pure derived math: (store, range) → view models. Pages never aggregate inline.
// Results are memoized per store object identity (mutations replace the object).

import type { Account, Category, CategoryGroup, Profile, Property, Store, Transaction } from './types'
import { DEFAULT_PROFILE_ID } from './types'
import type { DateRange } from './dates'
import { fullMonthsInRange, monthEndISO, monthKey, rangeMonths, addMonths } from './dates'
import { ACCOUNT_TYPE_LABEL, PALETTE, UNCATEGORIZED_COLOR } from './constants'
import { fxConvert } from './fx'

// ---------- memo ----------
const caches = new WeakMap<Store, Map<string, unknown>>()
function memo<T>(store: Store, key: string, fn: () => T): T {
  let m = caches.get(store)
  if (!m) {
    m = new Map()
    caches.set(store, m)
  }
  if (!m.has(key)) m.set(key, fn())
  return m.get(key) as T
}
const rk = (r: DateRange) => `${r.start}_${r.end}`

// ---------- lookups ----------
export const accountById = (s: Store) => memo(s, 'accById', () => new Map(s.accounts.map((a) => [a.id, a])))
export const categoryById = (s: Store) => memo(s, 'catById', () => new Map(s.categories.map((c) => [c.id, c])))
export const groupById = (s: Store) => memo(s, 'grpById', () => new Map(s.categoryGroups.map((g) => [g.id, g])))

export function groupOfCategory(s: Store, categoryId?: string): CategoryGroup | undefined {
  if (!categoryId) return undefined
  const c = categoryById(s).get(categoryId)
  return c ? groupById(s).get(c.groupId) : undefined
}

export function categoryColor(s: Store, categoryId?: string): string {
  return groupOfCategory(s, categoryId)?.color ?? UNCATEGORIZED_COLOR
}

export function merchantColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0
  return PALETTE[Math.abs(h) % PALETTE.length]
}

// ---------- currency conversion ----------
export function accountCurrency(s: Store, accountId: string): string {
  return accountById(s).get(accountId)?.currency || s.settings.currencyCode
}

/** True when any visible account is denominated in a non-base currency. */
export function multiCurrencyInUse(s: Store): boolean {
  return memo(s, 'multiCur', () => s.accounts.some((a) => !a.hidden && a.currency && a.currency !== s.settings.currencyCode))
}

/** Convert an amount from an account's currency into the base (display) currency. */
export function toBase(s: Store, accountId: string, amount: number): number {
  const from = accountCurrency(s, accountId)
  const to = s.settings.currencyCode
  if (from === to) return amount
  return fxConvert(amount, from, to, s.fx)
}

/** Convert an account balance (native) to base currency. */
export function balanceToBase(s: Store, account: Account, balance: number): number {
  const from = account.currency || s.settings.currencyCode
  if (from === s.settings.currencyCode) return balance
  return fxConvert(balance, from, s.settings.currencyCode, s.fx)
}

// ---------- flows (splits expanded) ----------
export interface Flow {
  tx: Transaction
  date: string
  merchant: string
  /** Native amount in the account's own currency. */
  amount: number
  /** Amount converted to the base currency, ALL aggregation uses this. */
  base: number
  categoryId?: string
}

/** Analytics universe: not hidden, not transfer, account not hidden. */
export function analyticsTx(s: Store): Transaction[] {
  return memo(s, 'analyticsTx', () => {
    const accs = accountById(s)
    return s.transactions.filter((t) => !t.hidden && !t.transfer && !accs.get(t.accountId)?.hidden)
  })
}

export function flowsInRange(s: Store, r: DateRange): Flow[] {
  return memo(s, `flows_${rk(r)}`, () => {
    const out: Flow[] = []
    for (const t of analyticsTx(s)) {
      if (t.date < r.start || t.date > r.end) continue
      if (t.splits && t.splits.length > 0) {
        for (const sp of t.splits)
          out.push({ tx: t, date: t.date, merchant: t.merchant, amount: sp.amount, base: toBase(s, t.accountId, sp.amount), categoryId: sp.categoryId })
      } else {
        out.push({ tx: t, date: t.date, merchant: t.merchant, amount: t.amount, base: toBase(s, t.accountId, t.amount), categoryId: t.categoryId })
      }
    }
    return out
  })
}

/** income if category group kind=income; uncategorized falls back to amount sign. */
function flowKind(s: Store, f: Flow): 'income' | 'expense' {
  const g = groupOfCategory(s, f.categoryId)
  if (g) return g.kind
  return f.amount >= 0 ? 'income' : 'expense'
}

// ---------- totals ----------
export interface Totals {
  income: number
  expense: number // positive
  net: number
  count: number
  moneyIn: number
  moneyOut: number
  needsReview: number
}

export function totals(s: Store, r: DateRange): Totals {
  return memo(s, `totals_${rk(r)}`, () => {
    let income = 0
    let expense = 0
    for (const f of flowsInRange(s, r)) {
      if (flowKind(s, f) === 'income') income += f.base
      else expense -= f.base
    }
    let count = 0
    let moneyIn = 0
    let moneyOut = 0
    let needsReview = 0
    for (const t of analyticsTx(s)) {
      if (t.date < r.start || t.date > r.end) continue
      count++
      const base = toBase(s, t.accountId, t.amount)
      if (base >= 0) moneyIn += base
      else moneyOut -= base
      if (t.needsReview) needsReview++
    }
    return { income, expense, net: income - expense, count, moneyIn, moneyOut, needsReview }
  })
}

// ---------- ranked breakdowns ----------
export type BreakdownMode = 'groups' | 'categories' | 'merchants'

export interface RankRow {
  key: string
  name: string
  sub?: string
  color: string
  amount: number // positive
  share: number // 0..1 of side total
  count: number
}

function rank(rows: Map<string, RankRow>): RankRow[] {
  const list = [...rows.values()].filter((r) => Math.abs(r.amount) >= 0.005)
  const total = list.reduce((a, b) => a + b.amount, 0)
  for (const r of list) r.share = total > 0 ? r.amount / total : 0
  return list.sort((a, b) => b.amount - a.amount)
}

export function spendingRows(s: Store, r: DateRange, mode: BreakdownMode): RankRow[] {
  return memo(s, `spend_${mode}_${rk(r)}`, () => {
    const rows = new Map<string, RankRow>()
    const cats = categoryById(s)
    for (const f of flowsInRange(s, r)) {
      if (flowKind(s, f) !== 'expense') continue
      const amt = -f.base
      let key: string, name: string, sub: string | undefined, color: string
      if (mode === 'merchants') {
        key = f.merchant
        name = f.merchant
        sub = undefined
        color = merchantColor(f.merchant)
      } else {
        const g = groupOfCategory(s, f.categoryId)
        if (mode === 'groups') {
          key = g?.id ?? 'uncat'
          name = g?.name ?? 'Uncategorized'
          color = g?.color ?? UNCATEGORIZED_COLOR
        } else {
          key = f.categoryId ?? 'uncat'
          name = f.categoryId ? (cats.get(f.categoryId)?.name ?? 'Unknown') : 'Uncategorized'
          sub = g?.name
          color = g?.color ?? UNCATEGORIZED_COLOR
        }
      }
      const row = rows.get(key) ?? { key, name, sub, color, amount: 0, share: 0, count: 0 }
      row.amount += amt
      row.count++
      rows.set(key, row)
    }
    return rank(rows)
  })
}

export function incomeRows(s: Store, r: DateRange, mode: 'categories' | 'merchants'): RankRow[] {
  return memo(s, `income_${mode}_${rk(r)}`, () => {
    const rows = new Map<string, RankRow>()
    const cats = categoryById(s)
    for (const f of flowsInRange(s, r)) {
      if (flowKind(s, f) !== 'income') continue
      let key: string, name: string, color: string
      if (mode === 'merchants') {
        key = f.merchant
        name = f.merchant
        color = merchantColor(f.merchant)
      } else {
        key = f.categoryId ?? 'uncat_inc'
        name = f.categoryId ? (cats.get(f.categoryId)?.name ?? 'Unknown') : 'Uncategorized income'
        color = '#2F9E44'
      }
      const row = rows.get(key) ?? { key, name, color, amount: 0, share: 0, count: 0 }
      row.amount += f.base
      row.count++
      rows.set(key, row)
    }
    return rank(rows)
  })
}

// ---------- monthly series ----------
export interface MonthCashflow {
  month: string
  income: number
  expense: number
  net: number
}

export function monthlyCashflow(s: Store, r: DateRange): MonthCashflow[] {
  return memo(s, `mcf_${rk(r)}`, () => {
    const byMonth = new Map<string, MonthCashflow>()
    for (const m of rangeMonths(r)) byMonth.set(m, { month: m, income: 0, expense: 0, net: 0 })
    for (const f of flowsInRange(s, r)) {
      const row = byMonth.get(monthKey(f.date))
      if (!row) continue
      if (flowKind(s, f) === 'income') row.income += f.base
      else row.expense -= f.base
    }
    for (const row of byMonth.values()) row.net = row.income - row.expense
    return [...byMonth.values()]
  })
}

/** Monthly spending for specific breakdown keys (trend overlays). */
export function monthlySpendingByKey(s: Store, r: DateRange, mode: BreakdownMode, keys: string[]): Record<string, number>[] {
  const cats = categoryById(s)
  const months = rangeMonths(r)
  const idx = new Map(months.map((m, i) => [m, i]))
  const rows: Record<string, number>[] = months.map((m) => ({ __month: idx.get(m)! }))
  for (const f of flowsInRange(s, r)) {
    if (flowKind(s, f) !== 'expense') continue
    const i = idx.get(monthKey(f.date))
    if (i === undefined) continue
    let key: string
    if (mode === 'merchants') key = f.merchant
    else if (mode === 'groups') key = groupOfCategory(s, f.categoryId)?.id ?? 'uncat'
    else key = f.categoryId ?? 'uncat'
    if (!keys.includes(key)) continue
    rows[i][key] = (rows[i][key] ?? 0) + -f.base
  }
  return rows
}

// ---------- Sankey ----------
export interface SankeyNode {
  id: string
  name: string
  amount: number
  color: string
  side: 'source' | 'hub' | 'target'
}
export interface SankeyLink {
  source: string
  target: string
  value: number
}

export function sankeyData(s: Store, r: DateRange, grouping: 'groups' | 'categories') {
  return memo(s, `sankey_${grouping}_${rk(r)}`, () => {
    const inc = incomeRows(s, r, 'categories')
    const exp = spendingRows(s, r, grouping === 'groups' ? 'groups' : 'categories')
    const t = totals(s, r)
    const nodes: SankeyNode[] = []
    const links: SankeyLink[] = []
    const greens = ['#2F9E44', '#37B24D', '#40C057', '#51CF66', '#69DB7C']
    inc.forEach((row, i) => {
      nodes.push({ id: `src_${row.key}`, name: row.name, amount: row.amount, color: greens[i % greens.length], side: 'source' })
      links.push({ source: `src_${row.key}`, target: 'hub', value: row.amount })
    })
    nodes.push({ id: 'hub', name: 'Income', amount: t.income, color: '#2F9E44', side: 'hub' })
    if (t.net > 0.005) {
      nodes.push({ id: 'savings', name: 'Savings', amount: t.net, color: '#0CA678', side: 'target' })
      links.push({ source: 'hub', target: 'savings', value: t.net })
    }
    for (const row of exp) {
      nodes.push({ id: `dst_${row.key}`, name: row.name, amount: row.amount, color: row.color, side: 'target' })
      links.push({ source: 'hub', target: `dst_${row.key}`, value: row.amount })
    }
    return { nodes, links, income: t.income }
  })
}

// ---------- P&L ----------
export interface PLRow {
  key: string
  name: string
  color: string
  amount: number
  shareOfIncome: number
  children?: PLRow[]
}

export function profitLoss(s: Store, r: DateRange): { income: PLRow; expenses: PLRow; savings: PLRow } {
  return memo(s, `pl_${rk(r)}`, () => {
    const t = totals(s, r)
    const shareOf = (x: number) => (t.income > 0 ? x / t.income : 0)
    const incomeChildren: PLRow[] = incomeRows(s, r, 'categories').map((row) => ({
      key: row.key,
      name: row.name,
      color: row.color,
      amount: row.amount,
      shareOfIncome: shareOf(row.amount),
    }))
    const groups = spendingRows(s, r, 'groups')
    const catRows = spendingRows(s, r, 'categories')
    const expenseChildren: PLRow[] = groups.map((g) => ({
      key: g.key,
      name: g.name,
      color: g.color,
      amount: g.amount,
      shareOfIncome: shareOf(g.amount),
      children: catRows
        .filter((c) => (groupOfCategory(s, c.key !== 'uncat' ? c.key : undefined)?.id ?? 'uncat') === g.key)
        .map((c) => ({ key: c.key, name: c.name, color: c.color, amount: c.amount, shareOfIncome: shareOf(c.amount) })),
    }))
    return {
      income: { key: 'income', name: 'Income', color: '#2F9E44', amount: t.income, shareOfIncome: 1, children: incomeChildren },
      expenses: { key: 'expenses', name: 'Expenses', color: '#E8590C', amount: t.expense, shareOfIncome: shareOf(t.expense), children: expenseChildren },
      savings: { key: 'savings', name: 'Savings', color: '#0CA678', amount: t.net, shareOfIncome: shareOf(t.net) },
    }
  })
}

// ---------- balances & net worth ----------
export function accountBalanceOn(s: Store, acc: Account, dateISO: string): number {
  if (acc.balanceHistory && acc.balanceHistory.length > 0) {
    const m = monthKey(dateISO)
    let best: number | null = null
    for (const p of acc.balanceHistory) {
      if (p.month <= m) best = p.balance
      else break
    }
    return best ?? acc.openingBalance
  }
  let bal = acc.openingBalance
  for (const t of s.transactions) {
    if (t.accountId === acc.id && t.date <= dateISO) bal += t.amount
  }
  return bal
}

export function balancesOn(s: Store, dateISO: string): Map<string, number> {
  return memo(s, `bal_${dateISO}`, () => {
    const out = new Map<string, number>()
    // one pass for transactional accounts
    const txAccs = s.accounts.filter((a) => !a.balanceHistory || a.balanceHistory.length === 0)
    for (const a of txAccs) out.set(a.id, a.openingBalance)
    for (const t of s.transactions) {
      if (t.date > dateISO) continue
      if (out.has(t.accountId)) out.set(t.accountId, out.get(t.accountId)! + t.amount)
    }
    for (const a of s.accounts) {
      if (a.balanceHistory && a.balanceHistory.length > 0) out.set(a.id, accountBalanceOn(s, a, dateISO))
    }
    return out
  })
}

export interface NetWorthPoint {
  month: string
  value: number
  byType: Record<string, number>
}

export function netWorthSeries(s: Store, r: DateRange, scope?: { type?: string; accountId?: string }): NetWorthPoint[] {
  return memo(s, `nw_${rk(r)}_${scope?.type ?? ''}_${scope?.accountId ?? ''}`, () => {
    const months = rangeMonths(r)
    return months.map((m) => {
      const date = monthEndISO(m)
      const bals = balancesOn(s, date)
      let value = 0
      const byType: Record<string, number> = {}
      for (const a of s.accounts) {
        if (a.hidden) continue
        if (scope?.type && a.type !== scope.type) continue
        if (scope?.accountId && a.id !== scope.accountId) continue
        if (a.openingDate > date) continue
        const b = balanceToBase(s, a, bals.get(a.id) ?? 0)
        value += b
        byType[a.type] = (byType[a.type] ?? 0) + b
      }
      return { month: m, value, byType }
    })
  })
}

export interface TypeGroupRow {
  type: string
  label: string
  /** Base-currency total. */
  total: number
  /** balance = native (account currency); balanceBase = converted. */
  accounts: { account: Account; balance: number; balanceBase: number }[]
}

export function assetsLiabilities(s: Store, dateISO: string): { assets: number; liabilities: number; assetGroups: TypeGroupRow[]; liabilityGroups: TypeGroupRow[] } {
  return memo(s, `al_${dateISO}`, () => {
    const bals = balancesOn(s, dateISO)
    const rows = new Map<string, TypeGroupRow>()
    for (const a of s.accounts) {
      if (a.hidden) continue
      const row = rows.get(a.type) ?? { type: a.type, label: ACCOUNT_TYPE_LABEL[a.type] ?? a.type, total: 0, accounts: [] }
      const b = bals.get(a.id) ?? 0
      const bb = balanceToBase(s, a, b)
      row.total += bb
      row.accounts.push({ account: a, balance: b, balanceBase: bb })
      rows.set(a.type, row)
    }
    let assets = 0
    let liabilities = 0
    const assetGroups: TypeGroupRow[] = []
    const liabilityGroups: TypeGroupRow[] = []
    const assetOrder = ['real_estate', 'retirement', 'investment', 'checking', 'savings', 'cash']
    for (const type of assetOrder) {
      const row = rows.get(type)
      if (!row) continue
      row.accounts.sort((x, y) => y.balanceBase - x.balanceBase)
      assets += row.total
      assetGroups.push(row)
    }
    for (const type of ['credit', 'loan']) {
      const row = rows.get(type)
      if (!row) continue
      row.accounts.sort((x, y) => x.balanceBase - y.balanceBase)
      liabilities += -row.total
      liabilityGroups.push(row)
    }
    return { assets, liabilities, assetGroups, liabilityGroups }
  })
}

/** Net worth change across the range (vs the month-end before range start). */
export function netWorthChange(s: Store, r: DateRange): { current: number; change: number } {
  const series = netWorthSeries(s, r)
  const current = series.length ? series[series.length - 1].value : 0
  const prevMonth = addMonths(monthKey(r.start), -1)
  const before = balancesOn(s, monthEndISO(prevMonth))
  let prev = 0
  for (const a of s.accounts) {
    if (a.hidden) continue
    if (a.openingDate > monthEndISO(prevMonth)) continue
    prev += balanceToBase(s, a, before.get(a.id) ?? 0)
  }
  return { current, change: current - prev }
}

// ---------- per-profile (household breakdown) ----------
export interface ProfileNetWorth {
  profile: Profile
  assets: number
  liabilities: number
  net: number
}

export function netWorthByProfile(s: Store, dateISO: string): ProfileNetWorth[] {
  return memo(s, `nwbp_${dateISO}`, () => {
    const bals = balancesOn(s, dateISO)
    const map = new Map<string, { assets: number; liab: number }>()
    for (const a of s.accounts) {
      if (a.hidden) continue
      if (a.openingDate > dateISO) continue
      const b = balanceToBase(s, a, bals.get(a.id) ?? 0)
      const pid = a.profileId ?? DEFAULT_PROFILE_ID
      const row = map.get(pid) ?? { assets: 0, liab: 0 }
      if (b >= 0) row.assets += b
      else row.liab += -b
      map.set(pid, row)
    }
    return s.profiles
      .map((profile) => {
        const r = map.get(profile.id) ?? { assets: 0, liab: 0 }
        return { profile, assets: r.assets, liabilities: r.liab, net: r.assets - r.liab }
      })
      .filter((x) => x.assets !== 0 || x.liabilities !== 0)
      .sort((a, b) => b.net - a.net)
  })
}

// ---------- loans ----------
export interface LoanRow {
  account: Account
  balance: number // positive owed, native currency
  balanceBase: number // positive owed, base currency
  paidPct: number
  monthlyPayment?: number // native currency
  series: { month: string; balance: number }[]
}

export function loanRows(s: Store, dateISO: string): LoanRow[] {
  return memo(s, `loans_${dateISO}`, () => {
    const out: LoanRow[] = []
    for (const a of s.accounts) {
      if (a.type !== 'loan' || a.hidden) continue
      const balance = -accountBalanceOn(s, a, dateISO)
      const paidPct = a.originalPrincipal ? 1 - balance / a.originalPrincipal : 0
      // detect payment: most recent expense tx whose merchant matches the lender
      let monthlyPayment: number | undefined
      for (let i = s.transactions.length - 1; i >= 0; i--) {
        const t = s.transactions[i]
        if (t.amount < 0 && !t.transfer && a.institution && t.merchant === a.institution) {
          monthlyPayment = -t.amount
          break
        }
      }
      const series = (a.balanceHistory ?? []).map((p) => ({ month: p.month, balance: -p.balance }))
      out.push({ account: a, balance, balanceBase: balanceToBase(s, a, -accountBalanceOn(s, a, dateISO)), paidPct, monthlyPayment, series })
    }
    return out.sort((x, y) => y.balanceBase - x.balanceBase)
  })
}

// ---------- properties ----------
export interface PropertyStats {
  property: Property
  income: number
  expenses: number
  net: number
  valuation: number
  mortgageBalance: number
  equity: number
  monthly: MonthCashflow[]
  breakdown: RankRow[]
  transactions: Transaction[]
}

export function propertyStats(s: Store, p: Property, r: DateRange, dateISO: string): PropertyStats {
  return memo(s, `prop_${p.id}_${rk(r)}_${dateISO}`, () => {
    const cats = categoryById(s)
    const isIncome = (f: Flow) => p.incomeCategoryId && f.categoryId === p.incomeCategoryId
    const isExpense = (f: Flow) => {
      const g = groupOfCategory(s, f.categoryId)
      return g && p.expenseGroupId === g.id
    }
    let income = 0
    let expenses = 0
    const byMonth = new Map<string, MonthCashflow>()
    for (const m of rangeMonths(r)) byMonth.set(m, { month: m, income: 0, expense: 0, net: 0 })
    const rows = new Map<string, RankRow>()
    const txSet = new Set<Transaction>()
    for (const f of flowsInRange(s, r)) {
      const m = byMonth.get(monthKey(f.date))
      if (isIncome(f)) {
        income += f.base
        if (m) m.income += f.base
        txSet.add(f.tx)
      } else if (isExpense(f)) {
        expenses += -f.base
        if (m) m.expense += -f.base
        txSet.add(f.tx)
        const key = f.categoryId ?? 'uncat'
        const row = rows.get(key) ?? {
          key,
          name: cats.get(key)?.name ?? 'Uncategorized',
          color: groupOfCategory(s, f.categoryId)?.color ?? UNCATEGORIZED_COLOR,
          amount: 0,
          share: 0,
          count: 0,
        }
        row.amount += -f.base
        row.count++
        rows.set(key, row)
      }
    }
    for (const m of byMonth.values()) m.net = m.income - m.expense
    const accs = accountById(s)
    const val = p.valuationAccountId ? accs.get(p.valuationAccountId) : undefined
    const mort = p.mortgageAccountId ? accs.get(p.mortgageAccountId) : undefined
    const valuation = val ? balanceToBase(s, val, accountBalanceOn(s, val, dateISO)) : 0
    const mortgageBalance = mort ? balanceToBase(s, mort, -accountBalanceOn(s, mort, dateISO)) : 0
    const transactions = [...txSet].sort((a, b) => (a.date < b.date ? 1 : -1))
    return {
      property: p,
      income,
      expenses,
      net: income - expenses,
      valuation,
      mortgageBalance,
      equity: valuation - mortgageBalance,
      monthly: [...byMonth.values()],
      breakdown: rank(rows),
      transactions,
    }
  })
}

// ---------- badges ----------
export function uncategorizedCount(s: Store): number {
  return memo(s, 'uncatCount', () => analyticsTx(s).filter((t) => !t.categoryId && (!t.splits || t.splits.length === 0)).length)
}

export function needsReviewCount(s: Store): number {
  return memo(s, 'nrCount', () => s.transactions.filter((t) => !t.hidden && t.needsReview).length)
}

// ---------- misc ----------
export function averagePerMonth(total: number, r: DateRange): number {
  return total / fullMonthsInRange(r)
}
