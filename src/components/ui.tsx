import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from 'react'

export const TABLE_WRAP = 'overflow-hidden rounded-lg border border-slate-200 bg-white'
export const TH_CLASS = 'border-b border-slate-200 bg-slate-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500'
export const TD_CLASS = 'px-4 py-3 text-sm'
export const TR_CLASS = 'border-b border-slate-100 last:border-0 hover:bg-copper-50/40'

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper-300 focus-visible:ring-offset-2'

const BUTTON_VARIANTS = {
  primary: 'bg-copper-600 text-white hover:bg-copper-700',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700',
  danger: 'bg-rose-600 text-white hover:bg-rose-700',
  secondary: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
  ghost: 'text-copper-600 hover:underline',
} as const

type ButtonVariant = keyof typeof BUTTON_VARIANTS

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button className={`${BUTTON_BASE} ${BUTTON_VARIANTS[variant]} ${className}`} {...props} />
}

const FIELD_BASE =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-copper-400 focus:outline-none focus:ring-2 focus:ring-copper-100'

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${FIELD_BASE} ${className}`} {...props} />
}

export function Select({ className = '', ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`${FIELD_BASE} ${className}`} {...props} />
}

const TABLE_FIELD_BASE =
  'rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 focus:border-copper-400 focus:outline-none focus:ring-2 focus:ring-copper-100'

export function TableInput({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${TABLE_FIELD_BASE} ${className}`} {...props} />
}

export function Label({ className = '', ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={`mb-1.5 block text-sm font-medium text-slate-700 ${className}`} {...props} />
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-slate-200 bg-white p-6 ${className}`}>{children}</div>
}

export function PageHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-8 flex items-center justify-between">
      <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
      {action}
    </div>
  )
}

const ALERT_VARIANTS = {
  error: 'border-rose-200 bg-rose-50 text-rose-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
  info: 'border-slate-200 bg-slate-50 text-slate-700',
} as const

export function Alert({
  variant = 'error',
  children,
  className = '',
}: {
  variant?: keyof typeof ALERT_VARIANTS
  children: ReactNode
  className?: string
}) {
  return <p className={`rounded-md border px-4 py-3 text-sm ${ALERT_VARIANTS[variant]} ${className}`}>{children}</p>
}

const STATUS_TONES = {
  neutral: { bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-200', dot: 'bg-slate-400' },
  info: { bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200', dot: 'bg-sky-500' },
  success: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  danger: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', dot: 'bg-rose-500' },
  warning: { bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200', dot: 'bg-amber-500' },
} as const

export type StatusTone = keyof typeof STATUS_TONES

export function StatusBadge({ tone, label }: { tone: StatusTone; label: string }) {
  const t = STATUS_TONES[tone]
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded border px-2 py-1 text-xs font-medium uppercase tracking-wide ${t.bg} ${t.text} ${t.border}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${t.dot}`} />
      {label}
    </span>
  )
}
