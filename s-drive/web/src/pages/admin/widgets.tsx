// =============================================================================
//  Catalogue des widgets du tableau de bord d'administration.
//  Pour ajouter un widget : une entrée dans WIDGETS (id, titre, tailles, rendu).
//  Il apparaît alors dans « Personnaliser > Ajouter un widget ».
// =============================================================================
import { createContext, useContext, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { AdminUser, Overview, SecurityEvent, SystemInfo, WidgetSize } from '../../api'
import { Avatar } from '../../components/Avatar'
import { ColumnChart, Heatmap, LineChart, SegmentedBar, Sparkline } from '../../components/charts/Charts'
import {
	IconActivity, IconAlert, IconChevronRight, IconClock, IconDevice, IconLogin, IconServer, IconShield,
	IconUser, IconUserPlus,
} from '../../components/Icons'
import { Badge } from '../../components/ui'
import { ago, bytes, duration, num, shortDay } from '../../format'
import { eventKind, eventSentence } from './events'

// --- Données partagées par tous les widgets (une seule requête par source) -------
export type DashboardData = {
	overview: Overview | null
	users: AdminUser[] | null
	events: SecurityEvent[] | null
	system: SystemInfo | null
	days: number
}
export const DashboardDataContext = createContext<DashboardData>({ overview: null, users: null, events: null, system: null, days: 30 })
const useDash = () => useContext(DashboardDataContext)

// Couleurs des séries (validées daltonisme + contraste, thème clair et sombre)
const S1 = 'var(--series-1)'
const S2 = 'var(--series-2)'

const periodLabel = (days: number) => `${days} derniers jours`

// --- Briques ----------------------------------------------------------------------
function Loading() {
	return <div className="w-loading" aria-busy="true"><span /><span /><span /></div>
}

function Empty({ children }: { children: ReactNode }) {
	return <p className="w-empty">{children}</p>
}

/** Variation vs période précédente : flèche + texte ; couleur selon que la hausse est bonne ou non. */
function Delta({ value, upIsGood = true }: { value: number | null | undefined; upIsGood?: boolean }) {
	if (value === null || value === undefined) return <span className="delta delta--flat">— pas de comparaison</span>
	if (value === 0) return <span className="delta delta--flat">= stable</span>
	const good = value > 0 === upIsGood
	return (
		<span className={`delta ${good ? 'delta--good' : 'delta--bad'}`}>
			<span aria-hidden="true">{value > 0 ? '▲' : '▼'}</span> {value > 0 ? '+' : ''}{value} %
			<span className="sr-only">{good ? ' (favorable)' : ' (défavorable)'}</span>
		</span>
	)
}

function Kpi({ label, value, sub, delta, upIsGood, spark }: {
	label: string
	value: number | undefined
	sub?: ReactNode
	delta?: number | null
	upIsGood?: boolean
	spark?: number[]
}) {
	if (value === undefined) return <Loading />
	return (
		<div className="kpi">
			<div className="kpi-label">{label}</div>
			<div className="kpi-value">{num(value)}</div>
			<div className="kpi-sub">
				{delta !== undefined && <Delta value={delta} upIsGood={upIsGood} />}
				{sub && <span className="muted">{sub}</span>}
			</div>
			{spark && <Sparkline values={spark} />}
		</div>
	)
}

// --- Définition d'un widget --------------------------------------------------------
export type WidgetDef = {
	id: string
	title: string
	description: string
	icon: ReactNode
	sizes: WidgetSize[]
	defaultSize: WidgetSize
	kind: 'kpi' | 'chart' | 'list'
	link?: { to: string; label: string }
	Body: () => ReactNode
}

export const WIDGETS: WidgetDef[] = [
	// ---------------------------------------------------------------- Indicateurs
	{
		id: 'kpi-active', title: 'Utilisateurs actifs', kind: 'kpi', icon: <IconActivity size={18} />,
		description: 'Personnes ayant utilisé S-Drive sur la période, comparé à la période précédente.',
		sizes: [3, 4, 6], defaultSize: 3,
		Body: () => {
			const { overview: o, days } = useDash()
			return <Kpi label={periodLabel(days)} value={o?.kpis.activeUsers.value} delta={o?.kpis.activeUsers.delta}
				spark={o?.series.map((d) => d.active)} />
		},
	},
	{
		id: 'kpi-logins', title: 'Connexions', kind: 'kpi', icon: <IconLogin size={18} />,
		description: 'Connexions réussies sur la période.',
		sizes: [3, 4, 6], defaultSize: 3,
		Body: () => {
			const { overview: o, days } = useDash()
			return <Kpi label={periodLabel(days)} value={o?.kpis.logins.value} delta={o?.kpis.logins.delta}
				spark={o?.series.map((d) => d.logins)} />
		},
	},
	{
		id: 'kpi-failures', title: 'Échecs de connexion', kind: 'kpi', icon: <IconAlert size={18} />,
		description: 'Mots de passe erronés ou identifiants inconnus. Une hausse peut signaler une attaque.',
		sizes: [3, 4, 6], defaultSize: 3, link: { to: '/tableau-de-bord/journal?groupe=failures', label: 'Voir les échecs' },
		Body: () => {
			const { overview: o, days } = useDash()
			return <Kpi label={periodLabel(days)} value={o?.kpis.failures.value} delta={o?.kpis.failures.delta} upIsGood={false}
				spark={o?.series.map((d) => d.failures)} />
		},
	},
	{
		id: 'kpi-online', title: 'En ligne maintenant', kind: 'kpi', icon: <IconDevice size={18} />,
		description: 'Personnes actives dans les 5 dernières minutes et sessions ouvertes.',
		sizes: [3, 4, 6], defaultSize: 3, link: { to: '/tableau-de-bord/sessions', label: 'Voir les sessions' },
		Body: () => {
			const { overview: o } = useDash()
			return <Kpi label="5 dernières minutes" value={o?.kpis.online.value}
				sub={o && `${num(o.kpis.sessions.value)} session${o.kpis.sessions.value > 1 ? 's' : ''} ouverte${o.kpis.sessions.value > 1 ? 's' : ''}`} />
		},
	},
	{
		id: 'kpi-users', title: 'Comptes', kind: 'kpi', icon: <IconUser size={18} />,
		description: 'Nombre total de comptes et évolution.',
		sizes: [3, 4, 6], defaultSize: 3, link: { to: '/tableau-de-bord/comptes', label: 'Gérer les comptes' },
		Body: () => {
			const { overview: o, days } = useDash()
			return <Kpi label="Au total" value={o?.kpis.totalUsers.value}
				sub={o && `+${num(o.kpis.totalUsers.added ?? 0)} en ${days} j`} spark={o?.series.map((d) => d.total)} />
		},
	},
	{
		id: 'kpi-signups', title: 'Inscriptions', kind: 'kpi', icon: <IconUserPlus size={18} />,
		description: 'Nouveaux comptes sur la période.',
		sizes: [3, 4, 6], defaultSize: 3,
		Body: () => {
			const { overview: o, days } = useDash()
			return <Kpi label={periodLabel(days)} value={o?.kpis.signups.value} delta={o?.kpis.signups.delta}
				spark={o?.series.map((d) => d.signups)} />
		},
	},

	// ---------------------------------------------------------------- Graphiques
	{
		id: 'chart-logins', title: 'Connexions par jour', kind: 'chart', icon: <IconLogin size={18} />,
		description: 'Connexions réussies et échouées, jour par jour.',
		sizes: [6, 8, 12], defaultSize: 8,
		Body: () => {
			const { overview: o } = useDash()
			if (!o) return <Loading />
			return <LineChart data={o.series.map((d) => ({ x: d.day, logins: d.logins, failures: d.failures }))}
				series={[
					{ key: 'logins', label: 'Réussies', color: S1, area: true },
					{ key: 'failures', label: 'Échouées', color: S2, dash: true },
				]} xLabel={shortDay} />
		},
	},
	{
		id: 'chart-active', title: 'Utilisateurs actifs par jour', kind: 'chart', icon: <IconActivity size={18} />,
		description: 'Nombre de personnes différentes actives chaque jour.',
		sizes: [6, 8, 12], defaultSize: 6,
		Body: () => {
			const { overview: o } = useDash()
			if (!o) return <Loading />
			return <LineChart data={o.series.map((d) => ({ x: d.day, active: d.active }))}
				series={[{ key: 'active', label: 'Utilisateurs actifs', color: S1, area: true }]} xLabel={shortDay} />
		},
	},
	{
		id: 'chart-signups', title: 'Inscriptions par jour', kind: 'chart', icon: <IconUserPlus size={18} />,
		description: 'Nouveaux comptes créés chaque jour.',
		sizes: [4, 6, 8, 12], defaultSize: 6,
		Body: () => {
			const { overview: o } = useDash()
			if (!o) return <Loading />
			return <ColumnChart data={o.series.map((d) => ({ x: d.day, value: d.signups }))} color={S1} label="Inscriptions" xLabel={shortDay} />
		},
	},
	{
		id: 'heatmap', title: 'Heures de connexion', kind: 'chart', icon: <IconClock size={18} />,
		description: 'À quels jours et à quelles heures vos utilisateurs se connectent.',
		sizes: [6, 8, 12], defaultSize: 6,
		Body: () => {
			const { overview: o } = useDash()
			if (!o) return <Loading />
			return <Heatmap cells={o.heatmap} label="Connexions" />
		},
	},
	{
		id: 'roles', title: 'Répartition des comptes', kind: 'chart', icon: <IconUser size={18} />,
		description: 'Administrateurs, utilisateurs et comptes désactivés.',
		sizes: [3, 4, 6], defaultSize: 4, link: { to: '/tableau-de-bord/comptes', label: 'Gérer' },
		Body: () => {
			const { overview: o } = useDash()
			if (!o) return <Loading />
			return <SegmentedBar parts={[
				{ label: 'Utilisateurs', value: o.roles.users, color: S1 },
				{ label: 'Administrateurs', value: o.roles.admins, color: S2 },
				{ label: 'Désactivés', value: o.roles.disabled, color: 'var(--neutral-mark)' },
			]} />
		},
	},

	// ---------------------------------------------------------------- Listes
	{
		id: 'security', title: 'Journal de sécurité', kind: 'list', icon: <IconShield size={18} />,
		description: 'Les derniers événements : connexions, échecs, comptes modifiés.',
		sizes: [4, 6, 8, 12], defaultSize: 6, link: { to: '/tableau-de-bord/journal', label: 'Tout le journal' },
		Body: () => {
			const { events } = useDash()
			if (!events) return <Loading />
			if (!events.length) return <Empty>Aucun événement pour l’instant.</Empty>
			return (
				<ul className="w-list">
					{events.map((e) => {
						const k = eventKind(e.type)
						return (
							<li key={e.id} className="w-row">
								<span className={`ev-icon ev-icon--${k.tone}`}>{k.icon(16)}</span>
								<div className="w-row-main">
									<strong>{eventSentence(e)}</strong>
									<span className="muted">{k.label} · {ago(e.createdAt)}{e.ip ? ` · ${e.ip}` : ''}</span>
								</div>
							</li>
						)
					})}
				</ul>
			)
		},
	},
	{
		id: 'threats', title: 'Tentatives suspectes', kind: 'list', icon: <IconAlert size={18} />,
		description: 'Blocages en cours et identifiants les plus visés par des échecs.',
		sizes: [4, 6, 8, 12], defaultSize: 6, link: { to: '/tableau-de-bord/journal?groupe=failures', label: 'Voir les échecs' },
		Body: () => {
			const { overview: o } = useDash()
			if (!o) return <Loading />
			if (!o.blocks.length && !o.topFailures.length) {
				return <Empty><Badge tone="good">Rien à signaler</Badge> Aucun échec de connexion sur la période.</Empty>
			}
			return (
				<>
					{o.blocks.length > 0 && (
						<div className="w-alert">
							<Badge tone="critical">{o.blocks.length} blocage{o.blocks.length > 1 ? 's' : ''} en cours</Badge>
							<span className="muted">{o.blocks.slice(0, 3).map((b) => `${b.login ?? 'toute l’IP'} (${b.ip}, ${b.seconds} s)`).join(' · ')}</span>
						</div>
					)}
					<table className="w-table">
						<thead><tr><th>Identifiant visé</th><th className="num">Échecs</th><th className="num">IP</th><th>Dernier</th></tr></thead>
						<tbody>
							{o.topFailures.map((f) => (
								<tr key={f.login ?? '?'}>
									<td>
										<span className="mono">{f.login ?? '—'}</span>{' '}
										{!f.existing && <Badge tone="warning">inconnu</Badge>}
									</td>
									<td className="num">{f.attempts}</td>
									<td className="num">{f.ips}</td>
									<td className="muted">{ago(f.lastAt)}</td>
								</tr>
							))}
						</tbody>
					</table>
				</>
			)
		},
	},
	{
		id: 'online', title: 'Qui est en ligne', kind: 'list', icon: <IconDevice size={18} />,
		description: 'Les personnes connectées en ce moment.',
		sizes: [3, 4, 6, 8], defaultSize: 4, link: { to: '/tableau-de-bord/sessions', label: 'Sessions' },
		Body: () => {
			const { users } = useDash()
			if (!users) return <Loading />
			const online = users.filter((u) => u.online)
			if (!online.length) return <Empty>Personne n’est en ligne en ce moment.</Empty>
			return (
				<ul className="w-list">
					{online.slice(0, 8).map((u) => (
						<li key={u.id} className="w-row">
							<Avatar name={u.displayName} seed={u.username} size={32} status="online" />
							<div className="w-row-main">
								<strong>{u.displayName}</strong>
								<span className="muted">@{u.username} · actif {ago(u.lastSeenAt ?? null)}</span>
							</div>
							{u.role === 'admin' && <Badge tone="info">Admin</Badge>}
						</li>
					))}
				</ul>
			)
		},
	},
	{
		id: 'recent-accounts', title: 'Derniers comptes créés', kind: 'list', icon: <IconUserPlus size={18} />,
		description: 'Les inscriptions et comptes ajoutés récemment.',
		sizes: [3, 4, 6, 8], defaultSize: 4, link: { to: '/tableau-de-bord/comptes', label: 'Tous les comptes' },
		Body: () => {
			const { users } = useDash()
			if (!users) return <Loading />
			const recent = [...users].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6)
			return (
				<ul className="w-list">
					{recent.map((u) => (
						<li key={u.id} className="w-row">
							<Avatar name={u.displayName} seed={u.username} size={32} status={u.online ? 'online' : 'offline'} />
							<div className="w-row-main">
								<strong>{u.displayName}</strong>
								<span className="muted">@{u.username} · inscrit {ago(u.createdAt)}</span>
							</div>
							{u.status === 'disabled' && <Badge tone="warning">Désactivé</Badge>}
						</li>
					))}
				</ul>
			)
		},
	},
	{
		id: 'system', title: 'Santé du serveur', kind: 'list', icon: <IconServer size={18} />,
		description: 'Disponibilité, mémoire, base de données.',
		sizes: [3, 4, 6], defaultSize: 4, link: { to: '/tableau-de-bord/systeme', label: 'Détails' },
		Body: () => {
			const { system: s } = useDash()
			if (!s) return <Loading />
			const memUsed = 1 - s.host.freeMem / s.host.totalMem
			const latencyTone = s.database.latencyMs < 20 ? 'good' : s.database.latencyMs < 100 ? 'warning' : 'critical'
			return (
				<div className="w-health">
					<div className="w-health-status">
						<Badge tone="good">Opérationnel</Badge>
						<span className="muted">depuis {duration(s.app.uptimeSeconds)}</span>
					</div>
					<dl className="w-kv">
						<dt>Base de données</dt>
						<dd className="dd-inline"><Badge tone={latencyTone}>{s.database.latencyMs} ms</Badge> <span className="muted">{bytes(s.database.sizeBytes)}</span></dd>
						<dt>Mémoire du serveur</dt>
						<dd>
							<div className="meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(memUsed * 100)}
								aria-label="Mémoire utilisée">
								<span className={memUsed > 0.9 ? 'meter--critical' : memUsed > 0.75 ? 'meter--warning' : ''}
									style={{ width: `${Math.round(memUsed * 100)}%` }} />
							</div>
							<span className="muted">{bytes(s.host.totalMem - s.host.freeMem)} / {bytes(s.host.totalMem)}</span>
						</dd>
						<dt>API S-Drive</dt>
						<dd>{bytes(s.process.rss)} · Node {s.app.node.replace(/^v/, '')}</dd>
					</dl>
				</div>
			)
		},
	},
]

