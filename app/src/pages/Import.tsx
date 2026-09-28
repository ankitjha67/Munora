import { useMemo, useRef, useState } from 'react'
import { FileUp, Loader2, Check, Mail, Lock, RefreshCw, AlertTriangle } from 'lucide-react'
import { useStore, useStoreCtx } from '../lib/store'
import { fmtMoneyIn } from '../lib/format'
import { runPipeline, buildTransactions, categorizeAndDedupe, dropExistingDuplicates } from '../lib/statements/parse'
import { PdfPasswordError } from '../lib/statements/pdf'
import { llmCategorize, llmConfigured } from '../lib/statements/llm'
import { normalizeDesc } from '../lib/statements/merchantKB'
import type { CategorizedRow, PipelineState, StageResult } from '../lib/statements/types'
import { parseEml, base64ToArrayBuffer } from '../lib/email/eml'
import { importEmails } from '../lib/email/importEmail'
import type { EmailInput } from '../lib/email/importEmail'
import type { StatementSummary } from '../lib/email/parseEmail'
import { senderSearchDomains } from '../lib/email/senders'
import { Seg, EmptyState } from '../components/ui'
import { CategorySelect, newId } from '../components/TxDrawer'
import type { ImportRule } from '../lib/types'

const ALL_STAGES = ['ingest', 'detect', 'extract', 'normalize', 'dedupe', 'categorize', 'review', 'commit'] as const
const STAGE_LABEL: Record<string, string> = {
  ingest: 'Ingest',
  detect: 'Detect',
  extract: 'Extract',
  normalize: 'Normalize',
  dedupe: 'Dedupe',
  categorize: 'Categorize',
  review: 'Review',
  commit: 'Commit',
}

