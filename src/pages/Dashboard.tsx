import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, Legend } from 'recharts'
import { Clock, CheckCircle2, TrendingUp, FileEdit, ArrowUpRight, ArrowDownRight, Mic, Keyboard, AlertTriangle, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { STATUT_TONES, currencyFormatter, dateFormatter, statCurrencyFormatter, type Statut } from '../lib/format'
import {
  Alert,
  Button,
  EmptyState,
  PageHeader,
  StatusBadge,
  TABLE_WRAP,
  TD_CLASS,
  TH_CLASS,
  TR_CLASS,
} from '../components/ui'

type DevisRow = {
  id: string
  numero: string
  statut: Statut
  montant_ht: number | null
  created_at: string
  date_reponse: string | null
  source: string | null
  clients: { name: string } | null
}

const DEVIS_SELECT = 'id, numero, statut, montant_ht, created_at, date_reponse, source, clients(name)'

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000
const ONE_DAY_MS = 24 * 60 * 60 * 1000
const STALE_THRESHOLD_DAYS = 5

const PIE_COLORS: Record<string, string> = {
  'accepté': '#16A34A',
  'envoyé': '#2563EB',
  'brouillon': '#78716C',
  'refusé': '#DC2626',
  'expiré': '#EA580C',
}

type KpiKey = 'attente' | 'signes' | 'taux' | 'brouillons'

// Compare une période de 30j à la précédente. Retourne un pourcentage réel
// (pas inventé) ou null si on n'a pas assez de recul pour comparer.
function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return null
  return Math.round(((current - previous) / previous) * 100)
}

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / ONE_DAY_MS)
}

function TrendBadge({ pct, goodDirection = 'up' }: { pct: number | null; goodDirection?: 'up' | 'down' }) {
  if (pct === null) return null
  const isUp = pct >= 0
  const isGood = goodDirection === 'up' ? isUp : !isUp
  const Icon = isUp ? ArrowUpRight : ArrowDownRight
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
        isGood ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
      }`}
    >
      <Icon size={11} />
      {Math.abs(pct)}%
    </span>
  )
}

function StatCell({
  label,
  value,
  sub,
  icon: Icon,
  iconColor = '#C1613A',
  trendPct = null,
  goodDirection = 'up',
  onClick,
}: {
  label: string
  value: string
  sub?: string
  icon: React.ComponentType<{ size?: number; color?: string }>
  iconColor?: string
  trendPct?: number | null
  goodDirection?: 'up' | 'down'
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-2xl border border-slate-100 bg-white p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper-300"
    >
      <div className="flex items-center justify-between">
        <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
        <div
          className="flex h-8 w-8 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${iconColor}1A` }}
        >
          <Icon size={16} color={iconColor} />
        </div>
      </div>
      <div className="mt-2 flex items-end justify-between">
        <dd className="font-mono text-2xl font-semibold tabular-nums text-slate-900">{value}</dd>
        <TrendBadge pct={trendPct} goodDirection={goodDirection} />
      </div>
      {sub && <dd className="mt-1 text-xs text-slate-500">{sub}</dd>}
    </button>
  )
}

