import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { dateFormatter } from '../lib/format'

type Relance = {
  id: string
  cible_type: 'devis' | 'facture'
  cible_id: string
  sequence: string
  canal: 'email' | 'sms'
  statut_envoi: 'envoyée' | 'échouée'
  date_envoi: string
}

const STATUT_ENVOI_STYLES: Record<Relance['statut_envoi'], string> = {
  'envoyée': 'bg-green-100 text-green-700',
  'échouée': 'bg-red-100 text-red-700',
}

export default function SuiviRelances() {
  const [relances, setRelances] = useState<Relance[]>([])
  const [devisNumeros, setDevisNumeros] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)

      const { data, error } = await supabase
        .from('relances_log')
        .select('*')
        .order('date_envoi', { ascending: false })

      if (cancelled) return

      if (error) {
        setError('Impossible de charger les relances. Vérifiez votre connexion et réessayez.')
        setLoading(false)
        return
      }

      const rows = (data ?? []) as Relance[]
      setRelances(rows)

      // cible_id n'est pas une vraie FK (peut pointer vers devis ou
      // facture) — résolution du numéro de devis en une requête séparée,
      // non bloquante si elle échoue (juste "—" affiché à la place).
      const devisIds = [...new Set(rows.filter((r) => r.cible_type === 'devis').map((r) => r.cible_id))]
      if (devisIds.length > 0) {
        const { data: devisRows } = await supabase.from('devis').select('id, numero').in('id', devisIds)
        if (!cancelled && devisRows) {
          setDevisNumeros(new Map(devisRows.map((d) => [d.id as string, d.numero as string])))
        }
      }

      if (!cancelled) setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return <p className="text-gray-500">Chargement des relances…</p>
  }

  if (error) {
    return <p className="rounded bg-red-50 p-4 text-red-700">{error}</p>
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-gray-900">Suivi relances</h1>
      {relances.length === 0 ? (
        <p className="text-gray-500">Aucune relance envoyée pour le moment.</p>
      ) : (
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-gray-500">
              <th className="py-2 pr-4">Devis</th>
              <th className="py-2 pr-4">Séquence</th>
              <th className="py-2 pr-4">Canal</th>
              <th className="py-2 pr-4">Statut d'envoi</th>
              <th className="py-2 pr-4">Date d'envoi</th>
            </tr>
          </thead>
          <tbody>
            {relances.map((relance) => (
              <tr key={relance.id} className="border-b border-gray-100">
                <td className="py-2 pr-4 font-medium text-gray-900">
                  {relance.cible_type === 'devis' ? (devisNumeros.get(relance.cible_id) ?? '—') : '—'}
                </td>
                <td className="py-2 pr-4 text-gray-700">{relance.sequence}</td>
                <td className="py-2 pr-4 text-gray-700">{relance.canal}</td>
                <td className="py-2 pr-4">
                  <span
                    className={`inline-block rounded-full px-2 py-1 text-xs font-medium ${STATUT_ENVOI_STYLES[relance.statut_envoi]}`}
                  >
                    {relance.statut_envoi}
                  </span>
                </td>
                <td className="py-2 pr-4 text-gray-500">{dateFormatter.format(new Date(relance.date_envoi))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
