import type { Store } from './types'
import { migrate } from './migrate'

export interface LlmFetchRequest {
  url: string
  method?: string
  headers?: Record<string, string>
  body?: string
}
export interface LlmFetchResponse {
  ok: boolean
  status: number
  body: string
}

export interface EmailScanRequest {
  host: string
  port: number
  secure: boolean
  user: string
  password?: string
  sinceDays?: number
  domains: string[]
}
export interface EmailScanMessage {
  from: string
  subject: string
  date?: string
  source: string // base64-encoded raw .eml
}
export interface EmailScanResponse {
  ok: boolean
  error?: string
  messages: EmailScanMessage[]
}

interface MunoraBridge {
  platform: 'electron'
  loadStore(): Promise<string | null>
  saveStore(json: string): Promise<boolean>
  openDataFolder(): Promise<boolean>
  llmFetch?(req: LlmFetchRequest): Promise<LlmFetchResponse>
  scanEmail?(req: EmailScanRequest): Promise<EmailScanResponse>
}

declare global {
  interface Window {
    munora?: MunoraBridge
  }
}

export interface StorageAdapter {
  kind: 'electron' | 'browser' | 'capacitor'
  load(): Promise<Store | null>
  save(store: Store): Promise<void>
  openDataFolder?: () => void
}

const LS_KEY = 'munora-store-v1'
const MOBILE_FILE = 'munora-data.json'

function parseStore(json: string | null): Store | null {
  if (!json) return null
  try {
    return migrate(JSON.parse(json))
  } catch {
    return null
  }
}

function isCapacitorNative(): boolean {
  const c = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
  return !!(c && typeof c.isNativePlatform === 'function' && c.isNativePlatform())
}

export function getStorage(): StorageAdapter {
  // Mobile (Android / iOS via Capacitor): a single JSON file in app storage.
  if (isCapacitorNative()) {
    return {
      kind: 'capacitor',
      load: async () => {
        try {
          const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
          const res = await Filesystem.readFile({ path: MOBILE_FILE, directory: Directory.Data, encoding: Encoding.UTF8 })
          return parseStore(typeof res.data === 'string' ? res.data : null)
        } catch {
          return null // file does not exist yet
        }
      },
      save: async (store) => {
        const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
        await Filesystem.writeFile({ path: MOBILE_FILE, directory: Directory.Data, encoding: Encoding.UTF8, data: JSON.stringify(store) })
      },
    }
  }

  // Desktop (Electron): file-backed store via the main process.
  const bridge = window.munora
  if (bridge) {
    return {
      kind: 'electron',
      load: async () => parseStore(await bridge.loadStore()),
      save: async (store) => {
        await bridge.saveStore(JSON.stringify(store, null, 1))
      },
      openDataFolder: () => bridge.openDataFolder(),
    }
  }

  // Browser dev.
  return {
    kind: 'browser',
    load: async () => parseStore(localStorage.getItem(LS_KEY)),
    save: async (store) => {
      localStorage.setItem(LS_KEY, JSON.stringify(store))
    },
  }
}
