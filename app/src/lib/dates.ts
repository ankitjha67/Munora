// Month-granular date math. Store dates are YYYY-MM-DD strings; month keys are YYYY-MM.

export interface DateRange {
  start: string // inclusive YYYY-MM-DD
  end: string // inclusive YYYY-MM-DD
}

export type PresetId =
  | 'this_month'
  | 'last_month'
  | 'last_3'
  | 'last_6'
  | 'ytd'
  | 'last_12'
  | 'all'
  | 'custom'

export const PRESETS: { id: PresetId; label: string }[] = [
  { id: 'this_month', label: 'This month' },
  { id: 'last_month', label: 'Last month' },
  { id: 'last_3', label: 'Last 3 months' },
  { id: 'last_6', label: 'Last 6 months' },
  { id: 'ytd', label: 'Year to date' },
  { id: 'last_12', label: 'Last 12 months' },
  { id: 'all', label: 'All time' },
  { id: 'custom', label: 'Custom' },
]

const pad = (n: number) => String(n).padStart(2, '0')

export function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export const monthKey = (dateISO: string) => dateISO.slice(0, 7)

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number)
  const total = y * 12 + (m - 1) + n
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  return `${ny}-${pad(nm)}`
}

export function monthDiff(a: string, b: string): number {
  const [ay, am] = a.split('-').map(Number)
  const [by, bm] = b.split('-').map(Number)
  return by * 12 + bm - (ay * 12 + am)
}

export const monthStartISO = (month: string) => `${month}-01`

export function monthEndISO(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const last = new Date(y, m, 0).getDate() // day 0 of next month = last day of this
  return `${month}-${pad(last)}`
}

export function eachMonth(from: string, to: string): string[] {
  const out: string[] = []
  let cur = from
  while (cur <= to) {
    out.push(cur)
    cur = addMonths(cur, 1)
  }
  return out
}

export function rangeMonths(range: DateRange): string[] {
  return eachMonth(monthKey(range.start), monthKey(range.end))
}

/** Whole months fully contained in the range (for "average per month" math). */
export function fullMonthsInRange(range: DateRange): number {
  const months = rangeMonths(range)
  let n = 0
  for (const m of months) {
    if (range.start <= monthStartISO(m) && monthEndISO(m) <= range.end) n++
  }
  return Math.max(1, n || 1)
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function monthLabel(month: string, withYear = true): string {
  const [y, m] = month.split('-').map(Number)
  return withYear ? `${MONTHS_SHORT[m - 1]} ${y}` : MONTHS_SHORT[m - 1]
}

export function rangeLabel(range: DateRange): string {
  const a = monthKey(range.start)
  const b = monthKey(range.end)
  if (a === b) return monthLabel(a)
  const [ay] = a.split('-')
  const [by] = b.split('-')
  if (ay === by) return `${monthLabel(a, false)} - ${monthLabel(b)}`
  return `${monthLabel(a)} - ${monthLabel(b)}`
}

/** Resolve a preset to a concrete range. `minDate` bounds "All time". */
export function presetRange(preset: PresetId, minDate?: string): DateRange {
  const today = todayISO()
  const thisMonth = monthKey(today)
  switch (preset) {
    case 'this_month':
      return { start: monthStartISO(thisMonth), end: monthEndISO(thisMonth) }
    case 'last_month': {
      const m = addMonths(thisMonth, -1)
      return { start: monthStartISO(m), end: monthEndISO(m) }
    }
    case 'last_3':
      return { start: monthStartISO(addMonths(thisMonth, -2)), end: monthEndISO(thisMonth) }
    case 'last_6':
      return { start: monthStartISO(addMonths(thisMonth, -5)), end: monthEndISO(thisMonth) }
    case 'ytd':
      return { start: `${thisMonth.slice(0, 4)}-01-01`, end: monthEndISO(thisMonth) }
    case 'last_12':
      return { start: monthStartISO(addMonths(thisMonth, -11)), end: monthEndISO(thisMonth) }
    case 'all':
      return { start: minDate ?? '2000-01-01', end: monthEndISO(thisMonth) }
    case 'custom':
      return { start: monthStartISO(addMonths(thisMonth, -11)), end: monthEndISO(thisMonth) }
  }
}

/** Shift a month-granular range backward/forward by its own length. */
export function shiftRange(range: DateRange, dir: -1 | 1): DateRange {
  const a = monthKey(range.start)
  const b = monthKey(range.end)
  const len = monthDiff(a, b) + 1
  const na = addMonths(a, dir * len)
  const nb = addMonths(b, dir * len)
  return { start: monthStartISO(na), end: monthEndISO(nb) }
}

export function clampRangeEndToToday(range: DateRange): DateRange {
  const today = todayISO()
  return range.end > monthEndISO(monthKey(today)) ? { ...range, end: monthEndISO(monthKey(today)) } : range
}
