import { NavLink, Outlet } from 'react-router'
import { supabase } from '../lib/supabase'

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/devis/nouveau', label: 'Nouveau devis' },
  { to: '/clients', label: 'Clients' },
  { to: '/relances', label: 'Suivi relances' },
]

export default function Layout() {
  return (
    <div className="flex h-screen bg-slate-50">
      <aside className="flex w-60 shrink-0 flex-col bg-slate-900 px-4 py-6">
        <div className="mb-8 flex items-center gap-2.5 px-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-copper-500 font-display text-sm font-bold text-white">
            T
          </span>
          <span className="font-display text-lg font-semibold tracking-tight text-white">Thermik</span>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `rounded-r-md border-l-2 px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'border-copper-400 bg-white/5 text-white'
                    : 'border-transparent text-slate-400 hover:border-slate-600 hover:bg-white/5 hover:text-slate-100'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <button
          onClick={() => supabase.auth.signOut()}
          className="rounded-md px-3 py-2 text-left text-sm text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-100"
        >
          Déconnexion
        </button>
      </aside>
      <main className="flex-1 overflow-auto px-8 py-8">
        <div className="mx-auto max-w-6xl">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
