// Catalog of investment and account "vehicles" people use across regions.
// Each vehicle maps to one of the eight base account types and carries a display
// label plus the region it belongs to. Used by the Add Account picker and to
// label holdings more precisely than the base type (e.g. "PPF" vs "Retirement").

import type { AccountType } from './types'

export interface Vehicle {
  key: string
  label: string
  type: AccountType
  /** Home region. Vehicles outside the app's region still appear under "other regions"
   * in the picker, so someone in the US can still add, say, a Canadian RRSP. */
  region: 'US' | 'IN' | 'UK' | 'EU' | 'CA' | 'AU' | 'JP' | 'SG' | 'INTL'
  note?: string
}

export const VEHICLES: Vehicle[] = [
  // Everyday, global
  { key: 'checking', label: 'Checking / Current account', type: 'checking', region: 'INTL' },
  { key: 'savings', label: 'Savings account', type: 'savings', region: 'INTL' },
  { key: 'cash', label: 'Cash / Wallet', type: 'cash', region: 'INTL' },
  { key: 'credit_card', label: 'Credit card', type: 'credit', region: 'INTL' },
  { key: 'brokerage', label: 'Brokerage / Taxable', type: 'investment', region: 'INTL' },
  { key: 'stocks', label: 'Stocks / Shares', type: 'investment', region: 'INTL' },
  { key: 'etf', label: 'ETF', type: 'investment', region: 'INTL', note: 'Exchange-traded fund' },
  { key: 'index_fund', label: 'Index fund', type: 'investment', region: 'INTL' },
  { key: 'reit', label: 'REIT', type: 'investment', region: 'INTL', note: 'Real-estate investment trust' },
  { key: 'crypto', label: 'Crypto wallet / exchange', type: 'investment', region: 'INTL' },
  { key: 'bonds', label: 'Bonds', type: 'investment', region: 'INTL' },
  { key: 'money_market', label: 'Money-market fund', type: 'investment', region: 'INTL' },
  { key: 'precious_metal', label: 'Gold / Precious metals', type: 'investment', region: 'INTL' },
  { key: 'commodities', label: 'Commodities', type: 'investment', region: 'INTL' },
  { key: 'p2p', label: 'P2P lending', type: 'investment', region: 'INTL' },
  { key: 'private_equity', label: 'Private equity / Angel', type: 'investment', region: 'INTL' },
  { key: 'business_equity', label: 'Business ownership / Equity', type: 'investment', region: 'INTL' },
  { key: 'collectibles', label: 'Collectibles / Art', type: 'investment', region: 'INTL' },
  { key: 'real_estate', label: 'Real estate / Property', type: 'real_estate', region: 'INTL' },
  { key: 'vehicle_asset', label: 'Vehicle', type: 'real_estate', region: 'INTL' },
  { key: 'personal_loan', label: 'Personal loan', type: 'loan', region: 'INTL' },
  { key: 'mortgage', label: 'Mortgage / Home loan', type: 'loan', region: 'INTL' },
  { key: 'auto_loan', label: 'Auto loan', type: 'loan', region: 'INTL' },
  { key: 'student_loan', label: 'Student / Education loan', type: 'loan', region: 'INTL' },

  // United States
  { key: '401k', label: '401(k)', type: 'retirement', region: 'US' },
  { key: '403b', label: '403(b)', type: 'retirement', region: 'US' },
  { key: 'trad_ira', label: 'Traditional IRA', type: 'retirement', region: 'US' },
  { key: 'roth_ira', label: 'Roth IRA', type: 'retirement', region: 'US' },
  { key: 'sep_ira', label: 'SEP IRA', type: 'retirement', region: 'US', note: 'Self-employed' },
  { key: 'solo_401k', label: 'Solo 401(k)', type: 'retirement', region: 'US', note: 'Self-employed' },
  { key: 'hsa', label: 'HSA', type: 'investment', region: 'US', note: 'Health savings account' },
  { key: '529', label: '529 college plan', type: 'investment', region: 'US' },
  { key: 'i_bonds', label: 'Treasury / I Bonds', type: 'investment', region: 'US' },
  { key: 'espp', label: 'ESPP', type: 'investment', region: 'US', note: 'Employee stock purchase plan' },
  { key: 'rsu', label: 'RSUs / Equity comp', type: 'investment', region: 'US' },
  { key: 'cd_us', label: 'Certificate of Deposit (CD)', type: 'savings', region: 'US' },

  // India
  { key: 'epf', label: 'EPF (Provident Fund)', type: 'retirement', region: 'IN' },
  { key: 'ppf', label: 'PPF', type: 'retirement', region: 'IN' },
  { key: 'nps', label: 'NPS', type: 'retirement', region: 'IN' },
  { key: 'elss', label: 'ELSS (tax-saver MF)', type: 'investment', region: 'IN' },
  { key: 'mutual_fund_in', label: 'Mutual fund (SIP)', type: 'investment', region: 'IN' },
  { key: 'demat', label: 'Demat / Stocks', type: 'investment', region: 'IN' },
  { key: 'fd', label: 'Fixed deposit (FD)', type: 'savings', region: 'IN' },
  { key: 'rd', label: 'Recurring deposit (RD)', type: 'savings', region: 'IN' },
  { key: 'ssy', label: 'Sukanya Samriddhi (SSY)', type: 'investment', region: 'IN' },
  { key: 'sgb', label: 'Sovereign Gold Bond (SGB)', type: 'investment', region: 'IN' },
  { key: 'scss', label: 'Senior Citizens Savings (SCSS)', type: 'investment', region: 'IN' },

  // United Kingdom
  { key: 'isa', label: 'Stocks & Shares ISA', type: 'investment', region: 'UK' },
  { key: 'cash_isa', label: 'Cash ISA', type: 'savings', region: 'UK' },
  { key: 'lisa', label: 'Lifetime ISA (LISA)', type: 'investment', region: 'UK' },
  { key: 'sipp', label: 'SIPP / Pension', type: 'retirement', region: 'UK' },
  { key: 'workplace_pension', label: 'Workplace pension', type: 'retirement', region: 'UK' },
  { key: 'jisa', label: 'Junior ISA', type: 'investment', region: 'UK' },
  { key: 'premium_bonds', label: 'Premium Bonds', type: 'savings', region: 'UK' },
  { key: 'gilts', label: 'Gilts', type: 'investment', region: 'UK', note: 'UK government bonds' },
  { key: 'gia', label: 'General Investment Account', type: 'investment', region: 'UK' },

  // Canada
  { key: 'rrsp', label: 'RRSP', type: 'retirement', region: 'CA', note: 'Registered retirement savings' },
  { key: 'tfsa', label: 'TFSA', type: 'investment', region: 'CA', note: 'Tax-free savings account' },
  { key: 'resp', label: 'RESP', type: 'investment', region: 'CA', note: 'Education savings' },
  { key: 'fhsa', label: 'FHSA', type: 'investment', region: 'CA', note: 'First-home savings' },

  // Australia
  { key: 'super', label: 'Superannuation', type: 'retirement', region: 'AU' },
  { key: 'smsf', label: 'Self-managed super (SMSF)', type: 'retirement', region: 'AU' },
  { key: 'asx_shares', label: 'ASX shares', type: 'investment', region: 'AU' },

  // Europe
  { key: 'ucits_etf', label: 'UCITS ETF', type: 'investment', region: 'EU' },
  { key: 'private_pension_eu', label: 'Private pension', type: 'retirement', region: 'EU' },
  { key: 'pea', label: 'PEA (France)', type: 'investment', region: 'EU', note: 'Equity savings plan' },
  { key: 'assurance_vie', label: 'Assurance-vie (France)', type: 'investment', region: 'EU' },
  { key: 'riester', label: 'Riester pension (Germany)', type: 'retirement', region: 'EU' },

  // Japan
  { key: 'nisa', label: 'NISA', type: 'investment', region: 'JP' },
  { key: 'ideco', label: 'iDeCo', type: 'retirement', region: 'JP' },

  // Singapore
  { key: 'cpf', label: 'CPF', type: 'retirement', region: 'SG', note: 'Central Provident Fund' },
  { key: 'srs', label: 'SRS', type: 'retirement', region: 'SG', note: 'Supplementary Retirement Scheme' },

  // Insurance used as an investment / savings vehicle.
  // Only policies that build cash value, a surrender value or a maturity benefit
  // belong here, since those carry a balance that counts toward net worth. Pure
  // protection cover (term life, health, motor) has no investment value and is a
  // recurring expense, not an account, so it is deliberately not listed.
  { key: 'whole_life', label: 'Whole life insurance (cash value)', type: 'investment', region: 'INTL', note: 'Permanent cover with a surrender/cash value' },
  { key: 'universal_life', label: 'Universal / Variable life', type: 'investment', region: 'INTL', note: 'Flexible-premium permanent cover with an investment account' },
  { key: 'endowment', label: 'Endowment policy', type: 'investment', region: 'INTL', note: 'Savings policy paying a lump sum at maturity' },
  { key: 'annuity', label: 'Annuity', type: 'retirement', region: 'INTL', note: 'Pays a guaranteed income, usually in retirement' },
  { key: 'ulip', label: 'ULIP (unit-linked plan)', type: 'investment', region: 'IN', note: 'Insurance plus market-linked funds' },
  { key: 'lic_endowment', label: 'LIC / traditional endowment plan', type: 'investment', region: 'IN', note: 'Guaranteed-return savings policy' },
  { key: 'money_back', label: 'Money-back policy', type: 'investment', region: 'IN', note: 'Periodic survival benefits plus maturity' },
  { key: 'guaranteed_income_in', label: 'Guaranteed income / savings plan', type: 'investment', region: 'IN' },
  { key: 'pension_plan_in', label: 'Insurance pension / annuity plan', type: 'retirement', region: 'IN' },
  { key: 'iul', label: 'Indexed universal life (IUL)', type: 'investment', region: 'US', note: 'Cash value tracked to an index' },
  { key: 'fixed_annuity_us', label: 'Fixed / variable annuity', type: 'retirement', region: 'US' },
  { key: 'with_profits', label: 'With-profits / investment bond', type: 'investment', region: 'UK', note: 'Life-company investment bond' },
  { key: 'uk_endowment', label: 'Endowment (mortgage-linked)', type: 'investment', region: 'UK' },
]

const byKey = new Map(VEHICLES.map((v) => [v.key, v]))

export function vehicle(key?: string): Vehicle | undefined {
  return key ? byKey.get(key) : undefined
}

export function vehicleLabel(key?: string): string | undefined {
  return vehicle(key)?.label
}

/** Vehicles offered in the Add Account picker: the region first, then the rest. */
export function vehiclesForRegion(region: string): { region: Vehicle[]; other: Vehicle[] } {
  const inRegion = VEHICLES.filter((v) => v.region === region)
  const intl = VEHICLES.filter((v) => v.region === 'INTL')
  const rest = VEHICLES.filter((v) => v.region !== region && v.region !== 'INTL')
  return { region: [...intl, ...inRegion], other: rest }
}
