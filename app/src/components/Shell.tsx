import { useState } from 'react'
import { NavLink, Outlet, useLocation, useParams } from 'react-router-dom'
import {
  ReceiptText,
  ArrowUpDown,
  ChartPie,
  TrendingUp,
  Landmark,
  HandCoins,
  Users,
  CircleDashed,
  Home,
  Settings as SettingsIcon,
  ChevronLeft,
  ChevronRight,
  LineChart,
  FileUp,
  Target,
  Sun,
  Moon,
  Menu,
  MoreHorizontal,
  MessageSquareText,
} from 'lucide-react'
import { APP_NAME } from '../lib/constants'
import { useStore, useStoreCtx } from '../lib/store'
import { needsReviewCount, uncategorizedCount } from '../lib/selectors'
import { useRange } from '../lib/range'
import { PRESETS, rangeLabel, monthKey, monthStartISO, monthEndISO } from '../lib/dates'
import type { PresetId } from '../lib/dates'
import { fmtTime } from '../lib/format'
import { ProfileSwitcher } from './ProfileSwitcher'

export function Logo({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" style={{ flexShrink: 0, borderRadius: size * 0.28 }} aria-hidden="true">
      <defs>
        <linearGradient id="nw-logo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4338CA" />
          <stop offset="0.55" stopColor="#4F46E5" />
          <stop offset="1" stopColor="#6366F1" />
        </linearGradient>
      </defs>
      <rect x="16" y="16" width="480" height="480" rx="122" fill="url(#nw-logo)" />
      <rect x="140" y="300" width="58" height="104" rx="18" fill="#FFFFFF" opacity="0.55" />
      <rect x="227" y="252" width="58" height="152" rx="18" fill="#FFFFFF" opacity="0.75" />
      <rect x="314" y="196" width="58" height="208" rx="18" fill="#FFFFFF" />
      <path d="M150 268 L 250 214 L 343 156" fill="none" stroke="#FFFFFF" strokeWidth="28" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M300 150 L 356 148 L 352 206" fill="none" stroke="#FFFFFF" strokeWidth="28" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const PAGE_TITLES: Record<string, { title: string; range: boolean }> = {
  '/transactions': { title: 'Transactions', range: true },
  '/cashflow': { title: 'Cash flow', range: true },
  '/spending': { title: 'Spending', range: true },
  '/networth': { title: 'Net worth', range: true },
  '/accounts': { title: 'Accounts', range: false },
  '/household': { title: 'Household', range: false },
  '/loans': { title: 'Loans', range: false },
  '/funds': { title: 'Mutual funds', range: false },
  '/import': { title: 'Import statement', range: false },
  '/planning': { title: 'Planning', range: false },
  '/assistant': { title: 'Assistant', range: false },
  '/settings': { title: 'Settings', range: false },
}

function RangeControl() {
  const { range, preset, setPreset, setCustom, shift } = useRange()
  return (
    <>
      <div className="range-stepper">
        <button onClick={() => shift(-1)} aria-label="Previous period">
          <ChevronLeft size={15} />
        </button>
        <span className="range-label">{rangeLabel(range)}</span>
        <button onClick={() => shift(1)} aria-label="Next period">
          <ChevronRight size={15} />
        </button>
      </div>
      <select className="control" value={preset} onChange={(e) => setPreset(e.target.value as PresetId)}>
        {PRESETS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
      {preset === 'custom' && (
        <>
          <input type="month" className="control" value={monthKey(range.start)} onChange={(e) => e.target.value && setCustom({ start: monthStartISO(e.target.value), end: range.end })} />
          <input type="month" className="control" value={monthKey(range.end)} onChange={(e) => e.target.value && setCustom({ start: range.start, end: monthEndISO(e.target.value) })} />
        </>
      )}
    </>
  )
}

function ThemeToggle() {
  const store = useStore()
  const { mutate } = useStoreCtx()
  const isDark = document.documentElement.dataset.theme === 'dark'
  return (
    <button
      className="iconbtn"
      title={isDark ? 'Switch to light' : 'Switch to dark'}
      onClick={() => mutate((d) => { d.settings.theme = isDark ? 'light' : 'dark' })}
      style={{ border: '1px solid var(--border)', borderRadius: 9, width: 34, height: 34 }}
    >
      {isDark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  )
}

export default function Shell() {
  const store = useStore()
  const { lastSavedAt, storageKind } = useStoreCtx()
  const { pathname, search } = useLocation()
  const params = useParams()
  const onUncategorized = pathname === '/transactions' && search.includes('filter=uncategorized')

  const [drawer, setDrawer] = useState(false)
  const closeDrawer = () => setDrawer(false)

  const review = needsReviewCount(store)
  const uncat = uncategorizedCount(store)

  let page = PAGE_TITLES[pathname]
  if (!page && pathname.startsWith('/property/')) {
    const prop = store.properties.find((p) => p.id === params.id)
    page = { title: prop?.name ?? 'Property', range: true }
  }
  page ??= { title: APP_NAME, range: false }

  const statusBits = [storageKind === 'browser' ? 'Browser storage (dev)' : storageKind === 'capacitor' ? 'On-device' : 'Local data file']
  if (lastSavedAt) statusBits.push(`saved ${fmtTime(lastSavedAt)}`)

  const navClass = (isActive: boolean) => `navitem${isActive ? ' active' : ''}`

  return (
    <div className="app">
      {drawer && <div className="drawer-scrim" onClick={closeDrawer} />}
      <aside className={`sidebar${drawer ? ' open' : ''}`} onClick={(e) => (e.target as HTMLElement).closest('a') && closeDrawer()}>
        <div className="sidebar-brand">
          <Logo />
          {store.settings.appName || APP_NAME}
        </div>

        <ProfileSwitcher />

        <NavLink to="/assistant" className={({ isActive }) => navClass(isActive)}>
          <MessageSquareText /> Assistant
        </NavLink>
        <NavLink to="/transactions" className={({ isActive }) => navClass(isActive && !onUncategorized)}>
          <ReceiptText /> Transactions {review > 0 && <span className="nav-badge">{review}</span>}
        </NavLink>
        <NavLink to="/cashflow" className={({ isActive }) => navClass(isActive)}>
          <ArrowUpDown /> Cash flow
        </NavLink>
        <NavLink to="/spending" className={({ isActive }) => navClass(isActive)}>
          <ChartPie /> Spending
        </NavLink>
        <NavLink to="/networth" className={({ isActive }) => navClass(isActive)}>
          <TrendingUp /> Net worth
        </NavLink>

        <div className="nav-section">Accounts</div>
        <NavLink to="/accounts" className={({ isActive }) => navClass(isActive)}>
          <Landmark /> Accounts
        </NavLink>
        <NavLink to="/loans" className={({ isActive }) => navClass(isActive)}>
          <HandCoins /> Loans
        </NavLink>
        <NavLink to="/household" className={({ isActive }) => navClass(isActive)}>
          <Users /> Household
        </NavLink>
        <NavLink to="/transactions?filter=uncategorized" className={() => navClass(onUncategorized)}>
          <CircleDashed /> Uncategorized {uncat > 0 && <span className="nav-badge">{uncat}</span>}
        </NavLink>

        <div className="nav-section">Investing</div>
        <NavLink to="/funds" className={({ isActive }) => navClass(isActive)}>
          <LineChart /> Mutual funds
        </NavLink>
        <NavLink to="/planning" className={({ isActive }) => navClass(isActive)}>
          <Target /> Planning
        </NavLink>

        <div className="nav-section">Data</div>
        <NavLink to="/import" className={({ isActive }) => navClass(isActive)}>
          <FileUp /> Import statement
        </NavLink>

        {store.properties.length > 0 && (
          <>
            <div className="nav-section">Properties</div>
            {store.properties.map((p) => (
              <NavLink key={p.id} to={`/property/${p.id}`} className={({ isActive }) => navClass(isActive)}>
                <Home /> {p.name}
              </NavLink>
            ))}
          </>
        )}

        <div className="sidebar-bottom">
          <NavLink to="/settings" className={({ isActive }) => navClass(isActive)}>
            <SettingsIcon /> Settings
          </NavLink>
        </div>
      </aside>

      <div className="main">
        <div className="mobile-topbar">
          <button className="iconbtn" onClick={() => setDrawer(true)} aria-label="Menu">
            <Menu size={20} />
          </button>
          <Logo size={24} />
          <span className="mtb-title">{store.settings.appName || APP_NAME}</span>
          <div className="spacer" />
          <ThemeToggle />
        </div>
        <div className="header">
          <div>
            <h1>{page.title}</h1>
            <div className="status">{statusBits.join(' · ')}</div>
          </div>
          <div className="header-controls">
            {page.range && <RangeControl />}
            <span className="desktop-only">
              <ThemeToggle />
            </span>
          </div>
        </div>
        <div className="content">
          <div className="content-inner">
            <Outlet />
          </div>
        </div>
      </div>

      <nav className="bottombar">
        <NavLink to="/transactions" className={({ isActive }) => (isActive && !onUncategorized ? 'active' : '')}>
          <ReceiptText /> Transactions
        </NavLink>
        <NavLink to="/cashflow" className={({ isActive }) => (isActive ? 'active' : '')}>
          <ArrowUpDown /> Cash flow
        </NavLink>
        <NavLink to="/spending" className={({ isActive }) => (isActive ? 'active' : '')}>
          <ChartPie /> Spending
        </NavLink>
        <NavLink to="/networth" className={({ isActive }) => (isActive ? 'active' : '')}>
          <TrendingUp /> Net worth
        </NavLink>
        <button onClick={() => setDrawer(true)}>
          <MoreHorizontal /> More
        </button>
      </nav>
    </div>
  )
}
