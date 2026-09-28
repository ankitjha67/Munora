import { useCallback, useEffect, useMemo, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Search, Star, RefreshCw, Loader2, Layers } from 'lucide-react'
import { useStore, useStoreCtx } from '../lib/store'
import { useDebounced } from '../lib/hooks'
import {
  EXPLORE_CATEGORIES,
  WATCH_TTL_MS,
  computeReturns,
  exploreCategory,
  fmtInr,
  fmtRet,
  getScheme,
  loadExploreCache,
  loadLastScan,
  loadWatchSummaries,
  newScanStale,
  sampleNavs,
  saveExploreCache,
  saveWatchSummary,
  scanNewSchemes,
  searchSchemes,
} from '../lib/mf'
import type { ExploreRow, MfReturns, MfScheme, MfSearchResult, NewScanResult, WatchSummary } from '../lib/mf'
import { Seg, Modal, EmptyState } from '../components/ui'
import FundOverlapPage from './FundOverlap'
import { chartTooltipStyle, tv } from '../components/charts'
import type { TooltipValue } from '../components/charts'
import { monthLabel, monthKey } from '../lib/dates'
import { fmtDay, fmtTime } from '../lib/format'

const DISCLAIMER = 'Data: AMFI via mfapi.in (NAVs in ₹, updated once daily). Rankings are trailing-return data screens, not investment advice. Past performance does not predict future returns.'

type Tab = 'explore' | 'search' | 'watchlist' | 'new' | 'overlap'

/**
 * Funds you have ticked for comparison, shared by every tab so you can gather
 * schemes while browsing and then switch to Overlap to compare them.
 */
export interface Compare {
  codes: number[]
  has: (code: number) => boolean
  toggle: (code: number) => void
}

/** Checkbox shown on every scheme row to add/remove it from the overlap comparison. */
export function CompareBox({ code, compare }: { code: number; compare: Compare }) {
  const on = compare.has(code)
  return (
    <span
      className="cmp-box"
      onClick={(e) => { e.stopPropagation(); compare.toggle(code) }}
      title={on ? 'Remove from comparison' : 'Add to comparison'}
    >
      <input type="checkbox" className="cb" checked={on} readOnly tabIndex={-1} />
      <span className="cmp-label">Compare</span>
    </span>
  )
}

export default function MutualFundsPage() {
  const store = useStore()
  const watch = store.investing?.mfWatchlist ?? []
  const [tab, setTab] = useState<Tab>(watch.length > 0 ? 'watchlist' : 'explore')
  const [openCode, setOpenCode] = useState<number | null>(null)
  const [compareCodes, setCompareCodes] = useState<number[]>(watch)

  const compare: Compare = useMemo(
    () => ({
      codes: compareCodes,
      has: (c) => compareCodes.includes(c),
      toggle: (c) => setCompareCodes((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c])),
    }),
    [compareCodes],
  )

  return (
    <>
      <div className="row between wrap">
        <Seg
          options={[
            { key: 'explore', label: 'Explore' },
            { key: 'search', label: 'Search all funds' },
            { key: 'watchlist', label: `Watchlist${watch.length ? ` (${watch.length})` : ''}` },
            { key: 'new', label: 'New listings' },
            { key: 'overlap', label: `Overlap${compareCodes.length ? ` (${compareCodes.length})` : ''}` },
          ]}
          value={tab}
          onChange={setTab}
        />
        {tab !== 'overlap' && compareCodes.length > 0 && (
          <button className="btn primary" onClick={() => setTab('overlap')}>
            <Layers size={14} /> Compare {compareCodes.length} fund{compareCodes.length === 1 ? '' : 's'}
          </button>
        )}
      </div>

      {tab === 'search' && <SearchTab onOpen={setOpenCode} compare={compare} />}
      {tab === 'watchlist' && <WatchlistTab onOpen={setOpenCode} onExplore={() => setTab('explore')} compare={compare} />}
      {tab === 'explore' && <ExploreTab onOpen={setOpenCode} compare={compare} />}
      {tab === 'new' && <NewListingsTab onOpen={setOpenCode} compare={compare} />}
      {tab === 'overlap' && <FundOverlapPage codes={compareCodes} onCodes={setCompareCodes} />}

      {tab !== 'overlap' && <div className="disclaimer">{DISCLAIMER}</div>}

      {openCode !== null && <FundModal code={openCode} onClose={() => setOpenCode(null)} />}
    </>
  )
}

