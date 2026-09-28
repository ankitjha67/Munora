import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, Landmark, PiggyBank, Wallet, CreditCard, CandlestickChart, Umbrella, Home, HandCoins, Trash2, Pencil } from 'lucide-react'
import type { Account, AccountType } from '../lib/types'
import { DEFAULT_PROFILE_ID } from '../lib/types'
import { useStore, useStoreCtx } from '../lib/store'
import { useScopedStore, useProfileScope } from '../lib/profiles'
import { accountBalanceOn, balanceToBase } from '../lib/selectors'
import { fmtMoney, fmtMoneyIn } from '../lib/format'
import { monthKey, todayISO } from '../lib/dates'
import { ACCOUNT_TYPE_LABEL, ASSET_TYPES, CURRENCIES, LIABILITY_TYPES } from '../lib/constants'
import { accountTypeLabel } from '../lib/terms'
import { vehicleLabel, vehiclesForRegion, vehicle } from '../lib/vehicles'
import { Drawer, Switch } from '../components/ui'
import { Avatar } from '../components/ProfileSwitcher'
import { newId } from '../components/TxDrawer'

const TYPE_ICON: Record<string, React.ComponentType<{ size?: number }>> = {
  checking: Landmark,
  savings: PiggyBank,
  cash: Wallet,
  credit: CreditCard,
  investment: CandlestickChart,
  retirement: Umbrella,
  real_estate: Home,
  loan: HandCoins,
}

const TYPE_COLORS: Record<string, string> = {
  checking: '#F59E0B',
  savings: '#10B981',
  cash: '#84CC16',
  credit: '#EC4899',
  investment: '#14B8A6',
  retirement: '#8B5CF6',
  real_estate: '#3B82F6',
  loan: '#EF4444',
}

/** Valued types keep balances via monthly history instead of transactions. */
const VALUED: AccountType[] = ['investment', 'retirement', 'real_estate', 'loan']

