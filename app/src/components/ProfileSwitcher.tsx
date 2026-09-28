import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Users, Check } from 'lucide-react'
import { useStore } from '../lib/store'
import { useProfileScope } from '../lib/profiles'

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('')
}

export function Avatar({ name, color, size = 'md' }: { name: string; color: string; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span className={`avatar ${size}`} style={{ background: color }}>
      {initials(name) || '?'}
    </span>
  )
}

export function ProfileSwitcher() {
  const store = useStore()
  const { scope, setScope } = useProfileScope()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  if (store.profiles.length < 2) return null // no switcher until there is a household

  const active = scope === 'all' ? null : store.profiles.find((p) => p.id === scope)

  return (
    <div className="profile-switch" ref={ref}>
      <button className="current" onClick={() => setOpen((o) => !o)}>
        {active ? <Avatar name={active.name} color={active.color} size="sm" /> : <Users size={16} />}
        <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {active ? active.name : 'Everyone'}
        </span>
        <ChevronDown size={15} />
      </button>
      {open && (
        <div className="profile-menu">
          <button className={scope === 'all' ? 'active' : ''} onClick={() => { setScope('all'); setOpen(false) }}>
            <Users size={16} />
            <span style={{ flex: 1 }}>Everyone (household)</span>
            {scope === 'all' && <Check size={14} />}
          </button>
          {store.profiles.map((p) => (
            <button key={p.id} className={scope === p.id ? 'active' : ''} onClick={() => { setScope(p.id); setOpen(false) }}>
              <Avatar name={p.name} color={p.color} size="sm" />
              <span style={{ flex: 1 }}>
                {p.name}
                {p.relationship ? ` (${p.relationship})` : ''}
              </span>
              {scope === p.id && <Check size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
