export type Statut = 'brouillon' | 'envoyé' | 'accepté' | 'refusé' | 'expiré'

export const STATUT_STYLES: Record<Statut, string> = {
  brouillon: 'bg-gray-100 text-gray-700',
  'envoyé': 'bg-blue-100 text-blue-700',
  'accepté': 'bg-green-100 text-green-700',
  'refusé': 'bg-red-100 text-red-700',
  'expiré': 'bg-amber-100 text-amber-700',
}

export const currencyFormatter = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })
export const dateFormatter = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' })
