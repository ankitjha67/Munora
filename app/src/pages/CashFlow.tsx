import { useMemo, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { useScopedStore } from '../lib/profiles'
import { useRange } from '../lib/range'
import type { PLRow, RankRow, SankeyNode } from '../lib/selectors'
import { flowsInRange, groupOfCategory, incomeRows, profitLoss, sankeyData, spendingRows } from '../lib/selectors'
import { fmtMoney, fmtPct } from '../lib/format'
import { Seg, BarList } from '../components/ui'
import { SankeyChart } from '../components/SankeyChart'
import { TxListModal } from '../components/TxListModal'
import type { Transaction } from '../lib/types'

type Crit =
  | { kind: 'incomeCat'; id: string; title: string }
  | { kind: 'group'; id: string; title: string }
  | { kind: 'cat'; id: string; title: string }
  | { kind: 'merchant'; id: string; title: string; side: 'income' | 'expense' }

export default function CashFlowPage() {
  const store = useScopedStore()
  const { range } = useRange()
  const [view, setView] = useState<'sankey' | 'pl'>('sankey')
  const [grouping, setGrouping] = useState<'groups' | 'categories'>('groups')
  const [incMode, setIncMode] = useState<'categories' | 'merchants'>('categories')
  const [expMode, setExpMode] = useState<'groups' | 'categories' | 'merchants'>('groups')
  const [crit, setCrit] = useState<Crit | null>(null)

  const sk = sankeyData(store, range, grouping)
  const pl = profitLoss(store, range)
  const inc = incomeRows(store, range, incMode)
  const exp = spendingRows(store, range, expMode)

  const critTxs: Transaction[] = useMemo(() => {
    if (!crit) return []
    const out = new Map<string, Transaction>()
    for (const f of flowsInRange(store, range)) {
      const g = groupOfCategory(store, f.categoryId)
      const kind = g ? g.kind : f.amount >= 0 ? 'income' : 'expense'
      let match = false
      switch (crit.kind) {
        case 'incomeCat':
          match = kind === 'income' && (crit.id === 'uncat_inc' ? !f.categoryId : f.categoryId === crit.id)
          break
        case 'group':
          match = kind === 'expense' && (crit.id === 'uncat' ? !g : g?.id === crit.id)
          break
        case 'cat':
          match = kind === 'expense' && (crit.id === 'uncat' ? !f.categoryId : f.categoryId === crit.id)
          break
        case 'merchant':
          match = kind === crit.side && f.merchant === crit.id
          break
      }
      if (match) out.set(f.tx.id, f.tx)
    }
    return [...out.values()].sort((a, b) => (a.date < b.date ? 1 : -1))
  }, [crit, store, range])

  const onNode = (n: SankeyNode) => {
    if (n.side === 'hub' || n.id === 'savings') return
    if (n.side === 'source') setCrit({ kind: 'incomeCat', id: n.id.slice(4), title: n.name })
    else setCrit({ kind: grouping === 'groups' ? 'group' : 'cat', id: n.id.slice(4), title: n.name })
  }

  const onIncomeRow = (r: RankRow) =>
    incMode === 'categories' ? setCrit({ kind: 'incomeCat', id: r.key, title: r.name }) : setCrit({ kind: 'merchant', id: r.key, title: r.name, side: 'income' })

  const onExpenseRow = (r: RankRow) =>
    expMode === 'merchants'
      ? setCrit({ kind: 'merchant', id: r.key, title: r.name, side: 'expense' })
      : setCrit({ kind: expMode === 'groups' ? 'group' : 'cat', id: r.key, title: r.name })

  return (
    <>
      <div className="card">
        <div className="card-title">
          Where the money went
          <span className="row">
            {view === 'sankey' && (
              <Seg
                options={[
                  { key: 'groups', label: 'Groups' },
                  { key: 'categories', label: 'Categories' },
                ]}
                value={grouping}
                onChange={setGrouping}
              />
            )}
            <Seg
              options={[
                { key: 'sankey', label: 'Sankey' },
                { key: 'pl', label: 'Profit & loss' },
              ]}
              value={view}
              onChange={setView}
            />
          </span>
        </div>
        {view === 'sankey' ? (
          <>
            <p className="card-sub">Income sources flow into the hub, then out to {grouping}. Click a node to see its transactions.</p>
            <SankeyChart nodes={sk.nodes} links={sk.links} income={sk.income} height={Math.max(340, 40 + sk.nodes.length * 26)} minWidth={560} onNodeClick={onNode} />
          </>
        ) : (
          <PLTable pl={pl} onLeaf={(row, level) => {
            if (row.key === 'savings') return
            if (level === 'incomeChild') setCrit({ kind: 'incomeCat', id: row.key, title: row.name })
            if (level === 'group') setCrit({ kind: 'group', id: row.key, title: row.name })
            if (level === 'cat') setCrit({ kind: 'cat', id: row.key, title: row.name })
          }} />
        )}
      </div>

      <div className="grid2">
        <div className="card">
          <div className="card-title">
            Income
            <Seg
              options={[
                { key: 'categories', label: 'Category' },
                { key: 'merchants', label: 'Merchant' },
              ]}
              value={incMode}
              onChange={setIncMode}
            />
          </div>
          <BarList rows={inc} limit={10} onRowClick={onIncomeRow} />
        </div>
        <div className="card">
          <div className="card-title">
            Expenses
            <Seg
              options={[
                { key: 'groups', label: 'Group' },
                { key: 'categories', label: 'Category' },
                { key: 'merchants', label: 'Merchant' },
              ]}
              value={expMode}
              onChange={setExpMode}
            />
          </div>
          <BarList rows={exp} limit={10} onRowClick={onExpenseRow} />
        </div>
      </div>

      {crit && <TxListModal title={crit.title} txs={critTxs} onClose={() => setCrit(null)} />}
    </>
  )
}

function PLTable({ pl, onLeaf }: { pl: ReturnType<typeof profitLoss>; onLeaf: (row: PLRow, level: 'incomeChild' | 'group' | 'cat') => void }) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(['income', 'expenses']))
  const toggle = (key: string) =>
    setOpen((cur) => {
      const next = new Set(cur)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const Head = ({ row, id }: { row: PLRow; id: string }) => (
    <div className="plrow head" onClick={() => toggle(id)} style={{ cursor: 'pointer' }}>
      <span className="name">
        <ChevronRight className={`caret${open.has(id) ? ' open' : ''}`} />
        <span className="dot" style={{ background: row.color }} />
        {row.name}
      </span>
      <span className="pct">{fmtPct(row.shareOfIncome)}</span>
      <span className="amt">{id === 'expenses' ? fmtMoney(-row.amount) : fmtMoney(row.amount)}</span>
    </div>
  )

  return (
    <div>
      <div className="plrow head" style={{ cursor: 'default' }}>
        <span className="name muted" style={{ fontWeight: 600 }}>
          Category
        </span>
        <span className="pct">% of income</span>
        <span className="amt muted" style={{ fontWeight: 600 }}>
          Amount
        </span>
      </div>
      <Head row={pl.income} id="income" />
      {open.has('income') &&
        pl.income.children?.map((c) => (
          <div key={c.key} className="plrow child" onClick={() => onLeaf(c, 'incomeChild')}>
            <span className="name">
              <span className="dot" style={{ background: c.color }} />
              {c.name}
            </span>
            <span className="pct">{fmtPct(c.shareOfIncome)}</span>
            <span className="amt">{fmtMoney(c.amount)}</span>
          </div>
        ))}
      <Head row={pl.expenses} id="expenses" />
      {open.has('expenses') &&
        pl.expenses.children?.map((g) => (
          <GroupRows key={g.key} row={g} open={open} toggle={toggle} onLeaf={onLeaf} />
        ))}
      <div className="plrow" style={{ cursor: 'default', background: '#fcfbf9' }}>
        <span className="name" style={{ fontWeight: 650 }}>
          <span className="dot" style={{ background: pl.savings.color }} />
          Savings
        </span>
        <span className="pct">{fmtPct(pl.savings.shareOfIncome)}</span>
        <span className={`amt ${pl.savings.amount >= 0 ? 'green' : 'red'}`}>{fmtMoney(pl.savings.amount)}</span>
      </div>
    </div>
  )
}

function GroupRows({ row, open, toggle, onLeaf }: { row: PLRow; open: Set<string>; toggle: (k: string) => void; onLeaf: (row: PLRow, level: 'incomeChild' | 'group' | 'cat') => void }) {
  const id = `grp_${row.key}`
  const hasKids = (row.children?.length ?? 0) > 0
  return (
    <>
      <div className="plrow child" onClick={() => (hasKids ? toggle(id) : onLeaf(row, 'group'))}>
        <span className="name">
          {hasKids ? <ChevronRight className={`caret${open.has(id) ? ' open' : ''}`} /> : <span style={{ width: 14 }} />}
          <span className="dot" style={{ background: row.color }} />
          {row.name}
        </span>
        <span className="pct">{fmtPct(row.shareOfIncome)}</span>
        <span className="amt">{fmtMoney(-row.amount)}</span>
      </div>
      {open.has(id) &&
        row.children?.map((c) => (
          <div key={c.key} className="plrow grandchild" onClick={() => onLeaf(c, 'cat')}>
            <span className="name">
              <span className="dot" style={{ background: c.color }} />
              {c.name}
            </span>
            <span className="pct">{fmtPct(c.shareOfIncome)}</span>
            <span className="amt">{fmtMoney(-c.amount)}</span>
          </div>
        ))}
    </>
  )
}
