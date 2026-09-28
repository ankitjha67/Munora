import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Pencil } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useScopedStore } from '../lib/profiles'
import { loanRows } from '../lib/selectors'
import type { LoanRow } from '../lib/selectors'
import { fmtCompact, fmtMoney, fmtMoneyIn, fmtPct } from '../lib/format'
import { monthLabel, todayISO } from '../lib/dates'
import { term } from '../lib/terms'
import { Modal, EmptyState } from '../components/ui'
import { chartTooltipStyle, tv } from '../components/charts'
import type { TooltipValue } from '../components/charts'

export default function LoansPage() {
  const store = useScopedStore()
  const rows = loanRows(store, todayISO())
  const [open, setOpen] = useState<LoanRow | null>(null)

  const totalOwed = rows.reduce((a, r) => a + r.balanceBase, 0)

  if (rows.length === 0)
    return (
      <div className="card">
        <EmptyState title="No loans" sub="Add a loan account on the Accounts page to track balances and payoff." />
      </div>
    )

  return (
    <>
      <div className="card table-scroll" style={{ padding: '6px 10px' }}>
        <table className="plain loan-table" style={{ minWidth: 560 }}>
          <thead>
            <tr>
              <th>Loan</th>
              <th>Rate</th>
              <th>{term('monthlyPayment')}</th>
              <th>Original</th>
              <th>Balance</th>
              <th style={{ width: 160 }}>Paid off</th>
              <th style={{ width: 44 }} />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.account.id} style={{ cursor: 'pointer' }} onClick={() => setOpen(r)}>
                <td>
                  <div style={{ fontWeight: 600 }}>{r.account.name}</div>
                  <div className="small muted">{r.account.institution}</div>
                </td>
                <td data-label="Rate">{r.account.interestRate ? `${r.account.interestRate}%` : 'n/a'}</td>
                <td data-label={term('monthlyPayment')}>{r.monthlyPayment ? fmtMoneyIn(r.account.currency, r.monthlyPayment) : 'n/a'}</td>
                <td data-label="Original">{r.account.originalPrincipal ? fmtMoneyIn(r.account.currency, r.account.originalPrincipal, 0) : 'n/a'}</td>
                <td data-label="Balance" style={{ fontWeight: 650 }}>{fmtMoneyIn(r.account.currency, r.balance)}</td>
                <td data-label="Paid off">
                  <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
                    <span className="track" style={{ position: 'static', width: 80, height: 5, background: 'var(--border-soft)', borderRadius: 3, overflow: 'hidden', display: 'inline-block' }}>
                      <span className="fill" style={{ width: `${Math.min(100, Math.max(0, r.paidPct * 100))}%`, background: 'var(--teal)', display: 'block', height: '100%' }} />
                    </span>
                    <span className="small muted num">{fmtPct(Math.max(0, r.paidPct), 0)}</span>
                  </div>
                </td>
                <td onClick={(e) => e.stopPropagation()}>
                  {/* A loan is an account, so editing and deleting it happens in the
                      account editor. Link straight there instead of making people hunt. */}
                  <Link className="iconbtn" to={`/accounts?edit=${r.account.id}`} title={`Edit or delete ${r.account.name}`} aria-label={`Edit or delete ${r.account.name}`}>
                    <Pencil size={15} />
                  </Link>
                </td>
              </tr>
            ))}
            <tr>
              <td style={{ fontWeight: 650 }}>Total</td>
              <td colSpan={3} />
              <td style={{ fontWeight: 650 }}>{fmtMoney(totalOwed)}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>

      {open && (
        <Modal title={open.account.name} onClose={() => setOpen(null)}>
          <div className="row wrap" style={{ gap: 20, marginBottom: 14 }}>
            <span className="small muted">
              Balance <b className="num" style={{ color: 'var(--ink)' }}>{fmtMoneyIn(open.account.currency, open.balance)}</b>
            </span>
            {open.account.interestRate && (
              <span className="small muted">
                Rate <b style={{ color: 'var(--ink)' }}>{open.account.interestRate}%</b>
              </span>
            )}
            {open.monthlyPayment && (
              <span className="small muted">
                {term('monthlyPayment')} <b className="num" style={{ color: 'var(--ink)' }}>{fmtMoneyIn(open.account.currency, open.monthlyPayment)}</b>
              </span>
            )}
            {open.account.originalPrincipal && (
              <span className="small muted">
                Paid off <b style={{ color: 'var(--ink)' }}>{fmtPct(Math.max(0, open.paidPct))}</b>
              </span>
            )}
          </div>
          {open.series.length > 1 ? (
            <div style={{ height: 260 }}>
              <ResponsiveContainer>
                <LineChart data={open.series} margin={{ top: 8, right: 8 }}>
                  <CartesianGrid vertical={false} stroke="var(--border-soft)" />
                  <XAxis dataKey="month" tickFormatter={(m) => monthLabel(m, false)} tickLine={false} axisLine={false} />
                  <YAxis tickFormatter={fmtCompact} tickLine={false} axisLine={false} width={62} domain={['auto', 'auto']} />
                  <Tooltip contentStyle={chartTooltipStyle} labelFormatter={(m) => monthLabel(String(m))} formatter={(v: TooltipValue) => [fmtMoney(tv(v)), 'Balance']} />
                  <Line dataKey="balance" stroke="#EF4444" strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState title="No balance history yet" sub="Balances appear here as monthly valuations accumulate." />
          )}
        </Modal>
      )}
    </>
  )
}
