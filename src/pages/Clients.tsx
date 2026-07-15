import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Alert, Button, Card, Input, Label, PageHeader, TABLE_WRAP, TD_CLASS, TH_CLASS, TR_CLASS } from '../components/ui'

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
      <PageHeader title="Clients" />

      <Card className="mb-8 max-w-lg">
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <Label>Nom</Label>
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
          </div>

          <div className="mb-4">
            <Label>Email</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </div>

          <div className="mb-4">
            <Label>Téléphone</Label>
            <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
          </div>

          <div className="mb-5">
            <Label>Adresse</Label>
            <Input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
          </div>

          {saveError && <Alert className="mb-4">{saveError}</Alert>}

          <div className="flex gap-2">
            <Button type="submit" disabled={!form.name.trim() || saving}>
              {saving ? 'Enregistrement…' : editingId ? 'Enregistrer les modifications' : 'Créer le client'}
            </Button>
            {editingId && (
              <Button type="button" variant="secondary" onClick={cancelEdit}>
                Annuler
              </Button>
            )}
          </div>
        </form>
      </Card>

      {loading ? (
        <p className="text-sm text-slate-500">Chargement des clients…</p>
      ) : loadError ? (
        <Alert>{loadError}</Alert>
      ) : clients.length === 0 ? (
        <p className="text-sm text-slate-500">Aucun client pour le moment.</p>
      ) : (
        <div className={TABLE_WRAP}>
          <table className="w-full border-collapse text-left">
            <thead>
              <tr>
                <th className={TH_CLASS}>Nom</th>
                <th className={TH_CLASS}>Email</th>
                <th className={TH_CLASS}>Téléphone</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => (
                <tr key={client.id} onClick={() => startEdit(client)} className={`cursor-pointer ${TR_CLASS}`}>
                  <td className={`${TD_CLASS} font-medium text-slate-900`}>{client.name}</td>
                  <td className={`${TD_CLASS} text-slate-700`}>{client.email ?? '—'}</td>
                  <td className={`${TD_CLASS} text-slate-700`}>{client.phone ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
