import { Link } from 'react-router'

export default function NotFound() {
  return (
    <div>
      <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900">Page introuvable</h1>
      <p className="mt-2 text-sm text-slate-500">Cette page n'existe pas ou a été déplacée.</p>
      <Link to="/dashboard" className="mt-4 inline-block text-sm font-medium text-copper-600 hover:underline">
        ← Retour aux devis
      </Link>
    </div>
  )
}
