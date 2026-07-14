import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

type Client = {
  id: string
  name: string
  email: string | null
  phone: string | null
  address: string | null
}

const emptyForm = { name: '', email: '', phone: '', address: '' }

export default function Clients() {
  const { session } = useAuth()

  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  async function loadClients() {
    const { data, error } = await supabase.from('clients').select('*').order('name')
    if (error) {
      setLoadError('Impossible de charger les clients. Vérifiez votre connexion et réessayez.')
      return
    }
    setClients((data ?? []) as Client[])
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    loadClients().then(() => {
      if (!cancelled) setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  function startEdit(client: Client) {
    setEditingId(client.id)
    setForm({
      name: client.name,
      email: client.email ?? '',
      phone: client.phone ?? '',
      address: client.address ?? '',
    })
    setSaveError(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setForm(emptyForm)
    setSaveError(null)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!session || !form.name.trim()) return

    setSaveError(null)
    setSaving(true)

    const values = {
      name: form.name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      address: form.address.trim() || null,
    }

    if (editingId) {
      const { error } = await supabase.from('clients').update(values).eq('id', editingId)
      if (error) {
        setSaveError("Échec de l'enregistrement. Vos modifications n'ont pas été perdues, réessayez.")
        setSaving(false)
        return
      }
    } else {
      // company_id requis par la policy RLS clients_all (with check) —
      // même pattern que côté Nouveau devis.
      const { data: userRow, error: userRowError } = await supabase
        .from('users')
        .select('company_id')
        .eq('id', session.user.id)
        .single()

      if (userRowError || !userRow?.company_id) {
        setSaveError('Impossible de déterminer votre entreprise. Contactez un administrateur.')
        setSaving(false)
        return
      }

      const { error } = await supabase.from('clients').insert({ ...values, company_id: userRow.company_id })
      if (error) {
        setSaveError("Échec de la création du client. Vos informations n'ont pas été perdues, réessayez.")
        setSaving(false)
        return
      }
    }

    // Jamais d'ajout/modification optimiste en mémoire — on relit la
    // liste depuis Supabase une fois la sauvegarde confirmée.
    await loadClients()
    setEditingId(null)
    setForm(emptyForm)
    setSaving(false)
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-gray-900">Clients</h1>

      <form onSubmit={handleSubmit} className="mb-8 max-w-lg">
        <label className="mb-1 block text-sm font-medium text-gray-700">Nom</label>
        <input
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          required
          className="mb-3 w-full rounded border border-gray-300 px-3 py-2"
        />

        <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
        <input
          type="email"
          value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          className="mb-3 w-full rounded border border-gray-300 px-3 py-2"
        />

        <label className="mb-1 block text-sm font-medium text-gray-700">Téléphone</label>
        <input
          value={form.phone}
          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          className="mb-3 w-full rounded border border-gray-300 px-3 py-2"
        />

        <label className="mb-1 block text-sm font-medium text-gray-700">Adresse</label>
        <input
          value={form.address}
          onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
          className="mb-3 w-full rounded border border-gray-300 px-3 py-2"
        />

        {saveError && <p className="mb-3 rounded bg-red-50 p-4 text-red-700">{saveError}</p>}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={!form.name.trim() || saving}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? 'Enregistrement…' : editingId ? 'Enregistrer les modifications' : 'Créer le client'}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={cancelEdit}
              className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Annuler
            </button>
          )}
        </div>
      </form>

      {loading ? (
        <p className="text-gray-500">Chargement des clients…</p>
      ) : loadError ? (
        <p className="rounded bg-red-50 p-4 text-red-700">{loadError}</p>
      ) : clients.length === 0 ? (
        <p className="text-gray-500">Aucun client pour le moment.</p>
      ) : (
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-gray-500">
              <th className="py-2 pr-4">Nom</th>
              <th className="py-2 pr-4">Email</th>
              <th className="py-2 pr-4">Téléphone</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((client) => (
              <tr
                key={client.id}
                onClick={() => startEdit(client)}
                className="cursor-pointer border-b border-gray-100 hover:bg-gray-50"
              >
                <td className="py-2 pr-4 font-medium text-gray-900">{client.name}</td>
                <td className="py-2 pr-4 text-gray-700">{client.email ?? '—'}</td>
                <td className="py-2 pr-4 text-gray-700">{client.phone ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
