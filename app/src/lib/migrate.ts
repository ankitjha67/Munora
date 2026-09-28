import type { Store } from './types'
import { DEFAULT_PROFILE_ID } from './types'

export const CURRENT_SCHEMA = 2

/** Bring any older store shape up to the current schema. Pure; returns a new object. */
export function migrate(raw: unknown): Store | null {
  if (!raw || typeof raw !== 'object') return null
  const s = raw as Record<string, unknown>
  const version = typeof s.schemaVersion === 'number' ? s.schemaVersion : 0
  if (version < 1 || version > CURRENT_SCHEMA) return null

  const store = structuredClone(s) as unknown as Store

  // v1 -> v2: profiles, households, per-account ownership, import rules.
  if (version < 2) {
    store.profiles = [{ id: DEFAULT_PROFILE_ID, name: 'You', color: '#4F46E5', relationship: 'Self' }]
    store.households = []
    store.importRules = []
    for (const a of store.accounts) if (!a.profileId) a.profileId = DEFAULT_PROFILE_ID
    if (!store.settings.theme) store.settings.theme = 'system'
    store.schemaVersion = 2
  }

  // Fill any gaps that a partially-formed store might have.
  store.profiles ??= [{ id: DEFAULT_PROFILE_ID, name: 'You', color: '#4F46E5', relationship: 'Self' }]
  store.households ??= []
  store.importRules ??= []
  if (store.profiles.length === 0) store.profiles.push({ id: DEFAULT_PROFILE_ID, name: 'You', color: '#4F46E5', relationship: 'Self' })

  return store
}
