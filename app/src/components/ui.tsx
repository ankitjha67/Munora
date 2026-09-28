import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { X } from 'lucide-react'
import { fmtMoney, fmtPct } from '../lib/format'
import type { RankRow } from '../lib/selectors'
import { merchantColor } from '../lib/selectors'

export function StatCard({ label, value, sub, dotColor, valueClass }: { label: string; value: ReactNode; sub?: ReactNode; dotColor?: string; valueClass?: string }) {
  return (
    <div className="statcard">
      <div className="label">
        {dotColor && <span className="dot" style={{ background: dotColor }} />}
        {label}
      </div>
      <div className={`value ${valueClass ?? ''}`}>{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  )
}

export function Seg<T extends string>({ options, value, onChange }: { options: { key: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={o.key} className={o.key === value ? 'active' : ''} onClick={() => onChange(o.key)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

function useEscape(onClose: () => void) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
}

export function Modal({ title, onClose, children, width, actions }: { title: ReactNode; onClose: () => void; children: ReactNode; width?: number; actions?: ReactNode }) {
  useEscape(onClose)
  return (
    <div className="overlay center" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={width ? { width } : undefined}>
        <div className="modal-head">
          <h3>{title}</h3>
          <div className="row">
            {actions}
            <button className="iconbtn" onClick={onClose} aria-label="Close">
              <X />
            </button>
          </div>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

export function Drawer({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  useEscape(onClose)
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="drawer">{children}</div>
    </div>
  )
}

export function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <span className="switch">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="knob" />
    </span>
  )
}

export function EmptyState({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="big">{title}</div>
      {sub && <div>{sub}</div>}
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  )
}

export function MerchantChip({ name }: { name: string }) {
  const initial = (name.replace(/^(Sq \*|PayPal \*|Toast \*)/i, '').trim()[0] ?? '?').toUpperCase()
  return (
    <span className="merchant-chip" style={{ background: merchantColor(name) }}>
      {initial}
    </span>
  )
}

/** Ranked horizontal bar list ("Mortgage · 1418 Linden Ave   $24,157.08  32%"). */
export function BarList({ rows, onRowClick, selectedKeys, limit }: { rows: RankRow[]; onRowClick?: (row: RankRow) => void; selectedKeys?: Set<string>; limit?: number }) {
  const max = rows.length ? rows[0].amount : 1
  const shown = limit ? rows.slice(0, limit) : rows
  return (
    <div className="barlist">
      {shown.map((r) => {
        const selected = selectedKeys?.has(r.key)
        return (
          <div
            key={r.key}
            className="barrow"
            onClick={() => onRowClick?.(r)}
            style={selected ? { background: 'var(--accent-soft)' } : undefined}
            title={`${r.name}, ${fmtMoney(r.amount)} (${fmtPct(r.share)})`}
          >
            <span className="name">
              <span className="dot" style={{ background: r.color }} />
              <span className="txt">{r.name}</span>
              {r.sub && <span className="sub txt"> · {r.sub}</span>}
            </span>
            <span className="amt">{fmtMoney(r.amount)}</span>
            <span className="share">{fmtPct(r.share)}</span>
            <span className="track">
              <span className="fill" style={{ width: `${Math.max(2, (r.amount / max) * 100)}%`, background: r.color }} />
            </span>
          </div>
        )
      })}
      {rows.length === 0 && <div className="empty small">Nothing in this range</div>}
    </div>
  )
}

export function LegendDots({ items }: { items: { name: string; color: string }[] }) {
  return (
    <div className="legend">
      {items.map((i) => (
        <span key={i.name} className="item">
          <span className="dot" style={{ background: i.color }} />
          {i.name}
        </span>
      ))}
    </div>
  )
}
