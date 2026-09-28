// Minimal CSV parsing + date coercion for imports.

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  const pushCell = () => {
    row.push(cell)
    cell = ''
  }
  const pushRow = () => {
    if (row.length > 1 || (row.length === 1 && row[0].trim() !== '')) rows.push(row)
    row = []
  }
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i++
        } else inQuotes = false
      } else cell += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') pushCell()
    else if (c === '\n') {
      pushCell()
      pushRow()
    } else if (c !== '\r') cell += c
  }
  pushCell()
  pushRow()
  return rows
}

export type DateFormat = 'auto' | 'ymd' | 'dmy' | 'mdy'

const pad = (n: number) => String(n).padStart(2, '0')

/** Coerce a raw cell to YYYY-MM-DD, or null if unparseable. */
export function coerceDate(raw: string, format: DateFormat): string | null {
  const s = raw.trim()
  if (!s) return null
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (iso) return `${iso[1]}-${pad(+iso[2])}-${pad(+iso[3])}`
  const parts = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/)
  if (parts) {
    const a = +parts[1]
    const b = +parts[2]
    let y = +parts[3]
    if (y < 100) y += 2000
    let day: number, month: number
    if (format === 'dmy') {
      day = a
      month = b
    } else if (format === 'mdy') {
      month = a
      day = b
    } else {
      // auto: unambiguous when one part > 12
      if (a > 12) {
        day = a
        month = b
      } else if (b > 12) {
        month = a
        day = b
      } else {
        day = a
        month = b // default DD/MM
      }
    }
    if (month < 1 || month > 12 || day < 1 || day > 31) return null
    return `${y}-${pad(month)}-${pad(day)}`
  }
  const d = new Date(s) // "Sep 26, 2026" etc.
  if (!Number.isNaN(d.getTime())) return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  return null
}

export function coerceAmount(raw: string): number | null {
  const s = raw.replace(/[₹$€£,\s]/g, '').replace(/^\((.*)\)$/, '-$1')
  if (s === '' || s === '-') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}
