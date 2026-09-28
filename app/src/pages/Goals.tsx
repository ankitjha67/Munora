import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AreaChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Plus, Pencil, Target, TriangleAlert, CircleCheck } from 'lucide-react'
import { useStore } from '../lib/store'
import { fmtCompact, fmtMoney, fmtPct } from '../lib/format'
import { monthLabel } from '../lib/dates'
import { getScheme } from '../lib/mf'
import { planProgress, planSeries, planKindLabel } from '../lib/plans'
import type { NavMap, PlanProgress } from '../lib/plans'
import type { Plan } from '../lib/types'
import { StatCard, EmptyState } from '../components/ui'
import { chartTooltipStyle, tv } from '../components/charts'
import type { TooltipValue } from '../components/charts'
import PlanEditor from '../components/PlanEditor'
import EconomyCard from '../components/EconomyCard'

export default function GoalsPage() {
  const store = useStore()
  const plans = store.plans ?? []
  const [editing, setEditing] = useState<Plan | 'new' | null>(null)
  const [navs, setNavs] = useState<NavMap>(new Map())

  // Mark fund holdings to the live NAV where the user recorded units.
  const codes = useMemo(() => [...new Set(plans.flatMap((p) => p.funds.filter((f) => f.units).map((f) => f.code)))], [plans])
  useEffect(() => {
    if (codes.length === 0) return
    let alive = true
    Promise.allSettled(codes.map((c) => getScheme(c))).then((settled) => {
      if (!alive) return
      const map: NavMap = new Map()
      for (const s of settled) {
        if (s.status !== 'fulfilled') continue
        const last = s.value.navs[s.value.navs.length - 1]
        if (last) map.set(s.value.meta.scheme_code, last.nav)
      }
      setNavs(map)
    })
    return () => { alive = false }
  }, [codes])

  const rows = useMemo(() => plans.map((p) => planProgress(store, p, navs)), [plans, store, navs])

  const totals = useMemo(
    () =>
      rows.reduce(
        (t, r) => ({
          target: t.target + r.target,
          current: t.current + r.current,
          offTrack: t.offTrack + (r.onTrack === false ? 1 : 0),
          dated: t.dated + (r.monthsLeft !== null ? 1 : 0),
        }),
        { target: 0, current: 0, offTrack: 0, dated: 0 },
      ),
    [rows],
  )

  return (
    <>
      <div className="row between wrap">
        <p className="page-sub muted" style={{ maxWidth: 620 }}>
          Goals you are saving towards, each funded by whichever accounts and funds you choose. Progress tracks their live value.
        </p>
        <button className="btn primary" onClick={() => setEditing('new')}>
          <Plus /> New goal
        </button>
      </div>

      <EconomyCard />

      {plans.length === 0 ? (
        <EmptyState
          title="No goals yet"
          sub="Create a goal like a college fund, a home down payment or an emergency fund, then attach the accounts and mutual funds that pay for it. Munora tracks the combined value and tells you whether you are on pace."
          action={<button className="btn primary" onClick={() => setEditing('new')}>Create your first goal</button>}
        />
      ) : (
        <>
          <div className="stat-grid">
            <StatCard label="Goals" value={String(plans.length)} sub={totals.dated > 0 ? `${totals.dated} with a deadline` : 'No deadlines set'} />
            <StatCard label="Saved towards goals" value={fmtMoney(totals.current, 0)} valueClass="green" />
            <StatCard label="Combined target" value={fmtMoney(totals.target, 0)} sub={totals.target > 0 ? `${fmtPct(totals.current / totals.target)} funded` : undefined} />
            <StatCard
              label="Off pace"
              value={String(totals.offTrack)}
              valueClass={totals.offTrack > 0 ? 'red' : 'green'}
              sub={totals.offTrack > 0 ? 'Raise the monthly saving or extend the date' : 'Every dated goal is on pace'}
            />
          </div>

          {rows.map((r) => (
            <PlanCard key={r.plan.id} r={r} onEdit={() => setEditing(r.plan)} />
          ))}
        </>
      )}

      {editing && <PlanEditor plan={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  )
}

function PlanCard({ r, onEdit }: { r: PlanProgress; onEdit: () => void }) {
  const store = useStore()
  const rate = r.plan.expectedReturn ?? store.settings.expectedReturn ?? 0.07
  const series = useMemo(() => (r.monthsLeft !== null ? planSeries(r, rate) : []), [r, rate])
  const owner = r.plan.profileId ? store.profiles.find((p) => p.id === r.plan.profileId) : undefined
  const accounts = r.plan.accountIds.map((id) => store.accounts.find((a) => a.id === id)).filter(Boolean)

  const barColor = r.onTrack === false ? 'var(--red)' : r.progress >= 1 ? 'var(--green)' : 'var(--accent)'

  return (
    <div className="card">
      <div className="card-title">
        <span className="row" style={{ gap: 8 }}>
          <Target size={15} style={{ color: barColor }} />
          {r.plan.name}
          <span className="badge">{planKindLabel(r.plan.kind)}</span>
          {owner && <span className="small muted">{owner.name}</span>}
          {!owner && <span className="small muted">Household</span>}
        </span>
        <button className="iconbtn" onClick={onEdit} title="Edit goal" aria-label={`Edit ${r.plan.name}`}>
          <Pencil size={15} />
        </button>
      </div>

      <div className="goal-head">
        <div>
          <div className="goal-now">{fmtMoney(r.current, 0)}</div>
          <div className="small muted">
            of {fmtMoney(r.target, 0)} target{r.plan.targetDate ? ` by ${monthLabel(r.plan.targetDate)}` : ''}
          </div>
          {r.inflationUsed !== undefined && (
            <div className="small muted">
              {fmtMoney(r.plan.targetAmount, 0)} in today's money, grown at {(r.inflationUsed * 100).toFixed(1)}% inflation
            </div>
          )}
        </div>
        <div className="goal-pct" style={{ color: barColor }}>{fmtPct(r.rawProgress)}</div>
      </div>

      <div className="goal-bar">
        <span style={{ width: `${Math.max(1, r.progress * 100)}%`, background: barColor }} />
      </div>

      <div className="goal-facts">
        <span><span className="small muted">From accounts</span><b>{fmtMoney(r.fromAccounts, 0)}</b></span>
        <span><span className="small muted">From funds</span><b>{fmtMoney(r.fromFunds, 0)}</b></span>
        <span><span className="small muted">Still needed</span><b>{fmtMoney(r.remaining, 0)}</b></span>
        {r.plan.monthlyContribution ? (
          <span><span className="small muted">Saving / month</span><b>{fmtMoney(r.plan.monthlyContribution, 0)}</b></span>
        ) : null}
        {r.requiredMonthly !== null && (
          <span>
            <span className="small muted">Needed / month</span>
            <b className={r.onTrack === false ? 'red' : ''}>{fmtMoney(r.requiredMonthly, 0)}</b>
          </span>
        )}
      </div>

      {r.onTrack !== null && (
        <div className={`goal-verdict ${r.onTrack ? 'ok' : 'warn'}`}>
          {r.onTrack ? <CircleCheck size={15} /> : <TriangleAlert size={15} />}
          <span>
            {r.onTrack
              ? `On pace: projected ${fmtMoney(r.projected ?? 0, 0)} by ${monthLabel(r.plan.targetDate!)}, about ${fmtMoney(Math.abs(r.surplus ?? 0), 0)} clear of the target.`
              : `Off pace: projected ${fmtMoney(r.projected ?? 0, 0)} by ${monthLabel(r.plan.targetDate!)}, short by ${fmtMoney(Math.abs(r.surplus ?? 0), 0)}. Saving ${fmtMoney(r.requiredMonthly ?? 0, 0)} a month would close it.`}
          </span>
        </div>
      )}

      {series.length > 1 && (
        <div style={{ height: 180, marginTop: 12 }}>
          <ResponsiveContainer>
            <AreaChart data={series} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" vertical={false} />
              <XAxis dataKey="month" tickFormatter={(m: string) => monthLabel(m, false)} tick={{ fontSize: 11 }} stroke="var(--ink-3)" />
              <YAxis tickFormatter={fmtCompact} tick={{ fontSize: 11 }} stroke="var(--ink-3)" width={54} />
              <Tooltip
                contentStyle={chartTooltipStyle}
                formatter={(v: TooltipValue, n) => [fmtMoney(tv(v)), n === 'target' ? 'Target' : 'Projected']}
                labelFormatter={(m) => monthLabel(String(m))}
              />
              <Area type="monotone" dataKey="value" stroke="var(--accent)" fill="var(--accent-soft)" strokeWidth={2} />
              <Line type="monotone" dataKey="target" stroke="var(--ink-3)" strokeDasharray="5 4" dot={false} strokeWidth={1.5} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {(accounts.length > 0 || r.fundValues.length > 0) && (
        <div className="goal-holdings">
          {accounts.map((a) => (
            <div key={a!.id} className="hh-acct">
              <span className="grow">
                <div>{a!.name}</div>
                <div className="small muted">Account</div>
              </span>
              <Link className="iconbtn" to={`/accounts?edit=${a!.id}`} title="Edit account" aria-label={`Edit ${a!.name}`}>
                <Pencil size={13} />
              </Link>
            </div>
          ))}
          {r.fundValues.map((f) => (
            <div key={f.code} className="hh-acct">
              <span className="grow">
                <div>{f.name}</div>
                <div className="small muted">
                  {f.marked ? 'Marked to live NAV' : 'Invested amount'}
                  {f.gain !== undefined && <span className={f.gain >= 0 ? 'green' : 'red'}> · {f.gain >= 0 ? '+' : ''}{(f.gain * 100).toFixed(1)}%</span>}
                </div>
              </span>
              <span className="num">{fmtMoney(f.value, 0)}</span>
            </div>
          ))}
        </div>
      )}

      {r.plan.notes && <p className="small muted" style={{ marginTop: 10 }}>{r.plan.notes}</p>}
      {r.plan.profileId === undefined && r.plan.accountIds.length === 0 && r.fundValues.length === 0 && (
        <p className="small muted" style={{ marginTop: 10 }}>
          Nothing is funding this goal yet. Edit it and pick the accounts or funds that count towards it.
        </p>
      )}
    </div>
  )
}
