import { LayoutDashboard, FilePlus2 } from 'lucide-react'
import { APP_NAME, APP_TAGLINE } from '../lib/constants'
import { useStoreCtx } from '../lib/store'
import { Logo } from './Shell'

export default function Onboarding() {
  const { initDemo, initEmpty, storageKind } = useStoreCtx()
  return (
    <div className="onboard">
      <div className="card onboard-card">
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <Logo size={44} />
        </div>
        <h1>Welcome to {APP_NAME}</h1>
        <p>{APP_TAGLINE}. All data stays in {storageKind === 'electron' ? 'a local file on this PC' : 'this browser'}, no accounts, no cloud.</p>
        <div className="onboard-choices">
          <button className="btn primary" style={{ justifyContent: 'center', padding: '11px' }} onClick={initDemo}>
            <LayoutDashboard /> Start with demo data
          </button>
          <button className="btn" style={{ justifyContent: 'center', padding: '11px' }} onClick={initEmpty}>
            <FilePlus2 /> Start empty
          </button>
        </div>
        <p className="small muted" style={{ marginTop: 18, marginBottom: 0 }}>
          Demo data is a realistic sample household, you can erase or replace it anytime in Settings.
        </p>
      </div>
    </div>
  )
}
