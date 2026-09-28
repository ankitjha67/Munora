import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, Loader2, Plus, X, Sparkle, Star, RefreshCw, ShieldCheck } from 'lucide-react'
import { useStore, useStoreCtx } from '../lib/store'
import { useDebounced } from '../lib/hooks'
import { getScheme, searchSchemes, fmtInr, fmtRet } from '../lib/mf'
import type { MfSearchResult } from '../lib/mf'
import { llmConfigured, promptJson } from '../lib/statements/llm'
import {
  toOverlapFund,
  overlapPairs,
  overlapInsights,
  overlapLabel,
  overlapAiPrompt,
  enrichAlternatives,
  shortName,
  estimateOverlap as estimate,
} from '../lib/mfOverlap'
import type { OverlapFund, AiOverlap, AltDetail } from '../lib/mfOverlap'
import { EmptyState } from '../components/ui'

const DISCLAIMER = 'Overlap is estimated from each fund\'s AMFI category and mandate, not its exact holdings, so treat it as a guide. Data via mfapi.in. Not investment advice; verify with a qualified professional.'

/** Green (independent) to red (near-identical). */
function overlapColor(s: number): string {
  const hue = Math.round(140 * (1 - s))
  return `hsl(${hue}, 68%, 45%)`
}
function overlapBg(s: number): string {
  const hue = Math.round(140 * (1 - s))
  return `hsl(${hue}, 70%, 90%)`
}

/**
 * Renders the overlap checker. Selection can be controlled by a parent (the Mutual
 * funds page embeds this as a tab and shares its "compare" selection), or managed
 * internally when used stand-alone.
 */