// ---------------- Search ----------------
function SearchTab({ onOpen, compare }: { onOpen: (code: number) => void; compare: Compare }) {
  const [q, setQ] = useState('')
  const dq = useDebounced(q, 400)
  const [results, setResults] = useState<MfSearchResult[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (dq.trim().length < 3) {
      setResults([])
      setError(null)
      return
    }
    let alive = true
    setBusy(true)
    searchSchemes(dq.trim())
      .then((r) => {
        if (!alive) return
        setResults(r.slice(0, 40))
        setError(null)
      })
      .catch((e) => alive && setError(String(e.message ?? e)))
      .finally(() => alive && setBusy(false))
    return () => {
      alive = false
    }
  }, [dq])

  return (
    <div className="card" style={{ padding: '14px 16px' }}>
      <div className="search-wrap" style={{ maxWidth: 480 }}>
        <Search />
        <input className="control" placeholder="Search any scheme, e.g. 'parag parikh flexi', 'nifty index', 'hdfc liquid'" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      </div>
      <div style={{ marginTop: 10 }}>
        {busy && <BusyRow label="Searching AMFI schemes…" />}
        {error && <div className="small red" style={{ padding: 8 }}>{error}, check your internet connection.</div>}
        {!busy && !error && dq.trim().length >= 3 && results.length === 0 && <EmptyState title="No schemes matched" sub="Try fewer words, the search matches scheme names." />}
        {!busy && dq.trim().length < 3 && <div className="small muted" style={{ padding: 8 }}>Type at least 3 characters. Searches all ~40,000 AMFI schemes: equity, debt, hybrid, ELSS, index, liquid, gold and more.</div>}
        {results.map((r) => (
          <div key={r.schemeCode} className="mf-row" style={{ gridTemplateColumns: '1fr auto' }} onClick={() => onOpen(r.schemeCode)}>
            <span>
              <div className="f-name">{r.schemeName}</div>
              <div className="f-sub">Scheme #{r.schemeCode}</div>
            </span>
            <CompareBox code={r.schemeCode} compare={compare} />
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------- Watchlist (stale-while-revalidate) ----------------
interface WatchRow {
  code: number
  summary?: WatchSummary
  refreshing?: boolean
  error?: string
}

function WatchlistTab({ onOpen, onExplore, compare }: { onOpen: (code: number) => void; onExplore: () => void; compare: Compare }) {
  const store = useStore()
  const { mutate } = useStoreCtx()
  const codes = useMemo(() => store.investing?.mfWatchlist ?? [], [store])
  const [rows, setRows] = useState<WatchRow[]>([])

  // Paint instantly from the persisted summary cache, then refetch whatever is stale.
  const load = useCallback(
    (force: boolean) => {
      const sums = loadWatchSummaries()
      setRows(codes.map((code) => ({ code, summary: sums[code], refreshing: force || !sums[code] || Date.now() - sums[code].fetchedAt > WATCH_TTL_MS })))
      for (const code of codes) {
        const s = sums[code]
        if (!force && s && Date.now() - s.fetchedAt < WATCH_TTL_MS) continue
        getScheme(code, force ? 0 : undefined)
          .then((sc) => {
            const summary: WatchSummary = {
              code,
              name: sc.meta.scheme_name,
              fundHouse: sc.meta.fund_house,
              category: sc.meta.scheme_category,
              returns: computeReturns(sc),
              fetchedAt: Date.now(),
            }
            saveWatchSummary(summary)
            setRows((cur) => cur.map((r) => (r.code === code ? { code, summary } : r)))
          })
          .catch((e) => setRows((cur) => cur.map((r) => (r.code === code ? { ...r, refreshing: false, error: String(e.message ?? e) } : r))))
      }
    },
    [codes],
  )

  useEffect(() => {
    load(false)
  }, [load])

  // Revalidate when the window regains focus (e.g. app left open overnight → new NAVs).
  useEffect(() => {
    const h = () => {
      if (document.visibilityState === 'visible') load(false)
    }
    document.addEventListener('visibilitychange', h)
    return () => document.removeEventListener('visibilitychange', h)
  }, [load])

  const remove = (code: number) =>
    mutate((d) => {
      d.investing = { mfWatchlist: (d.investing?.mfWatchlist ?? []).filter((c) => c !== code) }
    })

  if (codes.length === 0)
    return (
      <div className="card">
        <EmptyState
          title="No funds in your watchlist yet"
          sub="Pin funds from Explore or Search to compare them side by side. NAVs refresh automatically."
          action={<button className="btn primary" onClick={onExplore}>Browse funds</button>}
        />
      </div>
    )

  const sorted = [...rows].sort((a, b) => (b.summary?.returns.r1y ?? -99) - (a.summary?.returns.r1y ?? -99))
  const asOf = rows.reduce<string>((acc, r) => (r.summary && r.summary.returns.latestDate > acc ? r.summary.returns.latestDate : acc), '')
  const anyRefreshing = rows.some((r) => r.refreshing)

  return (
    <div className="card" style={{ padding: '6px 10px', overflowX: 'auto' }}>
      <div className="row" style={{ padding: '8px 10px 2px' }}>
        <span className="small muted">{asOf ? `NAVs as of ${fmtDay(asOf)}` : 'Loading NAVs…'}{anyRefreshing ? ' · refreshing…' : ''}</span>
        <div className="spacer" />
        <button className="btn small" onClick={() => load(true)} disabled={anyRefreshing}>
          <RefreshCw size={13} /> Refresh NAVs
        </button>
      </div>
      <table className="plain" style={{ minWidth: 720 }}>
        <thead>
          <tr>
            <th style={{ minWidth: 260 }}>Fund</th>
            <th>NAV</th>
            <th>1M</th>
            <th>6M</th>
            <th>1Y</th>
            <th>3Y</th>
            <th>5Y</th>
            <th />
            <th />
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.code} style={{ cursor: 'pointer' }} onClick={() => onOpen(r.code)}>
              <td style={{ maxWidth: 380 }}>
                <div className="f-name">{r.summary?.name ?? `Scheme #${r.code}`}</div>
                <div className="f-sub">
                  {r.error ? <span className="red">{r.error}</span> : r.summary ? `${r.summary.fundHouse} · ${r.summary.category}` : 'Loading…'}
                </div>
              </td>
              <td className="num">{r.summary ? fmtInr(r.summary.returns.latest) : '…'}</td>
              <RetCell v={r.summary?.returns.r1m} />
              <RetCell v={r.summary?.returns.r6m} />
              <RetCell v={r.summary?.returns.r1y} />
              <RetCell v={r.summary?.returns.r3y} />
              <RetCell v={r.summary?.returns.r5y} />
              <td><CompareBox code={r.code} compare={compare} /></td>
              <td onClick={(e) => { e.stopPropagation(); remove(r.code) }}>
                <button className="iconbtn" title="Remove from watchlist">
                  <Star fill="var(--accent)" color="var(--accent)" size={15} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small muted" style={{ padding: '8px 10px' }}>
        1Y/3Y/5Y are annualized (CAGR); 1M/6M are absolute. Sorted by 1Y return. Cached NAVs revalidate after 6h, on window focus, and on Refresh.
      </p>
    </div>
  )
}

// ---------------- New listings (auto-discovery of newly tracked schemes) ----------------
function NewListingsTab({ onOpen, compare }: { onOpen: (code: number) => void; compare: Compare }) {
  const [scan, setScan] = useState<NewScanResult | null>(() => loadLastScan())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runScan = useCallback(() => {
    setBusy(true)
    setError(null)
    scanNewSchemes()
      .then(setScan)
      .catch((e) => setError(String(e.message ?? e)))
      .finally(() => setBusy(false))
  }, [])

  // Auto-scan weekly once a baseline exists.
  useEffect(() => {
    if (scan && newScanStale() && !busy) runScan()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="card">
      <div className="card-title">
        <span className="row" style={{ gap: 8 }}>
          Newly listed schemes
        </span>
        <button className="btn small" onClick={runScan} disabled={busy}>
          <RefreshCw size={13} /> {busy ? 'Scanning…' : 'Scan now'}
        </button>
      </div>
      <p className="card-sub">
        Downloads the full AMFI scheme universe (~8 MB) and diffs it against the last scan, so funds appear here automatically once AMFI starts
        tracking them. Runs automatically about once a week; scan manually anytime.
      </p>
      {error && <div className="small red">{error}, check your internet connection.</div>}
      {busy && <BusyRow label="Downloading the AMFI scheme list and diffing…" />}
      {!busy && !scan && (
        <EmptyState
          title="No baseline yet"
          sub="Run the first scan to record today's scheme universe. From the next scan onward, anything newly tracked shows up here."
          action={<button className="btn primary" onClick={runScan}>Run first scan</button>}
        />
      )}
      {!busy && scan && (
        <>
          <p className="small muted">
            Last scan {fmtDay(new Date(scan.scannedAt).toISOString().slice(0, 10))} {fmtTime(scan.scannedAt)} · tracking {scan.total.toLocaleString()} schemes
            {scan.baseline
              ? ' · baseline recorded, new listings will appear from the next scan.'
              : ` · ${scan.newSchemes.length === 0 ? 'no new schemes since the previous scan' : `${scan.newSchemes.length} new since previous scan (was ${scan.prevTotal.toLocaleString()})`}.`}
          </p>
          {scan.newSchemes.map((r) => (
            <div key={r.schemeCode} className="mf-row" style={{ gridTemplateColumns: '1fr auto' }} onClick={() => onOpen(r.schemeCode)}>
              <span>
                <div className="f-name">{r.schemeName}</div>
                <div className="f-sub">Scheme #{r.schemeCode}</div>
              </span>
              <CompareBox code={r.schemeCode} compare={compare} />
            </div>
          ))}

          {/* Nothing new since the last scan is the normal case most days, which left
              this tab blank. Fall back to the newest schemes in the universe. */}
          {scan.newSchemes.length === 0 && (scan.recent?.length ?? 0) > 0 && (
            <>
              <div className="sub-title">Most recently listed schemes</div>
              <p className="small muted" style={{ marginTop: 0 }}>
                The highest scheme codes AMFI has issued. These are the newest additions to the universe, not necessarily new since your last scan.
              </p>
              {scan.recent!.slice(0, 30).map((r) => (
                <div key={r.schemeCode} className="mf-row" style={{ gridTemplateColumns: '1fr auto' }} onClick={() => onOpen(r.schemeCode)}>
                  <span>
                    <div className="f-name">{r.schemeName}</div>
                    <div className="f-sub">Scheme #{r.schemeCode}</div>
                  </span>
                  <CompareBox code={r.schemeCode} compare={compare} />
                </div>
              ))}
            </>
          )}
        </>
      )}
    </div>
  )
}

function RetCell({ v }: { v?: number }) {
  return <td className={`ret ${v === undefined ? '' : v >= 0 ? 'pos' : 'neg'}`}>{fmtRet(v)}</td>
}

// ---------------- Explore ----------------
function ExploreTab({ onOpen, compare }: { onOpen: (code: number) => void; compare: Compare }) {
  const [data, setData] = useState<Record<string, ExploreRow[]>>(() => loadExploreCache() ?? {})
  const [loadingKeys, setLoadingKeys] = useState<Set<string>>(new Set())
  const [started, setStarted] = useState(false)

  const loadAll = (force = false) => {
    setStarted(true)
    try {
      localStorage.setItem('munora-mf-explore-armed', '1')
    } catch {
      /* ignore */
    }
    EXPLORE_CATEGORIES.forEach((cat) => {
      if (!force && data[cat.key]?.length) return
      setLoadingKeys((cur) => new Set(cur).add(cat.key))
      exploreCategory(cat)
        .then((rows) =>
          setData((cur) => {
            const next = { ...cur, [cat.key]: rows }
            saveExploreCache(next)
            return next
          }),
        )
        .catch(() => setData((cur) => ({ ...cur, [cat.key]: cur[cat.key] ?? [] })))
        .finally(() =>
          setLoadingKeys((cur) => {
            const next = new Set(cur)
            next.delete(cat.key)
            return next
          }),
        )
    })
  }

  useEffect(() => {
    if (Object.keys(data).length > 0) {
      setStarted(true)
      return
    }
    // Cache expired (24h) but the user has used Explore before → refresh automatically.
    let armed = false
    try {
      armed = localStorage.getItem('munora-mf-explore-armed') === '1'
    } catch {
      /* ignore */
    }
    if (armed) loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!started)
    return (
      <div className="card">
        <EmptyState
          title="Explore top funds by category"
          sub="Loads live NAV data for ~60 popular schemes across 9 categories (index, flexi cap, ELSS, liquid, gold…) and ranks them by 1-year return. Takes ~10 seconds on first load, then cached for 24h."
          action={
            <button className="btn primary" onClick={() => loadAll()}>
              Load fund data
            </button>
          }
        />
      </div>
    )

  return (
    <>
      <div className="row">
        <span className="small muted">
          Top 5 per category by trailing 1Y return · Direct-Growth plans preferred · re-screened live daily, so newly tracked funds rank in automatically
        </span>
        <div className="spacer" />
        <button className="btn small" onClick={() => loadAll(true)} disabled={loadingKeys.size > 0}>
          <RefreshCw size={13} /> Refresh
        </button>
      </div>
      <div className="grid2">
        {EXPLORE_CATEGORIES.map((cat) => (
          <div className="card" key={cat.key} style={{ padding: '12px 14px' }}>
            <div className="card-title">
              {cat.title}
              <span className="small muted" style={{ fontWeight: 500 }}>
                {cat.note}
              </span>
            </div>
            {loadingKeys.has(cat.key) && <BusyRow label="Fetching NAV histories…" />}
            {!loadingKeys.has(cat.key) && (data[cat.key]?.length ?? 0) === 0 && <div className="small muted" style={{ padding: 6 }}>Couldn't load, try Refresh.</div>}
            {data[cat.key]?.map((r, i) => (
              <div key={r.code} className="mf-row" onClick={() => onOpen(r.code)}>
                <span style={{ minWidth: 0 }}>
                  <div className="f-name">
                    <span className="muted" style={{ marginRight: 6 }}>{i + 1}.</span>
                    {r.name}
                  </div>
                  <div className="f-sub">{r.fundHouse}</div>
                </span>
                <span className="small num muted" style={{ textAlign: 'right' }}>{fmtInr(r.returns.latest)}</span>
                <span className={`ret ${(r.returns.r1y ?? 0) >= 0 ? 'pos' : 'neg'}`}>{fmtRet(r.returns.r1y)}</span>
                <CompareBox code={r.code} compare={compare} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  )
}

function BusyRow({ label }: { label: string }) {
  return (
    <div className="row small muted" style={{ padding: 10 }}>
      <Loader2 className="spin" size={14} style={{ animation: 'spin 1s linear infinite' }} /> {label}
      <style>{'@keyframes spin { to { transform: rotate(360deg) } }'}</style>
    </div>
  )
}

// ---------------- Fund detail modal ----------------
const WINDOWS: { key: string; label: string; months: number | null }[] = [
  { key: '3m', label: '3M', months: 3 },
  { key: '1y', label: '1Y', months: 12 },
  { key: '3y', label: '3Y', months: 36 },
  { key: '5y', label: '5Y', months: 60 },
  { key: 'max', label: 'Max', months: null },
]

function FundModal({ code, onClose }: { code: number; onClose: () => void }) {
  const store = useStore()
  const { mutate } = useStoreCtx()
  const [scheme, setScheme] = useState<MfScheme | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [win, setWin] = useState('1y')

  useEffect(() => {
    let alive = true
    setScheme(null)
    setError(null)
    getScheme(code)
      .then((s) => alive && setScheme(s))
      .catch((e) => alive && setError(String(e.message ?? e)))
    return () => {
      alive = false
    }
  }, [code])

  const watched = (store.investing?.mfWatchlist ?? []).includes(code)
  const toggleWatch = () =>
    mutate((d) => {
      const cur = d.investing?.mfWatchlist ?? []
      d.investing = { mfWatchlist: cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code] }
    })

  const returns = useMemo(() => (scheme ? computeReturns(scheme) : null), [scheme])

  const chart = useMemo(() => {
    if (!scheme || scheme.navs.length === 0) return []
    const months = WINDOWS.find((w) => w.key === win)?.months
    const last = scheme.navs[scheme.navs.length - 1].date
    let from = scheme.navs[0].date
    if (months) {
      const [y, m, d] = last.split('-').map(Number)
      const total = y * 12 + (m - 1) - months
      from = `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    }
    return sampleNavs(scheme.navs, from)
  }, [scheme, win])

  const chartUp = chart.length > 1 && chart[chart.length - 1].nav >= chart[0].nav

  return (
    <Modal
      title={scheme?.meta.scheme_name ?? `Scheme #${code}`}
      onClose={onClose}
      width={820}
      actions={
        <button className="btn small" onClick={toggleWatch}>
          <Star size={13} fill={watched ? 'var(--accent)' : 'none'} color="var(--accent)" /> {watched ? 'Watching' : 'Watch'}
        </button>
      }
    >
      {error && <div className="small red">{error}</div>}
      {!scheme && !error && <BusyRow label="Loading NAV history…" />}
      {scheme && returns && (
        <>
          <div className="row wrap small muted" style={{ gap: 16, marginBottom: 12 }}>
            <span>{scheme.meta.fund_house}</span>
            <span>·</span>
            <span>{scheme.meta.scheme_category}</span>
            <span>·</span>
            <span>{scheme.meta.scheme_type}</span>
            {scheme.meta.isin_growth && (
              <>
                <span>·</span>
                <span>ISIN {scheme.meta.isin_growth}</span>
              </>
            )}
          </div>
          <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(92px, 1fr))', gap: 8, marginBottom: 14 }}>
            <MiniStat label={`NAV · ${scheme.navs.length ? monthLabel(monthKey(returns.latestDate)) : ''}`} value={fmtInr(returns.latest)} />
            <MiniStat label="1M" value={fmtRet(returns.r1m)} tone={returns.r1m} />
            <MiniStat label="6M" value={fmtRet(returns.r6m)} tone={returns.r6m} />
            <MiniStat label="1Y (CAGR)" value={fmtRet(returns.r1y)} tone={returns.r1y} />
            <MiniStat label="3Y (CAGR)" value={fmtRet(returns.r3y)} tone={returns.r3y} />
            <MiniStat label="5Y (CAGR)" value={fmtRet(returns.r5y)} tone={returns.r5y} />
          </div>
          <div className="row between" style={{ marginBottom: 6 }}>
            <span className="small muted">NAV history</span>
            <Seg options={WINDOWS.map((w) => ({ key: w.key, label: w.label }))} value={win} onChange={setWin} />
          </div>
          <div style={{ height: 260 }}>
            <ResponsiveContainer>
              <LineChart data={chart} margin={{ top: 6, right: 8 }}>
                <CartesianGrid vertical={false} stroke="var(--border-soft)" />
                <XAxis dataKey="date" tickFormatter={(d) => monthLabel(monthKey(String(d)), true)} tickLine={false} axisLine={false} minTickGap={42} />
                <YAxis tickFormatter={(v) => `₹${Number(v) >= 1000 ? `${(Number(v) / 1000).toFixed(1)}k` : Number(v).toFixed(0)}`} tickLine={false} axisLine={false} width={58} domain={['auto', 'auto']} />
                <Tooltip contentStyle={chartTooltipStyle} formatter={(v: TooltipValue) => [fmtInr(tv(v)), 'NAV']} labelFormatter={(d) => String(d)} />
                <Line dataKey="nav" stroke={chartUp ? '#2F9E44' : '#E03131'} strokeWidth={2.2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </Modal>
  )
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: number }) {
  return (
    <div className="statcard" style={{ padding: '10px 12px' }}>
      <div className="label" style={{ fontSize: 10.5 }}>{label}</div>
      <div className={`value ${tone === undefined ? '' : tone >= 0 ? 'green' : 'red'}`} style={{ fontSize: 15, marginTop: 3 }}>
        {value}
      </div>
    </div>
  )
}
