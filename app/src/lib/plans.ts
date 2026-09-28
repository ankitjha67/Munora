// Goal-based plan analytics. A plan is funded by any mix of existing accounts and
// specific mutual funds; progress is measured against their live value, so the
// numbers move as balances change and NAVs refresh.

import type { Plan, PlanKind, Store } from './types'
import { balancesOn, balanceToBase } from './selectors'
import { todayISO, monthKey } from './dates'
import { inflateBy } from './macro'

export const PLAN_KINDS: { key: PlanKind; label: string; note: string }[] = [
  { key: 'retirement', label: 'Retirement', note: 'Income after you stop working' },
  { key: 'education', label: 'Education', note: 'School, college or a course' },
  { key: 'home', label: 'Home', note: 'Down payment or purchase' },
  { key: 'vehicle', label: 'Vehicle', note: 'Car, bike or upgrade' },
  { key: 'travel', label: 'Travel', note: 'A trip or sabbatical' },
  { key: 'emergency', label: 'Emergency fund', note: 'Months of expenses set aside' },
  { key: 'wealth', label: 'Wealth building', note: 'General long-term investing' },
  { key: 'other', label: 'Other', note: 'Anything else you are saving for' },
]

export const planKindLabel = (k: PlanKind) => PLAN_KINDS.find((x) => x.key === k)?.label ?? 'Other'

/** Live NAV per scheme code, supplied by the page from the mutual fund cache. */
export type NavMap = Map<number, number>

export interface PlanFundValue {
  code: number
  name: string
  invested: number
  /** Live value when units and a NAV are known, otherwise the invested amount. */
  value: number
  /** Gain as a fraction of invested, only when marked to market. */
  gain?: number
  marked: boolean
}

export interface PlanProgress {
  plan: Plan
  /** Value of linked accounts, in base currency. */
  fromAccounts: number
  /** Value of linked funds, in base currency. */
  fromFunds: number
  current: number
  target: number
  /** 0..1, capped at 1 for display; `rawProgress` is uncapped. */
  progress: number
  rawProgress: number
  remaining: number
  fundValues: PlanFundValue[]
  /** Months until the target date, null when no date is set. */
  monthsLeft: number | null
  /** Projected value at the target date at the expected return. */
  projected: number | null
  /** Projected minus target; negative means a shortfall. */
  surplus: number | null
  onTrack: boolean | null
  /** Monthly contribution needed to hit the target on time. */
  requiredMonthly: number | null
  /** Total put in so far across funds (accounts have no cost basis here). */
  investedInFunds: number
  /** The target actually being aimed at. Equals plan.targetAmount unless the goal is
   * inflation-adjusted, in which case it is that amount grown to the target date. */
  effectiveTarget: number
  /** Inflation rate used, as a fraction, when the target was adjusted. */
  inflationUsed?: number
}

function monthsBetween(fromISO: string, toMonth: string): number {
  const [fy, fm] = fromISO.slice(0, 7).split('-').map(Number)
  const [ty, tm] = toMonth.split('-').map(Number)
  return (ty - fy) * 12 + (tm - fm)
}

/** Future value of a lump sum plus a monthly contribution, compounded monthly. */
export function futureValue(present: number, monthly: number, annualRate: number, months: number): number {
  if (months <= 0) return present
  const r = annualRate / 12
  if (Math.abs(r) < 1e-9) return present + monthly * months
  const growth = Math.pow(1 + r, months)
  return present * growth + monthly * ((growth - 1) / r)
}

/** Monthly contribution required to reach `target` from `present` in `months`. */
export function requiredContribution(present: number, target: number, annualRate: number, months: number): number {
  if (months <= 0) return Math.max(0, target - present)
  const r = annualRate / 12
  const growth = Math.pow(1 + r, months)
  if (Math.abs(r) < 1e-9) return Math.max(0, (target - present) / months)
  const need = target - present * growth
  if (need <= 0) return 0
  return need / ((growth - 1) / r)
}

export function planProgress(store: Store, plan: Plan, navs: NavMap): PlanProgress {
  const today = todayISO()
  const bals = balancesOn(store, today)

  let fromAccounts = 0
  for (const id of plan.accountIds) {
    const acc = store.accounts.find((a) => a.id === id)
    if (!acc) continue
    fromAccounts += balanceToBase(store, acc, bals.get(acc.id) ?? 0)
  }

  const fundValues: PlanFundValue[] = plan.funds.map((f) => {
    const nav = navs.get(f.code)
    const marked = !!(f.units && nav)
    const value = marked ? f.units! * nav! : f.invested
    return {
      code: f.code,
      name: f.name ?? `Scheme #${f.code}`,
      invested: f.invested,
      value,
      gain: marked && f.invested > 0 ? value / f.invested - 1 : undefined,
      marked,
    }
  })
  const fromFunds = fundValues.reduce((t, f) => t + f.value, 0)
  const investedInFunds = fundValues.reduce((t, f) => t + f.invested, 0)

  const current = fromAccounts + fromFunds

  const rate = plan.expectedReturn ?? store.settings.expectedReturn ?? 0.07
  const monthsLeft = plan.targetDate ? Math.max(0, monthsBetween(today, plan.targetDate)) : null
  const monthly = plan.monthlyContribution ?? 0

  // A target set in today's money buys less later, so optionally grow it by inflation.
  const inflation = store.settings.inflationRate
  const inflate = !!plan.inflateTarget && inflation !== undefined && monthsLeft !== null
  const target = inflate ? inflateBy(plan.targetAmount, inflation, monthsLeft / 12) : plan.targetAmount
  const rawProgress = target > 0 ? current / target : 0

  let projected: number | null = null
  let surplus: number | null = null
  let onTrack: boolean | null = null
  let reqMonthly: number | null = null
  if (monthsLeft !== null) {
    projected = futureValue(current, monthly, rate, monthsLeft)
    surplus = projected - target
    onTrack = projected >= target
    reqMonthly = requiredContribution(current, target, rate, monthsLeft)
  }

  return {
    plan,
    fromAccounts,
    fromFunds,
    current,
    target,
    progress: Math.max(0, Math.min(1, rawProgress)),
    rawProgress,
    remaining: Math.max(0, target - current),
    fundValues,
    monthsLeft,
    projected,
    surplus,
    onTrack,
    requiredMonthly: reqMonthly,
    investedInFunds,
    effectiveTarget: target,
    inflationUsed: inflate ? inflation : undefined,
  }
}

/** Month-by-month projected value, for the plan's chart. */
export function planSeries(p: PlanProgress, rate: number): { month: string; value: number; target: number }[] {
  const months = p.monthsLeft ?? 60
  const monthly = p.plan.monthlyContribution ?? 0
  const out: { month: string; value: number; target: number }[] = []
  const start = todayISO().slice(0, 7)
  const [y0, m0] = start.split('-').map(Number)
  const step = Math.max(1, Math.ceil(months / 48)) // keep the series readable
  for (let m = 0; m <= months; m += step) {
    const total = (y0 * 12 + (m0 - 1)) + m
    const month = `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
    out.push({ month, value: futureValue(p.current, monthly, rate, m), target: p.target })
  }
  return out
}

export const currentMonth = () => monthKey(todayISO())