export default function FundOverlapPage({ codes: extCodes, onCodes }: { codes?: number[]; onCodes?: (c: number[]) => void } = {}) {
  const store = useStore()
  const { mutate } = useStoreCtx()
  const watch = useMemo(() => store.investing?.mfWatchlist ?? [], [store.investing?.mfWatchlist])

  const [ownCodes, setOwnCodes] = useState<number[]>(watch)
  const codes = extCodes ?? ownCodes
  const setCodes = useCallback(
    (next: number[] | ((cur: number[]) => number[])) => {
      const resolved = typeof next === 'function' ? (next as (cur: number[]) => number[])(codes) : next
      if (onCodes) onCodes(resolved)
      else setOwnCodes(resolved)
    },
    [codes, onCodes],
  )
  const [funds, setFunds] = useState<OverlapFund[]>([])
  const [loading, setLoading] = useState(false)
  const [loadErr, setLoadErr] = useState<string | null>(null)

  // load selected schemes → OverlapFund[]
  useEffect(() => {
    if (codes.length === 0) { setFunds([]); return }
    let alive = true
    setLoading(true)
    setLoadErr(null)
    Promise.allSettled(codes.map((c) => getScheme(c)))
      .then((settled) => {
        if (!alive) return
        const ok: OverlapFund[] = []
        for (const s of settled) if (s.status === 'fulfilled') ok.push(toOverlapFund(s.value))
        setFunds(ok)
        if (ok.length < codes.length) setLoadErr(`${codes.length - ok.length} fund(s) could not be loaded and were skipped.`)
      })
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [codes])

  const pairs = useMemo(() => overlapPairs(funds), [funds])
  const insights = useMemo(() => (funds.length >= 2 ? overlapInsights(funds, pairs) : []), [funds, pairs])

  const add = (code: number) => setCodes((c) => (c.includes(code) ? c : [...c, code]))
  const remove = (code: number) => setCodes((c) => c.filter((x) => x !== code))
  const inWatch = (code: number) => watch.includes(code)
  const toggleWatch = (code: number) =>
    mutate((d) => {
      const inv = d.investing ?? (d.investing = { mfWatchlist: [] })
      inv.mfWatchlist = inv.mfWatchlist.includes(code) ? inv.mfWatchlist.filter((x) => x !== code) : [...inv.mfWatchlist, code]
    })

  return (
    <>
      <p className="page-sub muted">Check whether the funds your family holds overlap with each other, then see specific alternatives that actually diversify. Pick the funds to compare (your watchlist is loaded by default).</p>

      <FundPicker selected={codes} onAdd={add} />

      {codes.length > 0 && (
        <div className="card">
          <div className="card-title">Comparing {funds.length} fund{funds.length === 1 ? '' : 's'} {loading && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />}</div>
          <div className="chip-row">
            {funds.map((f) => (
              <span key={f.code} className="fund-chip" title={f.name}>
                <span className="fund-chip-name">{shortName(f.name)}</span>
                <span className="fund-chip-cat">{f.bucketLabel}</span>
                <button aria-label="Remove" onClick={() => remove(f.code)}><X size={13} /></button>
              </span>
            ))}
          </div>
          {loadErr && <div className="small muted" style={{ marginTop: 6 }}>{loadErr}</div>}
          {watch.length > 0 && codes.join() !== watch.join() && (
            <button className="btn small" style={{ marginTop: 10 }} onClick={() => setCodes(watch)}><RefreshCw size={13} /> Reset to watchlist</button>
          )}
        </div>
      )}

      {codes.length === 0 && (
        <EmptyState title="Pick funds to compare" sub="Add funds above, or star funds on the Mutual funds page to build a watchlist that loads here automatically." action={<Link className="btn" to="/funds">Go to Mutual funds</Link>} />
      )}

      {funds.length >= 2 && (
        <>
          <OverlapMatrix funds={funds} />

          <div className="grid2">
            <div className="card">
              <div className="card-title">Most overlapping pairs</div>
              <div className="overlap-list">
                {pairs.slice(0, 8).map((p) => (
                  <div key={`${p.a.code}-${p.b.code}`} className="overlap-row">
                    <span className="overlap-names">{shortName(p.a.name)} <span className="muted">&amp;</span> {shortName(p.b.name)}</span>
                    <span className="overlap-badge" style={{ background: overlapBg(p.score), color: overlapColor(p.score) }}>{overlapLabel(p.score)} · {Math.round(p.score * 100)}%</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="card">
              <div className="card-title">What this means</div>
              <ul className="insight-list">
                {insights.map((t, i) => <li key={i}>{t}</li>)}
              </ul>
            </div>
          </div>

          <AiSection funds={funds} onAdd={add} inWatch={inWatch} toggleWatch={toggleWatch} />
        </>
      )}

      {funds.length === 1 && <div className="card muted small">Add at least one more fund to check overlap.</div>}

      <div className="disclaimer">{DISCLAIMER}</div>
      <style>{'@keyframes spin { to { transform: rotate(360deg) } }'}</style>
    </>
  )
}

// ---------------- fund picker ----------------
function FundPicker({ selected, onAdd }: { selected: number[]; onAdd: (code: number) => void }) {
  const [q, setQ] = useState('')
  const dq = useDebounced(q, 400)
  const [results, setResults] = useState<MfSearchResult[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (dq.trim().length < 3) { setResults([]); return }
    let alive = true
    setBusy(true)
    searchSchemes(dq.trim())
      .then((r) => alive && setResults(r.slice(0, 20)))
      .catch(() => alive && setResults([]))
      .finally(() => alive && setBusy(false))
    return () => { alive = false }
  }, [dq])

  return (
    <div className="card">
      <div className="search-wrap">
        <Search />
        <input className="control" placeholder="Add a fund by name, e.g. 'parag parikh flexi', 'nifty index'…" value={q} onChange={(e) => setQ(e.target.value)} />
        {busy && <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />}
      </div>
      {results.length > 0 && (
        <div className="search-results">
          {results.map((r) => (
            <button key={r.schemeCode} className="search-row" disabled={selected.includes(r.schemeCode)} onClick={() => { onAdd(r.schemeCode); setQ('') }}>
              <span className="txt">{r.schemeName}</span>
              {selected.includes(r.schemeCode) ? <span className="small muted">added</span> : <Plus size={15} />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------- overlap matrix ----------------
function OverlapMatrix({ funds }: { funds: OverlapFund[] }) {
  if (funds.length > 12) {
    return (
      <div className="card">
        <div className="card-title">Overlap matrix</div>
        <p className="card-sub">The grid is hard to read beyond 12 funds, so it is hidden for these {funds.length}. The ranked pairs below still cover every combination.</p>
      </div>
    )
  }
  const val = (a: OverlapFund, b: OverlapFund) => (a.code === b.code ? 1 : Math.round((estimate(a, b)) * 100))
  return (
    <div className="card table-scroll">
      <div className="card-title">Overlap matrix</div>
      <table className="overlap-matrix">
        <thead>
          <tr>
            <th />
            {funds.map((f, i) => <th key={f.code} title={f.name}>{i + 1}</th>)}
          </tr>
        </thead>
        <tbody>
          {funds.map((a, i) => (
            <tr key={a.code}>
              <th title={a.name}><span className="mx-idx">{i + 1}</span> {shortName(a.name)}</th>
              {funds.map((b) => {
                if (a.code === b.code) return <td key={b.code} className="mx-self">—</td>
                const v = val(a, b)
                return <td key={b.code} style={{ background: overlapBg(v / 100), color: overlapColor(v / 100), fontWeight: 600 }}>{v}</td>
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------------- AI analysis ----------------
function AiSection({ funds, onAdd, inWatch, toggleWatch }: { funds: OverlapFund[]; onAdd: (c: number) => void; inWatch: (c: number) => boolean; toggleWatch: (c: number) => void }) {
  const store = useStore()
  const configured = llmConfigured(store.settings.llm)
  const [busy, setBusy] = useState(false)
  const [ai, setAi] = useState<AiOverlap | null>(null)
  const [alts, setAlts] = useState<AltDetail[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(async () => {
    setBusy(true)
    setError(null)
    setAlts(null)
    try {
      const res = await promptJson<AiOverlap>(store.settings.llm, overlapAiPrompt(funds), 2048)
      setAi(res)
      if (res.alternatives?.length) enrichAlternatives(res.alternatives).then(setAlts).catch(() => setAlts(res.alternatives))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }, [funds, store.settings.llm])

  if (!configured) {
    return (
      <div className="card">
        <div className="card-title">AI analysis</div>
        <p className="card-sub">Add an AI model in Settings (bring your own key) to get a written overlap read and concrete diversifying alternatives grounded with live fund data.</p>
        <Link className="btn" to="/settings">Open Settings</Link>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="row between wrap">
        <div className="card-title">AI analysis &amp; alternatives</div>
        <button className="btn primary" onClick={run} disabled={busy}>
          {busy ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Analyzing</> : <><Sparkle size={14} /> {ai ? 'Re-run' : 'Analyze overlap'}</>}
        </button>
      </div>

      {error && <div className="small red" style={{ marginTop: 8 }}>{error}</div>}

      {ai && (
        <div style={{ marginTop: 12 }}>
          <p>{ai.assessment}</p>

          {ai.redundancies?.length > 0 && (
            <>
              <div className="sub-title">Redundant holdings</div>
              <ul className="insight-list">
                {ai.redundancies.map((r, i) => (
                  <li key={i}><b>{r.funds.join(' & ')}</b> — {r.overlap} overlap. {r.why}</li>
                ))}
              </ul>
            </>
          )}

          {ai.concentration && (<><div className="sub-title">Concentration risk</div><p className="small">{ai.concentration}</p></>)}

          <div className="sub-title">Alternatives to diversify</div>
          {!alts && <div className="small muted row" style={{ gap: 6 }}><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Looking up live data…</div>}
          <div className="alt-grid">
            {(alts ?? ai.alternatives ?? []).map((a, i) => {
              const det = a as AltDetail
              return (
                <div key={i} className="alt-card">
                  <div className="alt-name">{det.matchedName ?? a.name}</div>
                  <div className="small muted">{det.fundHouse ? `${det.fundHouse} · ` : ''}{a.category}</div>
                  <div className="alt-why">{a.why}</div>
                  {det.returns && (
                    <div className="alt-returns small">
                      <span>NAV {fmtInr(det.returns.latest)}</span>
                      <span>1Y {fmtRet(det.returns.r1y)}</span>
                      <span>3Y {fmtRet(det.returns.r3y)}</span>
                    </div>
                  )}
                  {det.code && (
                    <div className="row" style={{ gap: 6, marginTop: 8 }}>
                      <button className="btn small" onClick={() => onAdd(det.code!)}><Plus size={13} /> Compare</button>
                      <button className={`btn small${inWatch(det.code) ? ' active' : ''}`} onClick={() => toggleWatch(det.code!)}><Star size={13} /> {inWatch(det.code) ? 'On watchlist' : 'Watch'}</button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="chat-foot small muted" style={{ marginTop: 12 }}>
        <ShieldCheck size={12} /> Runs on your configured model. Fund names are verified against live AMFI data where found.
      </div>
    </div>
  )
}
