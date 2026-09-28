import { useCallback, useEffect, useRef, useState } from 'react'
import { Plus, Trash2, FolderOpen, Download, Upload, RefreshCw, Globe, Eye, EyeOff, Loader2, Package as PackageIcon } from 'lucide-react'
import { useStore, useStoreCtx } from '../lib/store'
import type { Store } from '../lib/types'
import { buildDemoStore } from '../lib/seed'
import { clearMfCaches } from '../lib/mf'
import { newId } from '../components/TxDrawer'
import { todayISO } from '../lib/dates'
import { APP_NAME, CURRENCIES, DEFAULT_UPDATE_REPO } from '../lib/constants'
import { GLOSSARY, REGIONS } from '../lib/terms'
import { fxRate, fxStale } from '../lib/fx'
import { fmtTime, fmtDay } from '../lib/format'
import { multiCurrencyInUse } from '../lib/selectors'
import { buildBackup, backupFileName, readBackup, countStore } from '../lib/backup'
import { checkForUpdate, isValidRepo, normalizeRepo, assetForPlatform, fmtBytes } from '../lib/updates'
import type { UpdateCheck } from '../lib/updates'
import { DEFAULT_PROFILE_ID } from '../lib/types'
import type { LlmConfig } from '../lib/types'
import { RELATIONSHIPS, PROFILE_COLORS } from '../lib/constants'
import { Avatar } from '../components/ProfileSwitcher'
import { LLM_PROVIDERS, llmProvider, resolveLlm } from '../lib/llmProviders'
import { testLlm, autoPickModel } from '../lib/statements/llm'

