import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, type SecurityEvent } from '../../api'
import { IconExport, IconSearch } from '../../components/Icons'
import { Segmented, useToast } from '../../components/ui'
import { ago, dateTime, device } from '../../format'
import { AdminLayout, PageHeader } from './AdminLayout'
import { eventKind, eventSentence } from './events'

type Group = '' | 'auth' | 'failures' | 'accounts' | 'sessions' | 'shares'

/** Export CSV de ce qui est affiché (séparateur « ; » pour Excel en français). */
function exportCsv(events: SecurityEvent[]) {
	const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
	const lines = [
		['Date', 'Type', 'Description', 'Utilisateur', 'Par', 'Adresse IP', 'Appareil'].map(esc).join(';'),
		...events.map((e) => {
			const d = device(e.userAgent)
			return [dateTime(e.createdAt), eventKind(e.type).label, eventSentence(e), e.user?.username ?? '', e.actor?.username ?? '',
				e.ip ?? '', `${d.browser} ${d.os}`.trim()].map(esc).join(';')
		}),
	]
	const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
	const a = document.createElement('a')
	a.href = URL.createObjectURL(blob)
	a.download = `s-drive-journal-${new Date().toISOString().slice(0, 10)}.csv`
	a.click()
	URL.revokeObjectURL(a.href)
}

export function Journal() {
	const toast = useToast()
	const [params, setParams] = useSearchParams()
	const group = (params.get('groupe') ?? '') as Group
	const [q, setQ] = useState('')
	const [query, setQuery] = useState('')
	const [events, setEvents] = useState<SecurityEvent[]>([])
	const [next, setNext] = useState<number | null>(null)
	const [loading, setLoading] = useState(true)

	useEffect(() => {
		const t = setTimeout(() => setQuery(q), 250)
		return () => clearTimeout(t)
	}, [q])

	useEffect(() => {
		let alive = true
		setLoading(true)
		api.events({ limit: 50, group: group || undefined, q: query || undefined })
			.then((r) => { if (alive) { setEvents(r.events); setNext(r.nextBefore) } })
			.catch(() => toast('Impossible de charger le journal.', 'critical'))
			.finally(() => { if (alive) setLoading(false) })
		return () => { alive = false }
	}, [group, query, toast])

	const more = async () => {
		if (next === null) return
		setLoading(true)
		try {
			const r = await api.events({ limit: 50, before: next, group: group || undefined, q: query || undefined })
			setEvents((e) => [...e, ...r.events])
			setNext(r.nextBefore)
		} finally {
			setLoading(false)
		}
	}

	return (
		<AdminLayout>
			<PageHeader title="Journal de sécurité"
				subtitle="Toutes les connexions, échecs et modifications de comptes, du plus récent au plus ancien."
				actions={<button type="button" className="btn btn-secondary" disabled={!events.length} onClick={() => exportCsv(events)}>
					<IconExport size={18} /> Exporter (CSV)
				</button>} />

			<div className="toolbar">
				<Segmented<Group> label="Type d’événement" value={group}
					onChange={(g) => setParams(g ? { groupe: g } : {}, { replace: true })}
					options={[
						{ value: '', label: 'Tout' },
						{ value: 'auth', label: 'Connexions' },
						{ value: 'failures', label: 'Échecs' },
						{ value: 'accounts', label: 'Comptes' },
						{ value: 'sessions', label: 'Sessions' },
						{ value: 'shares', label: 'Partages' },
					]} />
				<label className="search">
					<IconSearch size={18} />
					<input type="search" placeholder="Identifiant ou adresse IP…" value={q} onChange={(e) => setQ(e.target.value)}
						aria-label="Filtrer par identifiant ou adresse IP" />
				</label>
			</div>

			<div className={`table-card${loading && events.length ? ' is-refreshing' : ''}`}>
				<ol className="timeline">
					{events.map((e) => {
						const k = eventKind(e.type)
						const d = device(e.userAgent)
						return (
							<li key={e.id}>
								<span className={`ev-icon ev-icon--${k.tone}`}>{k.icon(16)}</span>
								<div className="timeline-main">
									<strong>{eventSentence(e)}</strong>
									<span className="muted">
										{k.label}
										{e.ip && <> · <span className="mono">{e.ip}</span></>}
										{e.userAgent && <> · {d.browser}{d.os ? ` sur ${d.os}` : ''}</>}
									</span>
								</div>
								<time dateTime={e.createdAt} title={dateTime(e.createdAt)} className="muted">{ago(e.createdAt)}</time>
							</li>
						)
					})}
				</ol>
				{!loading && events.length === 0 && <p className="table-empty">Aucun événement ne correspond.</p>}
				{next !== null && (
					<div className="timeline-more">
						<button type="button" className="btn btn-secondary" onClick={more} disabled={loading}>
							{loading ? 'Chargement…' : 'Charger plus'}
						</button>
					</div>
				)}
			</div>
		</AdminLayout>
	)
}
