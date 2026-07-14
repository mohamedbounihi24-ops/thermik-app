import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { supabase } from '../lib/supabase'
import { STATUT_STYLES, currencyFormatter, dateFormatter, type Statut } from '../lib/format'

type Devis = {
  id: string
  numero: string
  statut: Statut
  montant_ht: number | null
  created_at: string
  date_envoi: string | null
  date_reponse: string | null
  clients: { name: string } | null
}

type DevisLineRow = {
  id: string
  description: string
  quantite: number | null
  unite: string | null
  prix_unitaire: number | null
}

// État d'édition local : `key` est un identifiant stable côté client pour
// React (et pour cibler une ligne à éditer/supprimer), jamais envoyé au
// RPC — update_devis_lines ne prend ni id ni ordre en entrée, il les
// régénère lui-même (delete + reinsert dans l'ordre du tableau JSON).
type EditableLine = {
  key: string
  description: string
  quantite: string
  unite: string
  prix_unitaire: string
}

const DEVIS_SELECT = 'id, numero, statut, montant_ht, created_at, date_envoi, date_reponse, clients(name)'
const DEVIS_LINE_SELECT = 'id, description, quantite, unite, prix_unitaire'

function computeMontant(line: EditableLine) {
  return (Number(line.quantite) || 0) * (Number(line.prix_unitaire) || 0)
}

