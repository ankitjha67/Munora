// Export and restore everything the app holds, so a user can move to a new version,
// a new machine, or between desktop and mobile without losing anything.
//
// On desktop an in-place upgrade does NOT need this: the data file lives in the OS
// user-data directory (keyed on the product name), not inside the installed program,
// so installing a newer build leaves it untouched. This is for moving machines,
// moving between desktop and mobile, and keeping your own copies.

import type { Store } from './types'
import { migrate, CURRENT_SCHEMA } from './migrate'
import { todayISO } from './dates'
import { APP_NAME } from './constants'

export const BACKUP_FORMAT = 'nestworth.backup'
export const BACKUP_FORMAT_VERSION = 1

export interface BackupManifest {
  format: typeof BACKUP_FORMAT
  formatVersion: number
  /** App version that produced the file. */
  appVersion: string
  /** Store schema the data is in, so an older file can be migrated on import. */
  schemaVersion: number
  exportedAt: string
  /** Whether API keys and passwords are inside. */
  includesSecrets: boolean
  /** What is in the file, so a restore can be confirmed before it overwrites. */
  counts: BackupCounts
}

export interface BackupCounts {
  accounts: number
  transactions: number
  categories: number
  profiles: number
  properties: number
  plans: number
  importRules: number
  trackedFunds: number
  tags: number
}

export interface BackupFile {
  manifest: BackupManifest
  data: Store
}

export function countStore(s: Store): BackupCounts {
  return {
    accounts: s.accounts.length,
    transactions: s.transactions.length,
    categories: s.categories.length,
    profiles: s.profiles.length,
    properties: s.properties.length,
    plans: s.plans?.length ?? 0,
    importRules: s.importRules.length,
    trackedFunds: s.investing?.mfWatchlist?.length ?? 0,
    tags: s.tags.length,
  }
}

/** Fields that are credentials rather than financial records. */
function stripSecrets(s: Store): Store {
  const out = structuredClone(s)
  if (out.settings.llm) delete out.settings.llm.apiKey
  if (out.settings.emailInbox) delete out.settings.emailInbox.password
  delete out.settings.statementPasswords
  return out
}

/**
 * Build a backup. Secrets are left out unless explicitly asked for: a backup travels
 * (Downloads, cloud drives, email) and an API key inside it travels too. Including
 * them is offered for a one-step move to a new machine.
 */
export function buildBackup(store: Store, opts?: { includeSecrets?: boolean; appVersion?: string }): BackupFile {
  const includesSecrets = !!opts?.includeSecrets
  const data = includesSecrets ? structuredClone(store) : stripSecrets(store)
  return {
    manifest: {
      format: BACKUP_FORMAT,
      formatVersion: BACKUP_FORMAT_VERSION,
      appVersion: opts?.appVersion ?? 'unknown',
      schemaVersion: CURRENT_SCHEMA,
      exportedAt: new Date().toISOString(),
      includesSecrets,
      counts: countStore(data),
    },
    data,
  }
}

export function backupFileName(includeSecrets: boolean): string {
  return `${APP_NAME.toLowerCase()}-backup-${todayISO()}${includeSecrets ? '-with-keys' : ''}.json`
}

export interface ReadResult {
  store: Store
  manifest?: BackupManifest
  /** Things worth telling the user before they overwrite their data. */
  warnings: string[]
}

/**
 * Parse a backup. Accepts both the manifest format and a bare store from older
 * exports, and migrates either to the current schema.
 */
export function readBackup(text: string): ReadResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('That file is not valid JSON.')
  }
  if (!parsed || typeof parsed !== 'object') throw new Error('That file does not contain any data.')

  const warnings: string[] = []
  const withManifest = parsed as Partial<BackupFile>
  const isWrapped = withManifest.manifest?.format === BACKUP_FORMAT && !!withManifest.data

  const raw = isWrapped ? withManifest.data : parsed
  const manifest = isWrapped ? withManifest.manifest : undefined

  const store = migrate(raw)
  if (!store || !Array.isArray(store.transactions) || !Array.isArray(store.accounts)) {
    throw new Error(`That does not look like a ${APP_NAME} backup.`)
  }

  if (manifest) {
    if (manifest.formatVersion > BACKUP_FORMAT_VERSION) {
      warnings.push(`This file was written by a newer version of ${APP_NAME} (backup format ${manifest.formatVersion}). Some of it may not be understood, so update the app first if anything looks wrong.`)
    }
    if (manifest.schemaVersion < CURRENT_SCHEMA) {
      warnings.push(`Saved with an older data format (v${manifest.schemaVersion}); it will be upgraded to v${CURRENT_SCHEMA} on restore.`)
    }
  } else {
    warnings.push('This file has no backup header, so it was probably exported by an early version. It will still be restored.')
  }

  return { store, manifest, warnings }
}