export default function SettingsPage() {
  const store = useStore()
  const { mutate, replaceStore, storageKind, openDataFolder } = useStoreCtx()
  const fileRef = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState('')

  const counts = countStore(store)

  const flash = (m: string) => {
    setMsg(m)
    setTimeout(() => setMsg(''), 4000)
  }

  const exportJson = (includeSecrets: boolean) => {
    const file = buildBackup(store, { includeSecrets, appVersion: __APP_VERSION__ })
    const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = backupFileName(includeSecrets)
    a.click()
    URL.revokeObjectURL(a.href)
    const n = file.manifest.counts.transactions.toLocaleString()
    flash(includeSecrets ? `Downloaded everything including keys (${n} transactions).` : `Downloaded your data (${n} transactions).`)
  }

  const importJson = (f: File) => {
    f.text().then((txt) => {
      try {
        const { store: next, manifest, warnings } = readBackup(txt)
        const c = countStore(next)
        const summary = [
          `${c.transactions.toLocaleString()} transactions`,
          `${c.accounts} accounts`,
          c.plans ? `${c.plans} goals` : '',
          c.properties ? `${c.properties} properties` : '',
        ]
          .filter(Boolean)
          .join(', ')
        const nl = String.fromCharCode(10)
        const from = manifest ? `${nl}${nl}Saved ${manifest.exportedAt.slice(0, 10)} by version ${manifest.appVersion}.` : ''
        const warn = warnings.length ? `${nl}${nl}${warnings.join(nl)}` : ''
        if (!window.confirm(`Replace everything currently in ${APP_NAME} with this backup?${nl}${nl}${summary}.${from}${warn}`)) return
        replaceStore(next)
        flash(`Restored ${c.transactions.toLocaleString()} transactions.`)
      } catch (e) {
        flash(`Import failed: ${e instanceof Error ? e.message : e}`)
      }
    })
  }

  return (
    <>
      {msg && <div className="disclaimer" style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}>{msg}</div>}

      <div className="card">
        <div className="card-title">General</div>
        <div className="row wrap" style={{ gap: 16 }}>
          <div className="field mt0">
            <label>App name</label>
            <input
              className="control"
              defaultValue={store.settings.appName ?? 'Fathom'}
              onBlur={(e) =>
                mutate((d) => {
                  d.settings.appName = e.target.value.trim() || 'Fathom'
                })
              }
            />
          </div>
          <div className="field mt0">
            <label>Base currency</label>
            <select
              className="control"
              value={store.settings.currencyCode}
              onChange={(e) =>
                mutate((d) => {
                  const oldBase = d.settings.currencyCode
                  const newBase = e.target.value
                  if (newBase === oldBase) return
                  // Preserve denomination: accounts that implicitly used the old base
                  // get it stamped explicitly, so their amounts CONVERT instead of
                  // being reinterpreted in the new base.
                  for (const a of d.accounts) {
                    if (!a.currency) a.currency = oldBase
                    if (a.currency === newBase) a.currency = undefined
                  }
                  d.settings.currencyCode = newBase
                  d.settings.locale = undefined
                })
              }
            >
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="field mt0" style={{ flex: '1 1 260px' }}>
            <label>Show amounts in</label>
            <select
              className="control"
              value={store.settings.displayInBase ? 'base' : 'native'}
              onChange={(e) => mutate((d) => { d.settings.displayInBase = e.target.value === 'base' || undefined })}
            >
              <option value="base">{store.settings.currencyCode} everywhere (convert)</option>
              <option value="native">Each account's own currency</option>
            </select>
            <div className="small muted" style={{ marginTop: 4 }}>
              {store.settings.displayInBase
                ? `Every amount, including individual transactions, is converted to ${store.settings.currencyCode} using live rates.`
                : 'Totals and charts use your base currency; individual accounts and their transactions stay in their own currency.'}
            </div>
          </div>
          <div className="field mt0">
            <label>Region (finance terminology)</label>
            <select
              className="control"
              value={store.settings.region ?? 'US'}
              onChange={(e) =>
                mutate((d) => {
                  d.settings.region = e.target.value as never
                })
              }
            >
              {REGIONS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field mt0">
            <label>Theme</label>
            <select
              className="control"
              value={store.settings.theme ?? 'system'}
              onChange={(e) => mutate((d) => { d.settings.theme = e.target.value as 'light' | 'dark' | 'system' })}
            >
              <option value="system">Match system</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>
        </div>
        <p className="small muted" style={{ marginBottom: 0 }}>
          Every account keeps its own currency; foreign-currency amounts are converted into the base currency for totals using the live rates below.
          Region adapts labels across the app (Checking ↔ Current account, Monthly payment ↔ EMI, k/M ↔ lakh/crore for ₹), see the glossary at the bottom.
          Mutual fund NAVs always display in ₹.
        </p>
      </div>

      <PeopleCard flash={flash} />
      <FxCard />

      <div className="card">
        <div className="card-title">Your data</div>
        <p className="card-sub">
          {storageKind === 'electron'
            ? 'Your data lives in a single JSON file on this PC (with an automatic .bak backup). API keys and passwords inside it are encrypted with Windows account protection.'
            : storageKind === 'capacitor'
              ? 'Your data is stored privately on this device.'
              : 'Browser dev mode, data is in localStorage. Run the desktop or mobile app for file storage.'}
          {' '}Download a copy to move to another machine, to move between desktop and mobile, or to keep your own backup.
        </p>

        <div className="data-counts">
          {([
            ['Transactions', counts.transactions],
            ['Accounts', counts.accounts],
            ['Goals', counts.plans],
            ['Properties', counts.properties],
            ['People', counts.profiles],
            ['Tracked funds', counts.trackedFunds],
          ] as [string, number][]).map(([label, n]) => (
            <span key={label}><b>{n.toLocaleString()}</b> {label.toLowerCase()}</span>
          ))}
        </div>

        <div className="row wrap">
          {storageKind === 'electron' && (
            <button className="btn" onClick={openDataFolder}>
              <FolderOpen /> Open data folder
            </button>
          )}
          <button className="btn primary" onClick={() => exportJson(false)}>
            <Download /> Download all my data
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            <Upload /> Restore from a file
          </button>
          <input ref={fileRef} type="file" accept="application/json" style={{ display: 'none' }} onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
          <div className="spacer" />
          <button
            className="btn"
            onClick={() => {
              if (window.confirm('Replace ALL current data with fresh demo data?')) {
                replaceStore(buildDemoStore())
                flash('Demo data loaded.')
              }
            }}
          >
            <RefreshCw /> Reset to demo data
          </button>
          <button
            className="btn danger"
            onClick={() => {
              if (window.confirm('Erase ALL data? This cannot be undone (export a backup first).')) {
                replaceStore({ ...store, accounts: [], transactions: [], properties: [], categoryGroups: [], categories: [], tags: [], importRules: [], investing: { mfWatchlist: [] } })
                flash('All data erased.')
              }
            }}
          >
            <Trash2 /> Erase all data
          </button>
        </div>

        <details className="data-advanced">
          <summary>Moving to a new machine?</summary>
          <p className="small muted">
            The download above leaves out your AI key, mailbox password and statement passwords, because a backup file
            travels and those would travel with it. For a one-step move you can include them, then delete the file once
            the new machine is set up.
          </p>
          <button className="btn small" onClick={() => exportJson(true)}>
            <Download size={13} /> Download including keys and passwords
          </button>
        </details>

        {storageKind === 'electron' && (
          <p className="small muted" style={{ marginTop: 10 }}>
            Installing a newer version of {APP_NAME} does not touch this data: it is kept in your user profile, not in
            the installed program, so an upgrade keeps everything as it is.
          </p>
        )}
      </div>

      <UpdatesCard flash={flash} />

      <CategoriesCard />
      <TagsCard />
      <PropertiesCard />

      <div className="card">
        <div className="card-title">Investing</div>
        <div className="row">
          <button
            className="btn"
            onClick={() => {
              clearMfCaches()
              flash('Mutual fund cache cleared, next load fetches fresh NAVs.')
            }}
          >
            <RefreshCw /> Clear mutual fund cache
          </button>
        </div>
      </div>

      <LlmCard />
      <ImportRulesCard />

      <div className="card">
        <div className="card-title">Bank sync</div>
        <p className="card-sub">
          Coming later: SimpleFin bridge and Actual Budget import (see PRD roadmap). For now, use CSV import on the Transactions page, it dedupes and learns merchant categories.
        </p>
        <button className="btn" disabled>
          Connect bank feed (coming soon)
        </button>
      </div>

      <GlossaryCard />
    </>
  )
}

