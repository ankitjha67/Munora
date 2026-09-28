import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, Search, Upload, ChevronRight } from 'lucide-react'
import { useStore, useStoreCtx } from '../lib/store'
import { useScopedStore } from '../lib/profiles'
import { useRange } from '../lib/range'
import { accountById, categoryById, categoryColor, groupOfCategory, merchantColor, toBase } from '../lib/selectors'
import { fmtMoney } from '../lib/format'
import { monthLabel } from '../lib/dates'
import { DEFAULT_PROFILE_ID } from '../lib/types'
import type { Transaction } from '../lib/types'
import { TxTable } from '../components/TxTable'
import { TxDrawer, CategorySelect } from '../components/TxDrawer'
import { CsvImportModal } from '../components/CsvImport'
import { UNCATEGORIZED_COLOR } from '../lib/constants'

type Chip = 'all' | 'review' | 'uncategorized' | 'split' | 'hidden'
type GroupBy = 'none' | 'month' | 'category' | 'group' | 'merchant' | 'account' | 'type' | 'tag' | 'owner' | 'review'
type SortBy = 'date_desc' | 'date_asc' | 'amt_desc' | 'amt_asc'

const CHIPS: { key: Chip; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'review', label: 'Needs review' },
  { key: 'uncategorized', label: 'Uncategorized' },
  { key: 'split', label: 'Split' },
  { key: 'hidden', label: 'Hidden' },
]

const GROUP_OPTIONS: { key: GroupBy; label: string }[] = [
  { key: 'none', label: 'No grouping' },
  { key: 'month', label: 'Month' },
  { key: 'category', label: 'Category' },
  { key: 'group', label: 'Category group' },
  { key: 'merchant', label: 'Merchant' },
  { key: 'account', label: 'Account' },
  { key: 'type', label: 'Type' },
  { key: 'tag', label: 'Tag' },
  { key: 'owner', label: 'Owner' },
  { key: 'review', label: 'Review status' },
]

interface Group {
  key: string
  label: string
  color?: string
  total: number
  count: number
  txs: Transaction[]
}

