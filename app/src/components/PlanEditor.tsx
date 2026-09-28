import { useEffect, useMemo, useState } from 'react'
import { Trash2, Plus, Search, Loader2, X } from 'lucide-react'
import { useStore, useStoreCtx } from '../lib/store'
import { useDebounced } from '../lib/hooks'
import { searchSchemes } from '../lib/mf'
import type { MfSearchResult } from '../lib/mf'
import { PLAN_KINDS } from '../lib/plans'
import { ACCOUNT_TYPE_LABEL } from '../lib/constants'
import { DEFAULT_PROFILE_ID } from '../lib/types'
import type { Plan, PlanFund, PlanKind } from '../lib/types'
import { Drawer } from './ui'
import { newId } from './TxDrawer'
import { currentMonth } from '../lib/plans'

/** Create or edit a goal, including which accounts and funds pay for it. */
export default function PlanEditor({ plan, onClose }: { plan: Plan | null; onClose: () => void }) {
  const store = useStore()
  const { mutate } = useStoreCtx()

  const [name, setName] = useState(plan?.name ?? '')
  const [kind, setKind] = useState<PlanKind>(plan?.kind ?? 'wealth')
  const [target, setTarget] = useState(String(plan?.targetAmount ?? ''))
  const [targetDate, setTargetDate] = useState(plan?.targetDate ?? '')
  const [monthly, setMonthly] = useState(String(plan?.monthlyContribution ?? ''))
  const [ret, setRet] = useState(plan?.expectedReturn !== undefined ? String(plan.expectedReturn * 100) : '')
  const [profileId, setProfileId] = useState(plan?.profileId ?? '')
  const [accountIds, setAccountIds] = useState<string[]>(plan?.accountIds ?? [])
  const [funds, setFunds] = useState<PlanFund[]>(plan?.funds ?? [])
  const [notes, setNotes] = useState(plan?.notes ?? '')
  const [inflate, setInflate] = useState(!!plan?.inflateTarget)

  const toggleAccount = (id: string) => setAccountIds((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]))

  const save = () => {
    const amount = Number(target) || 0
    const next: Plan = {
      id: plan?.id ?? newId('plan'),
      name: name.trim() || 'Untitled goal',
      kind,
      targetAmount: amount,
      targetDate: targetDate || undefined,
      monthlyContribution: Number(monthly) || undefined,
      expectedReturn: ret.trim() ? Number(ret) / 100 : undefined,
      inflateTarget: inflate || undefined,
      accountIds,
      funds,
      profileId: profileId || undefined,
      notes: notes.trim() || undefined,
      createdAt: plan?.createdAt ?? Date.now(),
    }
    mutate((d) => {
      const list = d.plans ?? (d.plans = [])
      const i = list.findIndex((p) => p.id === next.id)
      if (i >= 0) list[i] = next
      else list.push(next)
    })
    onClose()
  }

  const remove = () => {
    if (!plan) return
    if (!window.confirm(`Delete the goal "${plan.name}"? Your accounts and funds are not affected.`)) return
    mutate((d) => {
      d.plans = (d.plans ?? []).filter((p) => p.id !== plan.id)
    })
    onClose()
  }

  const visibleAccounts = store.accounts.filter((a) => !a.hidden)

  return (
    <Drawer onClose={onClose}>
      <div className="row between">
        <h3>{plan ? 'Edit goal' : 'New goal'}</h3>
        {plan && (
          <button className="iconbtn" onClick={remove} title="Delete goal">
            <Trash2 />
          </button>
        )}
      </div>

      <div className="field">
        <label>Goal name</label>
        <input className="control" value={name} onChange={(e) => setName(e.target.value)} placeholder="Riya's college fund" autoFocus />
      </div>

      <div className="row wrap" style={{ gap: 12 }}>
        <div className="field mt0" style={{ flex: '1 1 180px' }}>
          <label>Type</label>
          <select className="control" value={kind} onChange={(e) => setKind(e.target.value as PlanKind)}>
            {PLAN_KINDS.map((k) => (
              <option key={k.key} value={k.key}>{k.label}</option>
            ))}
          </select>
        </div>
        <div className="field mt0" style={{ flex: '1 1 160px' }}>
          <label>Whose goal</label>
          <select className="control" value={profileId} onChange={(e) => setProfileId(e.target.value)}>
            <option value="">Whole household</option>
            {store.profiles.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="row wrap" style={{ gap: 12 }}>
        <div className="field mt0" style={{ flex: '1 1 150px' }}>
          <label>Target amount</label>
          <input className="control" type="number" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="2500000" />
        </div>
        <div className="field mt0" style={{ flex: '1 1 130px' }}>
          <label>Needed by</label>
          <input className="control" type="month" value={targetDate} min={currentMonth()} onChange={(e) => setTargetDate(e.target.value)} />
        </div>
        <div className="field mt0" style={{ flex: '1 1 130px' }}>
          <label>Monthly saving</label>
          <input className="control" type="number" inputMode="decimal" value={monthly} onChange={(e) => setMonthly(e.target.value)} placeholder="15000" />
        </div>
        <div className="field mt0" style={{ flex: '1 1 120px' }}>
          <label>Return % / yr</label>
          <input className="control" type="number" inputMode="decimal" value={ret} onChange={(e) => setRet(e.target.value)} placeholder={String(((store.settings.expectedReturn ?? 0.07) * 100).toFixed(0))} />
        </div>
      </div>

      <label className="row small" style={{ gap: 8, marginTop: 4, cursor: 'pointer' }}>
        <input type="checkbox" className="cb" checked={inflate} onChange={(e) => setInflate(e.target.checked)} />
        <span>
          Treat the target as today's money and raise it with inflation
          {store.settings.inflationRate !== undefined
            ? ` (${(store.settings.inflationRate * 100).toFixed(1)}% from Settings)`
            : ' (set an inflation rate on the Planning page first)'}
        </span>
      </label>

      <div className="field">
        <label>Accounts funding this goal</label>
        <p className="small muted" style={{ margin: '0 0 8px' }}>Their live balances count towards the target.</p>
        <div className="pick-list">
          {visibleAccounts.map((a) => {
            const on = accountIds.includes(a.id)
            const owner = store.profiles.find((p) => p.id === (a.profileId ?? DEFAULT_PROFILE_ID))
            return (
              <label key={a.id} className={`pick-row${on ? ' on' : ''}`}>
                <input type="checkbox" className="cb" checked={on} onChange={() => toggleAccount(a.id)} />
                <span className="grow">
                  <div>{a.name}</div>
                  <div className="small muted">{[ACCOUNT_TYPE_LABEL[a.type], owner?.name].filter(Boolean).join(' · ')}</div>
                </span>
              </label>
            )
          })}
        </div>
      </div>

      <FundPicker funds={funds} onChange={setFunds} />

      <div className="field">
        <label>Notes</label>
        <textarea className="control" style={{ minHeight: 60 }} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything worth remembering about this goal" />
      </div>

      <div className="row" style={{ marginTop: 16 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <div className="spacer" />
        <button className="btn primary" disabled={!name.trim() || !(Number(target) > 0)} onClick={save}>
          {plan ? 'Save goal' : 'Create goal'}
        </button>
      </div>
    </Drawer>
  )
}

/** Search AMFI and attach funds (with what has been invested) to the goal. */
function FundPicker({ funds, onChange }: { funds: PlanFund[]; onChange: (f: PlanFund[]) => void }) {
  const [q, setQ] = useState('')
  const dq = useDebounced(q, 400)
  const [results, setResults] = useState<MfSearchResult[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (dq.trim().length < 3) { setResults([]); return }
    let alive = true
    setBusy(true)
    searchSchemes(dq.trim())
      .then((r) => alive && setResults(r.slice(0, 12)))
      .catch(() => alive && setResults([]))
      .finally(() => alive && setBusy(false))
    return () => { alive = false }
  }, [dq])

  const has = useMemo(() => new Set(funds.map((f) => f.code)), [funds])

  const add = (r: MfSearchResult) => {
    onChange([...funds, { code: r.schemeCode, name: r.schemeName, invested: 0 }])
    setQ('')
    setResults([])
  }
  const patch = (code: number, p: Partial<PlanFund>) => onChange(funds.map((f) => (f.code === code ? { ...f, ...p } : f)))

  return (
    <div className="field">
      <label>Mutual funds in this goal</label>
      <p className="small muted" style={{ margin: '0 0 8px' }}>
        Enter what you have invested. Add units too and the value is marked to the live NAV.
      </p>

      {funds.map((f) => (
        <div key={f.code} className="plan-fund">
          <span className="grow">
            <div className="small" style={{ fontWeight: 600 }}>{f.name ?? `Scheme #${f.code}`}</div>
            <div className="row" style={{ gap: 8, marginTop: 6 }}>
              <input className="control" style={{ width: 120 }} type="number" inputMode="decimal" placeholder="Invested" value={f.invested || ''} onChange={(e) => patch(f.code, { invested: Number(e.target.value) || 0 })} />
              <input className="control" style={{ width: 110 }} type="number" inputMode="decimal" placeholder="Units" value={f.units ?? ''} onChange={(e) => patch(f.code, { units: e.target.value ? Number(e.target.value) : undefined })} />
            </div>
          </span>
          <button className="iconbtn" title="Remove fund" onClick={() => onChange(funds.filter((x) => x.code !== f.code))}>
            <X size={15} />
          </button>
        </div>
      ))}

      <div className="search-wrap" style={{ marginTop: 8 }}>
        <Search />
        <input className="control" placeholder="Search a fund to add…" value={q} onChange={(e) => setQ(e.target.value)} />
        {busy && <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />}
      </div>
      {results.length > 0 && (
        <div className="search-results">
          {results.map((r) => (
            <button key={r.schemeCode} className="search-row" disabled={has.has(r.schemeCode)} onClick={() => add(r)}>
              <span className="txt">{r.schemeName}</span>
              {has.has(r.schemeCode) ? <span className="small muted">added</span> : <Plus size={15} />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
