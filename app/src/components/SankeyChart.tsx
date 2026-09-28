import { useMemo, useState } from 'react'
import { sankey, sankeyLinkHorizontal, sankeyJustify } from 'd3-sankey'
import type { SankeyGraph } from 'd3-sankey'
import { useMeasure } from '../lib/hooks'
import { fmtMoney, fmtPct } from '../lib/format'
import type { SankeyLink, SankeyNode } from '../lib/selectors'

interface NodeDatum extends SankeyNode {
  index?: number
  x0?: number
  x1?: number
  y0?: number
  y1?: number
  value?: number
}
interface LinkDatum {
  source: string | NodeDatum
  target: string | NodeDatum
  value: number
  width?: number
}

export function SankeyChart({
  nodes,
  links,
  income,
  height = 420,
  minWidth = 0,
  onNodeClick,
}: {
  nodes: SankeyNode[]
  links: SankeyLink[]
  income: number
  height?: number
  minWidth?: number
  onNodeClick?: (node: SankeyNode) => void
}) {
  const [ref, { width }] = useMeasure<HTMLDivElement>()
  const [hover, setHover] = useState<string | null>(null)
  // On narrow screens render at a floor width and let the container scroll, so
  // node labels do not collide.
  const w = Math.max(width, minWidth)

  const layout = useMemo(() => {
    if (w < 60 || nodes.length === 0 || links.length === 0) return null
    const gen = sankey<NodeDatum, LinkDatum>()
      .nodeId((d) => d.id)
      .nodeWidth(10)
      .nodePadding(12)
      .nodeAlign(sankeyJustify)
      // Side gutters hold the node labels. They are sized for the widest realistic
      // single line, "<name> <amount> (<pct>)", because thin nodes render their value
      // inline; source names like "Rent · 412 Maple St" need the wider left gutter or
      // the label is clipped at the chart edge. The top gutter holds the hub's label.
      .extent([
        [242, 34],
        [w - 196, height - 8],
      ])
    const graph: SankeyGraph<NodeDatum, LinkDatum> = {
      nodes: nodes.map((n) => ({ ...n })),
      links: links.map((l) => ({ ...l })),
    }
    try {
      return gen(graph)
    } catch {
      return null
    }
  }, [w, height, nodes, links])

  const path = sankeyLinkHorizontal<NodeDatum, LinkDatum>()

  return (
    <div ref={ref} style={{ width: '100%', overflowX: 'auto' }}>
      {layout && (
        <svg width={w} height={height} style={{ display: 'block' }}>
          <g>
            {layout.links.map((l, i) => {
              const src = l.source as NodeDatum
              const tgt = l.target as NodeDatum
              const color = src.side === 'source' ? src.color : tgt.color
              const active = hover === null || hover === src.id || hover === tgt.id
              return (
                <path
                  key={i}
                  className="sankey-link"
                  d={path(l) ?? undefined}
                  fill="none"
                  stroke={color}
                  strokeWidth={Math.max(1, l.width ?? 1)}
                  strokeOpacity={active ? 0.38 : 0.1}
                />
              )
            })}
            {layout.nodes.map((n) => {
              const h = (n.y1 ?? 0) - (n.y0 ?? 0)
              const isSource = n.side === 'source'
              const isHub = n.side === 'hub'
              const labelX = isHub ? (n.x0 ?? 0) + 5 : isSource ? (n.x0 ?? 0) - 8 : (n.x1 ?? 0) + 8
              const anchor = isHub ? 'middle' : isSource ? 'end' : 'start'
              const share = income > 0 ? (n.amount ?? 0) / income : 0
              const showSub = h >= 18 || isHub
              const showLabel = true // nodePadding keeps labels from colliding
              return (
                <g
                  key={n.id}
                  onMouseEnter={() => setHover(n.id)}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => onNodeClick?.(n)}
                  style={{ cursor: onNodeClick ? 'pointer' : 'default' }}
                >
                  <rect x={n.x0} y={n.y0} width={(n.x1 ?? 0) - (n.x0 ?? 0)} height={Math.max(1, h)} fill={n.color} rx={2.5} />
                  {isHub ? (
                    // Drawn above the node; clamped so the name and amount can never
                    // be cut off the top of the chart.
                    <text className="sankey-label" x={((n.x0 ?? 0) + (n.x1 ?? 0)) / 2} y={Math.max(12, (n.y0 ?? 0) - 16)} textAnchor="middle">
                      {n.name}
                      <tspan className="sankey-sub" x={((n.x0 ?? 0) + (n.x1 ?? 0)) / 2} dy={12}>
                        {fmtMoney(n.amount, 0)}
                      </tspan>
                    </text>
                  ) : (
                    showLabel && (
                      <text className="sankey-label" x={labelX} y={((n.y0 ?? 0) + (n.y1 ?? 0)) / 2 - (showSub ? 3 : -3)} textAnchor={anchor}>
                        {n.name}
                        {/* Thin bands have no room for a second line, so the amount goes
                            inline instead of being dropped: every node shows its value. */}
                        {showSub ? (
                          <tspan className="sankey-sub" x={labelX} dy={12}>
                            {fmtMoney(n.amount, 0)} ({fmtPct(share)})
                          </tspan>
                        ) : (
                          <tspan className="sankey-sub" dx={6}>
                            {fmtMoney(n.amount, 0)} ({fmtPct(share)})
                          </tspan>
                        )}
                      </text>
                    )
                  )}
                </g>
              )
            })}
          </g>
        </svg>
      )}
      {!layout && <div className="empty">Not enough data to draw the flow</div>}
    </div>
  )
}
