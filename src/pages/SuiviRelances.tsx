import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { dateFormatter } from '../lib/format'
import { Alert, PageHeader, StatusBadge, TABLE_WRAP, TD_CLASS, TH_CLASS, TR_CLASS, type StatusTone } from '../components/ui'

type Relance = {
  id: string
  cible_type: 'devis' | 'facture'
  cible_id: string
  sequence: string
  canal: 'email' | 'sms'
  statut_envoi: 'envoyée' | 'échouée'
  date_envoi: string
}

const STATUT_ENVOI_TONES: Record<Relance['statut_envoi'], StatusTone> = {
  'envoyée': 'success',
  'échouée': 'danger',
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
    return <p className="text-sm text-slate-500">Chargement des relances…</p>
  }

  if (error) {
    return <Alert>{error}</Alert>
  }

  return (
    <div>
      <PageHeader title="Suivi relances" />
      {relances.length === 0 ? (
        <p className="text-sm text-slate-500">Aucune relance envoyée pour le moment.</p>
      ) : (
        <div className={TABLE_WRAP}>
          <table className="w-full border-collapse text-left">
            <thead>
              <tr>
                <th className={TH_CLASS}>Devis</th>
                <th className={TH_CLASS}>Séquence</th>
                <th className={TH_CLASS}>Canal</th>
                <th className={TH_CLASS}>Statut d'envoi</th>
                <th className={TH_CLASS}>Date d'envoi</th>
              </tr>
            </thead>
            <tbody>
              {relances.map((relance) => (
                <tr key={relance.id} className={TR_CLASS}>
                  <td className={`${TD_CLASS} font-medium text-slate-900`}>
                    {relance.cible_type === 'devis' ? (devisNumeros.get(relance.cible_id) ?? '—') : '—'}
                  </td>
                  <td className={`${TD_CLASS} font-mono text-slate-700`}>{relance.sequence}</td>
                  <td className={`${TD_CLASS} text-slate-700`}>{relance.canal}</td>
                  <td className={TD_CLASS}>
                    <StatusBadge tone={STATUT_ENVOI_TONES[relance.statut_envoi]} label={relance.statut_envoi} />
                  </td>
                  <td className={`${TD_CLASS} text-slate-500`}>{dateFormatter.format(new Date(relance.date_envoi))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
