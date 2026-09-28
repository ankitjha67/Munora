// Financial-independence and retirement projection math. Pure helpers; the page
// supplies numbers pulled from the selectors. The most-requested idea in the
// source thread was FIRE-number tracking, so this drives that page.

export interface FireInputs {
  annualExpenses: number
  annualIncome: number
  netWorth: number
  /** Assets that compound (exclude primary home unless the user counts it). */
  investable: number
  withdrawalRate: number // e.g. 0.04
  realReturn: number // annual real return, e.g. 0.05
  currentAge?: number
}

export interface FireResult {
  fireNumber: number
  progress: number // 0..1
  annualSavings: number
  savingsRate: number // 0..1
  yearsToFire: number | null
  targetAge: number | null
}

export function fireNumber(annualExpenses: number, withdrawalRate: number): number {
  const wr = withdrawalRate > 0 ? withdrawalRate : 0.04
  return annualExpenses / wr
}

/** Years for `investable` growing at `realReturn` plus `annualSavings` to reach target. */
export function yearsToTarget(investable: number, annualSavings: number, realReturn: number, target: number): number | null {
  if (investable >= target) return 0
  if (annualSavings <= 0 && realReturn <= 0) return null
  let bal = investable
  for (let y = 1; y <= 100; y++) {
    bal = bal * (1 + realReturn) + annualSavings
    if (bal >= target) return y
  }
  return null
}

export function computeFire(i: FireInputs): FireResult {
  const target = fireNumber(i.annualExpenses, i.withdrawalRate)
  const annualSavings = Math.max(0, i.annualIncome - i.annualExpenses)
  const savingsRate = i.annualIncome > 0 ? annualSavings / i.annualIncome : 0
  const years = yearsToTarget(i.investable, annualSavings, i.realReturn, target)
  return {
    fireNumber: target,
    progress: target > 0 ? Math.min(1, i.netWorth / target) : 0,
    annualSavings,
    savingsRate,
    yearsToFire: years,
    targetAge: years !== null && i.currentAge ? i.currentAge + years : null,
  }
}

/** Net-worth projection points for charting, one per year for `years` years. */
export function projectSeries(investable: number, annualSavings: number, realReturn: number, years: number): { year: number; value: number }[] {
  const out: { year: number; value: number }[] = [{ year: 0, value: investable }]
  let bal = investable
  for (let y = 1; y <= years; y++) {
    bal = bal * (1 + realReturn) + annualSavings
    out.push({ year: y, value: Math.round(bal) })
  }
  return out
}
