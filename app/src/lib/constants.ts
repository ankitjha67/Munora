export const APP_NAME = 'Nestworth'
export const APP_TAGLINE = 'Your whole household, one clear number'

/** Official repository releases are published to. Used as the default source for the
 * in-app update check so users get updates without configuring anything; overridable
 * in Settings for forks. */
export const DEFAULT_UPDATE_REPO = 'ankitjha67/Nestworth'

// Widely used currencies, so the base currency is not limited to a handful.
// Intl handles the symbol and grouping for each.
export const CURRENCIES = [
  'USD', 'EUR', 'GBP', 'INR', 'JPY', 'CNY', 'AUD', 'CAD', 'CHF', 'SGD', 'HKD', 'NZD',
  'AED', 'SAR', 'QAR', 'KWD', 'BHD', 'OMR', 'ILS', 'TRY',
  'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'RON', 'BGN', 'ISK', 'UAH',
  'BRL', 'MXN', 'ARS', 'CLP', 'COP', 'PEN', 'UYU',
  'ZAR', 'NGN', 'KES', 'EGP', 'GHS', 'TZS', 'UGX', 'MAD', 'DZD', 'TND',
  'KRW', 'TWD', 'THB', 'MYR', 'IDR', 'PHP', 'VND', 'BDT', 'PKR', 'LKR', 'NPR', 'MMK', 'KHR',
  'RUB', 'KZT', 'GEL', 'AMD', 'AZN', 'UZS',
] as const

/** Generic fallback labels, UI should prefer region-aware `accountTypeLabel()` from lib/terms. */
export const ACCOUNT_TYPE_LABEL: Record<string, string> = {
  checking: 'Checking',
  savings: 'Savings',
  cash: 'Cash',
  credit: 'Credit cards',
  investment: 'Investments',
  retirement: 'Retirement',
  real_estate: 'Real estate',
  loan: 'Loans',
}

/** Asset types contribute positive balances; liability types negative. */
export const ASSET_TYPES = ['checking', 'savings', 'cash', 'investment', 'retirement', 'real_estate'] as const
export const LIABILITY_TYPES = ['credit', 'loan'] as const

/** Chart palette (PRD §8), assigned to groups/series in order. */
export const PALETTE = [
  '#3B82F6', // blue
  '#F59E0B', // amber
  '#10B981', // green
  '#EC4899', // pink
  '#8B5CF6', // violet
  '#14B8A6', // teal
  '#EF4444', // red
  '#6366F1', // indigo
  '#84CC16', // lime
  '#F97316', // orange
  '#06B6D4', // cyan
  '#64748B', // slate
]

export const UNCATEGORIZED_COLOR = '#94A3B8'
export const INCOME_COLOR = '#16A34A'
export const ACCENT = '#4F46E5'

export const RELATIONSHIPS = ['Self', 'Spouse', 'Partner', 'Child', 'Parent', 'Other']

/** Distinct hues for profile avatars. */
export const PROFILE_COLORS = ['#4F46E5', '#0EA5E9', '#16A34A', '#DB2777', '#EA580C', '#7C3AED', '#0D9488', '#CA8A04']
