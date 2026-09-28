// Regional finance terminology. The same concept goes by different names around
// the world (Checking ↔ Current account, Monthly payment ↔ EMI, 401(k) ↔ EPF/NPS).
// Region is set once from settings (module state, like format.ts).

export type Region = 'US' | 'IN' | 'UK' | 'INTL'

export const REGIONS: { id: Region; label: string }[] = [
  { id: 'US', label: 'United States' },
  { id: 'IN', label: 'India' },
  { id: 'UK', label: 'United Kingdom' },
  { id: 'INTL', label: 'International (generic)' },
]

let region: Region = 'US'

export function setRegion(r?: string) {
  region = r === 'IN' || r === 'UK' || r === 'INTL' ? r : 'US'
}

export function getRegion(): Region {
  return region
}

type TermKey =
  | 'checking'
  | 'savings'
  | 'cash'
  | 'credit'
  | 'investment'
  | 'retirement'
  | 'real_estate'
  | 'loan'
  | 'monthlyPayment'
  | 'paycheckHint'

const TERMS: Record<Region, Record<TermKey, string>> = {
  US: {
    checking: 'Checking',
    savings: 'Savings',
    cash: 'Cash',
    credit: 'Credit cards',
    investment: 'Investments',
    retirement: 'Retirement (401k · IRA)',
    real_estate: 'Real estate',
    loan: 'Loans',
    monthlyPayment: 'Monthly payment',
    paycheckHint: 'Paycheck',
  },
  IN: {
    checking: 'Current accounts',
    savings: 'Savings accounts',
    cash: 'Cash',
    credit: 'Credit cards',
    investment: 'Investments (Demat · MF)',
    retirement: 'Retirement (EPF · PPF · NPS)',
    real_estate: 'Property',
    loan: 'Loans',
    monthlyPayment: 'EMI',
    paycheckHint: 'Salary',
  },
  UK: {
    checking: 'Current accounts',
    savings: 'Savings',
    cash: 'Cash',
    credit: 'Credit cards',
    investment: 'Investments (ISA · GIA)',
    retirement: 'Pensions',
    real_estate: 'Property',
    loan: 'Loans',
    monthlyPayment: 'Monthly repayment',
    paycheckHint: 'Salary',
  },
  INTL: {
    checking: 'Current accounts',
    savings: 'Savings',
    cash: 'Cash',
    credit: 'Credit cards',
    investment: 'Investments',
    retirement: 'Retirement',
    real_estate: 'Property',
    loan: 'Loans',
    monthlyPayment: 'Monthly payment',
    paycheckHint: 'Salary',
  },
}

export function term(key: TermKey): string {
  return TERMS[region][key]
}

/** Region-aware account-type label (replaces the static ACCOUNT_TYPE_LABEL for UI). */
export function accountTypeLabel(type: string): string {
  const k = type as TermKey
  return TERMS[region][k] ?? type
}

/** Cross-regional glossary shown in Settings, concept per row. */
export const GLOSSARY: { concept: string; us: string; uk: string; in_: string }[] = [
  { concept: 'Everyday bank account', us: 'Checking account', uk: 'Current account', in_: 'Savings / Current account' },
  { concept: 'Monthly loan payment', us: 'Monthly payment', uk: 'Monthly repayment', in_: 'EMI (Equated Monthly Instalment)' },
  { concept: 'Employer retirement plan', us: '401(k) / 403(b)', uk: 'Workplace pension', in_: 'EPF (Provident Fund) / NPS' },
  { concept: 'Personal retirement account', us: 'IRA / Roth IRA', uk: 'SIPP', in_: 'PPF / NPS Tier-1' },
  { concept: 'Tax-advantaged investing', us: 'Roth / HSA', uk: 'ISA', in_: 'ELSS (80C) / PPF' },
  { concept: 'Fixed-term bank deposit', us: 'Certificate of Deposit (CD)', uk: 'Fixed-rate bond', in_: 'Fixed Deposit (FD)' },
  { concept: 'Recurring fund investing', us: 'Automatic investment plan', uk: 'Regular saver', in_: 'SIP (Systematic Investment Plan)' },
  { concept: 'Securities holding account', us: 'Brokerage account', uk: 'GIA / Share dealing', in_: 'Demat account' },
  { concept: 'Salary income', us: 'Paycheck', uk: 'Salary / Payslip', in_: 'Salary (CTC = total comp)' },
  { concept: 'Credit score body', us: 'FICO (Equifax/Experian/TransUnion)', uk: 'Experian / Equifax', in_: 'CIBIL score' },
  { concept: 'Tax ID', us: 'SSN / TIN', uk: 'NI number / UTR', in_: 'PAN' },
  { concept: 'Large number shorthand', us: 'k / M (thousand / million)', uk: 'k / M', in_: 'Lakh (1,00,000) / Crore (1,00,00,000)' },
]
