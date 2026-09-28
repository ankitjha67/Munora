// Seeded merchant knowledge base for retrieval-based categorization.
// Each entry: a lower-case keyword found in a statement line, the canonical
// merchant name to display, and a generic category hint. The hint is later
// resolved to the user's own category by name match, so it works whatever the
// user named their categories. Covers common merchants across US, India and UK.

export interface KbEntry {
  kw: string
  merchant: string
  hint: string
}

export const MERCHANT_KB: KbEntry[] = [
  // Income
  { kw: 'payroll', merchant: 'Payroll', hint: 'Paychecks' },
  { kw: 'salary', merchant: 'Salary', hint: 'Paychecks' },
  { kw: 'direct deposit', merchant: 'Direct Deposit', hint: 'Paychecks' },
  { kw: 'neft cr', merchant: 'Bank Transfer In', hint: 'Other income' },
  { kw: 'imps', merchant: 'IMPS Transfer', hint: 'Other income' },
  { kw: 'interest', merchant: 'Interest', hint: 'Interest' },
  { kw: 'dividend', merchant: 'Dividend', hint: 'Interest' },
  { kw: 'refund', merchant: 'Refund', hint: 'Other income' },
  { kw: 'cashback', merchant: 'Cashback', hint: 'Other income' },

  // Groceries
  { kw: 'walmart', merchant: 'Walmart', hint: 'Groceries' },
  { kw: 'costco', merchant: 'Costco', hint: 'Groceries' },
  { kw: 'trader joe', merchant: "Trader Joe's", hint: 'Groceries' },
  { kw: 'whole foods', merchant: 'Whole Foods', hint: 'Groceries' },
  { kw: 'safeway', merchant: 'Safeway', hint: 'Groceries' },
  { kw: 'kroger', merchant: 'Kroger', hint: 'Groceries' },
  { kw: 'aldi', merchant: 'Aldi', hint: 'Groceries' },
  { kw: 'tesco', merchant: 'Tesco', hint: 'Groceries' },
  { kw: 'sainsbury', merchant: "Sainsbury's", hint: 'Groceries' },
  { kw: 'waitrose', merchant: 'Waitrose', hint: 'Groceries' },
  { kw: 'dmart', merchant: 'DMart', hint: 'Groceries' },
  { kw: 'big bazaar', merchant: 'Big Bazaar', hint: 'Groceries' },
  { kw: 'reliance fresh', merchant: 'Reliance Fresh', hint: 'Groceries' },
  { kw: 'bigbasket', merchant: 'BigBasket', hint: 'Groceries' },
  { kw: 'blinkit', merchant: 'Blinkit', hint: 'Groceries' },
  { kw: 'zepto', merchant: 'Zepto', hint: 'Groceries' },

  // Restaurants / food delivery
  { kw: 'mcdonald', merchant: "McDonald's", hint: 'Restaurants' },
  { kw: 'starbucks', merchant: 'Starbucks', hint: 'Coffee shops' },
  { kw: 'chipotle', merchant: 'Chipotle', hint: 'Restaurants' },
  { kw: 'doordash', merchant: 'DoorDash', hint: 'Restaurants' },
  { kw: 'ubereats', merchant: 'Uber Eats', hint: 'Restaurants' },
  { kw: 'uber eats', merchant: 'Uber Eats', hint: 'Restaurants' },
  { kw: 'grubhub', merchant: 'Grubhub', hint: 'Restaurants' },
  { kw: 'swiggy', merchant: 'Swiggy', hint: 'Restaurants' },
  { kw: 'zomato', merchant: 'Zomato', hint: 'Restaurants' },
  { kw: 'dominos', merchant: "Domino's", hint: 'Restaurants' },
  { kw: 'kfc', merchant: 'KFC', hint: 'Restaurants' },
  { kw: 'costa', merchant: 'Costa Coffee', hint: 'Coffee shops' },
  { kw: 'pret a manger', merchant: 'Pret A Manger', hint: 'Coffee shops' },

  // Transport / fuel / rideshare
  { kw: 'uber', merchant: 'Uber', hint: 'Rideshare' },
  { kw: 'lyft', merchant: 'Lyft', hint: 'Rideshare' },
  { kw: 'ola', merchant: 'Ola', hint: 'Rideshare' },
  { kw: 'shell', merchant: 'Shell', hint: 'Gas' },
  { kw: 'chevron', merchant: 'Chevron', hint: 'Gas' },
  { kw: 'bp ', merchant: 'BP', hint: 'Gas' },
  { kw: 'hpcl', merchant: 'HPCL', hint: 'Gas' },
  { kw: 'indian oil', merchant: 'Indian Oil', hint: 'Gas' },
  { kw: 'iocl', merchant: 'Indian Oil', hint: 'Gas' },
  { kw: 'bharat petroleum', merchant: 'Bharat Petroleum', hint: 'Gas' },
  { kw: 'fastag', merchant: 'FASTag', hint: 'Parking & tolls' },
  { kw: 'irctc', merchant: 'IRCTC', hint: 'Rideshare' },
  { kw: 'tfl', merchant: 'Transport for London', hint: 'Rideshare' },
  { kw: 'trainline', merchant: 'Trainline', hint: 'Rideshare' },

  // Shopping
  { kw: 'amazon', merchant: 'Amazon', hint: 'Household' },
  { kw: 'flipkart', merchant: 'Flipkart', hint: 'Household' },
  { kw: 'target', merchant: 'Target', hint: 'Household' },
  { kw: 'ikea', merchant: 'IKEA', hint: 'Household' },
  { kw: 'home depot', merchant: 'Home Depot', hint: 'Household' },
  { kw: 'myntra', merchant: 'Myntra', hint: 'Clothing' },
  { kw: 'zara', merchant: 'Zara', hint: 'Clothing' },
  { kw: 'uniqlo', merchant: 'Uniqlo', hint: 'Clothing' },
  { kw: 'best buy', merchant: 'Best Buy', hint: 'Electronics' },
  { kw: 'apple.com', merchant: 'Apple', hint: 'Electronics' },
  { kw: 'croma', merchant: 'Croma', hint: 'Electronics' },

  // Bills / utilities / subscriptions
  { kw: 'netflix', merchant: 'Netflix', hint: 'Subscriptions' },
  { kw: 'spotify', merchant: 'Spotify', hint: 'Subscriptions' },
  { kw: 'prime video', merchant: 'Prime Video', hint: 'Subscriptions' },
  { kw: 'youtube premium', merchant: 'YouTube Premium', hint: 'Subscriptions' },
  { kw: 'icloud', merchant: 'Apple iCloud', hint: 'Subscriptions' },
  { kw: 'hotstar', merchant: 'Disney+ Hotstar', hint: 'Subscriptions' },
  { kw: 'comcast', merchant: 'Comcast Xfinity', hint: 'Internet' },
  { kw: 'xfinity', merchant: 'Comcast Xfinity', hint: 'Internet' },
  { kw: 'airtel', merchant: 'Airtel', hint: 'Phone' },
  { kw: 'jio', merchant: 'Jio', hint: 'Phone' },
  { kw: 'vodafone', merchant: 'Vodafone', hint: 'Phone' },
  { kw: 't-mobile', merchant: 'T-Mobile', hint: 'Phone' },
  { kw: 'verizon', merchant: 'Verizon', hint: 'Phone' },
  { kw: 'at&t', merchant: 'AT&T', hint: 'Phone' },
  { kw: 'electricity', merchant: 'Electricity', hint: 'Utilities' },
  { kw: 'bescom', merchant: 'BESCOM', hint: 'Utilities' },
  { kw: 'con ed', merchant: 'ConEd', hint: 'Utilities' },
  { kw: 'british gas', merchant: 'British Gas', hint: 'Utilities' },
  { kw: 'water bill', merchant: 'Water', hint: 'Utilities' },

  // Health
  { kw: 'cvs', merchant: 'CVS Pharmacy', hint: 'Pharmacy' },
  { kw: 'walgreens', merchant: 'Walgreens', hint: 'Pharmacy' },
  { kw: 'apollo pharmacy', merchant: 'Apollo Pharmacy', hint: 'Pharmacy' },
  { kw: 'pharmeasy', merchant: 'PharmEasy', hint: 'Pharmacy' },
  { kw: 'boots', merchant: 'Boots', hint: 'Pharmacy' },
  { kw: 'planet fitness', merchant: 'Planet Fitness', hint: 'Fitness' },
  { kw: 'cult.fit', merchant: 'cult.fit', hint: 'Fitness' },

  // Investing / transfers
  { kw: 'zerodha', merchant: 'Zerodha', hint: 'Investments' },
  { kw: 'groww', merchant: 'Groww', hint: 'Investments' },
  { kw: 'coinbase', merchant: 'Coinbase', hint: 'Investments' },
  { kw: 'vanguard', merchant: 'Vanguard', hint: 'Investments' },
  { kw: 'fidelity', merchant: 'Fidelity', hint: 'Investments' },
  { kw: 'sip ', merchant: 'Mutual Fund SIP', hint: 'Investments' },
  { kw: 'mutual fund', merchant: 'Mutual Fund', hint: 'Investments' },

  // Housing
  { kw: 'rent', merchant: 'Rent', hint: 'Rent' },
  { kw: 'mortgage', merchant: 'Mortgage', hint: 'Mortgage' },
]

/** Normalize a raw description for matching (drop reference numbers, punctuation, casing). */
export function normalizeDesc(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\b\d{6,}\b/g, ' ') // long reference numbers
    .replace(/[*#/\\|:.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
