import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { fmtMoney, fmtPct } from '../lib/format'
import type { RankRow } from '../lib/selectors'
import { monthLabel } from '../lib/dates'

export const chartTooltipStyle = {
  borderRadius: 10,
  border: '1px solid var(--border)',
  background: 'var(--card)',
  color: 'var(--ink)',
  fontSize: 12,
  boxShadow: 'var(--shadow-lg)',
} as const

/** Recharts tooltip values can be number | string | array | undefined, coerce to number. */
export type TooltipValue = number | string | readonly (number | string)[] | undefined
export type TooltipName = number | string | undefined
export const tv = (v: TooltipValue): number => Number(Array.isArray(v) ? (v[0] ?? 0) : (v ?? 0))

/** Donut with center total. */
export function Donut({ rows, total, size = 240, onSliceClick }: { rows: RankRow[]; total: number; size?: number; onSliceClick?: (row: RankRow) => void }) {
  const data = rows.map((r) => ({ ...r, value: r.amount }))
  return (
    <div style={{ width: size, height: size, position: 'relative', flexShrink: 0 }}>
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="68%"
            outerRadius="100%"
            paddingAngle={1.5}
            strokeWidth={0}
            onClick={(entry) => {
              const row = rows.find((r) => r.key === (entry as unknown as RankRow).key)
              if (row) onSliceClick?.(row)
            }}
          >
            {data.map((d) => (
              <Cell key={d.key} fill={d.color} style={{ cursor: onSliceClick ? 'pointer' : 'default', outline: 'none' }} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={chartTooltipStyle}
            formatter={(value: TooltipValue, name: TooltipName) => [`${fmtMoney(tv(value))} · ${fmtPct(tv(value) / (total || 1))}`, String(name ?? '')]}
          />
        </PieChart>
      </ResponsiveContainer>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'grid',
          placeItems: 'center',
          pointerEvents: 'none',
          textAlign: 'center',
        }}
      >
        <div>
          <div style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 600 }}>Total</div>
          <div style={{ fontSize: 19, fontWeight: 650, fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(total, 0)}</div>
        </div>
      </div>
    </div>
  )
}

/** Recharts tick formatter for YYYY-MM month keys. */
export function monthTick(m: string, withYear = false): string {
  return monthLabel(m, withYear)
}
