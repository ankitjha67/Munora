import { Fragment } from 'react'
import type { Transaction } from '../lib/types'
import { useStore } from '../lib/store'
import { accountById, categoryById, categoryColor, groupOfCategory, toBase } from '../lib/selectors'
import { fmtDay, fmtMoney, fmtMoneyIn } from '../lib/format'
import { MerchantChip } from './ui'

export function TxTable({
  txs,
  selectable = false,
  selected,
  onToggle,
  onToggleDay,
  onRowClick,
  showHead = true,
  limit,
  onShowMore,
}: {
  txs: Transaction[]
  selectable?: boolean
  selected?: Set<string>
  onToggle?: (id: string) => void
  onToggleDay?: (ids: string[], on: boolean) => void
  onRowClick?: (tx: Transaction) => void
  showHead?: boolean
  limit?: number
  onShowMore?: () => void
}) {
  const store = useStore()
  const cats = categoryById(store)
  const accs = accountById(store)

  const shown = limit ? txs.slice(0, limit) : txs
  const byDay: { day: string; rows: Transaction[] }[] = []
  for (const t of shown) {
    const last = byDay[byDay.length - 1]
    if (last && last.day === t.date) last.rows.push(t)
    else byDay.push({ day: t.date, rows: [t] })
  }

  const colsClass = `tx-cols${selectable ? '' : ' no-select'}`

  return (
    <div className="txtable">
      {showHead && (
        <div className={`${colsClass} tx-head`}>
          {selectable && <span />}
          <span>Merchant</span>
          <span>Category</span>
          <span>Account</span>
          <span style={{ textAlign: 'right' }}>Amount</span>
        </div>
      )}
      {byDay.map(({ day, rows }) => {
        const dayTotal = rows.reduce((a, t) => a + toBase(store, t.accountId, t.amount), 0)
        const ids = rows.map((t) => t.id)
        const allOn = selectable && selected ? ids.every((id) => selected.has(id)) : false
        return (
          <Fragment key={day}>
            <div className="tx-day">
              <span className="row" style={{ gap: 8 }}>
                {selectable && <input type="checkbox" className="cb" checked={allOn} onChange={(e) => onToggleDay?.(ids, e.target.checked)} />}
                {fmtDay(day)}
              </span>
              <span className="day-total">{fmtMoney(dayTotal)}</span>
            </div>
            {rows.map((t) => {
              const cat = t.categoryId ? cats.get(t.categoryId) : undefined
              const hasSplits = !!t.splits?.length
              const splitNames = hasSplits
                ? [...new Set(t.splits!.map((s) => (s.categoryId ? (cats.get(s.categoryId)?.name ?? '?') : 'Uncategorized')))].join(', ')
                : ''
              const uncat = !cat && !hasSplits && !t.transfer
              return (
                <div key={t.id} className={`${colsClass} txrow`} onClick={() => onRowClick?.(t)}>
                  {selectable && (
                    <input
                      type="checkbox"
                      className="cb"
                      checked={selected?.has(t.id) ?? false}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => onToggle?.(t.id)}
                    />
                  )}
                  <span className="merchant-cell">
                    {t.needsReview && <span className="dot" style={{ background: 'var(--accent)', width: 6, height: 6 }} />}
                    <MerchantChip name={t.merchant} />
                    <span style={{ minWidth: 0 }}>
                      <span className="m-name">{t.merchant}</span>
                      {(t.notes || t.hidden) && (
                        <div className="m-sub">
                          {t.hidden ? 'Hidden · ' : ''}
                          {t.notes}
                        </div>
                      )}
                    </span>
                  </span>
                  <span className={`cat-cell${uncat ? ' uncat' : ''}`}>
                    {hasSplits ? (
                      <>
                        <span className="badge">Split</span>
                        <span className="txt">{splitNames}</span>
                      </>
                    ) : t.transfer && !cat ? (
                      <span className="badge">Transfer</span>
                    ) : uncat ? (
                      <span className="txt">Uncategorized</span>
                    ) : (
                      <>
                        <span className="dot" style={{ background: categoryColor(store, t.categoryId) }} />
                        <span className="txt" title={groupOfCategory(store, t.categoryId)?.name}>
                          {cat?.name}
                        </span>
                      </>
                    )}
                  </span>
                  <span className="acct-cell">{accs.get(t.accountId)?.name ?? ', '}</span>
                  <span className={`amt-cell${t.amount > 0 ? ' pos' : ''}`}>{fmtMoneyIn(accs.get(t.accountId)?.currency, t.amount)}</span>
                </div>
              )
            })}
          </Fragment>
        )
      })}
      {txs.length === 0 && <div className="empty">No transactions match</div>}
      {limit !== undefined && txs.length > limit && (
        <div style={{ textAlign: 'center', padding: 12 }}>
          <button className="btn small" onClick={onShowMore}>
            Show more ({txs.length - limit} remaining)
          </button>
        </div>
      )}
    </div>
  )
}
