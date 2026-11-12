import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { api, type Preferences, type WidgetSize } from '../../api'
import { useAuth } from '../../auth'
import {
	IconChevronLeft, IconChevronRight, IconDrag, IconEdit, IconPlus, IconRefresh, IconX,
} from '../../components/Icons'
import { Dialog, Segmented, useData, useTicker, useToast } from '../../components/ui'
import { ago, greeting } from '../../format'
import { AdminLayout, PageHeader } from './AdminLayout'
import { DashboardDataContext, DEFAULT_LAYOUT, SIZE_LABEL, WIDGET_MAP, WIDGETS, WidgetLink } from './widgets'

type Item = { id: string; size: WidgetSize }
type Days = 7 | 30 | 90

const REFRESH_MS = 60_000

function cleanLayout(items: Item[] | undefined): Item[] {
	const valid = (items ?? []).filter((i) => {
		const def = WIDGET_MAP.get(i.id)
		return def && def.sizes.includes(i.size)
	})
	return valid.length ? valid : DEFAULT_LAYOUT
}

export function Overview() {
	const { user } = useAuth()
	const toast = useToast()
	useTicker(5000)

	// Préférences (disposition + période) enregistrées sur le compte
	const [layout, setLayout] = useState<Item[] | null>(null)
	const [days, setDays] = useState<Days>(30)
	const [editing, setEditing] = useState(false)
	const [adding, setAdding] = useState(false)
	const saved = useRef<string>('')

	useEffect(() => {
		api.preferences()
			.then(({ preferences }) => {
				setLayout(cleanLayout(preferences.dashboard?.widgets))
				if (preferences.dashboard?.days) setDays(preferences.dashboard.days)
				saved.current = JSON.stringify(preferences.dashboard ?? {})
			})
			.catch(() => setLayout(DEFAULT_LAYOUT))
	}, [])

	const save = async (next: Item[], nextDays: Days) => {
		const prefs: Preferences = { dashboard: { widgets: next, days: nextDays } }
		const key = JSON.stringify(prefs.dashboard)
		if (key === saved.current) return
		try {
			await api.savePreferences(prefs)
			saved.current = key
		} catch {
			toast('Impossible d’enregistrer la disposition.', 'critical')
		}
	}

	// Données (toutes les sources en parallèle, actualisées chaque minute)
	const overview = useData(() => api.overview(days), [days], REFRESH_MS)
	const users = useData(() => api.adminUsers(), [], REFRESH_MS)
	const events = useData(() => api.events({ limit: 8 }), [], REFRESH_MS)
	const system = useData(() => api.system(), [], REFRESH_MS)
	const storage = useData(() => api.storage(), [], REFRESH_MS)
	const shares = useData(() => api.shareStats(), [], REFRESH_MS)
	const reloadAll = () => { overview.reload(); users.reload(); events.reload(); system.reload(); storage.reload(); shares.reload() }
	const loading = overview.loading || users.loading || events.loading || system.loading || storage.loading || shares.loading

	const data = useMemo(() => ({
		overview: overview.data,
		users: users.data?.users ?? null,
		events: events.data?.events ?? null,
		system: system.data,
		storage: storage.data,
		shares: shares.data,
		days,
	}), [overview.data, users.data, events.data, system.data, storage.data, shares.data, days])

	const changeDays = (d: Days) => {
		setDays(d)
		if (layout) void save(layout, d)
	}

	// --- Personnalisation ----------------------------------------------------------
	const update = (next: Item[]) => setLayout(next)
	const move = (index: number, dir: -1 | 1) => {
		if (!layout) return
		const j = index + dir
		if (j < 0 || j >= layout.length) return
		const next = [...layout]
		;[next[index], next[j]] = [next[j], next[index]]
		update(next)
	}
	const resize = (index: number, size: WidgetSize) => layout && update(layout.map((it, i) => (i === index ? { ...it, size } : it)))
	const remove = (index: number) => layout && update(layout.filter((_, i) => i !== index))
	const add = (id: string) => {
		const def = WIDGET_MAP.get(id)
		if (!def || !layout) return
		update([...layout, { id, size: def.defaultSize }])
		toast(`« ${def.title} » ajouté en bas du tableau de bord.`)
	}
	const finish = () => {
		setEditing(false)
		setAdding(false)
		if (layout) void save(layout, days)
	}

	// Glisser-déposer (souris) — les boutons ‹ › font la même chose au clavier
	const dragFrom = useRef<number | null>(null)
	const [dragOver, setDragOver] = useState<number | null>(null)
	const onDragStart = (i: number) => (e: DragEvent) => {
		dragFrom.current = i
		e.dataTransfer.effectAllowed = 'move'
		e.dataTransfer.setData('text/plain', String(i))
	}
	const onDrop = (i: number) => (e: DragEvent) => {
		e.preventDefault()
		const from = dragFrom.current
		setDragOver(null)
		dragFrom.current = null
		if (from === null || from === i || !layout) return
		const next = [...layout]
		const [moved] = next.splice(from, 1)
		next.splice(i, 0, moved)
		update(next)
	}

	const hidden = WIDGETS.filter((w) => !layout?.some((i) => i.id === w.id))
	const loadedAt = overview.loadedAt

	return (
		<AdminLayout>
			<PageHeader
				title="Vue d’ensemble"
				subtitle={<>{user && greeting(user.displayName)} — {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</>}
				actions={
					editing ? (
						<>
							<button type="button" className="btn btn-secondary" onClick={() => setAdding(true)}>
								<IconPlus size={18} /> Ajouter un widget
							</button>
							<button type="button" className="btn btn-ghost" onClick={() => update(DEFAULT_LAYOUT)}>Réinitialiser</button>
							<button type="button" className="btn btn-primary" onClick={finish}>Terminer</button>
						</>
					) : (
						<>
							<Segmented<Days> label="Période" value={days} onChange={changeDays}
								options={[{ value: 7, label: '7 j' }, { value: 30, label: '30 j' }, { value: 90, label: '90 j' }]} />
							<button type="button" className="btn btn-ghost" onClick={reloadAll} disabled={loading}
								title="Actualiser maintenant">
								<IconRefresh size={18} className={loading ? 'spin' : undefined} />
								<span className="hide-sm">{loadedAt ? `Mis à jour ${ago(new Date(loadedAt).toISOString())}` : 'Chargement…'}</span>
							</button>
							<button type="button" className="btn btn-secondary" onClick={() => setEditing(true)}>
								<IconEdit size={18} /> Personnaliser
							</button>
						</>
					)
				}
			/>

			{editing && (
				<div className="edit-banner" role="status">
					<IconDrag size={18} />
					<span>Mode personnalisation : glissez les widgets pour les réordonner (ou utilisez ‹ ›), changez leur taille, retirez-les avec ×. La disposition est enregistrée sur votre compte.</span>
				</div>
			)}
			{overview.error && <p className="form-error" role="alert">{overview.error}</p>}

			<DashboardDataContext.Provider value={data}>
				<div className={`widgets${loading && overview.data ? ' is-refreshing' : ''}${editing ? ' is-editing' : ''}`}>
					{layout?.map((item, i) => {
						const def = WIDGET_MAP.get(item.id)
						if (!def) return null
						const Body = def.Body
						return (
							<section key={item.id} className={`widget-card wk-${def.kind} size-${item.size}${dragOver === i ? ' is-drop' : ''}`}
								aria-labelledby={`w-${item.id}`}
								draggable={editing} onDragStart={editing ? onDragStart(i) : undefined}
								onDragOver={editing ? (e) => { e.preventDefault(); setDragOver(i) } : undefined}
								onDragLeave={editing ? () => setDragOver((d) => (d === i ? null : d)) : undefined}
								onDrop={editing ? onDrop(i) : undefined}
								onDragEnd={() => setDragOver(null)}>
								<header className="w-head">
									{editing && <span className="w-grip" aria-hidden="true"><IconDrag size={18} /></span>}
									<span className="w-icon" aria-hidden="true">{def.icon}</span>
									<h2 id={`w-${item.id}`}>{def.title}</h2>
									{!editing && def.link && <WidgetLink {...def.link} />}
									{editing && (
										<div className="w-tools">
											<button type="button" className="icon-btn" onClick={() => move(i, -1)} disabled={i === 0}
												aria-label={`Déplacer « ${def.title} » avant`}><IconChevronLeft size={18} /></button>
											<button type="button" className="icon-btn" onClick={() => move(i, 1)} disabled={i === layout.length - 1}
												aria-label={`Déplacer « ${def.title} » après`}><IconChevronRight size={18} /></button>
											<select value={item.size} onChange={(e) => resize(i, Number(e.target.value) as WidgetSize)}
												aria-label={`Taille de « ${def.title} »`}>
												{def.sizes.map((s) => <option key={s} value={s}>{SIZE_LABEL[s]}</option>)}
											</select>
											<button type="button" className="icon-btn" onClick={() => remove(i)}
												aria-label={`Retirer « ${def.title} »`}><IconX size={18} /></button>
										</div>
									)}
								</header>
								<div className="w-body"><Body /></div>
							</section>
						)
					})}
					{editing && (
						<button type="button" className="widget-add size-3" onClick={() => setAdding(true)}>
							<IconPlus size={24} />
							<span>Ajouter un widget</span>
						</button>
					)}
				</div>
			</DashboardDataContext.Provider>

			<Dialog open={adding} onClose={() => setAdding(false)} title="Ajouter un widget" wide
				footer={<button type="button" className="btn btn-secondary" onClick={() => setAdding(false)}>Fermer</button>}>
				{hidden.length === 0 ? (
					<p className="muted">Tous les widgets sont déjà affichés.</p>
				) : (
					<ul className="catalog">
						{hidden.map((w) => (
							<li key={w.id}>
								<span className="w-icon">{w.icon}</span>
								<div>
									<strong>{w.title}</strong>
									<span className="muted">{w.description}</span>
								</div>
								<button type="button" className="btn btn-secondary" onClick={() => add(w.id)}>
									<IconPlus size={18} /> Ajouter
								</button>
							</li>
						))}
					</ul>
				)}
			</Dialog>
		</AdminLayout>
	)
}
