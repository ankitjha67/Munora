// Builds a compact, current snapshot of the user's finances to give the AI
// assistant grounding. Everything is computed locally from the store and sent
// only to the provider the user configured (their own key). Kept small on purpose.

import type { Store } from './types'
import { addMonths, monthKey, monthStartISO, todayISO } from './dates'
import type { DateRange } from './dates'
import {
  totals,
  spendingRows,
  incomeRows,
  assetsLiabilities,
  netWorthByProfile,
  loanRows,
} from './selectors'
import { fmtMoney } from './format'

/** Trailing 12 months ending today, the default window the assistant reasons over. */
export function trailingYear(): DateRange {
  const end = todayISO()
  return { start: monthStartISO(addMonths(monthKey(end), -11)), end }
}

const pct = (n: number) => `${Math.round(n * 100)}%`

/**
 * A short text brief of net worth, cash flow, top spending, loans and tracked
 * funds, in the base currency. `range` scopes the cash-flow / spending numbers.
 */
export function buildFinanceContext(store: Store, range: DateRange): string {
  const cur = store.settings.currencyCode
  const m = (n: number) => fmtMoney(n, 0)
  const today = todayISO()
  const lines: string[] = []

  lines.push(`Base currency: ${cur}. Figures below are in ${cur}. Today: ${today}.`)
  lines.push(`Cash-flow window: ${range.start} to ${range.end}.`)

  const al = assetsLiabilities(store, today)
  lines.push('', 'NET WORTH')
  lines.push(`Assets ${m(al.assets)}, Liabilities ${m(al.liabilities)}, Net worth ${m(al.assets - al.liabilities)}.`)
  const perProfile = netWorthByProfile(store, today)
  if (perProfile.length > 1) {
    lines.push('By person: ' + perProfile.map((p) => `${p.profile.name} ${m(p.net)}`).join(', ') + '.')
  }

  const t = totals(store, range)
  const savingsRate = t.income > 0 ? (t.income - t.expense) / t.income : 0
  lines.push('', 'CASH FLOW (window)')
  lines.push(`Income ${m(t.income)}, Expenses ${m(t.expense)}, Net ${m(t.net)}, Savings rate ${pct(savingsRate)}.`)

  const spend = spendingRows(store, range, 'categories').slice(0, 8)
  if (spend.length) {
    lines.push('', 'TOP SPENDING (window)')
    for (const r of spend) lines.push(`- ${r.name}: ${m(r.amount)} (${pct(r.share)} of spend)`)
  }

  const inc = incomeRows(store, range, 'categories').slice(0, 4)
  if (inc.length) {
    lines.push('', 'INCOME SOURCES (window)')
    for (const r of inc) lines.push(`- ${r.name}: ${m(r.amount)}`)
  }

  const loans = loanRows(store, today)
  if (loans.length) {
    lines.push('', 'LOANS')
    for (const l of loans) lines.push(`- ${l.account.name}: owed ${m(l.balanceBase)}${l.monthlyPayment ? `, ~${m(l.monthlyPayment)}/mo` : ''} (${Math.round(l.paidPct * 100)}% paid)`)
  }

  const accts = store.accounts.filter((a) => !a.hidden)
  const byType = new Map<string, number>()
  for (const a of accts) byType.set(a.type, (byType.get(a.type) ?? 0) + 1)
  lines.push('', 'ACCOUNTS')
  lines.push([...byType.entries()].map(([k, v]) => `${v} ${k}`).join(', ') + '.')

  const watch = store.investing?.mfWatchlist ?? []
  if (watch.length) lines.push('', `Tracked mutual funds: ${watch.length} on the watchlist (details on the Mutual funds page).`)

  return lines.join('\n')
}

export const ASSISTANT_SYSTEM = [
  'You are the built-in finance assistant inside Munora, a private, local-first personal-finance app.',
  'You are given a snapshot of the user\'s own finances. Use it to answer concretely, with their real numbers, in their base currency.',
  'Be concise and practical. Prefer short paragraphs and tight bullet lists. Do not invent numbers that are not in the snapshot or the conversation; if something is not available, say so and suggest where in the app to find or add it.',
  'You can explain trends, compare periods, flag concentration or overspending, sketch budgets and savings math, and explain finance terms.',
  'You are not a licensed financial advisor. For personalized investment, tax or legal decisions, add a brief reminder to verify with a qualified professional. Never claim to place trades or move money; this app cannot.',
].join(' ')

export const SUGGESTED_PROMPTS = [
  'How am I doing this year?',
  'Where is most of my money going?',
  'How can I improve my savings rate?',
  'Which expenses look unusually high?',
  'Explain my net worth in plain terms.',
  'Build me a simple monthly budget.',
]