export default function ImportPage() {
  const store = useStore()
  const { mutate } = useStoreCtx()
  const fileRef = useRef<HTMLInputElement>(null)
  const emlRef = useRef<HTMLInputElement>(null)

  const [source, setSource] = useState<'file' | 'email'>('file')
  const [pasted, setPasted] = useState('')
  const [emailText, setEmailText] = useState('')
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [state, setState] = useState<PipelineState | null>(null)
  const [rows, setRows] = useState<CategorizedRow[]>([])
  const [summaries, setSummaries] = useState<StatementSummary[]>([])
  const [accountId, setAccountId] = useState(store.accounts.find((a) => !a.hidden && !a.balanceHistory)?.id ?? store.accounts[0]?.id ?? '')
  const [llmBusy, setLlmBusy] = useState(false)
  const [committed, setCommitted] = useState<number | null>(null)
  const [skipped, setSkipped] = useState(0)
  const [drag, setDrag] = useState(false)
  const [detectedCurrency, setDetectedCurrency] = useState<string | undefined>(undefined)

  // password prompt for protected statement PDFs
  const [pwFile, setPwFile] = useState<File | null>(null)
  const [pwValue, setPwValue] = useState('')
  const [pwSave, setPwSave] = useState(true)

  // IMAP inbox config
  const [showInbox, setShowInbox] = useState(false)

  const account = store.accounts.find((a) => a.id === accountId)
  const currency = account?.currency
  const savedPasswords = store.settings.statementPasswords ?? []

  // Amounts import in the target account's currency (no conversion at import), so a
  // statement in a different currency would land as wrong numbers in every tab. Detect
  // the statement's currency and warn / offer a matching account before committing.
  const baseCurrency = store.settings.currencyCode
  const targetCurrency = account?.currency ?? baseCurrency
  const currencyMismatch = !!detectedCurrency && !!account && detectedCurrency !== targetCurrency
  const matchAccount = currencyMismatch
    ? store.accounts.find((a) => !a.hidden && (a.currency ?? baseCurrency) === detectedCurrency)
    : undefined

  const reset = () => {
    setState(null)
    setRows([])
    setSummaries([])
    setCommitted(null)
    setError(null)
    setPwFile(null)
    setPwValue('')
    setDetectedCurrency(undefined)
  }

  const applyResult = (cat: CategorizedRow[], stages: StageResult[], sums: StatementSummary[]) => {
    setRows(cat)
    setSummaries(sums)
    setState({ input: { fileName: '', kind: 'text', text: '' }, rows: cat, stages })
  }

  // ---- statement file / text ----
  const runFile = async (file: File | null, text: string) => {
    setRunning(true)
    setError(null)
    reset()
    setProgress('Reading')
    try {
      // Try with no password, then any saved statement passwords.
      let result: PipelineState | null = null
      const attempts = ['', ...savedPasswords]
      for (const pw of attempts) {
        try {
          result = await runPipeline(file, text, store, setProgress, pw || undefined)
          break
        } catch (e) {
          if (e instanceof PdfPasswordError) continue
          throw e
        }
      }
      if (!result) {
        // still locked: ask the user
        setPwFile(file)
        setRunning(false)
        setProgress('')
        return
      }
      setState(result)
      setRows(result.rows)
      setDetectedCurrency(result.format?.currency)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRunning(false)
      setProgress('')
    }
  }

  const unlock = async () => {
    if (!pwFile || !pwValue) return
    setRunning(true)
    setError(null)
    setProgress('Unlocking')
    try {
      const result = await runPipeline(pwFile, '', store, setProgress, pwValue)
      setState(result)
      setRows(result.rows)
      setDetectedCurrency(result.format?.currency)
      if (pwSave && pwValue) {
        mutate((d) => {
          const list = d.settings.statementPasswords ?? []
          if (!list.includes(pwValue)) d.settings.statementPasswords = [...list, pwValue]
        })
      }
      setPwFile(null)
      setPwValue('')
    } catch (e) {
      setError(e instanceof PdfPasswordError ? 'That password did not work. Try again.' : e instanceof Error ? e.message : String(e))
    } finally {
      setRunning(false)
      setProgress('')
    }
  }

  // ---- email ----
  const processEmails = async (inputs: EmailInput[], scannedNote: string) => {
    setRunning(true)
    setError(null)
    reset()
    try {
      const res = await importEmails(inputs, savedPasswords, setProgress)
      const cat = categorizeAndDedupe(res.rows, store)
      const stages: StageResult[] = [
        { id: 'ingest', label: 'Ingest', detail: scannedNote, ok: true },
        { id: 'detect', label: 'Detect', detail: `${res.summaries.length} statement summaries`, ok: true },
        { id: 'extract', label: 'Extract', detail: `${res.rows.length} transactions${res.locked ? `, ${res.locked} attachment(s) still locked` : ''}`, ok: res.rows.length > 0 },
        { id: 'normalize', label: 'Normalize', detail: `${cat.length} rows`, ok: true },
        { id: 'dedupe', label: 'Dedupe', detail: `${cat.filter((r) => r.duplicate).length} already in your data`, ok: true },
        { id: 'categorize', label: 'Categorize', detail: `${cat.filter((r) => r.categoryId).length} of ${cat.length} auto-categorized`, ok: true },
      ]
      applyResult(cat, stages, res.summaries)
      setDetectedCurrency(res.currency)
      if (res.locked) setError(`${res.locked} PDF attachment(s) are password protected. Add the password in Settings, Statement passwords, then scan again.`)
      if (cat.length === 0 && res.summaries.length === 0) setError('No transactions or statement details found in these emails.')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRunning(false)
      setProgress('')
    }
  }

  const onEmlFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setRunning(true)
    setProgress('Reading .eml files')
    try {
      const inputs: EmailInput[] = []
      for (const f of Array.from(files)) inputs.push(await parseEml(await f.arrayBuffer()))
      await processEmails(inputs, `${inputs.length} .eml file(s)`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setRunning(false)
    }
  }

  const scanInbox = async () => {
    const cfg = store.settings.emailInbox
    if (!window.fathom?.scanEmail || !cfg?.host || !cfg?.user) {
      setShowInbox(true)
      return
    }
    setRunning(true)
    setProgress('Connecting to mailbox')
    try {
      const res = await window.fathom!.scanEmail!({ ...cfg, domains: senderSearchDomains() })
      if (!res.ok) throw new Error(res.error || 'Mailbox scan failed')
      const inputs: EmailInput[] = []
      for (const m of res.messages) {
        try {
          inputs.push(await parseEml(base64ToArrayBuffer(m.source)))
        } catch {
          inputs.push({ from: m.from, subject: m.subject, date: m.date })
        }
      }
      await processEmails(inputs, `${inputs.length} email(s) from ${cfg.user}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setRunning(false)
    }
  }

  const runLlm = async () => {
    setLlmBusy(true)
    setError(null)
    try {
      setRows(await llmCategorize(rows, store))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLlmBusy(false)
    }
  }

  const stats = useMemo(() => {
    const included = rows.filter((r) => r.include)
    return { included: included.length, categorized: included.filter((r) => r.categoryId).length, dupes: rows.filter((r) => r.duplicate).length }
  }, [rows])

  const commit = () => {
    if (!accountId) return
    // Always dedupe at commit: drop any row that exactly matches an existing
    // transaction in the target account, even if it was re-enabled in review.
    const built = buildTransactions(rows, accountId)
    const txs = dropExistingDuplicates(built, store.transactions, accountId)
    setSkipped(built.length - txs.length)
    const existing = new Set(store.importRules.map((r) => r.match))
    const newRules: ImportRule[] = []
    for (const r of rows) {
      if (!r.include || !r.categoryId) continue
      const match = normalizeDesc(r.merchant)
      if (match.length < 3 || existing.has(match)) continue
      existing.add(match)
      newRules.push({ id: newId('rule'), match, categoryId: r.categoryId, merchant: r.merchant, createdAt: Date.now() })
    }
    mutate((d) => {
      d.transactions.push(...txs)
      d.transactions.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
      d.importRules.push(...newRules)
    })
    // reset() clears `committed`, so the success count is set after it, not before.
    reset()
    setCommitted(txs.length)
    setPasted('')
    setEmailText('')
  }

  const patch = (id: string, p: Partial<CategorizedRow>) => setRows((cur) => cur.map((r) => (r.id === id ? { ...r, ...p } : r)))

  const canEmailAuto = !!window.fathom?.scanEmail

  return (
    <>
      {committed !== null && (
        <div className="card" style={{ borderColor: 'var(--green)' }}>
          <div className="row" style={{ gap: 10 }}>
            <Check size={18} className="green" />
            <div>
              <div style={{ fontWeight: 650 }}>Imported {committed} transaction{committed === 1 ? '' : 's'} into {account?.name}</div>
              <div className="small muted">
                {skipped > 0 && `${skipped} row${skipped === 1 ? ' was' : 's were'} already in this account and ${skipped === 1 ? 'was' : 'were'} skipped. `}
                New merchants were flagged for review, and your confirmed categories were saved as rules for next time.
              </div>
            </div>
          </div>
        </div>
      )}

      {!state && !running && !pwFile && (
        <>
          <Seg options={[{ key: 'file', label: 'Statement file' }, { key: 'email', label: 'From email' }]} value={source} onChange={(s) => { setSource(s); setError(null) }} />

          {source === 'file' ? (
            <>
              <div
                className={`dropzone${drag ? ' drag' : ''}`}
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files?.[0]) runFile(e.dataTransfer.files[0], '') }}
              >
                <FileUp size={26} style={{ color: 'var(--accent)' }} />
                <div style={{ fontWeight: 650, marginTop: 8 }}>Drop a bank or mutual fund statement</div>
                <div className="small muted" style={{ marginTop: 4 }}>PDF, CSV or image. Scanned PDFs are read with OCR, password-protected PDFs will prompt for the password. Nothing leaves your machine.</div>
                <input ref={fileRef} type="file" accept=".pdf,.csv,.tsv,.txt,image/*" style={{ display: 'none' }} onChange={(e) => e.target.files?.[0] && runFile(e.target.files[0], '')} />
              </div>
              <div className="card">
                <div className="card-title">Or paste statement text</div>
                <textarea className="control" style={{ width: '100%', minHeight: 110, fontFamily: 'Consolas, monospace', fontSize: 11.5 }} placeholder={'27/09/2026  UPI/SWIGGY/Order  -432.00  12,340.00'} value={pasted} onChange={(e) => setPasted(e.target.value)} />
                <div className="row" style={{ marginTop: 10, justifyContent: 'flex-end' }}>
                  <button className="btn primary" disabled={pasted.trim().length < 10} onClick={() => runFile(null, pasted)}>Process text</button>
                </div>
              </div>
            </>
          ) : (
            <>
              <div
                className={`dropzone${drag ? ' drag' : ''}`}
                onClick={() => emlRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => { e.preventDefault(); setDrag(false); onEmlFiles(e.dataTransfer.files) }}
              >
                <Mail size={26} style={{ color: 'var(--accent)' }} />
                <div style={{ fontWeight: 650, marginTop: 8 }}>Drop bank or card emails (.eml)</div>
                <div className="small muted" style={{ marginTop: 4 }}>Export the email as .eml (or drag it in), or paste its text below. Statement PDFs and transaction alerts are both read. Everything is parsed on your device.</div>
                <input ref={emlRef} type="file" accept=".eml,message/rfc822" multiple style={{ display: 'none' }} onChange={(e) => onEmlFiles(e.target.files)} />
              </div>

              {canEmailAuto && (
                <div className="card">
                  <div className="card-title">
                    Connect an inbox (automatic)
                    <button className="btn small" onClick={() => setShowInbox((s) => !s)}>{showInbox ? 'Hide' : 'Set up'}</button>
                  </div>
                  <p className="card-sub">Scan your mailbox over IMAP for statement and alert emails, direct to your mail server with an app password. Nothing goes through any third party. Gmail/Outlook need an app password (not your login password).</p>
                  {showInbox && <InboxForm />}
                  <div className="row">
                    <button className="btn primary" onClick={scanInbox}>
                      <RefreshCw size={14} /> Scan inbox
                    </button>
                  </div>
                </div>
              )}

              <div className="card">
                <div className="card-title">Or paste an email</div>
                <textarea className="control" style={{ width: '100%', minHeight: 110, fontSize: 12 }} placeholder={'Paste the body of a bank/card email, e.g. "Rs 432.00 spent on your HDFC card at SWIGGY on 27-09-2026..."'} value={emailText} onChange={(e) => setEmailText(e.target.value)} />
                <div className="row" style={{ marginTop: 10, justifyContent: 'flex-end' }}>
                  <button className="btn primary" disabled={emailText.trim().length < 10} onClick={() => processEmails([{ from: '', subject: '', text: emailText }], 'pasted email')}>Read email</button>
                </div>
              </div>
              {!canEmailAuto && <p className="small muted">Automatic inbox scanning runs in the desktop app. On mobile, share or export a statement email as .eml, or paste its text here.</p>}
            </>
          )}

          <p className="small muted">
            Reads statements and alerts from many banks and cards (Chase, Amex, HDFC, ICICI, SBI, Axis, Citi, Barclays, HSBC and more). Transactions are categorized from your rules, your history, and a built-in merchant list; an optional local AI model can fill the rest.
          </p>
        </>
      )}

      {pwFile && !running && (
        <div className="card" style={{ borderColor: 'var(--accent)' }}>
          <div className="card-title">
            <span className="row" style={{ gap: 8 }}><Lock size={15} /> This statement is password protected</span>
          </div>
          <p className="card-sub">{pwFile.name}. Bank statement PDFs are often locked with something like your name and date of birth, PAN, or card digits. Enter it to read the file on your device.</p>
          {error && <div className="small red">{error}</div>}
          <div className="row wrap">
            <input className="control" type="password" style={{ flex: '1 1 180px', minWidth: 0 }} placeholder="Statement password" value={pwValue} onChange={(e) => setPwValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && unlock()} autoFocus />
            <label className="row small muted" style={{ gap: 6 }}>
              <input type="checkbox" className="cb" checked={pwSave} onChange={(e) => setPwSave(e.target.checked)} /> Remember for future statements
            </label>
            <div className="spacer" />
            <button className="btn" onClick={() => { setPwFile(null); setPwValue('') }}>Cancel</button>
            <button className="btn primary" disabled={!pwValue} onClick={unlock}>Unlock</button>
          </div>
        </div>
      )}

      {running && (
        <div className="card">
          <div className="row" style={{ gap: 10 }}>
            <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
            <span>{progress || 'Processing'}</span>
          </div>
          <style>{'@keyframes spin { to { transform: rotate(360deg) } }'}</style>
        </div>
      )}

      {state && (
        <>
          <div className="card">
            <div className="pipe">
              {ALL_STAGES.map((sid) => {
                const s = state.stages.find((x) => x.id === sid)
                const cls = sid === 'commit' ? '' : sid === 'review' ? 'active' : s ? 'done' : ''
                return (
                  <span key={sid} className={`pipe-step ${cls}`}>
                    <span className="txt">{STAGE_LABEL[sid]}</span>
                  </span>
                )
              })}
            </div>
            <div className="small muted" style={{ marginTop: 8 }}>{state.stages.map((s) => `${s.label}: ${s.detail}`).join('  ·  ')}</div>
          </div>

          {summaries.length > 0 && (
            <div className="grid2">
              {summaries.map((s, i) => (
                <div className="card" key={i}>
                  <div className="card-title">{s.issuer ?? 'Statement'} {s.kind ? `· ${s.kind}` : ''}</div>
                  <table className="plain">
                    <tbody>
                      {s.totalDue !== undefined && <tr><td style={{ textAlign: 'left' }}>Total due</td><td>{fmtMoneyIn(s.currency, s.totalDue)}</td></tr>}
                      {s.minDue !== undefined && <tr><td style={{ textAlign: 'left' }}>Minimum due</td><td>{fmtMoneyIn(s.currency, s.minDue)}</td></tr>}
                      {s.dueDate && <tr><td style={{ textAlign: 'left' }}>Due date</td><td>{s.dueDate}</td></tr>}
                      {s.statementDate && <tr><td style={{ textAlign: 'left' }}>Statement date</td><td>{s.statementDate}</td></tr>}
                      {s.closingBalance !== undefined && <tr><td style={{ textAlign: 'left' }}>Balance</td><td>{fmtMoneyIn(s.currency, s.closingBalance)}</td></tr>}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}

          <div className="row wrap" style={{ alignItems: 'flex-end' }}>
            <div className="field mt0">
              <label>Import into account</label>
              <select className="control" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {store.accounts.filter((a) => !a.hidden).map((a) => (
                  <option key={a.id} value={a.id}>{a.name}{a.currency ? ` (${a.currency})` : ''}</option>
                ))}
              </select>
            </div>
            <div className="spacer" />
            {llmConfigured(store.settings.llm) && (
              <button className="btn" onClick={runLlm} disabled={llmBusy}>{llmBusy ? 'Asking model' : 'Fill blanks with model'}</button>
            )}
            <button className="btn" onClick={reset}>Discard</button>
            <button className="btn primary" disabled={stats.included === 0 || !accountId} onClick={commit}>Import {stats.included} transaction{stats.included === 1 ? '' : 's'}</button>
          </div>

          {currencyMismatch && (
            <div className="card" style={{ borderColor: 'var(--amber)', background: 'var(--amber-soft)' }}>
              <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
                <AlertTriangle size={18} style={{ color: 'var(--amber)', flexShrink: 0, marginTop: 1 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 650 }}>This looks like a statement in {detectedCurrency}, but {account?.name} is in {targetCurrency}</div>
                  <div className="small muted" style={{ marginTop: 2 }}>
                    Transactions import in the account's currency, so importing here would record the amounts as {targetCurrency}. Import into an account held in {detectedCurrency} to keep them accurate. Every tab still rolls up to your base currency ({baseCurrency}) using live FX.
                  </div>
                  {matchAccount && (
                    <button className="btn small" style={{ marginTop: 8 }} onClick={() => setAccountId(matchAccount.id)}>Use {matchAccount.name} ({detectedCurrency})</button>
                  )}
                </div>
              </div>
            </div>
          )}

          {error && <div className="small red">{error}</div>}

          <div className="tx-summary">
            <b>{rows.length} rows</b>
            <span>·</span>
            <span>{stats.categorized} categorized</span>
            <span>·</span>
            <span>{stats.dupes} duplicates skipped</span>
          </div>

          <div className="card table-scroll" style={{ padding: '6px 10px' }}>
            <table className="plain" style={{ minWidth: 760 }}>
              <thead>
                <tr>
                  <th style={{ width: 34 }} />
                  <th style={{ textAlign: 'left', width: 96 }}>Date</th>
                  <th style={{ textAlign: 'left' }}>Merchant</th>
                  <th style={{ textAlign: 'left' }}>Category</th>
                  <th>Amount</th>
                  <th style={{ textAlign: 'left', width: 90 }}>Source</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} style={{ opacity: r.include ? 1 : 0.45 }}>
                    <td><input type="checkbox" className="cb" checked={r.include} onChange={(e) => patch(r.id, { include: e.target.checked })} /></td>
                    <td style={{ textAlign: 'left' }}>{r.date}</td>
                    <td style={{ textAlign: 'left' }}><input className="control" style={{ width: '100%', padding: '4px 8px' }} value={r.merchant} onChange={(e) => patch(r.id, { merchant: e.target.value })} title={r.raw} /></td>
                    <td style={{ textAlign: 'left' }}><CategorySelect store={store} value={r.categoryId ?? ''} onChange={(v) => patch(r.id, { categoryId: v || undefined })} /></td>
                    <td className={r.amount >= 0 ? 'green' : ''} style={{ fontWeight: 600 }}>{fmtMoneyIn(currency, r.amount)}</td>
                    <td style={{ textAlign: 'left' }}>{r.duplicate ? <span className="badge">Duplicate</span> : <span className={`conf ${r.confidence}`}>{r.source === 'none' ? 'review' : r.source}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {store.accounts.length === 0 && !state && <EmptyState title="Add an account first" sub="Statements import into an account. Create one on the Accounts page." />}
    </>
  )
}

function InboxForm() {
  const store = useStore()
  const { mutate } = useStoreCtx()
  const cfg = store.settings.emailInbox
  const set = (patch: Partial<NonNullable<typeof cfg>>) =>
    mutate((d) => { d.settings.emailInbox = { host: '', port: 993, secure: true, user: '', ...(d.settings.emailInbox ?? {}), ...patch } })
  return (
    <div className="row wrap" style={{ gap: 12, marginBottom: 10 }}>
      <div className="field mt0"><label>IMAP host</label><input className="control" defaultValue={cfg?.host ?? ''} placeholder="imap.gmail.com" onBlur={(e) => set({ host: e.target.value.trim() })} /></div>
      <div className="field mt0"><label>Port</label><input className="control" style={{ width: 80 }} type="number" defaultValue={cfg?.port ?? 993} onBlur={(e) => set({ port: Number(e.target.value) || 993 })} /></div>
      <div className="field mt0"><label>Email</label><input className="control" defaultValue={cfg?.user ?? ''} placeholder="you@gmail.com" onBlur={(e) => set({ user: e.target.value.trim() })} /></div>
      <div className="field mt0"><label>App password</label><input className="control" type="password" defaultValue={cfg?.password ?? ''} onBlur={(e) => set({ password: e.target.value.trim() || undefined })} /></div>
      <div className="field mt0"><label>Scan last (days)</label><input className="control" style={{ width: 90 }} type="number" defaultValue={cfg?.sinceDays ?? 90} onBlur={(e) => set({ sinceDays: Number(e.target.value) || 90 })} /></div>
    </div>
  )
}