export default function TransactionsPage() {
  const store = useScopedStore()
  const { mutate } = useStoreCtx()
  const { range } = useRange()
  const [params, setParams] = useSearchParams()

  const chip = (params.get('filter') as Chip) ?? 'all'
  const setChip = (c: Chip) => setParams(c === 'all' ? {} : { filter: c }, { replace: true })

  const [q, setQ] = useState('')
  const [typeF, setTypeF] = useState('all')
  const [accountF, setAccountF] = useState('all')
  const [categoryF, setCategoryF] = useState('all')
  const [tagF, setTagF] = useState('all')
  const [amtMin, setAmtMin] = useState('')
  const [amtMax, setAmtMax] = useState('')
  const [groupBy, setGroupBy] = useState<GroupBy>('none')
  const [sortBy, setSortBy] = useState<SortBy>('date_desc')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [drawerTx, setDrawerTx] = useState<Transaction | 'new' | null>(null)
  const [csvOpen, setCsvOpen] = useState(false)
  const [limit, setLimit] = useState(400)
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set())

  const cats = categoryById(store)
  const accs = accountById(store)
  const baseAmt = (t: Transaction) => toBase(store, t.accountId, t.amount)

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const min = amtMin.trim() === '' ? null : Math.abs(Number(amtMin))
    const max = amtMax.trim() === '' ? null : Math.abs(Number(amtMax))
    return store.transactions.filter((t) => {
      if (t.date < range.start || t.date > range.end) return false
      if (chip === 'hidden') {
        if (!t.hidden) return false
      } else if (t.hidden) return false
      if (chip === 'review' && !t.needsReview) return false
      if (chip === 'uncategorized' && (t.categoryId || (t.splits && t.splits.length > 0) || t.transfer)) return false
      if (chip === 'split' && !(t.splits && t.splits.length > 0)) return false
      if (typeF === 'income' && (t.amount <= 0 || t.transfer)) return false
      if (typeF === 'expense' && (t.amount >= 0 || t.transfer)) return false
      if (typeF === 'transfer' && !t.transfer) return false
      if (accountF !== 'all' && t.accountId !== accountF) return false
      if (categoryF !== 'all') {
        const inSplits = t.splits?.some((s) => s.categoryId === categoryF)
        if (categoryF === 'none' ? t.categoryId || t.splits?.length : t.categoryId !== categoryF && !inSplits) return false
      }
      if (tagF !== 'all' && !t.tagIds?.includes(tagF)) return false
      if (min !== null || max !== null) {
        const a = Math.abs(baseAmt(t))
        if (min !== null && a < min) return false
        if (max !== null && a > max) return false
      }
      if (needle) {
        const catName = t.categoryId ? (cats.get(t.categoryId)?.name.toLowerCase() ?? '') : ''
        const hay = `${t.merchant} ${t.notes ?? ''} ${catName} ${Math.abs(t.amount).toFixed(2)}`.toLowerCase()
        if (!hay.includes(needle)) return false
      }
      return true
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, range, chip, typeF, accountF, categoryF, tagF, q, amtMin, amtMax, cats])

  const sorted = useMemo(() => {
    const arr = [...filtered]
    switch (sortBy) {
      case 'date_asc':
        arr.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1))
        break
      case 'amt_desc':
        arr.sort((a, b) => baseAmt(b) - baseAmt(a))
        break
      case 'amt_asc':
        arr.sort((a, b) => baseAmt(a) - baseAmt(b))
        break
      default:
        arr.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.id < b.id ? 1 : -1))
    }
    return arr
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, sortBy, store])

  const groups = useMemo<Group[]>(() => {
    if (groupBy === 'none') return []
    const map = new Map<string, Group>()
    const put = (key: string, label: string, color: string | undefined, t: Transaction) => {
      const g = map.get(key) ?? { key, label, color, total: 0, count: 0, txs: [] }
      g.total += baseAmt(t)
      g.count++
      g.txs.push(t)
      map.set(key, g)
    }
    for (const t of sorted) {
      switch (groupBy) {
        case 'month': {
          const m = t.date.slice(0, 7)
          put(m, monthLabel(m), 'var(--accent)', t)
          break
        }
        case 'category': {
          if (t.splits && t.splits.length) put('__split', 'Split', UNCATEGORIZED_COLOR, t)
          else if (t.categoryId) put(t.categoryId, cats.get(t.categoryId)?.name ?? 'Unknown', categoryColor(store, t.categoryId), t)
          else put('__uncat', t.transfer ? 'Transfers' : 'Uncategorized', UNCATEGORIZED_COLOR, t)
          break
        }
        case 'group': {
          const g = groupOfCategory(store, t.categoryId)
          if (g) put(g.id, g.name, g.color, t)
          else put('__uncat', t.transfer ? 'Transfers' : 'Uncategorized', UNCATEGORIZED_COLOR, t)
          break
        }
        case 'merchant':
          put(t.merchant, t.merchant, merchantColor(t.merchant), t)
          break
        case 'account':
          put(t.accountId, accs.get(t.accountId)?.name ?? 'Unknown', undefined, t)
          break
        case 'type': {
          if (t.transfer) put('transfer', 'Transfers', UNCATEGORIZED_COLOR, t)
          else if (baseAmt(t) >= 0) put('income', 'Income', 'var(--green)', t)
          else put('expense', 'Expenses', 'var(--accent)', t)
          break
        }
        case 'owner': {
          const pid = accs.get(t.accountId)?.profileId ?? DEFAULT_PROFILE_ID
          const p = store.profiles.find((x) => x.id === pid)
          put(pid, p?.name ?? 'You', p?.color, t)
          break
        }
        case 'tag': {
          if (t.tagIds && t.tagIds.length) {
            for (const id of t.tagIds) put(`tag_${id}`, store.tags.find((x) => x.id === id)?.name ?? 'Tag', 'var(--accent)', t)
          } else put('__untagged', 'Untagged', UNCATEGORIZED_COLOR, t)
          break
        }
        case 'review':
          put(t.needsReview ? 'review' : 'reviewed', t.needsReview ? 'Needs review' : 'Reviewed', t.needsReview ? 'var(--accent)' : 'var(--green)', t)
          break
      }
    }
    const list = [...map.values()]
    if (groupBy === 'month') list.sort((a, b) => (a.key < b.key ? 1 : -1))
    else list.sort((a, b) => Math.abs(b.total) - Math.abs(a.total))
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sorted, groupBy, store, cats, accs])

  // Open all groups when there are few; collapse by default when there are many.
  useEffect(() => {
    if (groupBy === 'none') return
    setOpenGroups(groups.length <= 10 ? new Set(groups.map((g) => g.key)) : new Set())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupBy, groups.length])

  const summary = useMemo(() => {
    let inn = 0
    let out = 0
    let review = 0
    for (const t of filtered) {
      if (!t.transfer) {
        const base = baseAmt(t)
        if (base > 0) inn += base
        else out -= base
      }
      if (t.needsReview) review++
    }
    return { inn, out, review }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, store])

  const toggle = (id: string) =>
    setSelected((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const toggleDay = (ids: string[], on: boolean) =>
    setSelected((cur) => {
      const next = new Set(cur)
      for (const id of ids) {
        if (on) next.add(id)
        else next.delete(id)
      }
      return next
    })

  const toggleGroup = (key: string) =>
    setOpenGroups((cur) => {
      const next = new Set(cur)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const bulk = (fn: (t: Transaction) => void) => {
    mutate((d) => {
      for (const t of d.transactions) if (selected.has(t.id)) fn(t)
    })
    setSelected(new Set())
  }

  const bulkDelete = () => {
    if (!window.confirm(`Delete ${selected.size} transactions?`)) return
    mutate((d) => {
      d.transactions = d.transactions.filter((t) => !selected.has(t.id))
    })
    setSelected(new Set())
  }

  const clearFilters = () => {
    setQ('')
    setTypeF('all')
    setAccountF('all')
    setCategoryF('all')
    setTagF('all')
    setAmtMin('')
    setAmtMax('')
    setChip('all')
  }
  const anyFilter = q || typeF !== 'all' || accountF !== 'all' || categoryF !== 'all' || tagF !== 'all' || amtMin || amtMax || chip !== 'all'

  return (
    <>
      <div className="row wrap">
        <div className="search-wrap">
          <Search />
          <input className="control" placeholder="Search merchant, notes, category or amount" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="spacer" />
        <button className="btn" onClick={() => setCsvOpen(true)}>
          <Upload /> Import CSV
        </button>
        <button className="btn primary" onClick={() => setDrawerTx('new')}>
          <Plus /> Add transaction
        </button>
      </div>

      <div className="row wrap">
        <div className="chips">
          {CHIPS.map((c) => (
            <button key={c.key} className={`chip${chip === c.key ? ' active' : ''}`} onClick={() => setChip(c.key)}>
              {c.label}
            </button>
          ))}
        </div>
        <div className="spacer" />
        <select className="control" value={typeF} onChange={(e) => setTypeF(e.target.value)}>
          <option value="all">All types</option>
          <option value="income">Income</option>
          <option value="expense">Expense</option>
          <option value="transfer">Transfers</option>
        </select>
        <select className="control" value={accountF} onChange={(e) => setAccountF(e.target.value)}>
          <option value="all">All accounts</option>
          {store.accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <select className="control" value={categoryF} onChange={(e) => setCategoryF(e.target.value)}>
          <option value="all">All categories</option>
          <option value="none">Uncategorized</option>
          {store.categoryGroups.map((g) => (
            <optgroup key={g.id} label={g.name}>
              {store.categories
                .filter((c) => c.groupId === g.id)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
        {store.tags.length > 0 && (
          <select className="control" value={tagF} onChange={(e) => setTagF(e.target.value)}>
            <option value="all">All tags</option>
            {store.tags.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="row wrap" style={{ gap: 8 }}>
        <label className="small muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          Group by
          <select className="control" value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)}>
            {GROUP_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="small muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          Sort
          <select className="control" value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)}>
            <option value="date_desc">Newest first</option>
            <option value="date_asc">Oldest first</option>
            <option value="amt_desc">Amount: high to low</option>
            <option value="amt_asc">Amount: low to high</option>
          </select>
        </label>
        <span className="row" style={{ gap: 4 }}>
          <input className="control" style={{ width: 96 }} type="number" placeholder="Min amount" value={amtMin} onChange={(e) => setAmtMin(e.target.value)} />
          <span className="muted small">to</span>
          <input className="control" style={{ width: 96 }} type="number" placeholder="Max" value={amtMax} onChange={(e) => setAmtMax(e.target.value)} />
        </span>
        {anyFilter && (
          <button className="btn small ghost" onClick={clearFilters}>
            Clear filters
          </button>
        )}
      </div>

      <div className="tx-summary">
        <b>{filtered.length} transactions</b>
        <span>·</span>
        <span className="in num">{fmtMoney(summary.inn)} in</span>
        <span>·</span>
        <span className="num">{fmtMoney(summary.out)} out</span>
        {groupBy !== 'none' && (
          <>
            <span>·</span>
            <span>{groups.length} groups</span>
          </>
        )}
        {summary.review > 0 && (
          <>
            <span>·</span>
            <button className="review-link" onClick={() => setChip('review')}>
              {summary.review} need review
            </button>
          </>
        )}
      </div>

      {groupBy === 'none' ? (
        <div className="card" style={{ padding: '4px 6px' }}>
          <TxTable txs={sorted} selectable selected={selected} onToggle={toggle} onToggleDay={toggleDay} onRowClick={(t) => setDrawerTx(t)} limit={limit} onShowMore={() => setLimit((l) => l + 400)} />
        </div>
      ) : (
        <div className="card" style={{ padding: '4px 6px' }}>
          {groups.map((g) => {
            const open = openGroups.has(g.key)
            return (
              <div key={g.key}>
                <div className="tx-group" onClick={() => toggleGroup(g.key)}>
                  <ChevronRight className={`caret${open ? ' open' : ''}`} />
                  {g.color && <span className="dot" style={{ background: g.color }} />}
                  <span className="g-name">{g.label}</span>
                  <span className="g-count">{g.count}</span>
                  <span className={`g-total num${g.total >= 0 ? ' green' : ''}`}>{fmtMoney(g.total)}</span>
                </div>
                {open && (
                  <div style={{ paddingBottom: 6 }}>
                    <TxTable txs={g.txs} selectable selected={selected} onToggle={toggle} onToggleDay={toggleDay} onRowClick={(t) => setDrawerTx(t)} showHead={false} />
                  </div>
                )}
              </div>
            )
          })}
          {groups.length === 0 && <div className="empty">No transactions match</div>}
        </div>
      )}

      {selected.size > 0 && (
        <div className="bulkbar">
          <span className="small" style={{ fontWeight: 650 }}>
            {selected.size} selected
          </span>
          <BulkCategory onApply={(catId) => bulk((t) => {
            t.categoryId = catId || undefined
            t.splits = undefined
            t.needsReview = undefined
          })} />
          <button className="btn small" onClick={() => bulk((t) => (t.needsReview = undefined))}>
            Mark reviewed
          </button>
          <button className="btn small" onClick={() => bulk((t) => (t.hidden = !t.hidden))}>
            Hide / unhide
          </button>
          <button className="btn small" onClick={bulkDelete}>
            Delete
          </button>
          <button className="btn small" onClick={() => setSelected(new Set())}>
            Clear
          </button>
        </div>
      )}

      {drawerTx !== null && <TxDrawer tx={drawerTx} onClose={() => setDrawerTx(null)} key={drawerTx === 'new' ? 'new' : drawerTx.id} />}
      {csvOpen && <CsvImportModal onClose={() => setCsvOpen(false)} />}
    </>
  )
}

function BulkCategory({ onApply }: { onApply: (categoryId: string) => void }) {
  const store = useStore()
  const [val, setVal] = useState('')
  return (
    <span className="row" style={{ gap: 6 }}>
      <CategorySelect store={store} value={val} onChange={setVal} />
      <button className="btn small" onClick={() => onApply(val)}>
        Set category
      </button>
    </span>
  )
}
