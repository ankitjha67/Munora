// Deterministic demo household. Mirrors the reference screenshots' shape:
// two earners, a primary home (1418 Linden Ave), a rental (412 Maple St),
// ~21 months of history ending today, ≈$790k net worth.

import type { Account, BalancePoint, Category, CategoryGroup, Store, Transaction } from './types'
import { addMonths, eachMonth, monthEndISO, monthKey, todayISO } from './dates'
import { seedFxTable } from './fx'

// ---------- deterministic RNG ----------
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const rnd = mulberry32(20260927)
const between = (a: number, b: number) => a + rnd() * (b - a)
const money = (a: number, b: number) => Math.round(between(a, b) * 100) / 100
const int = (a: number, b: number) => Math.floor(between(a, b + 0.999))
const pick = <T,>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)]
const chance = (p: number) => rnd() < p

let txSeq = 0
const txId = () => `txn_${(++txSeq).toString(36).padStart(5, '0')}`

const pad = (n: number) => String(n).padStart(2, '0')
const dateOf = (month: string, day: number) => {
  const end = Number(monthEndISO(month).slice(8))
  return `${month}-${pad(Math.min(day, end))}`
}

export function buildDemoStore(): Store {
  const today = todayISO()
  const thisMonth = monthKey(today)
  const months = eachMonth('2025-01', thisMonth)

  // ---------- accounts ----------
  const accounts: Account[] = [
    { id: 'acc_checking', name: 'Joint Checking', type: 'checking', institution: 'Chase', mask: '4821', openingBalance: 9200, openingDate: '2025-01-01' },
    { id: 'acc_savings', name: 'High-Yield Savings', type: 'savings', institution: 'Marcus', mask: '3308', openingBalance: 30000, openingDate: '2025-01-01', interestRate: 3.9 },
    { id: 'acc_nre', name: 'NRE Savings (India)', type: 'savings', institution: 'State Bank of India', mask: '7702', currency: 'INR', openingBalance: 1250000, openingDate: '2025-01-01', interestRate: 6.5 },
    { id: 'acc_bluecash', name: 'Blue Cash Card', type: 'credit', institution: 'American Express', mask: '1007', openingBalance: -1450, openingDate: '2025-01-01' },
    { id: 'acc_sapphire', name: 'Sapphire Preferred', type: 'credit', institution: 'Chase', mask: '6614', openingBalance: -1980, openingDate: '2025-01-01' },
    { id: 'acc_brokerage', name: 'Brokerage', type: 'investment', institution: 'Vanguard', mask: '2250', openingBalance: 92000, openingDate: '2025-01-01' },
    { id: 'acc_401k_a', name: '401(k), Alex', type: 'retirement', institution: 'Fidelity', mask: '9034', openingBalance: 160000, openingDate: '2025-01-01' },
    { id: 'acc_401k_j', name: '401(k), Jordan', type: 'retirement', institution: 'Vanguard', mask: '7719', openingBalance: 104000, openingDate: '2025-01-01' },
    { id: 'acc_roth', name: 'Roth IRA', type: 'retirement', institution: 'Fidelity', mask: '5127', openingBalance: 46000, openingDate: '2025-01-01' },
    { id: 'acc_linden', name: '1418 Linden Ave', type: 'real_estate', institution: 'Zestimate', openingBalance: 492000, openingDate: '2025-01-01' },
    { id: 'acc_maple', name: '412 Maple St', type: 'real_estate', institution: 'Zestimate', openingBalance: 296000, openingDate: '2025-01-01' },
    { id: 'acc_mort_linden', name: 'Mortgage · 1418 Linden Ave', type: 'loan', institution: 'Rocket Mortgage', mask: '0092', openingBalance: -356500, openingDate: '2025-01-01', interestRate: 5.1, originalPrincipal: 396000 },
    { id: 'acc_mort_maple', name: 'Mortgage · 412 Maple St', type: 'loan', institution: 'Chase Home Lending', mask: '4410', openingBalance: -205000, openingDate: '2025-01-01', interestRate: 6.3, originalPrincipal: 228000 },
    { id: 'acc_auto', name: 'Auto Loan, RAV4', type: 'loan', institution: 'Toyota Financial', mask: '8823', openingBalance: -23000, openingDate: '2025-01-01', interestRate: 6.9, originalPrincipal: 32000 },
    { id: 'acc_student', name: 'Student Loan', type: 'loan', institution: 'Nelnet', mask: '3345', openingBalance: -52000, openingDate: '2025-01-01', interestRate: 4.8, originalPrincipal: 68000 },
    { id: 'acc_529', name: '529 College Fund', type: 'investment', institution: 'Fidelity', mask: '5290', openingBalance: 18000, openingDate: '2025-01-01' },
  ]

  // ---------- categories ----------
  const groups: CategoryGroup[] = [
    { id: 'grp_income', name: 'Income', kind: 'income', color: '#2F9E44' },
    { id: 'grp_food', name: 'Food & Dining', kind: 'expense', color: '#F59E0B' },
    { id: 'grp_bills', name: 'Bills', kind: 'expense', color: '#10B981' },
    { id: 'grp_transport', name: 'Transportation', kind: 'expense', color: '#EC4899' },
    { id: 'grp_shopping', name: 'Shopping', kind: 'expense', color: '#8B5CF6' },
    { id: 'grp_kids', name: 'Kids', kind: 'expense', color: '#14B8A6' },
    { id: 'grp_health', name: 'Health', kind: 'expense', color: '#EF4444' },
    { id: 'grp_travel', name: 'Travel', kind: 'expense', color: '#06B6D4' },
    { id: 'grp_lifestyle', name: 'Lifestyle', kind: 'expense', color: '#64748B' },
    { id: 'grp_linden', name: '1418 Linden Ave', kind: 'expense', color: '#3B82F6', propertyId: 'prp_linden' },
    { id: 'grp_maple', name: '412 Maple St', kind: 'expense', color: '#6366F1', propertyId: 'prp_maple' },
  ]

  const cat = (id: string, groupId: string, name: string): Category => ({ id, groupId, name })
  const categories: Category[] = [
    cat('cat_paychecks', 'grp_income', 'Paychecks'),
    cat('cat_rent_maple', 'grp_income', 'Rent · 412 Maple St'),
    cat('cat_other_income', 'grp_income', 'Other income'),
    cat('cat_interest', 'grp_income', 'Interest'),
    cat('cat_groceries', 'grp_food', 'Groceries'),
    cat('cat_restaurants', 'grp_food', 'Restaurants'),
    cat('cat_coffee', 'grp_food', 'Coffee shops'),
    cat('cat_utilities', 'grp_bills', 'Utilities'),
    cat('cat_internet', 'grp_bills', 'Internet'),
    cat('cat_phone', 'grp_bills', 'Phone'),
    cat('cat_insurance', 'grp_bills', 'Insurance'),
    cat('cat_student_loan', 'grp_bills', 'Student loan'),
    cat('cat_gas', 'grp_transport', 'Gas'),
    cat('cat_auto_loan', 'grp_transport', 'Auto loan'),
    cat('cat_parking', 'grp_transport', 'Parking & tolls'),
    cat('cat_rideshare', 'grp_transport', 'Rideshare'),
    cat('cat_household', 'grp_shopping', 'Household'),
    cat('cat_clothing', 'grp_shopping', 'Clothing'),
    cat('cat_electronics', 'grp_shopping', 'Electronics'),
    cat('cat_childcare', 'grp_kids', 'Childcare'),
    cat('cat_kids_activities', 'grp_kids', 'Kids activities'),
    cat('cat_medical', 'grp_health', 'Medical'),
    cat('cat_pharmacy', 'grp_health', 'Pharmacy'),
    cat('cat_fitness', 'grp_health', 'Fitness'),
    cat('cat_flights', 'grp_travel', 'Flights'),
    cat('cat_hotels', 'grp_travel', 'Hotels & stays'),
    cat('cat_vacation', 'grp_travel', 'Vacation spending'),
    cat('cat_entertainment', 'grp_lifestyle', 'Entertainment'),
    cat('cat_subscriptions', 'grp_lifestyle', 'Subscriptions'),
    cat('cat_personal', 'grp_lifestyle', 'Personal care'),
    cat('cat_gifts', 'grp_lifestyle', 'Gifts'),
    cat('cat_mort_linden', 'grp_linden', 'Mortgage'),
    cat('cat_maint_linden', 'grp_linden', 'Home maintenance'),
    cat('cat_tax_linden', 'grp_linden', 'Property tax'),
    cat('cat_mort_maple', 'grp_maple', 'Mortgage'),
    cat('cat_repairs_maple', 'grp_maple', 'Repairs'),
    cat('cat_mgmt_maple', 'grp_maple', 'Property management'),
    cat('cat_ins_maple', 'grp_maple', 'Landlord insurance'),
  ]

  const tags = [
    { id: 'tag_reimbursable', name: 'Reimbursable' },
    { id: 'tag_tax', name: 'Tax deductible' },
    { id: 'tag_vacation26', name: 'Summer trip 2026' },
  ]

  const properties = [
    { id: 'prp_linden', name: '1418 Linden Ave', valuationAccountId: 'acc_linden', mortgageAccountId: 'acc_mort_linden', expenseGroupId: 'grp_linden' },
    { id: 'prp_maple', name: '412 Maple St', valuationAccountId: 'acc_maple', mortgageAccountId: 'acc_mort_maple', incomeCategoryId: 'cat_rent_maple', expenseGroupId: 'grp_maple' },
  ]

  // ---------- transactions ----------
  const txns: Transaction[] = []
  const add = (t: Omit<Transaction, 'id'>) => {
    if (t.date > today) return
    txns.push({ id: txId(), ...t })
  }

  let prevBlueSpend = 1450 // becomes this month's payment on each card
  let prevSapphireSpend = 1980
  let checkingBal = 9200
  let savingsBal = 30000

  const onChecking = (t: Omit<Transaction, 'id' | 'accountId'>) => {
    add({ ...t, accountId: 'acc_checking' })
    if (t.date <= today) checkingBal += t.amount
  }

  for (const m of months) {
    const mi = months.indexOf(m)

    // --- income (checking) ---
    for (const day of [1, 15]) {
      onChecking({ date: dateOf(m, day), merchant: 'Acme Corp Payroll', amount: money(3680, 3760), categoryId: 'cat_paychecks' })
      onChecking({ date: dateOf(m, day), merchant: 'Northwind Payroll', amount: money(2795, 2865), categoryId: 'cat_paychecks' })
    }
    onChecking({ date: dateOf(m, 3), merchant: 'Tenant · 412 Maple St', amount: 1850, categoryId: 'cat_rent_maple' })
    {
      const interest = Math.round(savingsBal * (0.039 / 12) * 100) / 100
      add({ date: dateOf(m, int(25, 28)), merchant: 'Marcus Interest', amount: interest, categoryId: 'cat_interest', accountId: 'acc_savings' })
      savingsBal += interest
    }
    if (m.endsWith('-04')) onChecking({ date: dateOf(m, 14), merchant: 'IRS Tax Refund', amount: money(900, 1600), categoryId: 'cat_other_income' })
    if (chance(0.3)) onChecking({ date: dateOf(m, int(5, 25)), merchant: pick(['Venmo', 'Facebook Marketplace', 'eBay payout']), amount: money(40, 260), categoryId: 'cat_other_income' })

    // --- fixed bills (checking) ---
    onChecking({ date: dateOf(m, 1), merchant: 'Rocket Mortgage', amount: -2684.42, categoryId: 'cat_mort_linden' })
    onChecking({ date: dateOf(m, 1), merchant: 'Chase Home Lending', amount: -1478.19, categoryId: 'cat_mort_maple' })
    onChecking({ date: dateOf(m, 5), merchant: 'Toyota Financial', amount: -521.36, categoryId: 'cat_auto_loan' })
    onChecking({ date: dateOf(m, 8), merchant: 'Nelnet', amount: -412.5, categoryId: 'cat_student_loan' })
    onChecking({ date: dateOf(m, int(2, 4)), merchant: 'Bright Horizons', amount: -1450, categoryId: 'cat_childcare' })
    const season = Math.cos(((Number(m.slice(5)) - 1) / 12) * 2 * Math.PI) // winter high
    onChecking({ date: dateOf(m, int(10, 14)), merchant: 'ConEd', amount: -money(150 + 60 * season + 10, 190 + 60 * season + 10), categoryId: 'cat_utilities' })
    onChecking({ date: dateOf(m, 16), merchant: 'Comcast Xfinity', amount: -79.99, categoryId: 'cat_internet' })
    onChecking({ date: dateOf(m, 19), merchant: 'T-Mobile', amount: -128.0, categoryId: 'cat_phone' })
    onChecking({ date: dateOf(m, 21), merchant: 'State Farm', amount: -166.4, categoryId: 'cat_insurance' })
    onChecking({ date: dateOf(m, 6), merchant: 'Bay Property Management', amount: -148.0, categoryId: 'cat_mgmt_maple' })
    onChecking({ date: dateOf(m, 24), merchant: 'Steadily Insurance', amount: -61.75, categoryId: 'cat_ins_maple' })

    // property tax twice a year
    if (m.endsWith('-04') || m.endsWith('-10')) {
      onChecking({ date: dateOf(m, 12), merchant: 'County Tax Collector', amount: -3890, categoryId: 'cat_tax_linden', tagIds: ['tag_tax'] })
      onChecking({ date: dateOf(m, 12), merchant: 'County Tax Collector', amount: -2340, categoryId: 'cat_tax_maple' as never, tagIds: ['tag_tax'] })
    }

    // --- card spending ---
    let blue = 0
    let sapphire = 0
    const onCard = (card: 'acc_bluecash' | 'acc_sapphire', t: Omit<Transaction, 'id' | 'accountId'>) => {
      add({ ...t, accountId: card })
      if (t.date <= today) {
        if (card === 'acc_bluecash') blue += -t.amount
        else sapphire += -t.amount
      }
    }

    // groceries (blue cash)
    for (let i = 0, n = int(6, 9); i < n; i++) {
      const [merchant, lo, hi] = pick<[string, number, number]>([
        ['Trader Joe\'s', 38, 128], ['Whole Foods', 52, 145], ['Safeway', 45, 160], ['Costco', 165, 290],
      ])
      onCard('acc_bluecash', { date: dateOf(m, int(1, 28)), merchant, amount: -money(lo, hi), categoryId: 'cat_groceries' })
    }
    // restaurants & coffee
    for (let i = 0, n = int(4, 7); i < n; i++) {
      const [merchant, lo, hi] = pick<[string, number, number]>([
        ['Chipotle', 22, 44], ['Sweetgreen', 16, 34], ['DoorDash', 38, 82], ['Olive & Vine', 68, 140], ['Pho Saigon', 32, 58],
      ])
      onCard('acc_sapphire', { date: dateOf(m, int(1, 28)), merchant, amount: -money(lo, hi), categoryId: 'cat_restaurants' })
    }
    for (let i = 0, n = int(3, 5); i < n; i++) {
      onCard('acc_bluecash', { date: dateOf(m, int(1, 28)), merchant: pick(['Starbucks', 'Blue Bottle Coffee', 'Peet\'s Coffee']), amount: -money(5.5, 14), categoryId: 'cat_coffee' })
    }
    // gas
    for (let i = 0, n = int(3, 4); i < n; i++) {
      onCard('acc_bluecash', { date: dateOf(m, int(1, 28)), merchant: pick(['Shell', 'Chevron', 'Costco Gas']), amount: -money(36, 64), categoryId: 'cat_gas' })
    }
    // household & shopping
    for (let i = 0, n = int(3, 5); i < n; i++) {
      const [merchant, lo, hi] = pick<[string, number, number]>([
        ['Amazon', 18, 95], ['Target', 42, 130], ['Home Depot', 25, 110],
      ])
      onCard('acc_sapphire', { date: dateOf(m, int(1, 28)), merchant, amount: -money(lo, hi), categoryId: 'cat_household' })
    }
    if (chance(0.7)) onCard('acc_sapphire', { date: dateOf(m, int(1, 28)), merchant: pick(['Uniqlo', 'Old Navy', 'Nordstrom Rack', 'Zara']), amount: -money(38, 160), categoryId: 'cat_clothing' })
    if (chance(0.18)) onCard('acc_sapphire', { date: dateOf(m, int(1, 28)), merchant: pick(['Best Buy', 'Apple Store']), amount: -money(90, 480), categoryId: 'cat_electronics' })

    // lifestyle
    onCard('acc_sapphire', { date: dateOf(m, 2), merchant: 'Netflix', amount: -15.49, categoryId: 'cat_subscriptions' })
    onCard('acc_sapphire', { date: dateOf(m, 9), merchant: 'Spotify', amount: -11.99, categoryId: 'cat_subscriptions' })
    onCard('acc_bluecash', { date: dateOf(m, 27), merchant: 'Apple iCloud', amount: -2.99, categoryId: 'cat_subscriptions' })
    if (chance(0.6)) onCard('acc_sapphire', { date: dateOf(m, int(5, 27)), merchant: pick(['AMC Theatres', 'Steam', 'TicketMaster', 'Nintendo eShop']), amount: -money(14, 88), categoryId: 'cat_entertainment' })
    if (chance(0.6)) onCard('acc_bluecash', { date: dateOf(m, int(3, 26)), merchant: pick(['Great Clips', 'Sephora', 'CVS Beauty']), amount: -money(18, 85), categoryId: 'cat_personal' })
    if (chance(0.3)) onCard('acc_sapphire', { date: dateOf(m, int(3, 26)), merchant: pick(['Etsy', 'Amazon', 'Local Florist']), amount: -money(25, 120), categoryId: 'cat_gifts' })

    // health
    for (let i = 0, n = int(0, 2); i < n; i++) {
      onCard('acc_bluecash', { date: dateOf(m, int(2, 27)), merchant: pick(['CVS Pharmacy', 'Walgreens']), amount: -money(11, 42), categoryId: 'cat_pharmacy' })
    }
    if (chance(0.5)) onCard('acc_bluecash', { date: dateOf(m, int(2, 27)), merchant: 'Midtown Family Medicine', amount: -money(40, 190), categoryId: 'cat_medical' })
    onCard('acc_bluecash', { date: dateOf(m, 11), merchant: 'Planet Fitness', amount: -24.99, categoryId: 'cat_fitness' })
    onCard('acc_bluecash', { date: dateOf(m, 12), merchant: 'Planet Fitness', amount: -24.99, categoryId: 'cat_fitness' })

    // kids activities
    if (chance(0.75)) onCard('acc_bluecash', { date: dateOf(m, int(2, 26)), merchant: pick(['Little Kickers Soccer', 'SwimLabs', 'Lakeshore Learning']), amount: -money(30, 150), categoryId: 'cat_kids_activities' })

    // rideshare / parking
    for (let i = 0, n = int(0, 3); i < n; i++) {
      onCard('acc_sapphire', { date: dateOf(m, int(1, 28)), merchant: pick(['Uber', 'Lyft']), amount: -money(11, 38), categoryId: 'cat_rideshare' })
    }
    if (chance(0.5)) onCard('acc_bluecash', { date: dateOf(m, int(1, 28)), merchant: pick(['ParkMobile', 'FasTrak']), amount: -money(4, 26), categoryId: 'cat_parking' })

    // travel bursts
    const mm = Number(m.slice(5))
    if (mm === 4 || mm === 7 || mm === 12) {
      onCard('acc_sapphire', { date: dateOf(m, int(2, 10)), merchant: pick(['Delta Air Lines', 'United Airlines', 'Alaska Airlines']), amount: -money(380, 860), categoryId: 'cat_flights', tagIds: mm === 7 ? ['tag_vacation26'] : undefined })
      onCard('acc_sapphire', { date: dateOf(m, int(11, 20)), merchant: pick(['Airbnb', 'Marriott', 'Hyatt Regency']), amount: -money(520, 1350), categoryId: 'cat_hotels', tagIds: mm === 7 ? ['tag_vacation26'] : undefined })
      for (let i = 0, n = int(2, 4); i < n; i++) {
        onCard('acc_sapphire', { date: dateOf(m, int(12, 24)), merchant: pick(['Shake Shack JFK', 'Museum of Science', 'Hertz', 'Boardwalk Rentals']), amount: -money(24, 150), categoryId: 'cat_vacation' })
      }
    }

    // home maintenance (Linden) & rental repairs (Maple)
    if (mi % 2 === 0) onCard('acc_bluecash', { date: dateOf(m, int(5, 25)), merchant: pick(['Home Depot', 'GreenLawn Care', 'Ace Hardware']), amount: -money(70, 320), categoryId: 'cat_maint_linden' })
    if (chance(0.18)) onChecking({ date: dateOf(m, int(6, 24)), merchant: pick(['Roto-Rooter', 'Bay Area HVAC']), amount: -money(180, 560), categoryId: 'cat_maint_linden' })
    if (mi % 3 === 1) onChecking({ date: dateOf(m, int(6, 24)), merchant: pick(['Mr. Handyman', 'Ferguson Plumbing', 'Sherwin-Williams']), amount: -money(120, 720), categoryId: 'cat_repairs_maple', tagIds: ['tag_tax'] })

    // uncategorized noise (1-2 / month)
    onChecking({ date: dateOf(m, int(2, 27)), merchant: pick(['Venmo', 'Zelle payment', 'Check #20' + int(1, 9)]), amount: -money(40, 260) })
    if (chance(0.5)) onCard('acc_sapphire', { date: dateOf(m, int(2, 27)), merchant: pick(['Sq *Riverside Farmers Mkt', 'PayPal *Web Store', 'Toast *Corner Deli']), amount: -money(12, 90) })

    // split example every ~5 months
    if (mi % 5 === 2) {
      add({
        date: dateOf(m, int(8, 20)),
        merchant: 'Costco',
        amount: -287.44,
        accountId: 'acc_bluecash',
        splits: [
          { id: `spl_${mi}a`, amount: -196.2, categoryId: 'cat_groceries' },
          { id: `spl_${mi}b`, amount: -91.24, categoryId: 'cat_household' },
        ],
      })
      blue += 287.44
    }

    // occasional refund
    if (chance(0.35)) onCard('acc_sapphire', { date: dateOf(m, int(5, 26)), merchant: 'Amazon', amount: money(12, 60), categoryId: 'cat_household', notes: 'Refund' })

    // --- card payments (transfer pair), pay previous month's spend on the 7th ---
    for (const [card, prev] of [['acc_bluecash', prevBlueSpend], ['acc_sapphire', prevSapphireSpend]] as const) {
      const amt = Math.round(prev * 100) / 100
      if (amt > 0) {
        const d = dateOf(m, 7)
        onChecking({ date: d, merchant: card === 'acc_bluecash' ? 'Payment · Blue Cash' : 'Payment · Sapphire', amount: -amt, transfer: true })
        add({ date: d, merchant: 'Payment from Joint Checking', amount: amt, accountId: card, transfer: true })
      }
    }
    prevBlueSpend = blue
    prevSapphireSpend = sapphire

    // --- savings sweep to keep checking realistic ---
    if (checkingBal > 16000 && dateOf(m, 26) <= today) {
      const excess = Math.floor((checkingBal - 13000) / 500) * 500
      if (excess >= 500) {
        onChecking({ date: dateOf(m, 26), merchant: 'Transfer to Savings', amount: -excess, transfer: true })
        add({ date: dateOf(m, 26), merchant: 'Transfer from Checking', amount: excess, accountId: 'acc_savings', transfer: true })
        savingsBal += excess
      }
    }
  }

  // fix the mistaken category id used above for Maple property tax
  for (const t of txns) {
    if ((t.categoryId as string) === 'cat_tax_maple') t.categoryId = 'cat_repairs_maple'
  }

  // --- needs review: last ~9 non-transfer transactions ---
  const recent = txns
    .filter((t) => !t.transfer && t.date <= today)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 9)
  for (const t of recent) t.needsReview = true

  // ---------- balance histories for valued accounts ----------
  const history = (start: number, fn: (prev: number, i: number) => number): BalancePoint[] => {
    let bal = start
    return months.map((m, i) => {
      bal = fn(bal, i)
      return { month: m, balance: Math.round(bal * 100) / 100 }
    })
  }

  const withHist = (id: string, points: BalancePoint[]) => {
    const a = accounts.find((x) => x.id === id)!
    a.balanceHistory = points
  }

  withHist('acc_nre', history(1250000, (p) => Math.round(p * 1.0054)))
  withHist('acc_529', history(18000, (p) => (p + 300) * (1 + between(-0.01, 0.022))))
  withHist('acc_brokerage', history(92000, (p) => (p + 500) * (1 + between(-0.018, 0.028))))
  withHist('acc_401k_a', history(160000, (p) => (p + 1150) * (1 + between(-0.015, 0.026))))
  withHist('acc_401k_j', history(104000, (p) => (p + 780) * (1 + between(-0.015, 0.026))))
  withHist('acc_roth', history(46000, (p) => (p + 250) * (1 + between(-0.015, 0.026))))
  withHist('acc_linden', history(492000, (p) => p * (1 + between(-0.001, 0.004))))
  withHist('acc_maple', history(296000, (p) => p * (1 + between(-0.001, 0.004))))

  // loans amortize: balance is negative, payment reduces it by the principal portion
  const amort = (start: number, payment: number, ratePct: number, escrow = 0) =>
    history(-start, (p) => {
      const interest = (-p * ratePct) / 100 / 12
      const principal = Math.max(0, payment - escrow - interest)
      return Math.min(0, p + principal)
    })
  withHist('acc_mort_linden', amort(356500, 2684.42, 5.1, 450))
  withHist('acc_mort_maple', amort(205000, 1478.19, 6.3, 0))
  withHist('acc_auto', amort(23000, 521.36, 6.9, 0))
  withHist('acc_student', amort(52000, 412.5, 4.8, 0))

  // Household of three; owners and vehicles assigned by account id.
  const profiles = [
    { id: 'prof_self', name: 'Alex Rivera', color: '#4F46E5', relationship: 'Self' },
    { id: 'prof_spouse', name: 'Jordan Rivera', color: '#0EA5E9', relationship: 'Spouse' },
    { id: 'prof_child', name: 'Riya Rivera', color: '#16A34A', relationship: 'Child' },
  ]
  const households = [{ id: 'hh_1', name: 'Rivera household', profileIds: ['prof_self', 'prof_spouse', 'prof_child'] }]
  const ownerMeta: Record<string, { p: string; st?: string }> = {
    acc_checking: { p: 'prof_self' },
    acc_savings: { p: 'prof_self', st: 'savings' },
    acc_nre: { p: 'prof_self', st: 'fd' },
    acc_bluecash: { p: 'prof_self', st: 'credit_card' },
    acc_sapphire: { p: 'prof_spouse', st: 'credit_card' },
    acc_brokerage: { p: 'prof_self', st: 'brokerage' },
    acc_401k_a: { p: 'prof_self', st: '401k' },
    acc_401k_j: { p: 'prof_spouse', st: '401k' },
    acc_roth: { p: 'prof_spouse', st: 'roth_ira' },
    acc_529: { p: 'prof_child', st: '529' },
    acc_linden: { p: 'prof_self', st: 'real_estate' },
    acc_maple: { p: 'prof_self', st: 'real_estate' },
    acc_mort_linden: { p: 'prof_self', st: 'mortgage' },
    acc_mort_maple: { p: 'prof_self', st: 'mortgage' },
    acc_auto: { p: 'prof_spouse', st: 'auto_loan' },
    acc_student: { p: 'prof_spouse', st: 'student_loan' },
  }
  for (const a of accounts) {
    const m = ownerMeta[a.id]
    if (m) {
      a.profileId = m.p
      a.subtype = m.st
    } else {
      a.profileId = 'prof_self'
    }
  }

  return {
    schemaVersion: 2,
    settings: { currencyCode: 'USD', appName: 'Munora', onboarded: true, region: 'US', theme: 'system' },
    profiles,
    households,
    importRules: [],
    fx: seedFxTable(Date.now()),
    accounts,
    categoryGroups: groups,
    categories,
    tags,
    properties,
    transactions: txns.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)),
  }
}
