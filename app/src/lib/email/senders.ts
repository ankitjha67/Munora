// Registry of bank and card email senders, used to recognize statement and
// transaction-alert emails and label the issuer. Matching is on the From
// address/domain (and subject as a fallback). Extend freely.

export interface EmailSender {
  issuer: string
  region: 'US' | 'IN' | 'UK' | 'INTL'
  kind: 'card' | 'bank'
  from: RegExp
}

export const EMAIL_SENDERS: EmailSender[] = [
  // India
  { issuer: 'HDFC Bank', region: 'IN', kind: 'bank', from: /hdfcbank|@hdfc/i },
  { issuer: 'HDFC Bank Card', region: 'IN', kind: 'card', from: /hdfcbank\.net|infoalerts@hdfc/i },
  { issuer: 'ICICI Bank', region: 'IN', kind: 'bank', from: /icicibank|@icici/i },
  { issuer: 'State Bank of India', region: 'IN', kind: 'bank', from: /@sbi\.co\.in|onlinesbi/i },
  { issuer: 'SBI Card', region: 'IN', kind: 'card', from: /sbicard/i },
  { issuer: 'Axis Bank', region: 'IN', kind: 'bank', from: /axisbank/i },
  { issuer: 'Kotak', region: 'IN', kind: 'bank', from: /kotak/i },
  { issuer: 'IDFC FIRST', region: 'IN', kind: 'bank', from: /idfcfirstbank|idfc/i },
  { issuer: 'American Express', region: 'IN', kind: 'card', from: /americanexpress|aexp/i },
  { issuer: 'Paytm', region: 'IN', kind: 'bank', from: /paytm/i },
  { issuer: 'PhonePe', region: 'IN', kind: 'bank', from: /phonepe/i },

  // United States
  { issuer: 'Chase', region: 'US', kind: 'bank', from: /chase\.com|jpmchase|jpmorgan/i },
  { issuer: 'American Express', region: 'US', kind: 'card', from: /americanexpress|aexp/i },
  { issuer: 'Citi', region: 'US', kind: 'card', from: /citi\.com|citibank|citicards/i },
  { issuer: 'Capital One', region: 'US', kind: 'card', from: /capitalone/i },
  { issuer: 'Discover', region: 'US', kind: 'card', from: /discover\.com/i },
  { issuer: 'Bank of America', region: 'US', kind: 'bank', from: /bankofamerica|bofa/i },
  { issuer: 'Wells Fargo', region: 'US', kind: 'bank', from: /wellsfargo/i },
  { issuer: 'US Bank', region: 'US', kind: 'bank', from: /usbank/i },

  // United Kingdom
  { issuer: 'Barclays', region: 'UK', kind: 'bank', from: /barclays/i },
  { issuer: 'HSBC', region: 'UK', kind: 'bank', from: /hsbc/i },
  { issuer: 'Lloyds', region: 'UK', kind: 'bank', from: /lloyds/i },
  { issuer: 'Monzo', region: 'UK', kind: 'bank', from: /monzo/i },
  { issuer: 'Revolut', region: 'INTL', kind: 'bank', from: /revolut/i },
  { issuer: 'Nationwide', region: 'UK', kind: 'bank', from: /nationwide/i },
]

const STATEMENT_SUBJECT = /statement|e-?statement|bill|amount due|payment due|account summary|monthly statement/i
const ALERT_SUBJECT = /transaction alert|spent|debited|credited|purchase|payment received|debit alert|credit alert|txn/i

export function detectIssuer(from: string, subject = ''): EmailSender | undefined {
  const hay = `${from}`
  const hit = EMAIL_SENDERS.find((s) => s.from.test(hay))
  if (hit) return hit
  // fall back to subject-only guesses for forwarded mail where From is the user
  const sub = `${from} ${subject}`
  return EMAIL_SENDERS.find((s) => s.from.test(sub))
}

export function looksLikeStatement(subject: string): boolean {
  return STATEMENT_SUBJECT.test(subject)
}
export function looksLikeAlert(subject: string): boolean {
  return ALERT_SUBJECT.test(subject)
}

/** IMAP search terms: OR of known sender domains, to fetch only finance mail. */
export function senderSearchDomains(): string[] {
  return [
    'hdfcbank',
    'icicibank',
    'sbi',
    'sbicard',
    'axisbank',
    'kotak',
    'idfcfirstbank',
    'americanexpress',
    'aexp',
    'chase.com',
    'citi',
    'capitalone',
    'discover.com',
    'bankofamerica',
    'wellsfargo',
    'usbank',
    'barclays',
    'hsbc',
    'lloyds',
    'monzo',
    'revolut',
    'paytm',
    'phonepe',
  ]
}
