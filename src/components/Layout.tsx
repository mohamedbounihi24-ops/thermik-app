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
    <div className="flex h-screen">
      <aside className="w-56 shrink-0 border-r border-gray-200 bg-white p-4">
        <h2 className="mb-6 text-lg font-semibold text-gray-900">Thermik</h2>
        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `rounded px-3 py-2 text-sm ${isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <button onClick={() => supabase.auth.signOut()} className="mt-8 text-sm text-gray-500 hover:text-gray-800">
          Déconnexion
        </button>
      </aside>
      <main className="flex-1 overflow-auto p-6">
        <Outlet />
      </main>
    </div>
  )
}
