import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useAudioRecorder } from '../hooks/useAudioRecorder'

type Client = { id: string; name: string }
type GenerateDevisSuccess = { devis_id: string; numero: string }
type GenerateDevisError = { error: string }

export default function NouveauDevis() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const recorder = useAudioRecorder()

  const [clients, setClients] = useState<Client[]>([])
  const [clientsLoading, setClientsLoading] = useState(true)
  const [clientsError, setClientsError] = useState<string | null>(null)
  const [selectedClientId, setSelectedClientId] = useState('')

  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Pas de CRUD Clients pour l'instant (chantier séparé) — juste un
  // select RLS-scopé sur ce qui existe déjà.
  useEffect(() => {
    let cancelled = false
    setClientsLoading(true)
    setClientsError(null)

    supabase
      .from('clients')
      .select('id, name')
      .order('name')
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          setClientsError('Impossible de charger la liste des clients. Vérifiez votre connexion et réessayez.')
          setClientsLoading(false)
          return
        }
        setClients((data ?? []) as Client[])
        setClientsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  // URL de lecture locale pour <audio controls> — dérivée du Blob,
  // jamais de Storage (pas de policy SELECT nécessaire côté serveur).
  useEffect(() => {
    if (!recorder.audioBlob) {
      setAudioUrl(null)
      return
    }
    const url = URL.createObjectURL(recorder.audioBlob)
    setAudioUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [recorder.audioBlob])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!session || !selectedClientId || !recorder.audioBlob) return

    setSubmitError(null)
    setSubmitting(true)

    // company_id de l'utilisateur courant — même pattern que côté Edge
    // Function (users.company_id, RLS auto-scopée à sa propre ligne).
    const { data: userRow, error: userRowError } = await supabase
      .from('users')
      .select('company_id')
      .eq('id', session.user.id)
      .single()

    if (userRowError || !userRow?.company_id) {
      setSubmitError('Impossible de déterminer votre entreprise. Contactez un administrateur.')
      setSubmitting(false)
      return
    }

    const companyId = userRow.company_id as string
    const audioPath = `${companyId}/${crypto.randomUUID()}.webm`

    const { error: uploadError } = await supabase.storage
      .from('devis-audio')
      .upload(audioPath, recorder.audioBlob, { contentType: recorder.audioBlob.type })

    if (uploadError) {
      // Le blob local n'est jamais touché ici : l'utilisateur peut
      // relancer l'envoi sans tout ré-enregistrer.
      setSubmitError(
        "Échec de l'envoi de l'enregistrement audio. Vérifiez votre connexion et réessayez — votre enregistrement n'a pas été perdu.",
      )
      setSubmitting(false)
      return
    }

    const { data, error: invokeError } = await supabase.functions.invoke<GenerateDevisSuccess>('generate-devis', {
      body: { audio_path: audioPath, client_id: selectedClientId },
    })

    if (invokeError) {
      // FunctionsHttpError = l'Edge Function a répondu avec un statut
      // non-2xx (400/403/502/500) : le corps JSON { error: "..." } est
      // accessible via error.context.json() (context = la Response brute).
      if (invokeError instanceof FunctionsHttpError) {
        try {
          const body = (await invokeError.context.json()) as GenerateDevisError
          setSubmitError(body.error ?? 'Échec de la génération du devis.')
        } catch {
          setSubmitError('Échec de la génération du devis.')
        }
      } else {
        setSubmitError('Impossible de contacter le serveur de génération. Vérifiez votre connexion et réessayez.')
      }
      setSubmitting(false)
      return
    }

    if (!data) {
      setSubmitError('Réponse invalide du serveur.')
      setSubmitting(false)
      return
    }

    // Pas d'affichage du résultat ici : le Dashboard le montrera via
    // Realtime (Détail devis n'a pas encore de contenu réel).
    navigate('/dashboard')
  }

  const noClients = !clientsLoading && !clientsError && clients.length === 0
  const canGenerate = !!selectedClientId && recorder.state === 'recorded' && !submitting && !noClients

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-gray-900">Nouveau devis</h1>

      {clientsLoading ? (
        <p className="text-gray-500">Chargement des clients…</p>
      ) : clientsError ? (
        <p className="rounded bg-red-50 p-4 text-red-700">{clientsError}</p>
      ) : (
        <form onSubmit={handleSubmit} className="max-w-lg">
          <label className="mb-1 block text-sm font-medium text-gray-700">Client</label>
          {noClients ? (
            <p className="mb-4 rounded bg-amber-50 p-4 text-amber-800">
              Aucun client n'existe pour votre entreprise. Créez d'abord un client avant de générer un devis.
            </p>
          ) : (
            <select
              value={selectedClientId}
              onChange={(e) => setSelectedClientId(e.target.value)}
              required
              className="mb-4 w-full rounded border border-gray-300 px-3 py-2"
            >
              <option value="">— Sélectionner un client —</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          )}

          <label className="mb-1 block text-sm font-medium text-gray-700">Note vocale</label>
          <div className="mb-4 rounded border border-gray-200 p-4">
            {recorder.state !== 'recording' ? (
              <button
                type="button"
                onClick={recorder.state === 'recorded' ? recorder.reset : recorder.start}
                disabled={!selectedClientId}
                className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {recorder.state === 'recorded' ? 'Recommencer' : 'Enregistrer'}
              </button>
            ) : (
              <button
                type="button"
                onClick={recorder.stop}
                className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white"
              >
                Arrêter
              </button>
            )}

            {recorder.state === 'recording' && (
              <p className="mt-2 text-sm text-gray-500">Enregistrement en cours…</p>
            )}

            {recorder.state === 'recorded' && audioUrl && (
              <audio controls src={audioUrl} className="mt-3 w-full" />
            )}

            {recorder.error && <p className="mt-3 text-sm text-red-600">{recorder.error}</p>}
          </div>

          {submitError && <p className="mb-4 rounded bg-red-50 p-4 text-red-700">{submitError}</p>}

          <button
            type="submit"
            disabled={!canGenerate}
            className="w-full rounded bg-blue-600 py-2 font-medium text-white disabled:opacity-50"
          >
            {submitting ? 'Génération en cours…' : 'Générer le devis'}
          </button>
        </form>
      )}
    </div>
  )
}
