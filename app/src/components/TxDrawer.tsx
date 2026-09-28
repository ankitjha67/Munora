import { useMemo, useState } from 'react'
import { Trash2, Plus } from 'lucide-react'
import type { Split, Store, Transaction } from '../lib/types'
import { useStore, useStoreCtx } from '../lib/store'
import { fmtMoney } from '../lib/format'
import { todayISO } from '../lib/dates'
import { Drawer, Switch } from './ui'

export function newId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}

export function CategorySelect({ store, value, onChange, allowEmpty = true }: { store: Store; value: string; onChange: (v: string) => void; allowEmpty?: boolean }) {
  const groups = useMemo(() => {
    const inc = store.categoryGroups.filter((g) => g.kind === 'income')
    const exp = store.categoryGroups.filter((g) => g.kind === 'expense')
    return [...inc, ...exp].map((g) => ({ g, cats: store.categories.filter((c) => c.groupId === g.id) }))
  }, [store])
  return (
    <select className="control" value={value} onChange={(e) => onChange(e.target.value)}>
      {allowEmpty && <option value="">Uncategorized</option>}
      {groups.map(({ g, cats }) => (
        <optgroup key={g.id} label={g.name}>
          {cats.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}

export function TxDrawer({ tx, onClose }: { tx: Transaction | 'new' | null; onClose: () => void }) {
  const store = useStore()
  const { mutate } = useStoreCtx()
  const editing = tx !== 'new' && tx !== null ? tx : null

  const [date, setDate] = useState(editing?.date ?? todayISO())
  const [merchant, setMerchant] = useState(editing?.merchant ?? '')
  const [amount, setAmount] = useState<string>(editing ? String(editing.amount) : '')
  const [accountId, setAccountId] = useState(editing?.accountId ?? store.accounts.find((a) => !a.balanceHistory)?.id ?? store.accounts[0]?.id ?? '')
  const [categoryId, setCategoryId] = useState(editing?.categoryId ?? '')
  const [tagIds, setTagIds] = useState<string[]>(editing?.tagIds ?? [])
  const [notes, setNotes] = useState(editing?.notes ?? '')
  const [needsReview, setNeedsReview] = useState(editing?.needsReview ?? false)
  const [hidden, setHidden] = useState(editing?.hidden ?? false)
  const [transfer, setTransfer] = useState(editing?.transfer ?? false)
  const [splits, setSplits] = useState<Split[]>(editing?.splits ?? [])

  if (tx === null) return null

  const amt = Number(amount)
  const amountValid = amount.trim() !== '' && Number.isFinite(amt) && amt !== 0
  const splitSum = splits.reduce((a, s) => a + (Number.isFinite(s.amount) ? s.amount : 0), 0)
  const splitsValid = splits.length === 0 || Math.abs(splitSum - amt) < 0.005
  const canSave = amountValid && merchant.trim() !== '' && accountId && date && splitsValid

  const save = () => {
    const base: Transaction = {
      id: editing?.id ?? newId('txn'),
      date,
      merchant: merchant.trim(),
      amount: Math.round(amt * 100) / 100,
      accountId,
      categoryId: splits.length > 0 ? undefined : categoryId || undefined,
      tagIds: tagIds.length ? tagIds : undefined,
      notes: notes.trim() || undefined,
      needsReview: needsReview || undefined,
      hidden: hidden || undefined,
      transfer: transfer || undefined,
      splits: splits.length ? splits : undefined,
    }
    mutate((d) => {
      if (editing) {
        const i = d.transactions.findIndex((t) => t.id === editing.id)
        if (i >= 0) d.transactions[i] = base
      } else {
        d.transactions.push(base)
      }
      d.transactions.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    })
    onClose()
  }

  const remove = () => {
    if (!editing) return
    if (!window.confirm('Delete this transaction?')) return
    mutate((d) => {
      d.transactions = d.transactions.filter((t) => t.id !== editing.id)
    })
    onClose()
  }

  return (
    <Drawer onClose={onClose}>
      <div className="row between">
        <h3>{editing ? 'Edit transaction' : 'Add transaction'}</h3>
        {editing && (
          <button className="iconbtn" onClick={remove} title="Delete">
            <Trash2 />
          </button>
        )}
      </div>
      <div className="field-row">
        <div className="field">
          <label>Date</label>
          <input type="date" className="control" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field">
          <label>Amount in {store.accounts.find((a) => a.id === accountId)?.currency ?? store.settings.currencyCode} (negative = spent)</label>
          <input type="number" step="0.01" className="control" value={amount} placeholder="-42.50" onChange={(e) => setAmount(e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label>Merchant</label>
        <input className="control" value={merchant} placeholder="Trader Joe's" onChange={(e) => setMerchant(e.target.value)} />
      </div>
      <div className="field-row">
        <div className="field">
          <label>Account</label>
          <select className="control" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {store.accounts
              .filter((a) => !a.hidden)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </select>
        </div>
        <div className="field">
          <label>Category</label>
          <CategorySelect store={store} value={categoryId} onChange={setCategoryId} />
        </div>
      </div>
      {store.tags.length > 0 && (
        <div className="field">
          <label>Tags</label>
          <div className="chips">
            {store.tags.map((t) => (
              <button
                key={t.id}
                className={`chip${tagIds.includes(t.id) ? ' active' : ''}`}
                onClick={() => setTagIds((cur) => (cur.includes(t.id) ? cur.filter((x) => x !== t.id) : [...cur, t.id]))}
              >
                {t.name}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="field">
        <label>Notes</label>
        <textarea className="control" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <div className="field">
        <div className="row between">
          <label>Splits {splits.length > 0 && <span className="muted">({fmtMoney(splitSum)} of {amountValid ? fmtMoney(amt) : 'n/a'})</span>}</label>
          <button
            className="btn small"
            onClick={() => setSplits((cur) => [...cur, { id: newId('spl'), amount: 0 }])}
          >
            <Plus /> Add split
          </button>
        </div>
        {!splitsValid && <div className="small red">Splits must add up to the transaction amount.</div>}
        {splits.map((sp, i) => (
          <div className="field-row" key={sp.id} style={{ marginTop: 6 }}>
            <input
              type="number"
              step="0.01"
              className="control"
              style={{ width: 110 }}
              value={sp.amount || ''}
              placeholder="-10.00"
              onChange={(e) => setSplits((cur) => cur.map((x, j) => (j === i ? { ...x, amount: Number(e.target.value) } : x)))}
            />
            <div style={{ flex: 1 }}>
              <CategorySelect store={store} value={sp.categoryId ?? ''} onChange={(v) => setSplits((cur) => cur.map((x, j) => (j === i ? { ...x, categoryId: v || undefined } : x)))} />
            </div>
            <button className="iconbtn" onClick={() => setSplits((cur) => cur.filter((_, j) => j !== i))}>
              <Trash2 />
            </button>
          </div>
        ))}
      </div>

      <div className="field-row" style={{ marginTop: 16 }}>
        <div className="field row" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Switch checked={needsReview} onChange={setNeedsReview} /> <span className="small">Needs review</span>
        </div>
        <div className="field row" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Switch checked={hidden} onChange={setHidden} /> <span className="small">Hidden</span>
        </div>
        <div className="field row" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Switch checked={transfer} onChange={setTransfer} /> <span className="small">Transfer</span>
        </div>
      </div>

      <div className="row" style={{ marginTop: 22, justifyContent: 'flex-end' }}>
        <button className="btn" onClick={onClose}>
          Cancel
        </button>
        <button className="btn primary" disabled={!canSave} onClick={save}>
          {editing ? 'Save changes' : 'Add transaction'}
        </button>
      </div>
    </Drawer>
  )
}
