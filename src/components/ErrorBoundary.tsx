import { Component, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { hasError: boolean }

// Filet de sécurité global : une exception de rendu non rattrapée
// afficherait sinon une page blanche sans explication. Recharger repart
// d'un état propre (les données vivent dans Supabase, rien n'est perdu).
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen flex-col items-center justify-center gap-3 bg-slate-50 px-4 text-center">
          <h1 className="font-display text-xl font-semibold text-slate-900">Une erreur inattendue est survenue</h1>
          <p className="text-sm text-slate-500">Vos données sont en sécurité. Rechargez la page pour reprendre.</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 rounded-md bg-copper-600 px-4 py-2 text-sm font-medium text-white hover:bg-copper-700"
          >
            Recharger la page
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
