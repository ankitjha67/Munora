import { createContext, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { DateRange, PresetId } from './dates'
import { clampRangeEndToToday, presetRange, shiftRange } from './dates'
import { useStoreCtx } from './store'

interface RangeContextValue {
  range: DateRange
  preset: PresetId
  setPreset(p: PresetId): void
  setCustom(range: DateRange): void
  shift(dir: -1 | 1): void
}

const Ctx = createContext<RangeContextValue | null>(null)

export function RangeProvider({ children }: { children: ReactNode }) {
  const { store } = useStoreCtx()
  const minDate = useMemo(() => {
    if (!store || store.transactions.length === 0) return undefined
    let min = store.transactions[0].date
    for (const t of store.transactions) if (t.date < min) min = t.date
    return min
  }, [store])

  const [preset, setPresetState] = useState<PresetId>('ytd')
  const [custom, setCustomState] = useState<DateRange | null>(null)

  const range = useMemo(() => {
    const r = preset === 'custom' && custom ? custom : presetRange(preset, minDate)
    return clampRangeEndToToday(r)
  }, [preset, custom, minDate])

  const value: RangeContextValue = useMemo(
    () => ({
      range,
      preset,
      setPreset: (p) => {
        setPresetState(p)
        if (p !== 'custom') setCustomState(null)
      },
      setCustom: (r) => {
        setPresetState('custom')
        setCustomState(r)
      },
      shift: (dir) => {
        setCustomState(shiftRange(range, dir))
        setPresetState('custom')
      },
    }),
    [range, preset],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useRange(): RangeContextValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useRange outside provider')
  return v
}
