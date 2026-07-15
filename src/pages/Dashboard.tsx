import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { supabase } from '../lib/supabase'
import { STATUT_TONES, currencyFormatter, dateFormatter, type Statut } from '../lib/format'
import { Alert, PageHeader, StatusBadge, TABLE_WRAP, TD_CLASS, TH_CLASS, TR_CLASS } from '../components/ui'

type DevisRow = {
  id: string
  numero: string
  statut: Statut
  montant_ht: number | null
  created_at: string
  clients: { name: string } | null
}

const DEVIS_SELECT = 'id, numero, statut, montant_ht, created_at, clients(name)'

export default function Dashboard() {
  const [devisList, setDevisList] = useState<DevisRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch réel au montage — c'est le fix du bug v1 : jamais de state qui vit
  // sans avoir été relu depuis Supabase.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    supabase
      .from('devis')
      .select(DEVIS_SELECT)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          setError('Impossible de charger les devis. Vérifiez votre connexion et réessayez.')
          setLoading(false)
          return
        }
        setDevisList((data ?? []) as unknown as DevisRow[])
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  // Realtime : RLS s'applique nativement, pas de filtre company_id côté client.
  useEffect(() => {
    const channel = supabase
      .channel('devis-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'devis' }, async (payload) => {
        if (payload.eventType === 'DELETE') {
          const deletedId = (payload.old as { id: string }).id
          setDevisList((current) => current.filter((d) => d.id !== deletedId))
          return
        }

        // INSERT / UPDATE : le payload ne contient pas la jointure clients(name)
        // → on relit la ligne complète pour rester cohérent avec le fetch initial.
        const newId = (payload.new as { id: string }).id
        const { data, error } = await supabase.from('devis').select(DEVIS_SELECT).eq('id', newId).single()
        if (error || !data) return
        const row = data as unknown as DevisRow

        setDevisList((current) => {
          if (payload.eventType === 'INSERT') {
            if (current.some((d) => d.id === row.id)) return current
            return [row, ...current]
          }
          return current.map((d) => (d.id === row.id ? row : d))
        })
      })
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }, [])

  if (loading) {
    return <p className="text-sm text-slate-500">Chargement des devis…</p>
  }

  if (error) {
    return <Alert>{error}</Alert>
  }

  return (
    <div>
      <PageHeader title="Devis" />
      {devisList.length === 0 ? (
        <p className="text-sm text-slate-500">Aucun devis pour le moment.</p>
      ) : (
        <div className={TABLE_WRAP}>
          <table className="w-full border-collapse text-left">
            <thead>
              <tr>
                <th className={TH_CLASS}>Numéro</th>
                <th className={TH_CLASS}>Client</th>
                <th className={TH_CLASS}>Statut</th>
                <th className={TH_CLASS}>Montant HT</th>
                <th className={TH_CLASS}>Date de création</th>
              </tr>
            </thead>
            <tbody>
              {devisList.map((devis) => (
                <tr key={devis.id} className={TR_CLASS}>
                  <Link to={`/devis/${devis.id}`} className="contents">
                    <td className={`${TD_CLASS} font-medium text-slate-900`}>{devis.numero}</td>
                    <td className={`${TD_CLASS} text-slate-700`}>{devis.clients?.name ?? '—'}</td>
                    <td className={TD_CLASS}>
                      <StatusBadge tone={STATUT_TONES[devis.statut]} label={devis.statut} />
                    </td>
                    <td className={`${TD_CLASS} font-mono tabular-nums text-slate-700`}>
                      {devis.montant_ht != null ? currencyFormatter.format(devis.montant_ht) : '—'}
                    </td>
                    <td className={`${TD_CLASS} text-slate-500`}>{dateFormatter.format(new Date(devis.created_at))}</td>
                  </Link>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
