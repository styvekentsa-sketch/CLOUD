import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { IconAlert } from './Icons'

// --- Pastilles d'état : toujours icône + texte, jamais la couleur seule ----------
export type Tone = 'good' | 'warning' | 'critical' | 'neutral' | 'info'

export function Badge({ tone = 'neutral', icon, children }: { tone?: Tone; icon?: ReactNode; children: ReactNode }) {
	return (
		<span className={`badge badge--${tone}`}>
			{icon ?? <span className="badge-dot" aria-hidden="true" />}
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

/**
 * Menu d'actions (⋯). Le menu est rendu dans une couche flottante attachée à <body>
 * (portail) en position fixe : il n'est jamais rogné par un tableau, une carte ou une
 * barre de défilement. Il s'ouvre vers le bas, ou vers le haut s'il manque de place,
 * reste dans l'écran, se ferme au défilement / redimensionnement / Échap / clic ailleurs.
 * Clavier : flèches haut/bas pour parcourir, Échap pour fermer (le focus revient au bouton).
 */
export function ActionMenu({ actions, label, trigger }: { actions: MenuAction[]; label: string; trigger: ReactNode }) {
	const [open, setOpen] = useState(false)
	const [pos, setPos] = useState<{ top: number; left: number; maxHeight: number } | null>(null)
	const btn = useRef<HTMLButtonElement>(null)
	const pop = useRef<HTMLDivElement>(null)

	const close = useCallback((focusButton = false) => {
		setOpen(false)
		setPos(null)
		if (focusButton) btn.current?.focus()
	}, [])

	// Placement calculé après rendu (on connaît alors la taille réelle du menu)
	useLayoutEffect(() => {
		if (!open || !btn.current || !pop.current) return
		const margin = 8
		const b = btn.current.getBoundingClientRect()
		const w = pop.current.offsetWidth
		const h = pop.current.scrollHeight
		const vw = window.innerWidth
		const vh = window.innerHeight
		const below = vh - b.bottom - margin
		const above = b.top - margin
		const openUp = h > below && above > below
		const maxHeight = Math.max(120, openUp ? above - 4 : below - 4)
		const top = openUp ? Math.max(margin, b.top - 4 - Math.min(h, maxHeight)) : b.bottom + 4
		const left = Math.min(Math.max(margin, b.right - w), vw - w - margin)
		setPos({ top, left, maxHeight })
		pop.current.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
	}, [open])

	useEffect(() => {
		if (!open) return
		const onDown = (e: MouseEvent) => {
			const t = e.target as Node
			if (!pop.current?.contains(t) && !btn.current?.contains(t)) close()
		}
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') { e.preventDefault(); close(true); return }
			if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
			const items = [...(pop.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]
			if (!items.length) return
			e.preventDefault()
			const i = items.indexOf(document.activeElement as HTMLButtonElement)
			items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus()
		}
		// Défilement d'un conteneur ou de la page : le menu se fermerait loin de son bouton
		const onScroll = (e: Event) => { if (!pop.current?.contains(e.target as Node)) close() }
		const onResize = () => close()
		document.addEventListener('mousedown', onDown)
		document.addEventListener('keydown', onKey)
		window.addEventListener('scroll', onScroll, true)
		window.addEventListener('resize', onResize)
		return () => {
			document.removeEventListener('mousedown', onDown)
			document.removeEventListener('keydown', onKey)
			window.removeEventListener('scroll', onScroll, true)
			window.removeEventListener('resize', onResize)
		}
	}, [open, close])

	return (
		<div className="action-menu">
			<button ref={btn} type="button" className="icon-btn" aria-label={label} aria-haspopup="menu" aria-expanded={open}
				onClick={() => (open ? close() : setOpen(true))}>
				{trigger}
			</button>
			{open && createPortal(
				<div ref={pop} className="popover action-menu-pop" role="menu" aria-label={label}
					style={pos
						? { position: 'fixed', top: pos.top, left: pos.left, maxHeight: pos.maxHeight }
						: { position: 'fixed', top: 0, left: 0, visibility: 'hidden' }}>
					{actions.map((a, i) => a === 'separator'
						? <hr key={`sep-${i}`} />
						: (
							<button key={a.label} type="button" role="menuitem" className={`menu-item${a.danger ? ' menu-item--danger' : ''}`}
								disabled={a.disabled} title={a.hint} onClick={() => { close(true); a.onSelect() }}>
								{a.icon}<span>{a.label}</span>
							</button>
						))}
				</div>,
				document.body,
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
