// Checks whether a newer release exists, using the GitHub Releases API for a public
// repository (keyless). This is the ONLY part of the app that contacts a server the
// user did not configure themselves, so it never runs unless asked: either the user
// presses "Check now" or they turn on the automatic check.

export interface ReleaseInfo {
  version: string
  /** Tag as published, e.g. "v0.2.0". */
  tag: string
  name: string
  notes: string
  url: string
  publishedAt: string
  /** Installers and packages attached to the release. */
  assets: { name: string; url: string; size: number }[]
}

export interface UpdateCheck {
  current: string
  latest?: ReleaseInfo
  /** True when `latest` is newer than `current`. */
  updateAvailable: boolean
  checkedAt: number
}

/** "owner/repo", trimmed of a full GitHub URL if one was pasted in. */
export function normalizeRepo(input: string): string {
  return input
    .trim()
    .replace(/^https?:\/\/(www\.)?github\.com\//i, '')
    .replace(/\.git$/i, '')
    .replace(/\/+$/, '')
}

export function isValidRepo(input: string): boolean {
  return /^[\w.-]+\/[\w.-]+$/.test(normalizeRepo(input))
}

/** Strip a leading "v" and any build metadata so versions compare cleanly. */
function parseVersion(v: string): number[] {
  return v
    .trim()
    .replace(/^v/i, '')
    .split(/[.+-]/)
    .slice(0, 3)
    .map((n) => Number.parseInt(n, 10) || 0)
}

/** Positive when a is newer than b, 0 when equal, negative when older. */
export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a)
  const pb = parseVersion(b)
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

interface GhRelease {
  tag_name?: string
  name?: string
  body?: string
  html_url?: string
  published_at?: string
  draft?: boolean
  prerelease?: boolean
  assets?: { name?: string; browser_download_url?: string; size?: number }[]
}

/**
 * Fetch the newest published release for a repo. Throws with a readable message when
 * the repo is wrong or has no releases yet, which is the common case while setting up.
 */
export async function fetchLatestRelease(repo: string): Promise<ReleaseInfo> {
  const slug = normalizeRepo(repo)
  if (!isValidRepo(slug)) throw new Error('Enter the repository as "owner/repo".')

  const res = await fetch(`https://api.github.com/repos/${slug}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json' },
  })
  if (res.status === 404) throw new Error(`No published release found for ${slug}. Publish a release (not a draft) and try again.`)
  if (res.status === 403) throw new Error('GitHub rate-limited this check. Try again in a few minutes.')
  if (!res.ok) throw new Error(`GitHub returned HTTP ${res.status}.`)

  const r = (await res.json()) as GhRelease
  const tag = r.tag_name ?? ''
  if (!tag) throw new Error('That release has no tag, so its version cannot be read.')

  return {
    version: tag.replace(/^v/i, ''),
    tag,
    name: r.name || tag,
    notes: (r.body ?? '').trim(),
    url: r.html_url ?? `https://github.com/${slug}/releases`,
    publishedAt: r.published_at ?? '',
    assets: (r.assets ?? [])
      .filter((a) => a.name && a.browser_download_url)
      .map((a) => ({ name: a.name as string, url: a.browser_download_url as string, size: a.size ?? 0 })),
  }
}

export async function checkForUpdate(repo: string, currentVersion: string): Promise<UpdateCheck> {
  const latest = await fetchLatestRelease(repo)
  return {
    current: currentVersion,
    latest,
    updateAvailable: compareVersions(latest.version, currentVersion) > 0,
    checkedAt: Date.now(),
  }
}

/**
 * The installer for the platform the app is running on, or undefined when the release
 * has none. Deliberately no fallback to "whatever is first": handing a Windows user a
 * macOS archive is worse than sending them to the release page to choose.
 */
export function assetForPlatform(assets: ReleaseInfo['assets'], platform: 'electron' | 'capacitor' | 'browser') {
  if (platform === 'browser') return undefined
  const want = platform === 'capacitor' ? /\.apk$/i : /\.(exe|msi)$/i
  return assets.find((a) => want.test(a.name))
}

export const fmtBytes = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} KB`)