function FxCard() {
  const store = useStore()
  const { refreshFx } = useStoreCtx()
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  const base = store.settings.currencyCode
  const inUse = [...new Set(store.accounts.map((a) => a.currency).filter((c): c is string => !!c && c !== base))]
  const fx = store.fx
  const stale = fxStale(fx)

  const doRefresh = async () => {
    setBusy(true)
    setNote('')
    const ok = await refreshFx()
    setBusy(false)
    setNote(ok ? 'Rates updated.' : 'Could not fetch rates, check your internet connection; using cached rates.')
  }

  return (
    <div className="card">
      <div className="card-title">
        Currency &amp; live rates
        <button className="btn small" onClick={doRefresh} disabled={busy}>
          <RefreshCw /> {busy ? 'Fetching…' : 'Refresh rates'}
        </button>
      </div>
      <p className="card-sub">
        {fx
          ? `Rates ${fx.source ? `from ${fx.source}` : ''} · updated ${fmtDay(new Date(fx.fetchedAt).toISOString().slice(0, 10))} ${fmtTime(fx.fetchedAt)}${stale ? ' · stale (auto-refreshes on launch)' : ''}`
          : 'No rates cached yet, refresh to fetch live rates.'}
        {' '}Rates refresh automatically at launch when older than 12 hours and any account uses a foreign currency.
      </p>
      {note && <p className="small orange">{note}</p>}
      {inUse.length === 0 ? (
        <p className="small muted" style={{ margin: 0 }}>
          All accounts are in {base}. Set a currency on an account (Accounts → edit) and it will be converted here.
        </p>
      ) : (
        <table className="plain">
          <tbody>
            {inUse.map((c) => {
              const toBaseRate = fxRate(c, base, fx)
              const fromBaseRate = fxRate(base, c, fx)
              return (
                <tr key={c}>
                  <td style={{ textAlign: 'left', fontWeight: 600 }}>{c}</td>
                  <td>{toBaseRate ? `1 ${c} = ${toBaseRate.toPrecision(4)} ${base}` : 'no rate, treated 1:1'}</td>
                  <td>{fromBaseRate ? `1 ${base} = ${fromBaseRate.toPrecision(6)} ${c}` : ''}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      {!multiCurrencyInUse(store) && inUse.length > 0 && <p className="small muted">No visible accounts currently use these currencies.</p>}
    </div>
  )
}

function GlossaryCard() {
  return (
    <div className="card">
      <div className="card-title">
        <span className="row" style={{ gap: 8 }}>
          <Globe size={15} /> Finance terms around the world
        </span>
      </div>
      <p className="card-sub">
        The same concept, different names. The Region setting above switches which of these the app uses for its labels.
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table className="plain" style={{ minWidth: 640 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Concept</th>
              <th style={{ textAlign: 'left' }}>United States</th>
              <th style={{ textAlign: 'left' }}>United Kingdom</th>
              <th style={{ textAlign: 'left' }}>India</th>
            </tr>
          </thead>
          <tbody>
            {GLOSSARY.map((g) => (
              <tr key={g.concept}>
                <td style={{ textAlign: 'left', fontWeight: 600 }}>{g.concept}</td>
                <td style={{ textAlign: 'left' }}>{g.us}</td>
                <td style={{ textAlign: 'left' }}>{g.uk}</td>
                <td style={{ textAlign: 'left' }}>{g.in_}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function CategoriesCard() {
  const store = useStore()
  const { mutate } = useStoreCtx()
  const [newCat, setNewCat] = useState<Record<string, string>>({})

  const usage = (categoryId: string) => store.transactions.filter((t) => t.categoryId === categoryId || t.splits?.some((s) => s.categoryId === categoryId)).length

  return (
    <div className="card">
      <div className="card-title">
        Categories
        <button
          className="btn small"
          onClick={() => {
            const name = window.prompt('New group name?')
            if (!name?.trim()) return
            mutate((d) => {
              d.categoryGroups.push({ id: newId('grp'), name: name.trim(), kind: 'expense', color: '#64748B' })
            })
          }}
        >
          <Plus /> Add group
        </button>
      </div>
      {store.categoryGroups.map((g) => (
        <div key={g.id} style={{ borderTop: '1px solid var(--border-soft)', padding: '10px 0' }}>
          <div className="row">
            <input
              type="color"
              value={g.color}
              title="Group color"
              style={{ width: 26, height: 26, border: 'none', background: 'none', padding: 0, cursor: 'pointer' }}
              onChange={(e) =>
                mutate((d) => {
                  const gg = d.categoryGroups.find((x) => x.id === g.id)
                  if (gg) gg.color = e.target.value
                })
              }
            />
            <input
              className="control"
              style={{ fontWeight: 650, width: 220 }}
              defaultValue={g.name}
              onBlur={(e) =>
                e.target.value.trim() &&
                mutate((d) => {
                  const gg = d.categoryGroups.find((x) => x.id === g.id)
                  if (gg) gg.name = e.target.value.trim()
                })
              }
            />
            <span className="badge">{g.kind}</span>
            <div className="spacer" />
            <button
              className="iconbtn"
              title="Delete group (its categories and transactions become uncategorized)"
              onClick={() => {
                const cats = store.categories.filter((c) => c.groupId === g.id)
                if (!window.confirm(`Delete group "${g.name}" and its ${cats.length} categories? Transactions become uncategorized.`)) return
                mutate((d) => {
                  const ids = new Set(d.categories.filter((c) => c.groupId === g.id).map((c) => c.id))
                  d.categories = d.categories.filter((c) => !ids.has(c.id))
                  d.categoryGroups = d.categoryGroups.filter((x) => x.id !== g.id)
                  for (const t of d.transactions) {
                    if (t.categoryId && ids.has(t.categoryId)) t.categoryId = undefined
                    if (t.splits) for (const s of t.splits) if (s.categoryId && ids.has(s.categoryId)) s.categoryId = undefined
                  }
                  for (const p of d.properties) if (p.expenseGroupId === g.id) p.expenseGroupId = undefined
                })
              }}
            >
              <Trash2 />
            </button>
          </div>
          <div className="chips" style={{ marginTop: 8, paddingLeft: 34 }}>
            {store.categories
              .filter((c) => c.groupId === g.id)
              .map((c) => (
                <span key={c.id} className="chip active" title={`${usage(c.id)} transactions`}>
                  {c.name}
                  <button
                    className="iconbtn"
                    style={{ padding: 0 }}
                    onClick={() => {
                      if (!window.confirm(`Delete category "${c.name}"? ${usage(c.id)} transactions become uncategorized.`)) return
                      mutate((d) => {
                        d.categories = d.categories.filter((x) => x.id !== c.id)
                        for (const t of d.transactions) {
                          if (t.categoryId === c.id) t.categoryId = undefined
                          if (t.splits) for (const s of t.splits) if (s.categoryId === c.id) s.categoryId = undefined
                        }
                        for (const p of d.properties) if (p.incomeCategoryId === c.id) p.incomeCategoryId = undefined
                      })
                    }}
                  >
                    <Trash2 size={11} />
                  </button>
                </span>
              ))}
            <input
              className="control"
              style={{ width: 150, padding: '4px 9px' }}
              placeholder="Add category…"
              value={newCat[g.id] ?? ''}
              onChange={(e) => setNewCat((cur) => ({ ...cur, [g.id]: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (newCat[g.id] ?? '').trim()) {
                  mutate((d) => {
                    d.categories.push({ id: newId('cat'), groupId: g.id, name: newCat[g.id].trim() })
                  })
                  setNewCat((cur) => ({ ...cur, [g.id]: '' }))
                }
              }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

function TagsCard() {
  const store = useStore()
  const { mutate } = useStoreCtx()
  const [name, setName] = useState('')
  return (
    <div className="card">
      <div className="card-title">Tags</div>
      <div className="chips">
        {store.tags.map((t) => (
          <span key={t.id} className="chip active">
            {t.name}
            <button
              className="iconbtn"
              style={{ padding: 0 }}
              onClick={() =>
                mutate((d) => {
                  d.tags = d.tags.filter((x) => x.id !== t.id)
                  for (const tx of d.transactions) if (tx.tagIds) tx.tagIds = tx.tagIds.filter((id) => id !== t.id)
                })
              }
            >
              <Trash2 size={11} />
            </button>
          </span>
        ))}
        <input
          className="control"
          style={{ width: 150, padding: '4px 9px' }}
          placeholder="Add tag…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && name.trim()) {
              mutate((d) => {
                d.tags.push({ id: newId('tag'), name: name.trim() })
              })
              setName('')
            }
          }}
        />
      </div>
    </div>
  )
}

function PropertiesCard() {
  const store = useStore()
  const { mutate } = useStoreCtx()
  return (
    <div className="card">
      <div className="card-title">
        Properties
        <button
          className="btn small"
          onClick={() => {
            const name = window.prompt('Property name (e.g. "412 Maple St")?')
            if (!name?.trim()) return
            mutate((d) => {
              d.properties.push({ id: newId('prp'), name: name.trim() })
            })
          }}
        >
          <Plus /> Add property
        </button>
      </div>
      <p className="card-sub">Each property gets its own page: link a valuation account, mortgage, income category, and expense group.</p>
      {store.properties.map((p) => (
        <div key={p.id} className="row wrap" style={{ borderTop: '1px solid var(--border-soft)', padding: '10px 0' }}>
          <input
            className="control"
            style={{ fontWeight: 650, width: 170 }}
            defaultValue={p.name}
            onBlur={(e) =>
              e.target.value.trim() &&
              mutate((d) => {
                const pp = d.properties.find((x) => x.id === p.id)
                if (pp) pp.name = e.target.value.trim()
              })
            }
          />
          <PropSelect
            label="Valuation"
            value={p.valuationAccountId ?? ''}
            options={store.accounts.filter((a) => a.type === 'real_estate').map((a) => [a.id, a.name])}
            onChange={(v) =>
              mutate((d) => {
                const pp = d.properties.find((x) => x.id === p.id)
                if (pp) pp.valuationAccountId = v || undefined
              })
            }
          />
          <PropSelect
            label="Mortgage"
            value={p.mortgageAccountId ?? ''}
            options={store.accounts.filter((a) => a.type === 'loan').map((a) => [a.id, a.name])}
            onChange={(v) =>
              mutate((d) => {
                const pp = d.properties.find((x) => x.id === p.id)
                if (pp) pp.mortgageAccountId = v || undefined
              })
            }
          />
          <PropSelect
            label="Income category"
            value={p.incomeCategoryId ?? ''}
            options={store.categories.filter((c) => store.categoryGroups.find((g) => g.id === c.groupId)?.kind === 'income').map((c) => [c.id, c.name])}
            onChange={(v) =>
              mutate((d) => {
                const pp = d.properties.find((x) => x.id === p.id)
                if (pp) pp.incomeCategoryId = v || undefined
              })
            }
          />
          <PropSelect
            label="Expense group"
            value={p.expenseGroupId ?? ''}
            options={store.categoryGroups.filter((g) => g.kind === 'expense').map((g) => [g.id, g.name])}
            onChange={(v) =>
              mutate((d) => {
                const pp = d.properties.find((x) => x.id === p.id)
                if (pp) {
                  pp.expenseGroupId = v || undefined
                  const grp = d.categoryGroups.find((g) => g.id === v)
                  if (grp) grp.propertyId = p.id
                }
              })
            }
          />
          <button
            className="iconbtn"
            onClick={() => {
              if (!window.confirm(`Remove property "${p.name}"? (Accounts and categories are kept.)`)) return
              mutate((d) => {
                d.properties = d.properties.filter((x) => x.id !== p.id)
              })
            }}
          >
            <Trash2 />
          </button>
        </div>
      ))}
    </div>
  )
}

function PropSelect({ label, value, options, onChange }: { label: string; value: string; options: [string, string][]; onChange: (v: string) => void }) {
  return (
    <div className="field mt0" style={{ minWidth: 150 }}>
      <label>{label}</label>
      <select className="control" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">None</option>
        {options.map(([id, name]) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </select>
    </div>
  )
}

function PeopleCard({ flash }: { flash: (m: string) => void }) {
  const store = useStore()
  const { mutate } = useStoreCtx()
  const acctCount = (pid: string) => store.accounts.filter((a) => (a.profileId ?? DEFAULT_PROFILE_ID) === pid).length

  const addPerson = () => {
    const name = window.prompt('Name of the person?')
    if (!name?.trim()) return
    mutate((d) => {
      const id = `prof_${Date.now().toString(36)}`
      const color = PROFILE_COLORS[d.profiles.length % PROFILE_COLORS.length]
      d.profiles.push({ id, name: name.trim(), color, relationship: 'Other' })
      if (d.households[0]) d.households[0].profileIds.push(id)
      else d.households.push({ id: 'hh_1', name: 'Household', profileIds: d.profiles.map((p) => p.id) })
    })
  }

  const del = (pid: string) => {
    if (store.profiles.length <= 1) return
    const n = acctCount(pid)
    const fallbackName = store.profiles.find((p) => p.id !== pid)?.name
    if (!window.confirm(`Remove this person?${n ? ` Their ${n} accounts move to ${fallbackName}.` : ''}`)) return
    mutate((d) => {
      const fallback = d.profiles.find((p) => p.id !== pid)!.id
      for (const a of d.accounts) if ((a.profileId ?? DEFAULT_PROFILE_ID) === pid) a.profileId = fallback
      for (const p of d.properties) if (p.profileId === pid) p.profileId = fallback
      d.profiles = d.profiles.filter((p) => p.id !== pid)
      for (const h of d.households) h.profileIds = h.profileIds.filter((x) => x !== pid)
    })
    flash('Person removed.')
  }

  return (
    <div className="card">
      <div className="card-title">
        People &amp; household
        <button className="btn small" onClick={addPerson}>
          <Plus /> Add person
        </button>
      </div>
      <p className="card-sub">
        Each account belongs to a person. Switch between one person and the combined household from the top of the sidebar; Net worth shows a per-person breakdown.
      </p>
      {store.households[0] && (
        <div className="field mt0" style={{ maxWidth: 280, marginBottom: 6 }}>
          <label>Household name</label>
          <input
            className="control"
            defaultValue={store.households[0].name}
            onBlur={(e) => mutate((d) => { if (d.households[0]) d.households[0].name = e.target.value.trim() || 'Household' })}
          />
        </div>
      )}
      {store.profiles.map((p) => (
        <div key={p.id} className="row wrap" style={{ borderTop: '1px solid var(--border-soft)', padding: '10px 0', gap: 10 }}>
          <Avatar name={p.name} color={p.color} size="md" />
          <input
            type="color"
            value={p.color}
            title="Colour"
            style={{ width: 26, height: 26, border: 'none', background: 'none', padding: 0, cursor: 'pointer' }}
            onChange={(e) => mutate((d) => { const pp = d.profiles.find((x) => x.id === p.id); if (pp) pp.color = e.target.value })}
          />
          <input
            className="control"
            style={{ width: 180, fontWeight: 600 }}
            defaultValue={p.name}
            onBlur={(e) => e.target.value.trim() && mutate((d) => { const pp = d.profiles.find((x) => x.id === p.id); if (pp) pp.name = e.target.value.trim() })}
          />
          <select
            className="control"
            value={p.relationship ?? 'Other'}
            onChange={(e) => mutate((d) => { const pp = d.profiles.find((x) => x.id === p.id); if (pp) pp.relationship = e.target.value })}
          >
            {RELATIONSHIPS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
          <span className="small muted">{acctCount(p.id)} accounts</span>
          <div className="spacer" />
          {store.profiles.length > 1 && (
            <button className="iconbtn" title="Remove person" onClick={() => del(p.id)}>
              <Trash2 />
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

function LlmCard() {
  const store = useStore()
  const { mutate } = useStoreCtx()
  const cfg: LlmConfig = store.settings.llm ?? { provider: 'none' }
  const [test, setTest] = useState<{ busy: boolean; msg: string; ok: boolean }>({ busy: false, msg: '', ok: false })
  const [models, setModels] = useState<string[]>([])
  const [picking, setPicking] = useState(false)
  const [pickMsg, setPickMsg] = useState('')
  const [showKey, setShowKey] = useState(false)
  const set = (patch: Partial<LlmConfig>) =>
    mutate((d) => { d.settings.llm = { ...(d.settings.llm ?? { provider: 'none' }), ...patch } })

  const autoPick = async () => {
    setPicking(true)
    setPickMsg('Fetching models…')
    try {
      const res = await autoPickModel({ ...cfg }, { verify: true, onProgress: setPickMsg })
      setModels(res.models)
      if (!res.best) {
        setPickMsg('No chat models returned by this provider')
      } else if (res.verified) {
        set({ model: res.best })
        setPickMsg(
          res.jsonCapable
            ? `Selected ${res.best}, verified working with clean JSON, from ${res.models.length} models`
            : `Selected ${res.best} from ${res.models.length} models. It replies but not as strict JSON, so the Assistant works while statement categorization may fall back to the built-in engine.`,
        )
      } else {
        // Never save a model that failed to answer: doing so leaves every AI
        // feature returning 404 until the user notices and fixes it by hand.
        setPickMsg(
          `Checked ${res.tried} of ${res.models.length} models and none responded on your account, so your current model was kept. ` +
            'Your key may not have these models enabled, pick one manually from the list or try another provider.',
        )
      }
    } catch (e) {
      setPickMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setPicking(false)
    }
  }

  const provider = llmProvider(cfg.provider)
  const resolved = resolveLlm(cfg)
  const groups = ['Frontier', 'Cloud & aggregators', 'NVIDIA', 'Local', 'Custom'] as const

  const runTest = async () => {
    setTest({ busy: true, msg: '', ok: false })
    try {
      const r = await testLlm({ ...cfg })
      setTest({ busy: false, msg: r, ok: true })
    } catch (e) {
      setTest({ busy: false, msg: e instanceof Error ? e.message : String(e), ok: false })
    }
  }

  return (
    <div className="card">
      <div className="card-title">AI model for import (optional)</div>
      <p className="card-sub">
        Used only to categorize the statement rows the built-in engine is unsure about, and only when you click the button on the Import page. Bring your own key. Pick a
        frontier model, an open-source host, NVIDIA NIM, or a fully local server (Ollama, LM Studio, and others) to stay offline. Keys are stored only on this machine.
        Use Auto-pick best to fetch the provider's models and choose a fast, current one, so you never have to type a model name.
      </p>
      <div className="row wrap" style={{ gap: 16, alignItems: 'flex-end' }}>
        <div className="field mt0">
          <label>Provider</label>
          <select className="control" value={cfg.provider} onChange={(e) => { set({ provider: e.target.value, baseUrl: undefined, model: undefined }); setModels([]); setPickMsg('') }}>
            <option value="none">Off</option>
            {groups.map((g) => (
              <optgroup key={g} label={g}>
                {LLM_PROVIDERS.filter((p) => p.group === g).map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        {provider && (
          <>
            <div className="field mt0">
              <label>Base URL</label>
              <input
                key={`url-${cfg.provider}`}
                className="control"
                style={{ width: 240 }}
                defaultValue={cfg.baseUrl ?? provider.baseUrl}
                placeholder={provider.baseUrl || 'https://host/v1'}
                onBlur={(e) => set({ baseUrl: e.target.value.trim() })}
              />
            </div>
            <div className="field mt0">
              <label>Model</label>
              <div className="row wrap" style={{ gap: 6 }}>
                <input
                  key={`model-${cfg.provider}-${cfg.model ?? ''}`}
                  list="llm-model-list"
                  className="control"
                  style={{ flex: '1 1 150px', minWidth: 0 }}
                  defaultValue={cfg.model ?? provider.defaultModel}
                  placeholder={provider.defaultModel || 'model name'}
                  onBlur={(e) => set({ model: e.target.value.trim() })}
                />
                <button className="btn" style={{ whiteSpace: 'nowrap' }} onClick={autoPick} disabled={picking}>
                  {picking ? 'Finding…' : 'Auto-pick best'}
                </button>
              </div>
              <datalist id="llm-model-list">
                {models.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </div>
            {provider.group !== 'Local' && (
              <div className="field mt0">
                <label>API key {provider.needsKey ? '' : '(optional)'}</label>
                <div className="row wrap" style={{ gap: 6 }}>
                  <input
                    key={`key-${cfg.provider}-${cfg.apiKey ? '1' : '0'}`}
                    className="control"
                    style={{ flex: '1 1 150px', minWidth: 0 }}
                    type={showKey ? 'text' : 'password'}
                    defaultValue={cfg.apiKey ?? ''}
                    placeholder="Paste your key"
                    onBlur={(e) => set({ apiKey: e.target.value.trim() || undefined })}
                  />
                  <button className="iconbtn" title={showKey ? 'Hide key' : 'Show key'} onClick={() => setShowKey((s) => !s)}>
                    {showKey ? <EyeOff /> : <Eye />}
                  </button>
                  {cfg.apiKey && (
                    <button className="btn" title="Remove saved key" onClick={() => { set({ apiKey: undefined }); setShowKey(false) }}>
                      Clear
                    </button>
                  )}
                </div>
              </div>
            )}
            <div className="field mt0">
              <label>&nbsp;</label>
              <button className="btn" onClick={runTest} disabled={test.busy}>
                {test.busy ? 'Testing…' : 'Test'}
              </button>
            </div>
          </>
        )}
      </div>
      {provider && (
        <p className="small muted" style={{ marginBottom: 0 }}>
          {resolved ? `Calls ${resolved.baseUrl || provider.baseUrl} as ${resolved.api}.` : ''}
          {provider.keyUrl ? ` Get a key at ${provider.keyUrl}.` : ''}
          {cfg.apiKey ? ' A key is saved. Type over it to change it, or Clear to remove it.' : ''}
        </p>
      )}
      {pickMsg && <p className="small muted" style={{ marginBottom: 0 }}>{pickMsg}</p>}
      {test.msg && <p className={`small ${test.ok ? 'green' : 'red'}`} style={{ marginBottom: 0 }}>{test.ok ? 'Connected: ' : 'Failed: '}{test.msg}</p>}
    </div>
  )
}

function ImportRulesCard() {
  const store = useStore()
  const { mutate } = useStoreCtx()
  const catName = (id?: string) => store.categories.find((c) => c.id === id)?.name ?? 'Uncategorized'
  const rules = store.importRules ?? []

  return (
    <div className="card">
      <div className="card-title">
        Import rules
        {rules.length > 0 && (
          <button className="btn small" onClick={() => { if (window.confirm('Clear all import rules?')) mutate((d) => { d.importRules = [] }) }}>
            Clear all
          </button>
        )}
      </div>
      <p className="card-sub">Learned automatically when you import a statement and confirm the categories, so the next import is smarter. {rules.length} rules.</p>
      {rules.length === 0 ? (
        <p className="small muted" style={{ margin: 0 }}>No rules yet. Import a statement to build them.</p>
      ) : (
        <div style={{ maxHeight: 260, overflowY: 'auto' }}>
          {rules.map((r) => (
            <div key={r.id} className="row" style={{ borderTop: '1px solid var(--border-soft)', padding: '7px 0', gap: 10 }}>
              <span className="small" style={{ fontFamily: 'Consolas, monospace', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.match}</span>
              <span className="small">{r.merchant}</span>
              <span className="badge">{catName(r.categoryId)}</span>
              <button className="iconbtn" onClick={() => mutate((d) => { d.importRules = d.importRules.filter((x) => x.id !== r.id) })}>
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Update checking. This is the only request the app makes to a server the user did not
 * configure, so it is off by default and always says where it is going.
 */
function UpdatesCard({ flash }: { flash: (m: string) => void }) {
  const store = useStore()
  const { mutate, storageKind } = useStoreCtx()
  const repo = store.settings.updateRepo ?? DEFAULT_UPDATE_REPO

  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<UpdateCheck | null>(null)
  const [error, setError] = useState<string | null>(null)
  const tried = useRef(false)

  const run = useCallback(
    async (silent: boolean) => {
      if (!isValidRepo(repo)) {
        if (!silent) setError('Enter the repository as "owner/repo" first.')
        return
      }
      setBusy(true)
      setError(null)
      try {
        setResult(await checkForUpdate(repo, __APP_VERSION__))
      } catch (e) {
        if (!silent) setError(e instanceof Error ? e.message : String(e))
      } finally {
        setBusy(false)
      }
    },
    [repo],
  )

  // Opt-in check, once per app start.
  useEffect(() => {
    if (tried.current || !store.settings.autoCheckUpdates || !isValidRepo(repo)) return
    tried.current = true
    void run(true)
  }, [store.settings.autoCheckUpdates, repo, run])

  const latest = result?.latest
  const asset = latest ? assetForPlatform(latest.assets, storageKind) : undefined
  const skipped = latest && store.settings.skippedVersion === latest.version

  return (
    <div className="card">
      <div className="card-title">
        <span className="row" style={{ gap: 8 }}><PackageIcon size={15} /> Updates</span>
        <span className="small muted">You are running {APP_NAME} {__APP_VERSION__}</span>
      </div>
      <p className="card-sub">
        New versions are published as releases on GitHub. Checking asks github.com for the latest release number and
        nothing else; none of your financial data is sent. Your data stays where it is when you install an update.
      </p>

      <div className="row wrap" style={{ alignItems: 'flex-end' }}>
        <div className="field mt0" style={{ flex: '1 1 220px' }}>
          <label>Release repository</label>
          <input
            className="control"
            placeholder="owner/repo"
            defaultValue={repo}
            onBlur={(e) => mutate((d) => { d.settings.updateRepo = normalizeRepo(e.target.value) || undefined })}
          />
        </div>
        <button className="btn" onClick={() => run(false)} disabled={busy || !isValidRepo(repo)}>
          {busy ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Checking</> : <><RefreshCw size={14} /> Check now</>}
        </button>
      </div>

      <label className="row small" style={{ gap: 8, marginTop: 10, cursor: 'pointer' }}>
        <input
          type="checkbox"
          className="cb"
          checked={!!store.settings.autoCheckUpdates}
          onChange={(e) => mutate((d) => { d.settings.autoCheckUpdates = e.target.checked || undefined })}
        />
        <span>Check for a new release when {APP_NAME} starts</span>
      </label>

      {error && <div className="small red" style={{ marginTop: 8 }}>{error}</div>}

      {result && !result.updateAvailable && (
        <div className="small muted" style={{ marginTop: 10 }}>
          You are up to date. Latest published release is {latest?.tag ?? 'unknown'}.
        </div>
      )}

      {result && result.updateAvailable && latest && (
        <div className="update-box">
          <div className="row between wrap">
            <b>{latest.name} is available</b>
            <span className="small muted">you have {result.current}</span>
          </div>
          {latest.notes && <pre className="update-notes">{latest.notes.slice(0, 1200)}</pre>}
          <div className="row wrap" style={{ gap: 8, marginTop: 10 }}>
            {asset && (
              <a className="btn primary" href={asset.url} target="_blank" rel="noreferrer">
                <Download size={14} /> Download {asset.name} ({fmtBytes(asset.size)})
              </a>
            )}
            <a className="btn" href={latest.url} target="_blank" rel="noreferrer">Release notes</a>
            {!skipped && (
              <button className="btn small" onClick={() => { mutate((d) => { d.settings.skippedVersion = latest.version }); flash(`Skipping ${latest.tag}.`) }}>
                Skip this version
              </button>
            )}
          </div>
          <p className="small muted" style={{ marginTop: 8 }}>
            Install it over your current version. Your accounts, transactions and settings are kept.
          </p>
        </div>
      )}
    </div>
  )
}
