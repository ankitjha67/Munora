import { createContext, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Store } from './types'
import { DEFAULT_PROFILE_ID } from './types'
import { useStore } from './store'

// Profile scope: 'all' shows the whole household (combined total); a profile id
// narrows every analytic to that person's accounts. Implemented as a memoized
// "scoped store" so the pure selectors need no changes.

interface ProfileContextValue {
  scope: string // 'all' | profileId
  setScope(s: string): void
}

const Ctx = createContext<ProfileContextValue | null>(null)

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [scope, setScope] = useState('all')
  const value = useMemo(() => ({ scope, setScope }), [scope])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useProfileScope(): ProfileContextValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useProfileScope outside provider')
  return v
}

/** Analytics pages call this instead of useStore() to get the profile-scoped view. */
export function useScopedStore(): Store {
  const base = useStore()
  const { scope } = useProfileScope()
  return useMemo(() => scopedStore(base, scope), [base, scope])
}

const scopedCache = new WeakMap<Store, Map<string, Store>>()

/** A view of the store limited to one profile's accounts (and their transactions/properties). */
export function scopedStore(base: Store, scope: string): Store {
  if (scope === 'all') return base
  let m = scopedCache.get(base)
  if (!m) {
    m = new Map()
    scopedCache.set(base, m)
  }
  const hit = m.get(scope)
  if (hit) return hit

  const owns = (profileId?: string) => (profileId ?? DEFAULT_PROFILE_ID) === scope
  const accounts = base.accounts.filter((a) => owns(a.profileId))
  const accountIds = new Set(accounts.map((a) => a.id))
  const transactions = base.transactions.filter((t) => accountIds.has(t.accountId))
  const properties = base.properties.filter(
    (p) => owns(p.profileId) || (p.valuationAccountId && accountIds.has(p.valuationAccountId)),
  )
  const scoped: Store = { ...base, accounts, transactions, properties }
  m.set(scope, scoped)
  return scoped
}
