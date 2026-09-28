// Store schema, schemaVersion 2.
// Amount convention everywhere: NEGATIVE = money out, POSITIVE = money in.

export type AccountType =
  | 'checking'
  | 'savings'
  | 'cash'
  | 'credit'
  | 'investment'
  | 'retirement'
  | 'real_estate'
  | 'loan'

/** Balance at the END of `month` (YYYY-MM). Used by valued (non-transactional) accounts. */
export interface BalancePoint {
  month: string
  balance: number
}

export interface Account {
  id: string
  name: string
  type: AccountType
  /** Optional vehicle key from lib/vehicles (e.g. 'ppf', 'roth_ira', 'isa'). Refines type for display. */
  subtype?: string
  /** Which person owns this account. Unset = the default profile. */
  profileId?: string
  institution?: string
  mask?: string
  openingBalance: number
  openingDate: string // YYYY-MM-DD
  interestRate?: number // annual %, for loans/savings display
  originalPrincipal?: number // loans
  hidden?: boolean
  /** ISO 4217 code. Unset = the base currency in settings. All the account's amounts are in this currency. */
  currency?: string
  /** Valued accounts (investment/retirement/real_estate/loan) track month-end balances here. */
  balanceHistory?: BalancePoint[]
}

export interface CategoryGroup {
  id: string
  name: string
  kind: 'income' | 'expense'
  color: string
  /** Set when this group belongs to a property page (e.g. "412 Maple St"). */
  propertyId?: string
}

export interface Category {
  id: string
  groupId: string
  name: string
  emoji?: string
}

export interface Tag {
  id: string
  name: string
}

export type AreaUnit = 'sqft' | 'sqm' | 'sqyd'

export interface Property {
  id: string
  name: string
  profileId?: string
  valuationAccountId?: string
  mortgageAccountId?: string
  incomeCategoryId?: string
  expenseGroupId?: string
  /** What it cost, so appreciation and CAGR can be measured against it. */
  purchasePrice?: number
  purchaseDate?: string // YYYY-MM-DD
  /** Size and location, used by the rate-per-area calculator and the AI estimate. */
  area?: number
  areaUnit?: AreaUnit
  locality?: string
  city?: string
  /** Last rate per unit area used for a valuation (circle/market rate). */
  lastRatePerArea?: number
}

export interface Split {
  id: string
  amount: number
  categoryId?: string
  notes?: string
}

export interface Transaction {
  id: string
  date: string // YYYY-MM-DD
  merchant: string
  notes?: string
  amount: number // negative = outflow
  accountId: string
  categoryId?: string
  tagIds?: string[]
  needsReview?: boolean
  hidden?: boolean
  /** Transfers between own accounts, excluded from income/spending analytics. */
  transfer?: boolean
  /** When present, splits replace the parent's category for analytics; must sum to amount. */
  splits?: Split[]
}

/** A person whose accounts roll up under their name. */
export interface Profile {
  id: string
  name: string
  color: string
  relationship?: string // Self, Spouse, Partner, Child, Parent, Other
}

/** A group of profiles whose totals combine (a family). */
export interface Household {
  id: string
  name: string
  profileIds: string[]
}

/** A learned rule that categorizes and renames imported transactions. */
export interface ImportRule {
  id: string
  /** Lower-cased substring matched against the raw statement description. */
  match: string
  categoryId?: string
  /** Canonical merchant name to display instead of the raw description. */
  merchant?: string
  createdAt: number
}

export interface LlmConfig {
  /** A provider key from lib/llmProviders, or 'none'. */
  provider: string
  /** Wire protocol; only needed to override a custom provider. */
  api?: 'openai' | 'anthropic' | 'ollama'
  baseUrl?: string // override the provider default
  model?: string
  apiKey?: string // bring-your-own key (stored locally only)
}

