import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { supabase } from '../lib/supabase'
import { STATUT_STYLES, currencyFormatter, dateFormatter, type Statut } from '../lib/format'

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
    return <p className="text-gray-500">Chargement des devis…</p>
  }

  if (error) {
    return <p className="rounded bg-red-50 p-4 text-red-700">{error}</p>
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-gray-900">Devis</h1>
      {devisList.length === 0 ? (
        <p className="text-gray-500">Aucun devis pour le moment.</p>
      ) : (
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-gray-500">
              <th className="py-2 pr-4">Numéro</th>
              <th className="py-2 pr-4">Client</th>
              <th className="py-2 pr-4">Statut</th>
              <th className="py-2 pr-4">Montant HT</th>
              <th className="py-2 pr-4">Date de création</th>
            </tr>
          </thead>
          <tbody>
            {devisList.map((devis) => (
              <tr key={devis.id} className="border-b border-gray-100 hover:bg-gray-50">
                <Link to={`/devis/${devis.id}`} className="contents">
                  <td className="py-2 pr-4 font-medium text-gray-900">{devis.numero}</td>
                  <td className="py-2 pr-4 text-gray-700">{devis.clients?.name ?? '—'}</td>
                  <td className="py-2 pr-4">
                    <span
                      className={`inline-block rounded-full px-2 py-1 text-xs font-medium ${STATUT_STYLES[devis.statut]}`}
                    >
                      {devis.statut}
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-gray-700">
                    {devis.montant_ht != null ? currencyFormatter.format(devis.montant_ht) : '—'}
                  </td>
                  <td className="py-2 pr-4 text-gray-500">{dateFormatter.format(new Date(devis.created_at))}</td>
                </Link>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
