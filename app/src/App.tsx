import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { StoreProvider, useStoreCtx } from './lib/store'
import { RangeProvider } from './lib/range'
import { ProfileProvider } from './lib/profiles'
import Shell from './components/Shell'
import Onboarding from './components/Onboarding'
import TransactionsPage from './pages/Transactions'
import CashFlowPage from './pages/CashFlow'
import SpendingPage from './pages/Spending'
import NetWorthPage from './pages/NetWorth'
import AccountsPage from './pages/Accounts'
import HouseholdPage from './pages/Household'
import LoansPage from './pages/Loans'
import PropertyPage from './pages/Property'
import SettingsPage from './pages/Settings'
import MutualFundsPage from './pages/MutualFunds'
import ImportPage from './pages/Import'
import PlanningPage from './pages/Fire'
import AssistantPage from './pages/Assistant'

function Gate() {
  const { store, loading } = useStoreCtx()
  if (loading) return <div className="loading-screen">Loading your data…</div>
  if (!store) return <Onboarding />
  return (
    <ProfileProvider>
      <RangeProvider>
        <Routes>
          <Route element={<Shell />}>
            <Route path="/" element={<Navigate to="/transactions" replace />} />
            <Route path="/transactions" element={<TransactionsPage />} />
            <Route path="/cashflow" element={<CashFlowPage />} />
            <Route path="/spending" element={<SpendingPage />} />
            <Route path="/networth" element={<NetWorthPage />} />
            <Route path="/accounts" element={<AccountsPage />} />
            <Route path="/household" element={<HouseholdPage />} />
            <Route path="/loans" element={<LoansPage />} />
            <Route path="/funds" element={<MutualFundsPage />} />
            <Route path="/overlap" element={<Navigate to="/funds" replace />} />
            <Route path="/planning" element={<PlanningPage />} />
            <Route path="/assistant" element={<AssistantPage />} />
            <Route path="/import" element={<ImportPage />} />
            <Route path="/property/:id" element={<PropertyPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/transactions" replace />} />
          </Route>
        </Routes>
      </RangeProvider>
    </ProfileProvider>
  )
}

export default function App() {
  return (
    <StoreProvider>
      <HashRouter>
        <Gate />
      </HashRouter>
    </StoreProvider>
  )
}
