import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, Loader2, Globe, TrendingUp } from 'lucide-react'
import { useStore, useStoreCtx } from '../lib/store'
import { getMacro, cachedMacro, macroCountry, inflationFraction } from '../lib/macro'
import type { MacroKey, MacroSnapshot } from '../lib/macro'
import { fxRate } from '../lib/fx'
import { fmtTime } from '../lib/format'

const SHOWN: MacroKey[] = ['inflation', 'gdpGrowth', 'lendingRate', 'depositRate', 'realRate']

/**
 * Live macro context for the economy behind the base currency. Planning assumptions
 * are only as good as the numbers behind them, so this shows the real ones and lets
 * the user adopt the inflation figure with one click.
 */
export default function EconomyCard() {
  const store = useStore()
  const { mutate } = useStoreCtx()
  const base = store.settings.currencyCode
  const country = macroCountry(base)

  const [snap, setSnap] = useState<MacroSnapshot | null>(() => cachedMacro(base))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(
    async (force = false) => {
      if (!country) return
      setBusy(true)
      setError(null)
      try {
        setSnap(await getMacro(base, force))
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setBusy(false)
      }
    },
    [base, country],
  )

  useEffect(() => {
    const hit = cachedMacro(base)
    setSnap(hit)
    if (!hit) void load(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base])

  if (!country) {
    return (
      <div className="card">
        <div className="card-title"><span className="row" style={{ gap: 8 }}><Globe size={15} /> Economy</span></div>
        <p className="card-sub">No national statistics are mapped for {base} yet, so planning uses your own assumptions.</p>
      </div>
    )
  }

  const infl = inflationFraction(snap)
  const usdRate = base === 'USD' ? 1 : fxRate(base, 'USD', store.fx)
  const adopted = store.settings.inflationRate

  return (
    <div className="card">
      <div className="card-title">
        <span className="row" style={{ gap: 8 }}><Globe size={15} /> Economy · {snap?.countryName ?? country[1]} ({base})</span>
        <button className="btn small" onClick={() => load(true)} disabled={busy}>
          {busy ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={13} />} Refresh
        </button>
      </div>
      <p className="card-sub">
        The backdrop your plans run against. Figures are annual national statistics, each labelled with the year it is for.
      </p>

      {error && <div className="small red">{error}</div>}
      {!snap && busy && <div className="small muted row" style={{ gap: 6 }}><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Loading indicators…</div>}

      {snap && (
        <>
          <div className="macro-grid">
            {SHOWN.map((k) => {
              const s = snap.series[k]
              const v = s.latest
              const prev = s.history[s.history.length - 2]
              const delta = v && prev ? v.value - prev.value : undefined
              return (
                <div key={k} className="macro-cell" title={s.note}>
                  <div className="small muted">{s.label}</div>
                  <div className="macro-val">{v ? `${v.value.toFixed(1)}%` : 'n/a'}</div>
                  <div className="small muted">
                    {v ? `${v.year}` : 'no data'}
                    {delta !== undefined && (
                      <span className={delta > 0 ? 'red' : delta < 0 ? 'green' : ''}>
                        {' '}· {delta > 0 ? '+' : ''}{delta.toFixed(1)} vs {prev!.year}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
            <div className="macro-cell" title={`Value of 1 ${base} in USD, from live FX rates`}>
              <div className="small muted">1 {base} in USD</div>
              <div className="macro-val">{usdRate ? `$${usdRate.toFixed(base === 'USD' ? 2 : 4)}` : 'n/a'}</div>
              <div className="small muted">{store.fx?.fetchedAt ? `rates ${fmtTime(store.fx.fetchedAt)}` : 'no rates yet'}</div>
            </div>
          </div>

          <div className="row wrap" style={{ gap: 10, marginTop: 12, alignItems: 'center' }}>
            <span className="small muted">
              Planning inflation: <b>{adopted !== undefined ? `${(adopted * 100).toFixed(1)}%` : 'not set'}</b>
            </span>
            {infl !== undefined && adopted !== infl && (
              <button className="btn small" onClick={() => mutate((d) => { d.settings.inflationRate = infl })}>
                <TrendingUp size={13} /> Use {(infl * 100).toFixed(1)}% from {snap.series.inflation.latest?.year}
              </button>
            )}
            {adopted !== undefined && (
              <button className="btn small" onClick={() => mutate((d) => { d.settings.inflationRate = undefined })}>Clear</button>
            )}
          </div>

          <div className="small muted" style={{ marginTop: 8 }}>
            Source: {snap.source}. Cached for 30 days; refreshed {fmtTime(snap.fetchedAt)}. National statistics publish with a lag, so the latest year shown may trail today.
          </div>
        </>
      )}
      <style>{'@keyframes spin { to { transform: rotate(360deg) } }'}</style>
    </div>
  )
}
