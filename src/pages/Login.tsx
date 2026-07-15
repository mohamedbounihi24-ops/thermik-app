import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { supabase } from '../lib/supabase'
import { Alert, Button, Input, Label } from '../components/ui'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setSubmitting(false)
    if (error) {
      setError('Email ou mot de passe incorrect.')
      return
    }
    navigate('/dashboard')
  }

  return (
    <div className="flex h-screen items-center justify-center bg-slate-900">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-copper-500 font-display text-base font-bold text-white">
            T
          </span>
          <span className="font-display text-xl font-semibold tracking-tight text-white">Thermik</span>
        </div>

        <form onSubmit={handleSubmit} className="rounded-lg bg-white p-8 shadow-xl shadow-black/20">
          <h1 className="mb-6 font-display text-lg font-semibold tracking-tight text-slate-900">Connexion</h1>

          <div className="mb-4">
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>

          <div className="mb-5">
            <Label>Mot de passe</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>

          {error && <Alert className="mb-4">{error}</Alert>}

          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? 'Connexion…' : 'Se connecter'}
          </Button>
        </form>
      </div>
    </div>
  )
}
