import type { StatusTone } from '../components/ui'

export type Statut = 'brouillon' | 'envoyé' | 'accepté' | 'refusé' | 'expiré'

export const STATUT_TONES: Record<Statut, StatusTone> = {
  brouillon: 'neutral',
  'envoyé': 'info',
  'accepté': 'success',
  'refusé': 'danger',
  'expiré': 'warning',
}

export const currencyFormatter = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })
export const dateFormatter = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' })
