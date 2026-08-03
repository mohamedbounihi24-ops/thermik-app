import { NavLink, Outlet } from 'react-router'
import { LayoutGrid, FilePlus2, Users, BellRing, LogOut, Flame } from 'lucide-react'
import { supabase } from '../lib/supabase'

const NAV_SECTIONS = [
  {
    label: 'Pilotage',
    items: [{ to: '/dashboard', label: 'Dashboard', icon: LayoutGrid }],
  },
  {
    label: 'Activité',
    items: [
      { to: '/devis/nouveau', label: 'Nouveau devis', icon: FilePlus2 },
      { to: '/clients', label: 'Clients', icon: Users },
      { to: '/relances', label: 'Suivi relances', icon: BellRing },
    ],
  },
]

export default function Layout() {
  return (
    <div className="flex h-screen bg-paper">
      <aside className="flex w-64 shrink-0 flex-col bg-ink px-4 py-6">
        {/* Logo */}
        <div className="mb-9 flex items-center gap-3 px-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-copper-500 shadow-lg shadow-copper-500/25">
            <Flame size={18} className="text-white" />
          </span>
          <div className="leading-tight">
            <span className="block font-display text-lg font-bold tracking-tight text-white">Thermik</span>
            <span className="block text-[10px] font-medium uppercase tracking-widest text-copper-300">
              CVC · Gestion
            </span>
          </div>
        </div>

        {/* Navigation par sections */}
        <nav className="flex flex-1 flex-col gap-6">
          {NAV_SECTIONS.map((section) => (
            <div key={section.label}>
              <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-white/30">
                {section.label}
              </p>
              <div className="flex flex-col gap-0.5">
                {section.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      `group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-white/10 text-white'
                          : 'text-white/50 hover:bg-white/5 hover:text-white/90'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <item.icon
                          size={17}
                          className={isActive ? 'text-copper-400' : 'text-white/40 group-hover:text-white/70'}
                        />
                        {item.label}
                        {isActive && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-copper-400" />}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Déconnexion */}
        <div className="border-t border-white/10 pt-4">
          <button
            onClick={() => supabase.auth.signOut()}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-white/50 transition-colors hover:bg-white/5 hover:text-white/90"
          >
            <LogOut size={17} className="text-white/40" />
            Déconnexion
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto px-10 py-9">
        <div className="mx-auto max-w-6xl">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