// --- Modal de détail KPI ---
function KpiModal({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string
  subtitle?: string
  onClose: () => void
  children: React.ReactNode
}) {
  // Ferme avec la touche Échap.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h2 className="font-display text-xl font-bold tracking-tight text-slate-900">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

// Petite table de devis réutilisée dans les modals.
function MiniDevisTable({
  devis,
  extraCol,
}: {
  devis: DevisRow[]
  extraCol?: { header: string; render: (d: DevisRow) => React.ReactNode }
}) {
  if (devis.length === 0) {
    return <p className="py-6 text-center text-sm text-slate-400">Aucun devis dans cette catégorie.</p>
  }
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr>
            <th className={TH_CLASS}>Numéro</th>
            <th className={TH_CLASS}>Client</th>
            <th className={`${TH_CLASS} text-right`}>Montant HT</th>
            {extraCol && <th className={`${TH_CLASS} text-right`}>{extraCol.header}</th>}
          </tr>
        </thead>
        <tbody>
          {devis.map((d) => (
            <tr key={d.id} className="border-b border-slate-100 last:border-0">
              <td className={`${TD_CLASS} font-medium`}>
                <Link to={`/devis/${d.id}`} className="text-copper-600 hover:underline">
                  {d.numero}
                </Link>
              </td>
              <td className={`${TD_CLASS} text-slate-700`}>{d.clients?.name ?? '—'}</td>
              <td className={`${TD_CLASS} text-right font-mono tabular-nums text-slate-700`}>
                {d.montant_ht != null ? currencyFormatter.format(d.montant_ht) : '—'}
              </td>
              {extraCol && <td className={`${TD_CLASS} text-right text-slate-500`}>{extraCol.render(d)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [devisList, setDevisList] = useState<DevisRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openKpi, setOpenKpi] = useState<KpiKey | null>(null)

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

  // Sous-listes utilisées par les stats ET les modals de détail.
  const groups = useMemo(() => {
    const now = Date.now()
    const enAttente = devisList
      .filter((d) => d.statut === 'envoyé')
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    const acceptes = devisList.filter((d) => d.statut === 'accepté')
    const signes30j = acceptes.filter(
      (d) => d.date_reponse && now - new Date(d.date_reponse).getTime() <= THIRTY_DAYS_MS,
    )
    const refuses = devisList.filter((d) => d.statut === 'refusé')
    const expires = devisList.filter((d) => d.statut === 'expiré')
    const brouillons = devisList.filter((d) => d.statut === 'brouillon')
    return { enAttente, acceptes, signes30j, refuses, expires, brouillons }
  }, [devisList])

  const stats = useMemo(() => {
    const now = Date.now()
    const { enAttente, acceptes, signes30j, refuses, expires, brouillons } = groups
    const tranches = acceptes.length + refuses.length + expires.length

    // --- Comparaison période courante (0-30j) vs précédente (30-60j) ---
    // Basé sur les vraies dates des devis, pour des pourcentages réels.
    const inRange = (dateStr: string | null, fromMs: number, toMs: number) => {
      if (!dateStr) return false
      const t = new Date(dateStr).getTime()
      return t >= fromMs && t < toMs
    }
    const period0to30 = [now - THIRTY_DAYS_MS, now]
    const period30to60 = [now - 2 * THIRTY_DAYS_MS, now - THIRTY_DAYS_MS]

    const enAttenteCountPrev = devisList.filter(
      (d) => d.statut === 'envoyé' && inRange(d.created_at, period30to60[0], period30to60[1]),
    ).length
    const brouillonsCountCurrent = devisList.filter(
      (d) => d.statut === 'brouillon' && inRange(d.created_at, period0to30[0], period0to30[1]),
    ).length
    const brouillonsCountPrev = devisList.filter(
      (d) => d.statut === 'brouillon' && inRange(d.created_at, period30to60[0], period30to60[1]),
    ).length
    const signesMontantPrev = acceptes
      .filter((d) => inRange(d.date_reponse, period30to60[0], period30to60[1]))
      .reduce((sum, d) => sum + (d.montant_ht ?? 0), 0)

    const tranchesPrev = devisList.filter(
      (d) =>
        (d.statut === 'accepté' || d.statut === 'refusé' || d.statut === 'expiré') &&
        inRange(d.date_reponse, period30to60[0], period30to60[1]),
    )
    const acceptesPrev = tranchesPrev.filter((d) => d.statut === 'accepté')
    const tauxPrev = tranchesPrev.length > 0 ? (acceptesPrev.length / tranchesPrev.length) * 100 : null

    const aRelancer = enAttente.filter((d) => daysSince(d.created_at) >= STALE_THRESHOLD_DAYS)

    return {
      enAttenteMontant: enAttente.reduce((sum, d) => sum + (d.montant_ht ?? 0), 0),
      enAttenteCount: enAttente.length,
      enAttenteTrend: pctChange(enAttente.length, enAttenteCountPrev),
      signes30jMontant: signes30j.reduce((sum, d) => sum + (d.montant_ht ?? 0), 0),
      signes30jCount: signes30j.length,
      signesTrend: pctChange(signes30j.reduce((sum, d) => sum + (d.montant_ht ?? 0), 0), signesMontantPrev),
      tauxAcceptation: tranches > 0 ? Math.round((acceptes.length / tranches) * 100) : null,
      tauxTrend:
        tauxPrev !== null && tranches > 0
          ? pctChange(Math.round((acceptes.length / tranches) * 100), Math.round(tauxPrev))
          : null,
      brouillons: brouillons.length,
      brouillonsTrend: pctChange(brouillonsCountCurrent, brouillonsCountPrev),
      aRelancerCount: aRelancer.length,
      aRelancerMontant: aRelancer.reduce((sum, d) => sum + (d.montant_ht ?? 0), 0),
    }
  }, [devisList, groups])

  const trendData = useMemo(() => {
    const monthly: Record<string, { ca: number; sortKey: string }> = {}
    devisList
      .filter((d) => d.statut === 'accepté')
      .forEach((d) => {
        const date = new Date(d.created_at)
        const sortKey = `${date.getFullYear()}-${String(date.getMonth()).padStart(2, '0')}`
        const label = date.toLocaleDateString('fr-FR', { month: 'short' })
        if (!monthly[label]) monthly[label] = { ca: 0, sortKey }
        monthly[label].ca += d.montant_ht ?? 0
      })
    return Object.entries(monthly)
      .sort((a, b) => a[1].sortKey.localeCompare(b[1].sortKey))
      .map(([month, v]) => ({ month, ca: v.ca }))
  }, [devisList])

  const pieData = useMemo(() => {
    const counts: Record<string, number> = {}
    devisList.forEach((d) => {
      counts[d.statut] = (counts[d.statut] ?? 0) + 1
    })
    return Object.entries(counts).map(([statut, value]) => ({
      name: statut,
      value,
      color: PIE_COLORS[statut] ?? '#78716C',
    }))
  }, [devisList])

  // Top clients par CA signé (devis acceptés uniquement).
  const topClients = useMemo(() => {
    const byClient: Record<string, number> = {}
    devisList
      .filter((d) => d.statut === 'accepté')
      .forEach((d) => {
        const name = d.clients?.name ?? 'Client inconnu'
        byClient[name] = (byClient[name] ?? 0) + (d.montant_ht ?? 0)
      })
    return Object.entries(byClient)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, montant]) => ({ name, montant }))
  }, [devisList])

  // Répartition devis vocal vs manuel — met en avant la création de devis à la voix.
  const sourceStats = useMemo(() => {
    const vocal = devisList.filter((d) => d.source === 'vocal').length
    const manuel = devisList.filter((d) => d.source === 'manuel').length
    const total = vocal + manuel
    return {
      vocal,
      manuel,
      vocalPct: total > 0 ? Math.round((vocal / total) * 100) : 0,
    }
  }, [devisList])

  if (loading) {
    return (
      <div className="animate-pulse" aria-label="Chargement des devis…">
        <div className="mb-8 h-8 w-32 rounded bg-slate-200" />
        <div className="mb-8 h-[92px] rounded-lg border border-slate-200 bg-slate-100" />
        <div className="space-y-px overflow-hidden rounded-lg border border-slate-200">
          <div className="h-11 bg-slate-100" />
          <div className="h-11 bg-white" />
          <div className="h-11 bg-white" />
          <div className="h-11 bg-white" />
        </div>
      </div>
    )
  }

  if (error) {
    return <Alert>{error}</Alert>
  }

  return (
    <div>
      <PageHeader
        title="Tableau de bord"
        action={<Button onClick={() => navigate('/devis/nouveau')}>Nouveau devis</Button>}
      />

      {stats.aRelancerCount > 0 && (
        <div className="mb-6 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100">
            <AlertTriangle size={18} className="text-amber-700" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-900">
              {stats.aRelancerCount} devis à relancer
            </p>
            <p className="text-xs text-amber-700">
              Envoyés depuis plus de {STALE_THRESHOLD_DAYS} jours sans réponse — {currencyFormatter.format(stats.aRelancerMontant)} en jeu.
            </p>
          </div>
        </div>
      )}

      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCell
          label="En attente de réponse"
          value={statCurrencyFormatter.format(stats.enAttenteMontant)}
          sub={`${stats.enAttenteCount} devis envoyé${stats.enAttenteCount > 1 ? 's' : ''}`}
          icon={Clock}
          iconColor="#C1613A"
          trendPct={stats.enAttenteTrend}
          goodDirection="up"
          onClick={() => setOpenKpi('attente')}
        />
        <StatCell
          label="Signés · 30 jours"
          value={statCurrencyFormatter.format(stats.signes30jMontant)}
          sub={`${stats.signes30jCount} devis accepté${stats.signes30jCount > 1 ? 's' : ''}`}
          icon={CheckCircle2}
          iconColor="#16A34A"
          trendPct={stats.signesTrend}
          goodDirection="up"
          onClick={() => setOpenKpi('signes')}
        />
        <StatCell
          label="Taux d'acceptation"
          value={stats.tauxAcceptation != null ? `${stats.tauxAcceptation} %` : '—'}
          sub="sur les devis tranchés"
          icon={TrendingUp}
          iconColor="#2563EB"
          trendPct={stats.tauxTrend}
          goodDirection="up"
          onClick={() => setOpenKpi('taux')}
        />
        <StatCell
          label="Brouillons"
          value={String(stats.brouillons)}
          sub="à finaliser et envoyer"
          icon={FileEdit}
          iconColor="#78716C"
          trendPct={stats.brouillonsTrend}
          goodDirection="down"
          onClick={() => setOpenKpi('brouillons')}
        />
      </div>

      {/* --- Modals de détail KPI --- */}
      {openKpi === 'attente' && (
        <KpiModal
          title="Devis en attente de réponse"
          subtitle={`${stats.enAttenteCount} devis envoyés — ${currencyFormatter.format(stats.enAttenteMontant)} au total`}
          onClose={() => setOpenKpi(null)}
        >
          <MiniDevisTable
            devis={groups.enAttente}
            extraCol={{
              header: 'Attente',
              render: (d) => {
                const days = daysSince(d.created_at)
                return (
                  <span className={days >= STALE_THRESHOLD_DAYS ? 'font-semibold text-amber-700' : ''}>
                    {days} j
                  </span>
                )
              },
            }}
          />
          <p className="mt-4 text-xs text-slate-500">
            Les devis en attente depuis plus de {STALE_THRESHOLD_DAYS} jours sont signalés en orange — pensez à les
            relancer.
          </p>
        </KpiModal>
      )}

      {openKpi === 'signes' && (
        <KpiModal
          title="Devis signés sur 30 jours"
          subtitle={`${stats.signes30jCount} devis acceptés — ${currencyFormatter.format(stats.signes30jMontant)} de CA`}
          onClose={() => setOpenKpi(null)}
        >
          <MiniDevisTable
            devis={groups.signes30j}
            extraCol={{
              header: 'Signé le',
              render: (d) => (d.date_reponse ? dateFormatter.format(new Date(d.date_reponse)) : '—'),
            }}
          />
        </KpiModal>
      )}

      {openKpi === 'taux' && (
        <KpiModal
          title="Taux d'acceptation"
          subtitle="Calculé sur l'ensemble des devis tranchés (acceptés, refusés ou expirés)"
          onClose={() => setOpenKpi(null)}
        >
          <div className="mb-5 grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-emerald-50 p-4 text-center">
              <p className="font-mono text-2xl font-semibold text-emerald-700">{groups.acceptes.length}</p>
              <p className="mt-0.5 text-xs font-medium text-emerald-700">Acceptés</p>
            </div>
            <div className="rounded-xl bg-rose-50 p-4 text-center">
              <p className="font-mono text-2xl font-semibold text-rose-700">{groups.refuses.length}</p>
              <p className="mt-0.5 text-xs font-medium text-rose-700">Refusés</p>
            </div>
            <div className="rounded-xl bg-orange-50 p-4 text-center">
              <p className="font-mono text-2xl font-semibold text-orange-700">{groups.expires.length}</p>
              <p className="mt-0.5 text-xs font-medium text-orange-700">Expirés</p>
            </div>
          </div>
          <p className="mb-5 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            {groups.acceptes.length} accepté{groups.acceptes.length > 1 ? 's' : ''} ÷{' '}
            {groups.acceptes.length + groups.refuses.length + groups.expires.length} tranchés ={' '}
            <span className="font-semibold text-slate-900">{stats.tauxAcceptation ?? '—'} %</span>
          </p>
          <h3 className="mb-2 text-sm font-semibold text-slate-900">Devis refusés ou expirés</h3>
          <MiniDevisTable
            devis={[...groups.refuses, ...groups.expires]}
            extraCol={{
              header: 'Statut',
              render: (d) => <StatusBadge tone={STATUT_TONES[d.statut]} label={d.statut} />,
            }}
          />
        </KpiModal>
      )}

      {openKpi === 'brouillons' && (
        <KpiModal
          title="Brouillons à finaliser"
          subtitle={`${stats.brouillons} devis en cours de rédaction`}
          onClose={() => setOpenKpi(null)}
        >
          <MiniDevisTable
            devis={groups.brouillons}
            extraCol={{
              header: 'Créé le',
              render: (d) => dateFormatter.format(new Date(d.created_at)),
            }}
          />
          <p className="mt-4 text-xs text-slate-500">
            Cliquez sur un numéro pour ouvrir le devis, compléter ses lignes et l'envoyer.
          </p>
        </KpiModal>
      )}

      <div className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <h3 className="mb-4 text-sm font-semibold text-slate-900">CA signé par mois</h3>
          {trendData.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-400">Pas encore assez de devis acceptés.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={trendData} margin={{ left: -20 }}>
                <defs>
                  <linearGradient id="caFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#C1613A" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#C1613A" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#EDEAE3" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#78716C' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#78716C' }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v) => [`${Number(v).toLocaleString('fr-FR')} €`, 'CA signé']} />
                <Area type="monotone" dataKey="ca" stroke="#C1613A" strokeWidth={2.5} fill="url(#caFill)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <h3 className="mb-4 text-sm font-semibold text-slate-900">Répartition par statut</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={3}>
                {pieData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
              <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Widgets métier CVC : top clients + adoption du devis vocal */}
      <div className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <h3 className="mb-4 text-sm font-semibold text-slate-900">Top clients</h3>
          {topClients.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">Pas encore de devis acceptés à classer.</p>
          ) : (
            <div className="flex flex-col divide-y divide-slate-100">
              {topClients.map((c, i) => {
                const maxMontant = topClients[0].montant
                const widthPct = maxMontant > 0 ? Math.round((c.montant / maxMontant) * 100) : 0
                return (
                  <div key={c.name} className="flex items-center gap-3 py-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-500">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="truncate font-medium text-slate-900">{c.name}</span>
                        <span className="ml-2 shrink-0 font-mono tabular-nums text-slate-700">
                          {currencyFormatter.format(c.montant)}
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-copper-500"
                          style={{ width: `${widthPct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <h3 className="mb-4 text-sm font-semibold text-slate-900">Devis à la voix</h3>
          <div className="flex flex-col items-center justify-center py-2">
            <div className="font-mono text-4xl font-semibold text-copper-600">{sourceStats.vocalPct}%</div>
            <p className="mt-1 text-xs text-slate-500">des devis créés à l'oral</p>
          </div>
          <div className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-4">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5 text-slate-600">
                <Mic size={14} className="text-copper-600" /> Vocal
              </span>
              <span className="font-mono tabular-nums text-slate-900">{sourceStats.vocal}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5 text-slate-600">
                <Keyboard size={14} className="text-slate-400" /> Manuel
              </span>
              <span className="font-mono tabular-nums text-slate-900">{sourceStats.manuel}</span>
            </div>
          </div>
        </div>
      </div>

      {devisList.length === 0 ? (
        <EmptyState
          title="Aucun devis pour le moment"
          description="Créez votre premier devis à la voix : décrivez la prestation, les lignes sont structurées automatiquement."
          action={<Button onClick={() => navigate('/devis/nouveau')}>Créer un devis</Button>}
        />
      ) : (
        <div className={TABLE_WRAP}>
          <table className="w-full border-collapse text-left">
            <thead>
              <tr>
                <th className={TH_CLASS}>Numéro</th>
                <th className={TH_CLASS}>Client</th>
                <th className={TH_CLASS}>Statut</th>
                <th className={`${TH_CLASS} text-right`}>Montant HT</th>
                <th className={TH_CLASS}>Date de création</th>
              </tr>
            </thead>
            <tbody>
              {/* Un <a> ne peut pas envelopper des <td> (HTML invalide, React
                  le rejette) : lien réel sur le numéro pour le clavier et la
                  molette, clic sur le reste de la ligne en bonus. */}
              {devisList.map((devis) => {
                const stale = devis.statut === 'envoyé' && daysSince(devis.created_at) >= STALE_THRESHOLD_DAYS
                return (
                  <tr
                    key={devis.id}
                    onClick={() => navigate(`/devis/${devis.id}`)}
                    className={`cursor-pointer ${TR_CLASS}`}
                  >
                    <td className={`${TD_CLASS} font-medium`}>
                      <Link
                        to={`/devis/${devis.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-slate-900 hover:text-copper-600"
                      >
                        {devis.numero}
                      </Link>
                    </td>
                    <td className={`${TD_CLASS} text-slate-700`}>{devis.clients?.name ?? '—'}</td>
                    <td className={TD_CLASS}>
                      <div className="flex items-center gap-2">
                        <StatusBadge tone={STATUT_TONES[devis.statut]} label={devis.statut} />
                        {stale && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                            <AlertTriangle size={11} />
                            {daysSince(devis.created_at)}j sans réponse
                          </span>
                        )}
                      </div>
                    </td>
                    <td className={`${TD_CLASS} text-right font-mono tabular-nums text-slate-700`}>
                      {devis.montant_ht != null ? currencyFormatter.format(devis.montant_ht) : '—'}
                    </td>
                    <td className={`${TD_CLASS} text-slate-500`}>{dateFormatter.format(new Date(devis.created_at))}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
