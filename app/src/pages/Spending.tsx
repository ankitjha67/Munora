import { useMemo, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts'
import { useScopedStore } from '../lib/profiles'
import { useRange } from '../lib/range'
import type { BreakdownMode, RankRow } from '../lib/selectors'
import { flowsInRange, groupOfCategory, monthlyCashflow, monthlySpendingByKey, spendingRows, totals } from '../lib/selectors'
import { averagePerMonth } from '../lib/selectors'
import { fmtCompact, fmtMoney, fmtPct } from '../lib/format'
import { monthLabel, rangeMonths } from '../lib/dates'
import { StatCard, Seg, BarList } from '../components/ui'
import { Donut, chartTooltipStyle, tv } from '../components/charts'
import type { TooltipName, TooltipValue } from '../components/charts'
import { TxListModal } from '../components/TxListModal'
import type { Transaction } from '../lib/types'

export default function SpendingPage() {
  const store = useScopedStore()
  const { range } = useRange()
  const [mode, setMode] = useState<BreakdownMode>('categories')
  const [trend, setTrend] = useState<'monthly' | 'cumulative'>('monthly')
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [monthModal, setMonthModal] = useState<string | null>(null)

  const t = totals(store, range)
  const rows = spendingRows(store, range, mode)
  const groups = spendingRows(store, range, 'groups')
  const largest = groups[0]

  const expenseTxCount = useMemo(() => {
    const ids = new Set<string>()
    for (const f of flowsInRange(store, range)) {
      const g = groupOfCategory(store, f.categoryId)
      const isExpense = g ? g.kind === 'expense' : f.amount < 0
      if (isExpense) ids.add(f.tx.id)
    }
    return ids.size
  }, [store, range])

  const months = rangeMonths(range)
  const selRows = rows.filter((r) => selectedKeys.has(r.key))

  const trendData = useMemo(() => {
    const cash = monthlyCashflow(store, range)
    if (selRows.length === 0) {
      let run = 0
      return cash.map((m) => {
        run += m.expense
        return { month: m.month, total: m.expense, cumulative: run }
      })
    }
    const byKey = monthlySpendingByKey(store, range, mode, selRows.map((r) => r.key))
    const runs: Record<string, number> = {}
    return months.map((m, i) => {
      const row: Record<string, number | string> = { month: m }
      for (const r of selRows) {
        const v = byKey[i][r.key] ?? 0
        runs[r.key] = (runs[r.key] ?? 0) + v
        row[r.key] = trend === 'cumulative' ? runs[r.key] : v
      }
      return row
    })
  }, [store, range, mode, selRows, months, trend])

  const toggleKey = (row: RankRow) =>
    setSelectedKeys((cur) => {
      const next = new Set(cur)
      if (next.has(row.key)) next.delete(row.key)
      else next.add(row.key)
      return next
    })

  const monthTxs: Transaction[] = useMemo(() => {
    if (!monthModal) return []
    const ids = new Map<string, Transaction>()
    for (const f of flowsInRange(store, range)) {
      if (!f.date.startsWith(monthModal)) continue
      const g = groupOfCategory(store, f.categoryId)
      const isExpense = g ? g.kind === 'expense' : f.amount < 0
      if (!isExpense) continue
      if (selectedKeys.size > 0) {
        let key: string
        if (mode === 'merchants') key = f.merchant
        else if (mode === 'groups') key = g?.id ?? 'uncat'
        else key = f.categoryId ?? 'uncat'
        if (!selectedKeys.has(key)) continue
      }
      ids.set(f.tx.id, f.tx)
    }
    return [...ids.values()].sort((a, b) => (a.date < b.date ? 1 : -1))
  }, [monthModal, store, range, selectedKeys, mode])

  return (
    <>
      <div className="stat-grid">
        <StatCard label="Total spending" dotColor="var(--red)" value={fmtMoney(t.expense)} />
        <StatCard label="Average per month" value={fmtMoney(averagePerMonth(t.expense, range))} />
        <StatCard label="Largest group" value={largest?.name ?? ', '} sub={largest ? `${fmtPct(largest.share)} of spending` : undefined} />
        <StatCard label="Transactions" value={expenseTxCount} />
      </div>

      <div className="card">
        <div className="card-title">
          Spending breakdown
          <Seg
            options={[
              { key: 'groups', label: 'Groups' },
              { key: 'categories', label: 'Categories' },
              { key: 'merchants', label: 'Merchants' },
            ]}
            value={mode}
            onChange={(m) => {
              setMode(m)
              setSelectedKeys(new Set())
            }}
          />
        </div>
        <p className="card-sub">Click a row or slice to chart it in the trend below.</p>
        <div className="row breakdown-row" style={{ alignItems: 'flex-start', gap: 28 }}>
          <div className="donut-wrap">
            <div>
              <Donut rows={rows.slice(0, 11)} total={t.expense} onSliceClick={toggleKey} />
              <div style={{ marginTop: 12, maxWidth: 240 }}>
                <LegendMini rows={rows.slice(0, 9)} />
              </div>
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <BarList rows={rows} limit={14} onRowClick={toggleKey} selectedKeys={selectedKeys} />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">
          Spending trend
          <Seg
            options={[
              { key: 'monthly', label: 'Monthly' },
              { key: 'cumulative', label: 'Cumulative' },
            ]}
            value={trend}
            onChange={setTrend}
          />
        </div>
        <p className="card-sub">
          {selRows.length > 0 ? `Charting ${selRows.map((r) => r.name).join(', ')}. Click a month to see its transactions.` : 'Click a month to see its transactions.'}
        </p>
        <div style={{ height: 280 }}>
          <ResponsiveContainer>
            {selRows.length === 0 ? (
              trend === 'monthly' ? (
                <BarChart data={trendData} onClick={(e) => e?.activeLabel && setMonthModal(String(e.activeLabel))}>
                  <CartesianGrid vertical={false} stroke="var(--border-soft)" />
                  <XAxis dataKey="month" tickFormatter={(m) => monthLabel(m, false)} tickLine={false} axisLine={false} />
                  <YAxis tickFormatter={fmtCompact} tickLine={false} axisLine={false} width={54} />
                  <Tooltip contentStyle={chartTooltipStyle} labelFormatter={(m) => monthLabel(String(m))} formatter={(v: TooltipValue) => [fmtMoney(tv(v)), 'Spending']} />
                  <Bar dataKey="total" fill="#E8590C" radius={[5, 5, 0, 0]} cursor="pointer" />
                </BarChart>
              ) : (
                <LineChart data={trendData}>
                  <CartesianGrid vertical={false} stroke="var(--border-soft)" />
                  <XAxis dataKey="month" tickFormatter={(m) => monthLabel(m, false)} tickLine={false} axisLine={false} />
                  <YAxis tickFormatter={fmtCompact} tickLine={false} axisLine={false} width={54} />
                  <Tooltip contentStyle={chartTooltipStyle} labelFormatter={(m) => monthLabel(String(m))} formatter={(v: TooltipValue) => [fmtMoney(tv(v)), 'Cumulative']} />
                  <Line dataKey="cumulative" stroke="#E8590C" strokeWidth={2.5} dot={false} />
                </LineChart>
              )
            ) : (
              <LineChart data={trendData} onClick={(e) => e?.activeLabel && setMonthModal(String(e.activeLabel))}>
                <CartesianGrid vertical={false} stroke="var(--border-soft)" />
                <XAxis dataKey="month" tickFormatter={(m) => monthLabel(m, false)} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={fmtCompact} tickLine={false} axisLine={false} width={54} />
                <Tooltip contentStyle={chartTooltipStyle} labelFormatter={(m) => monthLabel(String(m))} formatter={(v: TooltipValue, name: TooltipName) => [fmtMoney(tv(v)), selRows.find((r) => r.key === name)?.name ?? String(name ?? '')]} />
                {selRows.map((r) => (
                  <Line key={r.key} dataKey={r.key} stroke={r.color} strokeWidth={2.5} dot={{ r: 2.5 }} />
                ))}
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>

      {monthModal && <TxListModal title={`Spending, ${monthLabel(monthModal)}`} txs={monthTxs} onClose={() => setMonthModal(null)} />}
    </>
  )
}

function LegendMini({ rows }: { rows: RankRow[] }) {
  return (
    <div className="legend">
      {rows.map((r) => (
        <span key={r.key} className="item">
          <span className="dot" style={{ background: r.color }} />
          {r.name}
        </span>
      ))}
    </div>
  )
}
