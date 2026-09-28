import { useMemo, useState } from 'react'
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { ChevronRight } from 'lucide-react'
import { useStore } from '../lib/store'
import { useScopedStore, useProfileScope } from '../lib/profiles'
import { useRange } from '../lib/range'
import { assetsLiabilities, multiCurrencyInUse, netWorthByProfile, netWorthChange, netWorthSeries } from '../lib/selectors'
import type { TypeGroupRow } from '../lib/selectors'
import { Avatar } from '../components/ProfileSwitcher'
import type { Store } from '../lib/types'
import { fmtCompact, fmtMoney, fmtMoneyIn, fmtMoneySigned } from '../lib/format'
import { monthKey, monthLabel } from '../lib/dates'
import { ACCOUNT_TYPE_LABEL } from '../lib/constants'
import { accountTypeLabel } from '../lib/terms'
import { StatCard, Seg } from '../components/ui'
import { chartTooltipStyle, tv } from '../components/charts'
import type { TooltipName, TooltipValue } from '../components/charts'

const TYPE_COLORS: Record<string, string> = {
  real_estate: '#3B82F6',
  retirement: '#8B5CF6',
  investment: '#14B8A6',
  checking: '#F59E0B',
  savings: '#10B981',
  cash: '#84CC16',
  credit: '#EC4899',
  loan: '#EF4444',
}

function longMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' })
}

