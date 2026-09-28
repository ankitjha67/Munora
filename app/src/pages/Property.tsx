import { useMemo, useState } from 'react'
import { AreaChart, Area } from 'recharts'
import { Pencil, TrendingUp } from 'lucide-react'
import { useParams } from 'react-router-dom'
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { useScopedStore } from '../lib/profiles'
import { useRange } from '../lib/range'
import { propertyStats, flowsInRange } from '../lib/selectors'
import { propertyPerformance, areaUnitLabel } from '../lib/property'
import ValuationDrawer from '../components/ValuationDrawer'
import { fmtCompact, fmtMoney, fmtMoneySigned, fmtPct } from '../lib/format'
import { monthLabel, todayISO, presetRange } from '../lib/dates'
import { StatCard, BarList, EmptyState } from '../components/ui'
import { chartTooltipStyle, tv } from '../components/charts'
import type { TooltipName, TooltipValue } from '../components/charts'
import { TxTable } from '../components/TxTable'
import { TxListModal } from '../components/TxListModal'
import type { Property, Transaction } from '../lib/types'
import { TxDrawer } from '../components/TxDrawer'

export default function PropertyPage() {
  const store = useScopedStore()
  const { range } = useRange()
  const { id } = useParams()
  const [allTx, setAllTx] = useState(false)
  const [editTx, setEditTx] = useState<Transaction | null>(null)
  const [valuing, setValuing] = useState(false)

  const property = store.properties.find((p) => p.id === id)
  const stats = useMemo(() => (property ? propertyStats(store, property, range, todayISO()) : null), [store, property, range])

  if (!property || !stats) {
    return (
      <div className="card">
        <EmptyState title="Property not found" sub="Create properties in Settings → Properties." />
      </div>
    )
  }

  const chartData = stats.monthly.map((m) => ({ ...m, expense: -m.expense }))

  return (
    <>
      <div className="stat-grid">
        <StatCard
          label="Cash flow (this range)"
          dotColor={stats.net >= 0 ? 'var(--green)' : 'var(--red)'}
          value={fmtMoneySigned(stats.net)}
          valueClass={stats.net >= 0 ? 'green' : 'red'}
        />
        <StatCard label="Income" value={fmtMoney(stats.income)} />
        <StatCard label="Expenses" value={fmtMoney(stats.expenses)} />
        <StatCard
          label="Equity"
          value={fmtMoney(stats.equity)}
          sub={`${fmtMoney(stats.valuation, 0)} value − ${fmtMoney(stats.mortgageBalance, 0)} mortgage`}
        />
      </div>

      <PerformanceCard property={property} onRecord={() => setValuing(true)} />

      <div className="card">
        <div className="card-title">Monthly cash flow</div>
        <div style={{ height: 280 }}>
          <ResponsiveContainer>
            <ComposedChart data={chartData} margin={{ top: 8, right: 8 }} stackOffset="sign">
              <CartesianGrid vertical={false} stroke="var(--border-soft)" />
              <XAxis dataKey="month" tickFormatter={(m) => monthLabel(m, false)} tickLine={false} axisLine={false} />
              <YAxis tickFormatter={fmtCompact} tickLine={false} axisLine={false} width={58} />
              <Tooltip
                contentStyle={chartTooltipStyle}
                labelFormatter={(m) => monthLabel(String(m))}
                formatter={(v: TooltipValue, name: TooltipName) => [fmtMoney(Math.abs(tv(v))), name === 'income' ? 'Income' : name === 'expense' ? 'Expenses' : 'Net']}
              />
              <Legend formatter={(v) => (v === 'income' ? 'Income' : v === 'expense' ? 'Expenses' : 'Net')} iconType="circle" iconSize={8} />
              <Bar dataKey="income" stackId="a" fill="#2F9E44" radius={[4, 4, 0, 0]} />
              <Bar dataKey="expense" stackId="a" fill="#E8590C" radius={[4, 4, 0, 0]} />
              <Line dataKey="net" stroke="#211D16" strokeWidth={2} dot={{ r: 2 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid2">
        <div className="card">
          <div className="card-title">Biggest expenses</div>
          <BarList rows={stats.breakdown} limit={10} />
        </div>
        <div className="card" style={{ padding: '10px 12px' }}>
          <div className="card-title" style={{ padding: '8px 8px 0' }}>
            Recent transactions
            {stats.transactions.length > 12 && (
              <button className="btn small" onClick={() => setAllTx(true)}>
                View all ({stats.transactions.length})
              </button>
            )}
          </div>
          {/* The transaction table needs more width than half a grid, so it scrolls
              inside this card rather than bursting the page. */}
          <div className="table-scroll">
            <TxTable txs={stats.transactions.slice(0, 12)} showHead={false} onRowClick={setEditTx} />
          </div>
        </div>
      </div>

      {allTx && <TxListModal title={`${property.name}, transactions`} txs={stats.transactions} onClose={() => setAllTx(false)} />}
      {editTx && <TxDrawer tx={editTx} onClose={() => setEditTx(null)} key={editTx.id} />}
      {valuing && <ValuationCapture property={property} onClose={() => setValuing(false)} />}
    </>
  )
}

/** Wraps the drawer so it always gets freshly computed performance figures. */
function ValuationCapture({ property, onClose }: { property: Property; onClose: () => void }) {
  const store = useScopedStore()
  const perf = usePerformance(property)
  void store
  return <ValuationDrawer property={property} perf={perf} onClose={onClose} />
}

/** Rent and running costs over the last 12 months, plus the investment roll-up. */
function usePerformance(property: Property) {
  const store = useScopedStore()
  return useMemo(() => {
    const r12 = presetRange('last_12')
    let rent = 0
    let costs = 0
    for (const f of flowsInRange(store, r12)) {
      if (property.incomeCategoryId && f.categoryId === property.incomeCategoryId && f.base > 0) rent += f.base
      else if (property.expenseGroupId) {
        const cat = store.categories.find((c) => c.id === f.categoryId)
        if (cat && cat.groupId === property.expenseGroupId && f.base < 0) costs += -f.base
      }
    }
    return propertyPerformance(store, property, rent, costs)
  }, [store, property])
}

function PerformanceCard({ property, onRecord }: { property: Property; onRecord: () => void }) {
  const perf = usePerformance(property)
  const hasValue = perf.value > 0

  return (
    <div className="card">
      <div className="card-title">
        <span className="row" style={{ gap: 8 }}><TrendingUp size={15} /> Investment performance</span>
        <button className="btn small" onClick={onRecord}><Pencil size={13} /> Record a valuation</button>
      </div>

      {!hasValue ? (
        <p className="card-sub">
          No valuation recorded yet. Add one to track appreciation, annual growth and rental yield. You can enter a figure, work it out from a local rate per unit area, or ask your AI model for an estimate.
        </p>
      ) : (
        <>
          <div className="macro-grid">
            <div className="macro-cell">
              <div className="small muted">Current value</div>
              <div className="macro-val">{fmtMoney(perf.value, 0)}</div>
              <div className="small muted">{perf.valueAsOf ? `as of ${monthLabel(perf.valueAsOf)}` : 'no date'}</div>
            </div>
            <div className="macro-cell">
              <div className="small muted">Appreciation</div>
              <div className={`macro-val ${perf.gain === undefined ? '' : perf.gain >= 0 ? 'green' : 'red'}`}>
                {perf.gain === undefined ? 'n/a' : fmtMoneySigned(perf.gain, 0)}
              </div>
              <div className="small muted">{perf.gainPct === undefined ? 'add what it cost' : `${perf.gainPct >= 0 ? '+' : ''}${(perf.gainPct * 100).toFixed(1)}% on cost`}</div>
            </div>
            <div className="macro-cell">
              <div className="small muted">Annual growth</div>
              <div className="macro-val">{perf.cagr === undefined ? 'n/a' : `${(perf.cagr * 100).toFixed(1)}%`}</div>
              <div className="small muted">{perf.years === undefined ? 'add a purchase date' : `over ${perf.years.toFixed(1)} years`}</div>
            </div>
            <div className="macro-cell">
              <div className="small muted">Equity</div>
              <div className="macro-val">{fmtMoney(perf.equity, 0)}</div>
              <div className="small muted">{perf.ltv !== undefined ? `${fmtPct(perf.ltv, 0)} still owed` : 'no mortgage linked'}</div>
            </div>
            <div className="macro-cell">
              <div className="small muted">Gross yield</div>
              <div className="macro-val">{perf.grossYield === undefined ? 'n/a' : `${(perf.grossYield * 100).toFixed(1)}%`}</div>
              <div className="small muted">{fmtMoney(perf.annualRent, 0)} rent / yr</div>
            </div>
            <div className="macro-cell">
              <div className="small muted">Net yield</div>
              <div className={`macro-val ${perf.netYield !== undefined && perf.netYield < 0 ? 'red' : ''}`}>
                {perf.netYield === undefined ? 'n/a' : `${(perf.netYield * 100).toFixed(1)}%`}
              </div>
              <div className="small muted">after {fmtMoney(perf.annualCosts, 0)} costs</div>
            </div>
            {perf.ratePerArea !== undefined && (
              <div className="macro-cell">
                <div className="small muted">Value per {areaUnitLabel(property.areaUnit)}</div>
                <div className="macro-val">{fmtMoney(perf.ratePerArea, 0)}</div>
                <div className="small muted">{property.area} {areaUnitLabel(property.areaUnit)}</div>
              </div>
            )}
          </div>

          {perf.history.length > 1 && (
            <div style={{ height: 170, marginTop: 14 }}>
              <ResponsiveContainer>
                <AreaChart data={perf.history} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" vertical={false} />
                  <XAxis dataKey="month" tickFormatter={(m: string) => monthLabel(m, false)} tick={{ fontSize: 11 }} stroke="var(--ink-3)" />
                  <YAxis tickFormatter={fmtCompact} tick={{ fontSize: 11 }} stroke="var(--ink-3)" width={58} />
                  <Tooltip contentStyle={chartTooltipStyle} formatter={(v: TooltipValue) => [fmtMoney(tv(v)), 'Value']} labelFormatter={(m) => monthLabel(String(m))} />
                  <Area type="monotone" dataKey="value" stroke="var(--teal)" fill="var(--green-soft)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          <p className="small muted" style={{ marginTop: 10 }}>
            Valuations are your own figures, not a live market feed. Rent and costs cover the last 12 months.
          </p>
        </>
      )}
    </div>
  )
}