export default function DetailDevis() {
  const { id } = useParams<{ id: string }>()

  const [devis, setDevis] = useState<Devis | null>(null)
  const [lines, setLines] = useState<EditableLine[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [statusUpdating, setStatusUpdating] = useState(false)
  const [statusError, setStatusError] = useState<string | null>(null)

  async function loadDevis(devisId: string) {
    const [devisResult, linesResult] = await Promise.all([
      supabase.from('devis').select(DEVIS_SELECT).eq('id', devisId).maybeSingle(),
      supabase.from('devis_lines').select(DEVIS_LINE_SELECT).eq('devis_id', devisId).order('ordre'),
    ])

    if (devisResult.error) {
      setLoadError('Impossible de charger le devis. Vérifiez votre connexion et réessayez.')
      return false
    }
    if (!devisResult.data) {
      setLoadError('Devis introuvable.')
      return false
    }

    if (linesResult.error) {
      setLoadError('Impossible de charger les lignes du devis. Vérifiez votre connexion et réessayez.')
      return false
    }

    setDevis(devisResult.data as unknown as Devis)
    setLines(
      ((linesResult.data ?? []) as DevisLineRow[]).map((row) => ({
        key: row.id,
        description: row.description,
        quantite: row.quantite != null ? String(row.quantite) : '',
        unite: row.unite ?? '',
        prix_unitaire: row.prix_unitaire != null ? String(row.prix_unitaire) : '',
      })),
    )
    return true
  }

  useEffect(() => {
    let cancelled = false
    if (!id) {
      setLoadError('Devis introuvable.')
      setLoading(false)
      return
    }
    setLoading(true)
    setLoadError(null)
    loadDevis(id).then(() => {
      if (cancelled) return
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [id])

  function updateLine(key: string, patch: Partial<Omit<EditableLine, 'key'>>) {
    setLines((current) => current.map((l) => (l.key === key ? { ...l, ...patch } : l)))
    setDirty(true)
  }

  function addLine() {
    setLines((current) => [
      ...current,
      { key: crypto.randomUUID(), description: '', quantite: '', unite: '', prix_unitaire: '' },
    ])
    setDirty(true)
  }

  function removeLine(key: string) {
    setLines((current) => current.filter((l) => l.key !== key))
    setDirty(true)
  }

  const hasEmptyDescription = lines.some((l) => !l.description.trim())

  async function handleSaveLines() {
    if (!devis || hasEmptyDescription) return
    setSaveError(null)
    setSaving(true)

    const payload = lines.map((l) => {
      const quantite = Number(l.quantite) || 0
      const prixUnitaire = Number(l.prix_unitaire) || 0
      return {
        description: l.description,
        quantite,
        unite: l.unite || null,
        prix_unitaire: prixUnitaire,
        montant_ligne: quantite * prixUnitaire,
      }
    })

    const { error } = await supabase.rpc('update_devis_lines', { p_devis_id: devis.id, p_lines: payload })

    if (error) {
      setSaveError(
        error.code === 'P0001'
          ? error.message
          : "Échec de l'enregistrement des lignes. Vos modifications n'ont pas été perdues, réessayez.",
      )
      setSaving(false)
      return
    }

    // Le serveur fait foi une fois la sauvegarde confirmée — même
    // philosophie que le Dashboard : jamais de state qui vit sans avoir
    // été relu depuis Supabase.
    await loadDevis(devis.id)
    setDirty(false)
    setSaving(false)
  }

  async function handleStatusChange(nextStatut: Statut, extraFields: Record<string, string>) {
    if (!devis) return
    setStatusError(null)
    setStatusUpdating(true)

    const { data, error } = await supabase
      .from('devis')
      .update({ statut: nextStatut, ...extraFields })
      .eq('id', devis.id)
      .select(DEVIS_SELECT)
      .single()

    if (error || !data) {
      setStatusError('Échec du changement de statut. Réessayez.')
      setStatusUpdating(false)
      return
    }

    setDevis(data as unknown as Devis)
    setStatusUpdating(false)
  }

  if (loading) return <p className="text-gray-500">Chargement du devis…</p>
  if (loadError) return <p className="rounded bg-red-50 p-4 text-red-700">{loadError}</p>
  if (!devis) return null

  return (
    <div>
      <Link to="/dashboard" className="mb-4 inline-block text-sm text-blue-600 hover:underline">
        ← Retour aux devis
      </Link>

      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{devis.numero}</h1>
          <p className="text-gray-700">{devis.clients?.name ?? '—'}</p>
        </div>
        <span className={`inline-block rounded-full px-2 py-1 text-xs font-medium ${STATUT_STYLES[devis.statut]}`}>
          {devis.statut}
        </span>
      </div>

      <dl className="mb-6 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-gray-500">Montant HT</dt>
          <dd className="text-gray-900">
            {devis.montant_ht != null ? currencyFormatter.format(devis.montant_ht) : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-gray-500">Créé le</dt>
          <dd className="text-gray-900">{dateFormatter.format(new Date(devis.created_at))}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Envoyé le</dt>
          <dd className="text-gray-900">
            {devis.date_envoi ? dateFormatter.format(new Date(devis.date_envoi)) : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-gray-500">Répondu le</dt>
          <dd className="text-gray-900">
            {devis.date_reponse ? dateFormatter.format(new Date(devis.date_reponse)) : '—'}
          </dd>
        </div>
      </dl>

      {statusError && <p className="mb-4 rounded bg-red-50 p-4 text-red-700">{statusError}</p>}

      <div className="mb-6 flex items-center gap-2">
        {devis.statut === 'brouillon' && (
          <>
            <button
              type="button"
              disabled={statusUpdating || dirty}
              onClick={() => handleStatusChange('envoyé', { date_envoi: new Date().toISOString() })}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Marquer comme envoyé
            </button>
            {dirty && (
              <p className="text-sm text-amber-700">Enregistrez vos modifications avant d'envoyer le devis.</p>
            )}
          </>
        )}
        {devis.statut === 'envoyé' && (
          <>
            <button
              type="button"
              disabled={statusUpdating}
              onClick={() => handleStatusChange('accepté', { date_reponse: new Date().toISOString() })}
              className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Marquer comme accepté
            </button>
            <button
              type="button"
              disabled={statusUpdating}
              onClick={() => handleStatusChange('refusé', { date_reponse: new Date().toISOString() })}
              className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Marquer comme refusé
            </button>
            <button
              type="button"
              disabled={statusUpdating}
              onClick={() => handleStatusChange('brouillon', {})}
              className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Repasser en brouillon
            </button>
          </>
        )}
      </div>

      {saveError && <p className="mb-4 rounded bg-red-50 p-4 text-red-700">{saveError}</p>}

      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-gray-500">
            <th className="py-2 pr-4">Description</th>
            <th className="py-2 pr-4">Quantité</th>
            <th className="py-2 pr-4">Unité</th>
            <th className="py-2 pr-4">Prix unitaire</th>
            <th className="py-2 pr-4">Montant</th>
            {devis.statut === 'brouillon' && <th className="py-2 pr-4"></th>}
          </tr>
        </thead>
        <tbody>
          {lines.map((line) =>
            devis.statut === 'brouillon' ? (
              <tr key={line.key} className="border-b border-gray-100">
                <td className="py-2 pr-4">
                  <input
                    value={line.description}
                    onChange={(e) => updateLine(line.key, { description: e.target.value })}
                    required
                    className="w-full rounded border border-gray-300 px-2 py-1"
                  />
                </td>
                <td className="py-2 pr-4">
                  <input
                    type="number"
                    step="any"
                    value={line.quantite}
                    onChange={(e) => updateLine(line.key, { quantite: e.target.value })}
                    className="w-24 rounded border border-gray-300 px-2 py-1"
                  />
                </td>
                <td className="py-2 pr-4">
                  <input
                    value={line.unite}
                    onChange={(e) => updateLine(line.key, { unite: e.target.value })}
                    className="w-20 rounded border border-gray-300 px-2 py-1"
                  />
                </td>
                <td className="py-2 pr-4">
                  <input
                    type="number"
                    step="any"
                    value={line.prix_unitaire}
                    onChange={(e) => updateLine(line.key, { prix_unitaire: e.target.value })}
                    className="w-28 rounded border border-gray-300 px-2 py-1"
                  />
                </td>
                <td className="py-2 pr-4 text-gray-700">{currencyFormatter.format(computeMontant(line))}</td>
                <td className="py-2 pr-4">
                  <button type="button" onClick={() => removeLine(line.key)} className="text-sm text-red-600 hover:underline">
                    Supprimer
                  </button>
                </td>
              </tr>
            ) : (
              <tr key={line.key} className="border-b border-gray-100">
                <td className="py-2 pr-4 text-gray-900">{line.description}</td>
                <td className="py-2 pr-4 text-gray-700">{line.quantite || '—'}</td>
                <td className="py-2 pr-4 text-gray-700">{line.unite || '—'}</td>
                <td className="py-2 pr-4 text-gray-700">
                  {line.prix_unitaire ? currencyFormatter.format(Number(line.prix_unitaire)) : '—'}
                </td>
                <td className="py-2 pr-4 text-gray-700">{currencyFormatter.format(computeMontant(line))}</td>
              </tr>
            ),
          )}
        </tbody>
      </table>

      {devis.statut === 'brouillon' && (
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={addLine}
            className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Ajouter une ligne
          </button>
          <button
            type="button"
            disabled={!dirty || saving || hasEmptyDescription}
            onClick={handleSaveLines}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? 'Enregistrement…' : 'Enregistrer les modifications'}
          </button>
          {hasEmptyDescription && <p className="text-sm text-red-600">Chaque ligne doit avoir une description.</p>}
        </div>
      )}
    </div>
  )
}
