import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { IconAlert } from './Icons'

// --- Pastilles d'état : toujours icône + texte, jamais la couleur seule ----------
export type Tone = 'good' | 'warning' | 'critical' | 'neutral' | 'info'

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
	return (
		<span className={`badge badge--${tone}`}>
			<span className="badge-dot" aria-hidden="true" />
			{children}
		</span>
	)
}

// --- Sélecteur à segments (période, filtres) --------------------------------------
export function Segmented<T extends string | number>({ value, options, onChange, label }: {
	value: T
	options: { value: T; label: string }[]
	onChange: (v: T) => void
	label: string
}) {
	return (
		<div className="segmented" role="radiogroup" aria-label={label}>
			{options.map((o) => (
				<button key={String(o.value)} type="button" role="radio" aria-checked={o.value === value}
					className={o.value === value ? 'is-active' : undefined} onClick={() => onChange(o.value)}>
					{o.label}
				</button>
			))}
		</div>
	)
}

// --- Menu d'actions (⋯) -------------------------------------------------------------
export type MenuAction = { label: string; icon?: ReactNode; danger?: boolean; disabled?: boolean; hint?: string; onSelect: () => void } | 'separator'

export function ActionMenu({ actions, label, trigger }: { actions: MenuAction[]; label: string; trigger: ReactNode }) {
	const [open, setOpen] = useState(false)
	const ref = useRef<HTMLDivElement>(null)
	useEffect(() => {
		if (!open) return
		const close = (e: MouseEvent | KeyboardEvent) => {
			if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false)
		}
		document.addEventListener('mousedown', close)
		document.addEventListener('keydown', close)
		return () => {
			document.removeEventListener('mousedown', close)
			document.removeEventListener('keydown', close)
		}
	}, [open])
	return (
		<div className="action-menu" ref={ref}>
			<button type="button" className="icon-btn" aria-label={label} aria-haspopup="menu" aria-expanded={open}
				onClick={() => setOpen((o) => !o)}>
				{trigger}
			</button>
			{open && (
				<div className="popover action-menu-pop" role="menu">
					{actions.map((a, i) => a === 'separator'
						? <hr key={`sep-${i}`} />
						: (
							<button key={a.label} type="button" role="menuitem" className={`menu-item${a.danger ? ' menu-item--danger' : ''}`}
								disabled={a.disabled} title={a.hint} onClick={() => { setOpen(false); a.onSelect() }}>
								{a.icon}<span>{a.label}</span>
							</button>
						))}
				</div>
			)}
		</div>
	)
}

// --- Fenêtre de dialogue (modale native <dialog>) -----------------------------------
export function Dialog({ open, onClose, title, children, footer, wide }: {
	open: boolean
	onClose: () => void
	title: string
	children: ReactNode
	footer?: ReactNode
	wide?: boolean
}) {
	const ref = useRef<HTMLDialogElement>(null)
	useEffect(() => {
		const d = ref.current
		if (!d) return
		if (open && !d.open) d.showModal()
		if (!open && d.open) d.close()
	}, [open])
	return (
		<dialog ref={ref} className={`dialog${wide ? ' dialog--wide' : ''}`} onClose={onClose}
			onClick={(e) => { if (e.target === ref.current) onClose() }} aria-labelledby="dialog-title">
			<div className="dialog-inner">
				<h2 id="dialog-title" className="dialog-title">{title}</h2>
				<div className="dialog-body">{children}</div>
				{footer && <div className="dialog-footer">{footer}</div>}
			</div>
		</dialog>
	)
}

// --- Notifications éphémères (toasts) ----------------------------------------------
type Toast = { id: number; text: string; tone: 'good' | 'critical' }
const ToastContext = createContext<(text: string, tone?: 'good' | 'critical') => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
	const [toasts, setToasts] = useState<Toast[]>([])
	const push = useCallback((text: string, tone: 'good' | 'critical' = 'good') => {
		const id = Date.now() + Math.random()
		setToasts((t) => [...t, { id, text, tone }])
		setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'critical' ? 7000 : 4000)
	}, [])
	return (
		<ToastContext.Provider value={push}>
			{children}
			<div className="toasts" aria-live="polite">
				{toasts.map((t) => (
					<div key={t.id} className={`toast toast--${t.tone}`}>
						{t.tone === 'critical' ? <IconAlert size={18} /> : <span className="badge-dot" />}
						<span>{t.text}</span>
					</div>
				))}
			</div>
		</ToastContext.Provider>
	)
}

export const useToast = () => useContext(ToastContext)

// --- Chargement de données : garde l'affichage précédent pendant l'actualisation ----
export function useData<T>(load: () => Promise<T>, deps: unknown[], refreshMs = 0) {
	const [data, setData] = useState<T | null>(null)
	const [error, setError] = useState('')
	const [loading, setLoading] = useState(true)
	const [stamp, setStamp] = useState(0)
	const [loadedAt, setLoadedAt] = useState<number | null>(null)
	useEffect(() => {
		let alive = true
		setLoading(true)
		load()
			.then((d) => { if (alive) { setData(d); setError(''); setLoadedAt(Date.now()) } })
			.catch((e: Error) => { if (alive) setError(e.message || 'Chargement impossible.') })
			.finally(() => { if (alive) setLoading(false) })
		return () => { alive = false }
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [...deps, stamp])
	useEffect(() => {
		if (!refreshMs) return
		const t = setInterval(() => setStamp((s) => s + 1), refreshMs)
		return () => clearInterval(t)
	}, [refreshMs])
	const reload = useCallback(() => setStamp((s) => s + 1), [])
	return { data, error, loading, reload, loadedAt, setData }
}

/** Texte « il y a 12 s » qui se met à jour tout seul. */
export function useTicker(ms = 5000) {
	const [, set] = useState(0)
	useEffect(() => {
		const t = setInterval(() => set((n) => n + 1), ms)
		return () => clearInterval(t)
	}, [ms])
}
