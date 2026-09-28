import { useMemo, useState } from 'react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { useScopedStore } from '../lib/profiles'
import { useStoreCtx } from '../lib/store'
import { accountBalanceOn, assetsLiabilities, balanceToBase, totals } from '../lib/selectors'
import { computeFire, projectSeries } from '../lib/fire'
import { presetRange, todayISO } from '../lib/dates'
import { fmtCompact, fmtMoney, fmtPct } from '../lib/format'
import { chartTooltipStyle, tv } from '../components/charts'
import type { TooltipValue } from '../components/charts'
import { StatCard, Seg } from '../components/ui'
import GoalsPage from './Goals'

const INVESTABLE_TYPES = new Set(['investment', 'retirement', 'savings', 'cash'])

function FireView() {
  const store = useScopedStore()
  const { mutate } = useStoreCtx()
  const today = todayISO()

  const range12 = presetRange('last_12')
  const t = totals(store, range12)
  const al = assetsLiabilities(store, today)

  const investable = useMemo(() => {
    let sum = 0
    for (const a of store.accounts) {
      if (a.hidden || !INVESTABLE_TYPES.has(a.type)) continue
      sum += balanceToBase(store, a, accountBalanceOn(store, a, today))
    }
    return sum
  }, [store, today])

  const withdrawalRate = store.settings.fireWithdrawalRate ?? 0.04
  const realReturn = store.settings.expectedReturn ?? 0.05
  const currentAge = store.settings.currentAge
  const annualExpenses = store.settings.fireMonthlyExpenses ? store.settings.fireMonthlyExpenses * 12 : t.expense
  const netWorth = al.assets - al.liabilities

  const fire = computeFire({ annualExpenses, annualIncome: t.income, netWorth, investable, withdrawalRate, realReturn, currentAge })

  const series = useMemo(() => {
    const years = fire.yearsToFire ?? 30
    return projectSeries(investable, fire.annualSavings, realReturn, Math.max(5, Math.min(50, years + 3)))
  }, [investable, fire.annualSavings, realReturn, fire.yearsToFire])

  const setNum = (key: 'fireWithdrawalRate' | 'expectedReturn' | 'currentAge' | 'fireMonthlyExpenses', v: string, scale = 1) => {
    const n = v === '' ? undefined : Number(v) * scale
    mutate((d) => {
      ;(d.settings as unknown as Record<string, number | undefined>)[key] = n && Number.isFinite(n) ? n : undefined
    })
  }

  return (
    <>
      <div className="stat-grid">
        <StatCard label="FIRE number" value={fmtMoney(fire.fireNumber, 0)} sub={`${fmtPct(withdrawalRate, 0)} withdrawal rate`} />
        <StatCard label="Net worth today" value={fmtMoney(netWorth, 0)} sub={`${fmtPct(fire.progress)} of target`} />
        <StatCard label="Savings rate" value={fmtPct(fire.savingsRate, 0)} sub={`${fmtMoney(fire.annualSavings, 0)} saved / year`} />
        <StatCard
          label="Time to independence"
          value={fire.yearsToFire === null ? 'Increase savings' : fire.yearsToFire === 0 ? 'Reached' : `${fire.yearsToFire} yr`}
          sub={fire.targetAge ? `around age ${fire.targetAge}` : 'set your age below'}
          valueClass={fire.yearsToFire === 0 ? 'green' : ''}
        />
      </div>

      <div className="card">
        <div className="card-title">Progress to financial independence</div>
        <div className="meter" style={{ marginTop: 6 }}>
          <span style={{ width: `${Math.max(1, fire.progress * 100)}%` }} />
        </div>
        <div className="row between small muted" style={{ marginTop: 6 }}>
          <span>{fmtMoney(netWorth, 0)}</span>
          <span>{fmtMoney(fire.fireNumber, 0)}</span>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Projected net worth</div>
        <p className="card-sub">
          Assumes {fmtMoney(fire.annualSavings, 0)} saved each year growing at {fmtPct(realReturn, 0)} a year (real). The line marks your FIRE number.
        </p>
        <div style={{ height: 300 }}>
          <ResponsiveContainer>
            <AreaChart data={series} margin={{ top: 8, right: 8 }}>
              <defs>
                <linearGradient id="firefill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--border-soft)" />
              <XAxis dataKey="year" tickFormatter={(y) => `+${y}y`} tickLine={false} axisLine={false} />
              <YAxis tickFormatter={fmtCompact} tickLine={false} axisLine={false} width={62} />
              <Tooltip contentStyle={chartTooltipStyle} labelFormatter={(y) => `In ${y} years`} formatter={(v: TooltipValue) => [fmtMoney(tv(v), 0), 'Net worth']} />
              <ReferenceLine y={fire.fireNumber} stroke="var(--green)" strokeDasharray="5 4" />
              <Area dataKey="value" stroke="var(--accent)" strokeWidth={2.5} fill="url(#firefill)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Assumptions</div>
        <div className="row wrap" style={{ gap: 16 }}>
          <div className="field mt0">
            <label>Annual spending</label>
            <input
              type="number"
              className="control"
              defaultValue={store.settings.fireMonthlyExpenses ? Math.round(store.settings.fireMonthlyExpenses * 12) : Math.round(t.expense)}
              onBlur={(e) => setNum('fireMonthlyExpenses', e.target.value, 1 / 12)}
            />
          </div>
          <div className="field mt0">
            <label>Withdrawal rate %</label>
            <input type="number" step="0.1" className="control" defaultValue={(withdrawalRate * 100).toFixed(1)} onBlur={(e) => setNum('fireWithdrawalRate', e.target.value, 0.01)} />
          </div>
          <div className="field mt0">
            <label>Expected real return %</label>
            <input type="number" step="0.1" className="control" defaultValue={(realReturn * 100).toFixed(1)} onBlur={(e) => setNum('expectedReturn', e.target.value, 0.01)} />
            {store.settings.inflationRate !== undefined && (
              <div className="small muted" style={{ marginTop: 4 }}>
                After {(store.settings.inflationRate * 100).toFixed(1)}% inflation, that needs about{' '}
                {fmtPct((1 + realReturn) * (1 + store.settings.inflationRate) - 1, 1)} nominal.
              </div>
            )}
          </div>
          <div className="field mt0">
            <label>Your age</label>
            <input type="number" className="control" defaultValue={currentAge ?? ''} onBlur={(e) => setNum('currentAge', e.target.value)} />
          </div>
        </div>
        <p className="small muted" style={{ marginBottom: 0 }}>
          Spending and income come from your last 12 months. Investable assets ({fmtMoney(investable, 0)}) count savings, cash, investments and retirement, and leave out property.
          These projections are estimates, not financial advice.
        </p>
      </div>
    </>
  )
}

/**
 * Planning has two halves: concrete goals with their own funding and deadlines,
 * and the long-range financial-independence projection.
 */
export default function PlanningPage() {
  const [tab, setTab] = useState<'goals' | 'fire'>('goals')
  return (
    <>
      <Seg
        options={[
          { key: 'goals', label: 'Goals' },
          { key: 'fire', label: 'Financial independence' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'goals' ? <GoalsPage /> : <FireView />}
    </>
  )
}