export interface Settings {
  /** Base currency: every aggregate (spending, cash flow, net worth) is reported in this. */
  currencyCode: string
  locale?: string
  appName?: string
  onboarded?: boolean
  /** Convert every per-account amount into `currencyCode` for display, so the whole
   * app reads in one currency. Off = each account shows its own currency. */
  displayInBase?: boolean
  /** Annual inflation %, as a fraction. Auto-filled from live data, editable. */
  inflationRate?: number
  /** Regional finance terminology (labels like Checking vs Current account, EMI, lakh/crore). */
  region?: 'US' | 'IN' | 'UK' | 'INTL'
  theme?: 'light' | 'dark' | 'system'
  llm?: LlmConfig
  /** Planning inputs (FIRE / retirement projection). */
  currentAge?: number
  fireWithdrawalRate?: number // default 0.04
  expectedReturn?: number // annual real return, default 0.05
  fireMonthlyExpenses?: number // override for target spend; else derived
  /** GitHub repository ("owner/repo") releases are published to, for update checks. */
  updateRepo?: string
  /** Check for a new release on launch. Off by default: this is the only request the
   * app makes that the user did not configure. */
  autoCheckUpdates?: boolean
  /** Release version the user chose to ignore, so they are not asked again. */
  skippedVersion?: string
  /** Candidate passwords tried when opening protected statement PDFs. */
  statementPasswords?: string[]
  /** IMAP mailbox for automatic email statement import (desktop only). */
  emailInbox?: EmailInboxConfig
}

export interface EmailInboxConfig {
  host: string
  port: number
  secure: boolean
  user: string
  password?: string
  sinceDays?: number
}

/** Cached live FX rates. rates[C] = units of C per 1 pivot (USD). */
export interface FxTable {
  pivot: 'USD'
  rates: Record<string, number>
  fetchedAt: number
  source?: string
}

export interface InvestingState {
  /** AMFI scheme codes pinned by the user. */
  mfWatchlist: number[]
}

/** A mutual fund earmarked for a plan, with what the user has put into it. */
export interface PlanFund {
  /** AMFI scheme code. */
  code: number
  name?: string
  /** Amount invested so far, in the base currency. */
  invested: number
  /** Units held. When set, current value is marked to the live NAV. */
  units?: number
}

export type PlanKind = 'retirement' | 'education' | 'home' | 'vehicle' | 'travel' | 'emergency' | 'wealth' | 'other'

/**
 * A goal the household is saving towards, funded by any mix of existing accounts
 * and specific mutual funds. Progress is measured against the live value of those.
 */
export interface Plan {
  id: string
  name: string
  kind: PlanKind
  targetAmount: number
  /** YYYY-MM the money is needed by. */
  targetDate?: string
  monthlyContribution?: number
  /** Expected annual return as a fraction, e.g. 0.08. Falls back to settings. */
  expectedReturn?: number
  /** Treat targetAmount as today's money and grow it by inflation to the target
   * date, so the goal keeps its real purchasing power. */
  inflateTarget?: boolean
  /** Accounts whose balances count towards this goal. */
  accountIds: string[]
  funds: PlanFund[]
  /** Whose goal this is. Unset = the whole household. */
  profileId?: string
  notes?: string
  createdAt: number
}

export interface Store {
  schemaVersion: 2
  settings: Settings
  profiles: Profile[]
  households: Household[]
  accounts: Account[]
  categoryGroups: CategoryGroup[]
  categories: Category[]
  tags: Tag[]
  properties: Property[]
  transactions: Transaction[]
  importRules: ImportRule[]
  investing?: InvestingState
  /** Goal-based plans. Optional so older stores load unchanged. */
  plans?: Plan[]
  fx?: FxTable
}

export const DEFAULT_PROFILE_ID = 'prof_self'

export function emptyStore(): Store {
  return {
    schemaVersion: 2,
    settings: { currencyCode: 'USD', onboarded: true, region: 'US', theme: 'system' },
    profiles: [{ id: DEFAULT_PROFILE_ID, name: 'You', color: '#4F46E5', relationship: 'Self' }],
    households: [],
    accounts: [],
    categoryGroups: [],
    categories: [],
    tags: [],
    properties: [],
    transactions: [],
    importRules: [],
  }
}
