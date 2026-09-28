import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronRight, Pencil, Users, Plus } from 'lucide-react'
import { useStore } from '../lib/store'
import { balancesOn, balanceToBase, accountById } from '../lib/selectors'
import { fmtMoney, fmtMoneyIn, fmtPct } from '../lib/format'
import { todayISO } from '../lib/dates'
import { ACCOUNT_TYPE_LABEL, LIABILITY_TYPES } from '../lib/constants'
import { DEFAULT_PROFILE_ID } from '../lib/types'
import { vehicleLabel } from '../lib/vehicles'
import { Avatar } from '../components/ProfileSwitcher'
import { StatCard, EmptyState } from '../components/ui'
import type { Account, Profile } from '../lib/types'

const INVESTMENT_TYPES = ['investment', 'retirement'] as const

interface PersonRoll {
  profile: Profile
  accounts: Account[]
  assets: number
  liabilities: number
  net: number
  invested: number
  owed: number
}

export default function HouseholdPage() {
  const store = useStore()
  const today = todayISO()
  const [open, setOpen] = useState<string | null>(null)

  const bals = useMemo(() => balancesOn(store, today), [store, today])
  const accts = accountById(store)

  /** Balance of one account converted to the base currency. */
  const baseOf = (a: Account) => balanceToBase(store, a, bals.get(a.id) ?? 0)

  const people: PersonRoll[] = useMemo(() => {
    const rows = store.profiles.map((profile) => {
      const owned = store.accounts.filter((a) => !a.hidden && (a.profileId ?? DEFAULT_PROFILE_ID) === profile.id)
      let assets = 0
      let liabilities = 0
      let invested = 0
      let owed = 0
      for (const a of owned) {
        const b = baseOf(a)
        if (b >= 0) assets += b
        else liabilities += -b
        if ((INVESTMENT_TYPES as readonly string[]).includes(a.type)) invested += Math.max(0, b)
        if ((LIABILITY_TYPES as readonly string[]).includes(a.type)) owed += Math.max(0, -b)
      }
      return { profile, accounts: owned, assets, liabilities, net: assets - liabilities, invested, owed }
    })
    return rows.filter((r) => r.accounts.length > 0).sort((a, b) => b.net - a.net)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, bals])

  const total = useMemo(
    () =>
      people.reduce(
        (t, p) => ({ assets: t.assets + p.assets, liabilities: t.liabilities + p.liabilities, invested: t.invested + p.invested, owed: t.owed + p.owed }),
        { assets: 0, liabilities: 0, invested: 0, owed: 0 },
      ),
    [people],
  )
  const net = total.assets - total.liabilities

  // Collective investments and loans, each attributed to the person who owns it.
  const investments = useMemo(
    () => store.accounts.filter((a) => !a.hidden && (INVESTMENT_TYPES as readonly string[]).includes(a.type)).map((a) => ({ a, base: baseOf(a) })).sort((x, y) => y.base - x.base),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, bals],
  )
  const loans = useMemo(
    () => store.accounts.filter((a) => !a.hidden && (LIABILITY_TYPES as readonly string[]).includes(a.type)).map((a) => ({ a, base: -baseOf(a) })).filter((x) => x.base > 0).sort((x, y) => y.base - x.base),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, bals],
  )

  const nameOf = (id?: string) => store.profiles.find((p) => p.id === (id ?? DEFAULT_PROFILE_ID))
  const householdName = store.households[0]?.name

  if (people.length === 0) {
    return (
      <EmptyState
        title="No accounts to roll up yet"
        sub="Add people in Settings, then assign each account an owner. This page combines everyone's balances into one household view."
        action={<Link className="btn primary" to="/accounts">Go to Accounts</Link>}
      />
    )
  }

  return (
    <>
      <p className="page-sub muted">
        {householdName ? `${householdName}: everyone's` : 'Everyone’s'} accounts rolled up together. Each person keeps their own accounts and details; the totals below combine them.
      </p>

      <div className="stat-grid">
        <StatCard label="Household net worth" value={fmtMoney(net, 0)} sub={`${people.length} people · ${store.accounts.filter((a) => !a.hidden).length} accounts`} />
        <StatCard label="Combined assets" value={fmtMoney(total.assets, 0)} valueClass="green" />
        <StatCard label="Combined debt" value={fmtMoney(total.liabilities, 0)} valueClass={total.liabilities > 0 ? 'red' : ''} />
        <StatCard label="Invested" value={fmtMoney(total.invested, 0)} sub={net > 0 ? `${fmtPct(total.invested / Math.max(1, total.assets))} of assets` : undefined} />
      </div>

      {/* ---- per person ---- */}
      <div className="card">
        <div className="card-title">
          <span className="row" style={{ gap: 8 }}><Users size={16} /> People</span>
          <Link className="btn small" to="/settings"><Plus size={13} /> Manage people</Link>
        </div>
        <p className="card-sub">Each person's own accounts and their share of the household. Expand to see the accounts they own.</p>

        {people.map((p) => {
          const expanded = open === p.profile.id
          const share = net > 0 ? p.net / net : 0
          return (
            <div key={p.profile.id} className="hh-person">
              <div className="hh-head" onClick={() => setOpen(expanded ? null : p.profile.id)}>
                <span className="hh-chev">{expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
                <Avatar name={p.profile.name} color={p.profile.color} />
                <span className="grow">
                  <div className="hh-name">{p.profile.name}</div>
                  <div className="small muted">
                    {[p.profile.relationship, `${p.accounts.length} account${p.accounts.length === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}
                  </div>
                </span>
                <span className="hh-figs">
                  <span className="hh-fig"><span className="small muted">Assets</span><b className="green">{fmtMoney(p.assets, 0)}</b></span>
                  <span className="hh-fig"><span className="small muted">Debt</span><b className={p.liabilities > 0 ? 'red' : ''}>{fmtMoney(p.liabilities, 0)}</b></span>
                  <span className="hh-fig"><span className="small muted">Net worth</span><b>{fmtMoney(p.net, 0)}</b></span>
                </span>
              </div>

              <div className="hh-share" title={`${p.profile.name} holds ${fmtPct(share)} of household net worth`}>
                <span style={{ width: `${Math.max(1, Math.min(100, share * 100))}%`, background: p.profile.color }} />
              </div>

              {expanded && (
                <div className="hh-accounts">
                  {p.accounts.map((a) => {
                    const b = bals.get(a.id) ?? 0
                    return (
                      <div key={a.id} className="hh-acct">
                        <span className="grow">
                          <div>{a.name}</div>
                          <div className="small muted">{[vehicleLabel(a.subtype) ?? ACCOUNT_TYPE_LABEL[a.type], a.institution].filter(Boolean).join(' · ')}</div>
                        </span>
                        <span className="num">{fmtMoneyIn(a.currency, b)}</span>
                        <Link className="iconbtn" to={`/accounts?edit=${a.id}`} title={`Edit ${a.name}`} aria-label={`Edit ${a.name}`}>
                          <Pencil size={14} />
                        </Link>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ---- collective investments ---- */}
      <div className="grid2">
        <div className="card">
          <div className="card-title">Investments across the household</div>
          {investments.length === 0 ? (
            <p className="card-sub">No investment or retirement accounts yet.</p>
          ) : (
            <>
              <div className="hh-total">{fmtMoney(total.invested, 0)}</div>
              <div className="hh-list">
                {investments.map(({ a, base }) => {
                  const owner = nameOf(a.profileId)
                  return (
                    <div key={a.id} className="hh-acct">
                      <span className="grow">
                        <div>{a.name}</div>
                        <div className="small muted">{[vehicleLabel(a.subtype) ?? ACCOUNT_TYPE_LABEL[a.type], owner?.name].filter(Boolean).join(' · ')}</div>
                      </span>
                      <span className="num">{fmtMoney(base, 0)}</span>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>

        {/* ---- collective loans ---- */}
        <div className="card">
          <div className="card-title">Loans across the household</div>
          {loans.length === 0 ? (
            <p className="card-sub">No outstanding loans or card balances. </p>
          ) : (
            <>
              <div className="hh-total red">{fmtMoney(total.liabilities, 0)}</div>
              <div className="hh-list">
                {loans.map(({ a, base }) => {
                  const owner = nameOf(a.profileId)
                  return (
                    <div key={a.id} className="hh-acct">
                      <span className="grow">
                        <div>{a.name}</div>
                        <div className="small muted">{[ACCOUNT_TYPE_LABEL[a.type], owner?.name, a.interestRate ? `${a.interestRate}%` : ''].filter(Boolean).join(' · ')}</div>
                      </span>
                      <span className="num red">{fmtMoney(base, 0)}</span>
                      <Link className="iconbtn" to={`/accounts?edit=${a.id}`} title={`Edit ${a.name}`} aria-label={`Edit ${a.name}`}>
                        <Pencil size={14} />
                      </Link>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>

      <p className="small muted">
        Amounts are converted to {store.settings.currencyCode} using current rates. Accounts without an owner count towards {store.profiles.find((p) => p.id === DEFAULT_PROFILE_ID)?.name ?? 'the default person'};
        set an owner on the Accounts page to move them.
      </p>
    </>
  )
}