export default function NetWorthPage() {
  const store = useScopedStore()
  const base = useStore()
  const { scope: profileScope } = useProfileScope()
  const { range } = useRange()
  const [view, setView] = useState<'networth' | 'bytype'>('networth')
  const [scope, setScope] = useState('all')

  const { current, change } = netWorthChange(store, range)
  const al = assetsLiabilities(store, range.end)

  const scopeObj = scope === 'all' ? undefined : { type: scope }
  const series = netWorthSeries(store, range, scopeObj)

  const typesPresent = useMemo(() => {
    const set = new Set<string>()
    for (const p of series) for (const k of Object.keys(p.byType)) set.add(k)
    return [...set]
  }, [series])

  const byTypeData = series.map((p) => ({ month: p.month, ...p.byType }))

  return (
    <>
      <div className="stat-grid">
        <StatCard label="Net worth" value={fmtMoney(current)} sub={`As of end of ${longMonth(monthKey(range.end))}`} />
        <StatCard
          label="Change this period"
          dotColor={change >= 0 ? 'var(--green)' : 'var(--red)'}
          value={fmtMoneySigned(change)}
          valueClass={change >= 0 ? 'green' : 'red'}
          sub={`Since the start of ${longMonth(monthKey(range.start))}`}
        />
        <StatCard label="Assets" value={fmtMoney(al.assets)} />
        <StatCard label="Liabilities" value={fmtMoney(al.liabilities)} />
      </div>
      {multiCurrencyInUse(store) && (
        <p className="small muted" style={{ margin: '-6px 2px 0' }}>
          Includes foreign-currency accounts converted at {store.fx ? 'the cached live rates' : '1:1 (no rates yet)'}. Manage in Settings, Currency and live rates.
        </p>
      )}

      {profileScope === 'all' && base.profiles.length > 1 && <HouseholdBreakdown base={base} dateISO={range.end} />}

      <div className="card">
        <div className="card-title">
          Net worth over time
          <span className="row">
            <select className="control" value={scope} onChange={(e) => setScope(e.target.value)}>
              <option value="all">All accounts</option>
              {Object.keys(ACCOUNT_TYPE_LABEL)
                .filter((t) => store.accounts.some((a) => a.type === t && !a.hidden))
                .map((t) => (
                  <option key={t} value={t}>
                    {accountTypeLabel(t)}
                  </option>
                ))}
            </select>
            <Seg
              options={[
                { key: 'networth', label: 'Net worth' },
                { key: 'bytype', label: 'By type' },
              ]}
              value={view}
              onChange={setView}
            />
          </span>
        </div>
        <div style={{ height: 300 }}>
          <ResponsiveContainer>
            {view === 'networth' ? (
              <AreaChart data={series} margin={{ top: 8, right: 8 }}>
                <defs>
                  <linearGradient id="nwfill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#E8590C" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="#E8590C" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--border-soft)" />
                <XAxis dataKey="month" tickFormatter={(m) => monthLabel(m, false)} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={fmtCompact} tickLine={false} axisLine={false} width={62} domain={['auto', 'auto']} />
                <Tooltip contentStyle={chartTooltipStyle} labelFormatter={(m) => monthLabel(String(m))} formatter={(v: TooltipValue) => [fmtMoney(tv(v)), 'Net worth']} />
                <Area dataKey="value" stroke="#E8590C" strokeWidth={2.5} fill="url(#nwfill)" dot={{ r: 2.5, fill: '#E8590C', strokeWidth: 0 }} activeDot={{ r: 4 }} />
              </AreaChart>
            ) : (
              <LineChart data={byTypeData} margin={{ top: 8, right: 8 }}>
                <CartesianGrid vertical={false} stroke="var(--border-soft)" />
                <XAxis dataKey="month" tickFormatter={(m) => monthLabel(m, false)} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={fmtCompact} tickLine={false} axisLine={false} width={62} domain={['auto', 'auto']} />
                <Tooltip
                  contentStyle={chartTooltipStyle}
                  labelFormatter={(m) => monthLabel(String(m))}
                  formatter={(v: TooltipValue, name: TooltipName) => [fmtMoney(tv(v)), accountTypeLabel(String(name ?? ''))]}
                />
                {typesPresent.map((t) => (
                  <Line key={t} dataKey={t} stroke={TYPE_COLORS[t] ?? '#64748B'} strokeWidth={2} dot={false} />
                ))}
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>
        {view === 'bytype' && (
          <div className="legend" style={{ marginTop: 10 }}>
            {typesPresent.map((t) => (
              <span key={t} className="item">
                <span className="dot" style={{ background: TYPE_COLORS[t] ?? '#64748B' }} />
                {accountTypeLabel(t)}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="grid2">
        <div className="card">
          <div className="card-title">Assets</div>
          <TypeGroups groups={al.assetGroups} />
        </div>
        <div className="card">
          <div className="card-title">Liabilities</div>
          <TypeGroups groups={al.liabilityGroups} liabilities />
        </div>
      </div>
    </>
  )
}

function HouseholdBreakdown({ base, dateISO }: { base: Store; dateISO: string }) {
  const rows = netWorthByProfile(base, dateISO)
  if (rows.length === 0) return null
  const total = rows.reduce((a, r) => a + r.net, 0)
  const max = Math.max(...rows.map((r) => Math.abs(r.net)), 1)
  return (
    <div className="card">
      <div className="card-title">
        By person
        <span className="num" style={{ fontWeight: 650 }}>{fmtMoney(total, 0)} combined</span>
      </div>
      <p className="card-sub">Each person's accounts, rolled up into the household total.</p>
      {rows.map((r) => (
        <div key={r.profile.id} className="acctrow">
          <Avatar name={r.profile.name} color={r.profile.color} size="md" />
          <span className="grow">
            <div className="a-name">
              {r.profile.name}
              {r.profile.relationship ? <span className="muted small"> · {r.profile.relationship}</span> : ''}
            </div>
            <div className="meter" style={{ marginTop: 5, maxWidth: 260 }}>
              <span style={{ width: `${Math.max(2, (Math.abs(r.net) / max) * 100)}%`, background: r.profile.color }} />
            </div>
          </span>
          <span className="a-bal">
            {fmtMoney(r.net, 0)}
            <div className="a-sub num">{fmtMoney(r.assets, 0)} assets</div>
          </span>
        </div>
      ))}
    </div>
  )
}

function TypeGroups({ groups, liabilities = false }: { groups: TypeGroupRow[]; liabilities?: boolean }) {
  const [open, setOpen] = useState<Set<string>>(new Set())
  const toggle = (t: string) =>
    setOpen((cur) => {
      const next = new Set(cur)
      if (next.has(t)) next.delete(t)
      else next.add(t)
      return next
    })
  if (groups.length === 0) return <div className="empty small">None</div>
  return (
    <div>
      {groups.map((g) => (
        <div key={g.type}>
          <div className="acctrow" style={{ cursor: 'pointer' }} onClick={() => toggle(g.type)}>
            <ChevronRight className={`caret${open.has(g.type) ? ' open' : ''}`} />
            <span className="dot" style={{ background: TYPE_COLORS[g.type] ?? '#64748B' }} />
            <span className="grow a-name">{accountTypeLabel(g.type)}</span>
            <span className="muted small">{g.accounts.length}</span>
            <span className="a-bal">{fmtMoney(liabilities ? -g.total : g.total)}</span>
          </div>
          {open.has(g.type) &&
            g.accounts.map(({ account, balance, balanceBase }) => {
              const foreign = account.currency && account.currency !== undefined && balanceBase !== balance
              return (
                <div key={account.id} className="acctrow" style={{ paddingLeft: 42 }}>
                  <span className="grow">
                    <div className="a-name" style={{ fontWeight: 500 }}>
                      {account.name}
                    </div>
                    <div className="a-sub">{account.institution}</div>
                  </span>
                  <span className="a-bal">
                    {fmtMoneyIn(account.currency, liabilities ? -balance : balance)}
                    {foreign && <div className="a-sub num">≈ {fmtMoney(liabilities ? -balanceBase : balanceBase)}</div>}
                  </span>
                </div>
              )
            })}
        </div>
      ))}
    </div>
  )
}
