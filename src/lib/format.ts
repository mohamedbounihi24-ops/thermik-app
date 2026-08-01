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
// Pour les stats : les centimes sont du bruit sur un chiffre de synthèse.
export const statCurrencyFormatter = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
})
export const dateFormatter = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' })
