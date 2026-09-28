import { useMemo, useState } from 'react'
import { Loader2, Sparkle, Calculator, ShieldCheck } from 'lucide-react'
import { useStore, useStoreCtx } from '../lib/store'
import { fmtMoney } from '../lib/format'
import { todayISO, monthKey } from '../lib/dates'
import { AREA_UNITS, areaUnitLabel, valueFromRate, valuationPrompt } from '../lib/property'
import type { AiValuation, PropertyPerformance } from '../lib/property'
import { llmConfigured, promptJson } from '../lib/statements/llm'
import { cachedMacro, inflationFraction } from '../lib/macro'
import type { AreaUnit, Property } from '../lib/types'
import { Drawer, Seg } from './ui'

type Mode = 'manual' | 'rate' | 'ai'

/**
 * Record what a property is worth today. Three routes to a number, all ending in the
 * same place: a month-end point on the property's valuation account, which is what
 * net worth and the performance stats read.
 */
export default function ValuationDrawer({ property, perf, onClose }: { property: Property; perf: PropertyPerformance; onClose: () => void }) {
  const store = useStore()
  const { mutate } = useStoreCtx()
  const base = store.settings.currencyCode

  const [mode, setMode] = useState<Mode>('manual')
  const [value, setValue] = useState(perf.value ? String(Math.round(perf.value)) : '')
  const [month, setMonth] = useState(monthKey(todayISO()))

  // details that also feed the rate calculator and the AI prompt
  const [area, setArea] = useState(property.area ? String(property.area) : '')
  const [areaUnit, setAreaUnit] = useState<AreaUnit>(property.areaUnit ?? 'sqft')
  const [rate, setRate] = useState(property.lastRatePerArea ? String(property.lastRatePerArea) : '')
  const [locality, setLocality] = useState(property.locality ?? '')
  const [city, setCity] = useState(property.city ?? '')
  const [purchasePrice, setPurchasePrice] = useState(property.purchasePrice ? String(property.purchasePrice) : '')
  const [purchaseDate, setPurchaseDate] = useState(property.purchaseDate ?? '')

  const [aiBusy, setAiBusy] = useState(false)
  const [ai, setAi] = useState<AiValuation | null>(null)
  const [error, setError] = useState<string | null>(null)

  const rateValue = useMemo(() => (Number(area) > 0 && Number(rate) > 0 ? valueFromRate(Number(area), Number(rate)) : 0), [area, rate])
  const canAi = llmConfigured(store.settings.llm)

  const runAi = async () => {
    setAiBusy(true)
    setError(null)
    try {
      const infl = inflationFraction(cachedMacro(base))
      const draft: Property = { ...property, area: Number(area) || undefined, areaUnit, locality: locality.trim() || undefined, city: city.trim() || undefined }
      const res = await promptJson<AiValuation>(store.settings.llm, valuationPrompt(draft, perf, base, infl !== undefined ? infl * 100 : undefined), 1200)
      setAi(res)
      if (Number.isFinite(res.estimate) && res.estimate > 0) setValue(String(Math.round(res.estimate)))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setAiBusy(false)
    }
  }

  const save = () => {
    const v = mode === 'rate' ? rateValue : Number(value)
    if (!(v > 0) || !property.valuationAccountId) return
    mutate((d) => {
      const prop = d.properties.find((p) => p.id === property.id)
      if (prop) {
        prop.area = Number(area) || undefined
        prop.areaUnit = Number(area) ? areaUnit : undefined
        prop.locality = locality.trim() || undefined
        prop.city = city.trim() || undefined
        prop.purchasePrice = Number(purchasePrice) || undefined
        prop.purchaseDate = purchaseDate || undefined
        if (mode === 'rate' && Number(rate) > 0) prop.lastRatePerArea = Number(rate)
      }
      const acc = d.accounts.find((a) => a.id === property.valuationAccountId)
      if (!acc) return
      const list = acc.balanceHistory ?? (acc.balanceHistory = [])
      const existing = list.find((pt) => pt.month === month)
      if (existing) existing.balance = v
      else list.push({ month, balance: v })
      list.sort((a, b) => (a.month < b.month ? -1 : 1))
    })
    onClose()
  }

  const finalValue = mode === 'rate' ? rateValue : Number(value) || 0

  return (
    <Drawer onClose={onClose}>
      <h3>Record a valuation</h3>
      <p className="small muted" style={{ marginTop: 4 }}>
        {property.name}. This becomes the property's value for {month}, which net worth and the performance stats use.
      </p>

      {!property.valuationAccountId && (
        <div className="small red" style={{ marginTop: 8 }}>
          This property has no valuation account linked. Set one in Settings, Properties, first.
        </div>
      )}

      <Seg
        options={[
          { key: 'manual', label: 'Enter a value' },
          { key: 'rate', label: 'From a rate' },
          { key: 'ai', label: 'AI estimate' },
        ]}
        value={mode}
        onChange={(m) => setMode(m as Mode)}
      />

      {mode === 'manual' && (
        <div className="row wrap" style={{ gap: 12 }}>
          <div className="field" style={{ flex: '1 1 160px' }}>
            <label>Value ({base})</label>
            <input className="control" type="number" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
          </div>
          <div className="field" style={{ flex: '1 1 130px' }}>
            <label>As of</label>
            <input className="control" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </div>
        </div>
      )}

      {mode === 'rate' && (
        <>
          <p className="small muted" style={{ marginTop: 10 }}>
            Use the going rate per {areaUnitLabel(areaUnit)} in the area, such as a circle rate, a guidance value or what similar places are selling for.
          </p>
          <div className="row wrap" style={{ gap: 12 }}>
            <div className="field" style={{ flex: '1 1 110px' }}>
              <label>Area</label>
              <input className="control" type="number" inputMode="decimal" value={area} onChange={(e) => setArea(e.target.value)} />
            </div>
            <div className="field" style={{ flex: '0 1 110px' }}>
              <label>Unit</label>
              <select className="control" value={areaUnit} onChange={(e) => setAreaUnit(e.target.value as AreaUnit)}>
                {AREA_UNITS.map((u) => (
                  <option key={u.key} value={u.key}>{u.label}</option>
                ))}
              </select>
            </div>
            <div className="field" style={{ flex: '1 1 140px' }}>
              <label>Rate per {areaUnitLabel(areaUnit)}</label>
              <input className="control" type="number" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />
            </div>
            <div className="field" style={{ flex: '1 1 130px' }}>
              <label>As of</label>
              <input className="control" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
            </div>
          </div>
          {rateValue > 0 && <div className="val-calc"><Calculator size={15} /> {area} {areaUnitLabel(areaUnit)} x {fmtMoney(Number(rate), 0)} = <b>{fmtMoney(rateValue, 0)}</b></div>}
        </>
      )}

      {mode === 'ai' && (
        <>
          <p className="small muted" style={{ marginTop: 10 }}>
            Your model has no live listing access, so this is a sanity check from general knowledge, not an appraisal. Give it the location and size for a better guess.
          </p>
          <div className="row wrap" style={{ gap: 12 }}>
            <div className="field" style={{ flex: '1 1 150px' }}>
              <label>Locality / area</label>
              <input className="control" value={locality} onChange={(e) => setLocality(e.target.value)} placeholder="Indiranagar" />
            </div>
            <div className="field" style={{ flex: '1 1 130px' }}>
              <label>City</label>
              <input className="control" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Bengaluru" />
            </div>
            <div className="field" style={{ flex: '1 1 110px' }}>
              <label>Area</label>
              <input className="control" type="number" inputMode="decimal" value={area} onChange={(e) => setArea(e.target.value)} />
            </div>
            <div className="field" style={{ flex: '0 1 110px' }}>
              <label>Unit</label>
              <select className="control" value={areaUnit} onChange={(e) => setAreaUnit(e.target.value as AreaUnit)}>
                {AREA_UNITS.map((u) => (
                  <option key={u.key} value={u.key}>{u.label}</option>
                ))}
              </select>
            </div>
          </div>

          {!canAi ? (
            <p className="small muted">Add an AI model in Settings to use this.</p>
          ) : (
            <button className="btn" onClick={runAi} disabled={aiBusy}>
              {aiBusy ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Estimating</> : <><Sparkle size={14} /> {ai ? 'Estimate again' : 'Get an estimate'}</>}
            </button>
          )}

          {error && <div className="small red" style={{ marginTop: 8 }}>{error}</div>}

          {ai && (
            <div className="val-ai">
              <div className="row between wrap">
                <b>{fmtMoney(ai.estimate, 0)}</b>
                <span className={`badge conf-${ai.confidence}`}>{ai.confidence} confidence</span>
              </div>
              <div className="small muted">
                Range {fmtMoney(ai.low, 0)} to {fmtMoney(ai.high, 0)}
                {ai.ratePerArea ? ` · about ${fmtMoney(ai.ratePerArea, 0)} per ${areaUnitLabel(areaUnit)}` : ''}
              </div>
              <p className="small" style={{ marginTop: 8 }}>{ai.reasoning}</p>
              {ai.caveats && <p className="small muted">{ai.caveats}</p>}
              <div className="row" style={{ gap: 8, marginTop: 8 }}>
                <div className="field mt0" style={{ flex: '1 1 140px' }}>
                  <label>Value to record</label>
                  <input className="control" type="number" value={value} onChange={(e) => setValue(e.target.value)} />
                </div>
                <div className="field mt0" style={{ flex: '0 1 130px' }}>
                  <label>As of</label>
                  <input className="control" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
                </div>
              </div>
              <div className="small muted" style={{ marginTop: 6 }}>
                <ShieldCheck size={12} /> Saved as your own figure. Treat it as a starting point and check it against local listings or a valuer.
              </div>
            </div>
          )}
        </>
      )}

      <div className="field">
        <label>Purchase details (for appreciation and annual growth)</label>
        <div className="row wrap" style={{ gap: 12 }}>
          <input className="control" style={{ flex: '1 1 150px' }} type="number" inputMode="decimal" placeholder={`What it cost (${base})`} value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} />
          <input className="control" style={{ flex: '1 1 140px' }} type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
        </div>
      </div>

      <div className="row" style={{ marginTop: 16 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <div className="spacer" />
        <button className="btn primary" disabled={!(finalValue > 0) || !property.valuationAccountId} onClick={save}>
          Save {finalValue > 0 ? fmtMoney(finalValue, 0) : 'valuation'}
        </button>
      </div>
      <style>{'@keyframes spin { to { transform: rotate(360deg) } }'}</style>
    </Drawer>
  )
}
