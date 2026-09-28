import { useMemo, useState } from 'react'
import { useStore, useStoreCtx } from '../lib/store'
import { parseCsv, coerceDate, coerceAmount } from '../lib/csv'
import type { DateFormat } from '../lib/csv'
import { fmtMoney } from '../lib/format'
import { Modal, Switch } from './ui'
import { newId } from './TxDrawer'

export function CsvImportModal({ onClose }: { onClose: () => void }) {
  const store = useStore()
  const { mutate } = useStoreCtx()

  const [raw, setRaw] = useState('')
  const [accountId, setAccountId] = useState(store.accounts.find((a) => !a.hidden)?.id ?? '')
  const [hasHeader, setHasHeader] = useState(true)
  const [dateCol, setDateCol] = useState(0)
  const [merchantCol, setMerchantCol] = useState(1)
  const [amountCol, setAmountCol] = useState(2)
  const [notesCol, setNotesCol] = useState(-1)
  const [dateFormat, setDateFormat] = useState<DateFormat>('auto')
  const [flipSign, setFlipSign] = useState(false)
  const [done, setDone] = useState<{ imported: number; skipped: number; failed: number } | null>(null)

  const rows = useMemo(() => parseCsv(raw), [raw])
  const header = hasHeader && rows.length > 0 ? rows[0] : null
  const dataRows = hasHeader ? rows.slice(1) : rows
  const colCount = rows.reduce((a, r) => Math.max(a, r.length), 0)

  const parsed = useMemo(() => {
    return dataRows.map((r) => {
      const date = coerceDate(r[dateCol] ?? '', dateFormat)
      const merchant = (r[merchantCol] ?? '').trim()
      let amount = coerceAmount(r[amountCol] ?? '')
      if (amount !== null && flipSign) amount = -amount
      const notes = notesCol >= 0 ? (r[notesCol] ?? '').trim() : ''
      const ok = !!date && !!merchant && amount !== null && amount !== 0
      return { date, merchant, amount, notes, ok }
    })
  }, [dataRows, dateCol, merchantCol, amountCol, notesCol, dateFormat, flipSign])

  const okCount = parsed.filter((p) => p.ok).length

  // learn merchant → most frequent category from existing data
  const merchantCategory = useMemo(() => {
    const counts = new Map<string, Map<string, number>>()
    for (const t of store.transactions) {
      if (!t.categoryId) continue
      const key = t.merchant.toLowerCase()
      const m = counts.get(key) ?? new Map<string, number>()
      m.set(t.categoryId, (m.get(t.categoryId) ?? 0) + 1)
      counts.set(key, m)
    }
    const best = new Map<string, string>()
    for (const [merchant, m] of counts) {
      let top: string | null = null
      let topN = 0
      for (const [cat, n] of m)
        if (n > topN) {
          top = cat
          topN = n
        }
      if (top) best.set(merchant, top)
    }
    return best
  }, [store])

  const doImport = () => {
    const existing = new Set(store.transactions.map((t) => `${t.accountId}|${t.date}|${t.amount.toFixed(2)}|${t.merchant.toLowerCase()}`))
    let imported = 0
    let skipped = 0
    let failed = 0
    mutate((d) => {
      for (const p of parsed) {
        if (!p.ok || !p.date || p.amount === null) {
          failed++
          continue
        }
        const key = `${accountId}|${p.date}|${p.amount.toFixed(2)}|${p.merchant.toLowerCase()}`
        if (existing.has(key)) {
          skipped++
          continue
        }
        existing.add(key)
        d.transactions.push({
          id: newId('txn'),
          date: p.date,
          merchant: p.merchant,
          amount: Math.round(p.amount * 100) / 100,
          accountId,
          categoryId: merchantCategory.get(p.merchant.toLowerCase()),
          notes: p.notes || undefined,
          needsReview: merchantCategory.has(p.merchant.toLowerCase()) ? undefined : true,
        })
        imported++
      }
      d.transactions.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    })
    setDone({ imported, skipped, failed })
  }

  const colOptions = (allowNone = false) => (
    <>
      {allowNone && <option value={-1}>, </option>}
      {Array.from({ length: colCount }, (_, i) => (
        <option key={i} value={i}>
          {header?.[i] ? `${i + 1}: ${header[i].slice(0, 22)}` : `Column ${i + 1}`}
        </option>
      ))}
    </>
  )

  return (
    <Modal title="Import CSV" onClose={onClose} width={820}>
      {done ? (
        <div className="empty">
          <div className="big">
            Imported {done.imported} transactions into {store.accounts.find((a) => a.id === accountId)?.name}
          </div>
          <div>
            {done.skipped} duplicates skipped · {done.failed} rows unparseable. New merchants are flagged "needs review"; known merchants were auto-categorized.
          </div>
          <div style={{ marginTop: 14 }}>
            <button className="btn primary" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="row wrap" style={{ marginBottom: 10 }}>
            <label className="btn small">
              Choose file…
              <input
                type="file"
                accept=".csv,text/csv"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) f.text().then(setRaw)
                }}
              />
            </label>
            <span className="small muted">or paste below</span>
            <div className="spacer" />
            <span className="row small muted">
              First row is a header <Switch checked={hasHeader} onChange={setHasHeader} />
            </span>
          </div>
          <textarea
            className="control"
            style={{ width: '100%', minHeight: 90, fontFamily: 'Consolas, monospace', fontSize: 11.5 }}
            placeholder={'Date,Description,Amount\n2026-09-04,TRADER JOES #552,-84.27'}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
          />
          {rows.length > 0 && (
            <>
              <div className="row wrap" style={{ marginTop: 12 }}>
                <div className="field mt0">
                  <label>Into account</label>
                  <select className="control" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                    {store.accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field mt0">
                  <label>Date column</label>
                  <select className="control" value={dateCol} onChange={(e) => setDateCol(+e.target.value)}>
                    {colOptions()}
                  </select>
                </div>
                <div className="field mt0">
                  <label>Merchant column</label>
                  <select className="control" value={merchantCol} onChange={(e) => setMerchantCol(+e.target.value)}>
                    {colOptions()}
                  </select>
                </div>
                <div className="field mt0">
                  <label>Amount column</label>
                  <select className="control" value={amountCol} onChange={(e) => setAmountCol(+e.target.value)}>
                    {colOptions()}
                  </select>
                </div>
                <div className="field mt0">
                  <label>Notes column</label>
                  <select className="control" value={notesCol} onChange={(e) => setNotesCol(+e.target.value)}>
                    {colOptions(true)}
                  </select>
                </div>
                <div className="field mt0">
                  <label>Date format</label>
                  <select className="control" value={dateFormat} onChange={(e) => setDateFormat(e.target.value as DateFormat)}>
                    <option value="auto">Auto</option>
                    <option value="ymd">YYYY-MM-DD</option>
                    <option value="dmy">DD/MM/YYYY</option>
                    <option value="mdy">MM/DD/YYYY</option>
                  </select>
                </div>
                <div className="field mt0">
                  <label>Positive = spent?</label>
                  <span className="row" style={{ height: 32 }}>
                    <Switch checked={flipSign} onChange={setFlipSign} />
                    <span className="small muted">flip signs</span>
                  </span>
                </div>
              </div>
              <div style={{ marginTop: 12, border: '1px solid var(--border-soft)', borderRadius: 8, overflow: 'hidden' }}>
                <table className="plain">
                  <thead>
                    <tr>
                      <th>OK</th>
                      <th>Date</th>
                      <th style={{ textAlign: 'left' }}>Merchant</th>
                      <th>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.slice(0, 8).map((p, i) => (
                      <tr key={i}>
                        <td style={{ textAlign: 'left' }}>{p.ok ? '✓' : <span className="red">✗</span>}</td>
                        <td>{p.date ?? ', '}</td>
                        <td style={{ textAlign: 'left' }}>{p.merchant || ', '}</td>
                        <td className={p.amount !== null && p.amount > 0 ? 'green' : ''}>{p.amount !== null ? fmtMoney(p.amount) : 'n/a'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="row" style={{ marginTop: 14, justifyContent: 'flex-end' }}>
                <span className="small muted">
                  {okCount} of {parsed.length} rows ready
                </span>
                <button className="btn primary" disabled={okCount === 0 || !accountId} onClick={doImport}>
                  Import {okCount} transactions
                </button>
              </div>
            </>
          )}
        </>
      )}
    </Modal>
  )
}