export default function AccountsPage() {
  const store = useScopedStore()
  const base = useStore()
  const { scope } = useProfileScope()
  const { mutate } = useStoreCtx()
  const [drawer, setDrawer] = useState<Account | 'new' | null>(null)
  const today = todayISO()
  const showOwner = scope === 'all' && base.profiles.length > 1

  // Other pages (Loans, Properties) link here as /accounts?edit=<id> to open the
  // editor for one account directly.
  const [params, setParams] = useSearchParams()
  const editId = params.get('edit')
  useEffect(() => {
    if (!editId) return
    const target = base.accounts.find((a) => a.id === editId)
    if (target) setDrawer(target)
    params.delete('edit')
    setParams(params, { replace: true })
  }, [editId, base.accounts, params, setParams])

  const order: AccountType[] = [...ASSET_TYPES, ...LIABILITY_TYPES] as AccountType[]
  const profileOf = (id?: string) => base.profiles.find((p) => p.id === (id ?? DEFAULT_PROFILE_ID))

  return (
    <>
      <div className="row">
        <span className="muted small">{store.accounts.length} accounts</span>
        <div className="spacer" />
        <button className="btn primary" onClick={() => setDrawer('new')}>
          <Plus /> Add account
        </button>
      </div>

      {order
        .filter((t) => store.accounts.some((a) => a.type === t))
        .map((type) => (
          <div className="card" key={type} style={{ padding: '10px 16px' }}>
            <div className="card-title" style={{ margin: '8px 0' }}>
              {accountTypeLabel(type)}
            </div>
            {store.accounts
              .filter((a) => a.type === type)
              .map((a) => {
                const Icon = TYPE_ICON[a.type] ?? Landmark
                const bal = accountBalanceOn(store, a, today)
                const foreign = a.currency && a.currency !== store.settings.currencyCode
                const owner = profileOf(a.profileId)
                return (
                  <div key={a.id} className="acctrow" style={{ cursor: 'pointer' }} onClick={() => setDrawer(a)}>
                    <span className="typechip" style={{ background: TYPE_COLORS[a.type] }}>
                      <Icon size={15} />
                    </span>
                    <span className="grow">
                      <div className="a-name">{a.name}</div>
                      <div className="a-sub">
                        {[vehicleLabel(a.subtype), a.institution, a.mask ? `····${a.mask}` : '', a.interestRate ? `${a.interestRate}%` : '', foreign ? a.currency : '']
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    </span>
                    {showOwner && owner && (
                      <span className="row small muted owner-badge" title={owner.name}>
                        <Avatar name={owner.name} color={owner.color} size="sm" />
                      </span>
                    )}
                    <span className="row small muted" onClick={(e) => e.stopPropagation()}>
                      <span className="hide-label">Hidden</span>
                      <Switch
                        checked={!!a.hidden}
                        onChange={(v) =>
                          mutate((d) => {
                            const acc = d.accounts.find((x) => x.id === a.id)
                            if (acc) acc.hidden = v || undefined
                          })
                        }
                      />
                    </span>
                    <span className="a-bal" style={{ minWidth: 120 }}>
                      {fmtMoneyIn(a.currency, bal)}
                      {foreign && <div className="a-sub num">≈ {fmtMoney(balanceToBase(store, a, bal))}</div>}
                    </span>
                    {/* The whole row opens the editor, but a visible control makes
                        editing and deleting discoverable rather than a hidden gesture. */}
                    <button className="iconbtn row-edit" title={`Edit or delete ${a.name}`} aria-label={`Edit or delete ${a.name}`} onClick={(e) => { e.stopPropagation(); setDrawer(a) }}>
                      <Pencil size={15} />
                    </button>
                  </div>
                )
              })}
          </div>
        ))}

      {drawer !== null && (
        <AccountDrawer
          account={drawer === 'new' ? null : drawer}
          defaultProfileId={scope === 'all' ? DEFAULT_PROFILE_ID : scope}
          onClose={() => setDrawer(null)}
        />
      )}
    </>
  )
}

function AccountDrawer({ account, defaultProfileId, onClose }: { account: Account | null; defaultProfileId: string; onClose: () => void }) {
  const store = useStore()
  const { mutate } = useStoreCtx()
  const today = todayISO()

  const [name, setName] = useState(account?.name ?? '')
  const [type, setType] = useState<AccountType>(account?.type ?? 'checking')
  const [subtype, setSubtype] = useState(account?.subtype ?? '')
  const [profileId, setProfileId] = useState(account?.profileId ?? defaultProfileId)
  const [currency, setCurrencyState] = useState(account?.currency ?? '')
  const [institution, setInstitution] = useState(account?.institution ?? '')
  const [mask, setMask] = useState(account?.mask ?? '')
  const [openingBalance, setOpeningBalance] = useState(account ? String(account.openingBalance) : '0')
  const [openingDate, setOpeningDate] = useState(account?.openingDate ?? today)
  const [interestRate, setInterestRate] = useState(account?.interestRate ? String(account.interestRate) : '')
  const [originalPrincipal, setOriginalPrincipal] = useState(account?.originalPrincipal ? String(account.originalPrincipal) : '')
  const [currentBalance, setCurrentBalance] = useState(account ? String(accountBalanceOn(store, account, today)) : '')

  const valued = VALUED.includes(type)
  const txCount = account ? store.transactions.filter((t) => t.accountId === account.id).length : 0
  const { region: regionVehicles, other } = vehiclesForRegion(store.settings.region ?? 'US')

  const pickVehicle = (key: string) => {
    setSubtype(key)
    const v = vehicle(key)
    if (v) setType(v.type)
  }

  const save = () => {
    mutate((d) => {
      const rec: Account = {
        id: account?.id ?? newId('acc'),
        name: name.trim(),
        type,
        subtype: subtype || undefined,
        profileId,
        institution: institution.trim() || undefined,
        mask: mask.trim() || undefined,
        openingBalance: Number(openingBalance) || 0,
        openingDate,
        currency: currency || undefined,
        interestRate: interestRate ? Number(interestRate) : undefined,
        originalPrincipal: originalPrincipal ? Number(originalPrincipal) : undefined,
        hidden: account?.hidden,
        balanceHistory: account?.balanceHistory,
      }
      if (valued && currentBalance !== '') {
        const bal = Number(currentBalance)
        const m = monthKey(today)
        const hist = [...(rec.balanceHistory ?? [])]
        const i = hist.findIndex((p) => p.month === m)
        if (i >= 0) hist[i] = { month: m, balance: bal }
        else hist.push({ month: m, balance: bal })
        hist.sort((a, b) => (a.month < b.month ? -1 : 1))
        rec.balanceHistory = hist
      }
      if (account) {
        const i = d.accounts.findIndex((x) => x.id === account.id)
        if (i >= 0) d.accounts[i] = rec
      } else {
        d.accounts.push(rec)
      }
    })
    onClose()
  }

  const remove = () => {
    if (!account) return
    if (!window.confirm(`Delete "${account.name}"${txCount ? ` and its ${txCount} transactions` : ''}? This cannot be undone.`)) return
    mutate((d) => {
      d.accounts = d.accounts.filter((x) => x.id !== account.id)
      d.transactions = d.transactions.filter((t) => t.accountId !== account.id)
      for (const p of d.properties) {
        if (p.valuationAccountId === account.id) p.valuationAccountId = undefined
        if (p.mortgageAccountId === account.id) p.mortgageAccountId = undefined
      }
    })
    onClose()
  }

  return (
    <Drawer onClose={onClose}>
      <div className="row between">
        <h3>{account ? 'Edit account' : 'Add account'}</h3>
        {account && (
          <button className="iconbtn" onClick={remove} title="Delete account">
            <Trash2 />
          </button>
        )}
      </div>
      <div className="field">
        <label>Name</label>
        <input className="control" value={name} onChange={(e) => setName(e.target.value)} placeholder="Joint Checking" />
      </div>
      <div className="field-row">
        <div className="field">
          <label>Owner</label>
          <select className="control" value={profileId} onChange={(e) => setProfileId(e.target.value)}>
            {store.profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.relationship ? ` (${p.relationship})` : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Vehicle</label>
          <select className="control" value={subtype} onChange={(e) => pickVehicle(e.target.value)}>
            <option value="">Generic ({accountTypeLabel(type)})</option>
            <optgroup label="Common">
              {regionVehicles.map((v) => (
                <option key={v.key} value={v.key}>
                  {v.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="Other regions">
              {other.map((v) => (
                <option key={v.key} value={v.key}>
                  {v.label} ({v.region})
                </option>
              ))}
            </optgroup>
          </select>
        </div>
      </div>
      <div className="field-row">
        <div className="field">
          <label>Type</label>
          <select className="control" value={type} onChange={(e) => setType(e.target.value as AccountType)}>
            {Object.keys(ACCOUNT_TYPE_LABEL).map((k) => (
              <option key={k} value={k}>
                {accountTypeLabel(k)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Institution</label>
          <input className="control" value={institution} onChange={(e) => setInstitution(e.target.value)} placeholder="Chase" />
        </div>
      </div>
      <div className="field">
        <label>Currency (this account's amounts)</label>
        <select className="control" value={currency} onChange={(e) => setCurrencyState(e.target.value)}>
          <option value="">Base ({store.settings.currencyCode})</option>
          {CURRENCIES.filter((c) => c !== store.settings.currencyCode).map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <div className="field-row">
        <div className="field">
          <label>Last 4 digits</label>
          <input className="control" value={mask} onChange={(e) => setMask(e.target.value)} placeholder="4821" maxLength={4} />
        </div>
        <div className="field">
          <label>Interest rate % (optional)</label>
          <input type="number" step="0.01" className="control" value={interestRate} onChange={(e) => setInterestRate(e.target.value)} />
        </div>
      </div>
      <div className="field-row">
        <div className="field">
          <label>Opening balance {type === 'credit' || type === 'loan' ? '(negative = owed)' : ''}</label>
          <input type="number" step="0.01" className="control" value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} />
        </div>
        <div className="field">
          <label>Opening date</label>
          <input type="date" className="control" value={openingDate} onChange={(e) => setOpeningDate(e.target.value)} />
        </div>
      </div>
      {type === 'loan' && (
        <div className="field">
          <label>Original principal</label>
          <input type="number" step="0.01" className="control" value={originalPrincipal} onChange={(e) => setOriginalPrincipal(e.target.value)} />
        </div>
      )}
      {valued && (
        <div className="field">
          <label>Current balance {type === 'loan' ? '(negative = owed)' : ''}, saved as this month's valuation</label>
          <input type="number" step="0.01" className="control" value={currentBalance} onChange={(e) => setCurrentBalance(e.target.value)} />
        </div>
      )}
      {account && <p className="small muted">{txCount} transactions on this account.</p>}
      <div className="row" style={{ marginTop: 20, justifyContent: 'flex-end' }}>
        <button className="btn" onClick={onClose}>
          Cancel
        </button>
        <button className="btn primary" disabled={!name.trim()} onClick={save}>
          {account ? 'Save changes' : 'Add account'}
        </button>
      </div>
    </Drawer>
  )
}