export const WIDGET_MAP = new Map(WIDGETS.map((w) => [w.id, w]))

/** Disposition par défaut (12 colonnes). */
export const DEFAULT_LAYOUT: { id: string; size: WidgetSize }[] = [
	{ id: 'kpi-active', size: 3 },
	{ id: 'kpi-logins', size: 3 },
	{ id: 'kpi-failures', size: 3 },
	{ id: 'kpi-online', size: 3 },
	{ id: 'chart-logins', size: 8 },
	{ id: 'roles', size: 4 },
	{ id: 'chart-signups', size: 6 },
	{ id: 'heatmap', size: 6 },
	{ id: 'security', size: 6 },
	{ id: 'threats', size: 6 },
	{ id: 'online', size: 4 },
	{ id: 'recent-accounts', size: 4 },
	{ id: 'system', size: 4 },
]

export const SIZE_LABEL: Record<WidgetSize, string> = { 3: '¼', 4: '⅓', 6: '½', 8: '⅔', 12: 'Pleine largeur' }

/** Lien « Voir … » en bas à droite d'un widget. */
export function WidgetLink({ to, label }: { to: string; label: string }) {
	return (
		<Link to={to} className="w-link" title={label} aria-label={label}>
			<span className="w-link-text">{label}</span> <IconChevronRight size={16} />
		</Link>
	)
}

