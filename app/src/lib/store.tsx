import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Store } from './types'
import { emptyStore } from './types'
import { buildDemoStore } from './seed'
import { getStorage } from './storage'
import { setCurrency, setDisplayConversion } from './format'
import { setRegion } from './terms'
import { fetchFxTable, fxStale, fxConvert, hasRate } from './fx'
import { multiCurrencyInUse } from './selectors'

export function applyTheme(theme?: 'light' | 'dark' | 'system') {
  const mode = theme ?? 'system'
  const resolved = mode === 'system' ? (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : mode
  document.documentElement.dataset.theme = resolved
}

function applyEnv(s: Store) {
  setCurrency(s.settings.currencyCode, s.settings.locale)
  setRegion(s.settings.region)
  applyTheme(s.settings.theme)
  // "Show everything in my base currency": convert per-account amounts at display
  // time. Returns null when no rate is known so the native amount is shown rather
  // than a wrong one.
  if (s.settings.displayInBase) {
    const base = s.settings.currencyCode
    setDisplayConversion((code, n) => (code === base || hasRate(code, s.fx) ? fxConvert(n, code, base, s.fx) : null))
  } else {
    setDisplayConversion(null)
  }
}

interface StoreContextValue {
  store: Store | null // null after loading finishes = first run (onboarding)
  loading: boolean
  lastSavedAt: number | null
  storageKind: 'electron' | 'browser' | 'capacitor'
  initDemo(): void
  initEmpty(): void
  /** Clone-mutate-persist. All edits go through here. */
  mutate(fn: (draft: Store) => void): void
  replaceStore(next: Store): void
  eraseAll(): void
  openDataFolder(): void
  /** Fetch live FX rates into store.fx. Resolves false on network failure. */
  refreshFx(): Promise<boolean>
}

const Ctx = createContext<StoreContextValue | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const storage = useMemo(() => getStorage(), [])
  const [store, setStore] = useState<Store | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)
  const saveTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    let alive = true
    storage.load().then((s) => {
      if (!alive) return
      if (s) applyEnv(s)
      setStore(s)
      setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [storage])

  // React to OS light/dark changes while the theme is set to "system".
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!mq) return
    const h = () => {
      if ((store?.settings.theme ?? 'system') === 'system') applyTheme('system')
    }
    mq.addEventListener?.('change', h)
    return () => mq.removeEventListener?.('change', h)
  }, [store])

  const persist = useCallback(
    (next: Store) => {
      window.clearTimeout(saveTimer.current)
      saveTimer.current = window.setTimeout(() => {
        storage.save(next).then(() => setLastSavedAt(Date.now()))
      }, 400)
    },
    [storage],
  )

  const commit = useCallback(
    (next: Store) => {
      applyEnv(next)
      setStore(next)
      persist(next)
    },
    [persist],
  )

  const refreshFx = useCallback(async () => {
    try {
      const table = await fetchFxTable()
      setStore((cur) => {
        if (!cur) return cur
        const next = { ...cur, fx: table }
        persist(next)
        return next
      })
      return true
    } catch {
      return false
    }
  }, [persist])

  // Auto-refresh rates once per app start when foreign-currency accounts exist and cache is stale.
  const fxTried = useRef(false)
  useEffect(() => {
    if (!store || fxTried.current) return
    if (multiCurrencyInUse(store) && fxStale(store.fx)) {
      fxTried.current = true
      void refreshFx()
    }
  }, [store, refreshFx])

  const value: StoreContextValue = useMemo(
    () => ({
      store,
      loading,
      lastSavedAt,
      storageKind: storage.kind,
      initDemo: () => commit(buildDemoStore()),
      initEmpty: () => commit(emptyStore()),
      mutate: (fn) => {
        setStore((cur) => {
          if (!cur) return cur
          const draft = structuredClone(cur)
          fn(draft)
          persist(draft)
          applyEnv(draft)
          return draft
        })
      },
      replaceStore: (next) => commit(next),
      eraseAll: () => {
        setStore(null)
        persist(emptyStore())
      },
      openDataFolder: () => storage.openDataFolder?.(),
      refreshFx,
    }),
    [store, loading, lastSavedAt, storage, commit, persist, refreshFx],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStoreCtx(): StoreContextValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useStoreCtx outside provider')
  return v
}

/** Convenience for pages that only render once a store exists. */
export function useStore(): Store {
  const { store } = useStoreCtx()
  if (!store) throw new Error('useStore called before store initialized')
  return store
}
