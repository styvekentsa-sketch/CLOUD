import { useEffect, useState } from 'react'
import { api, type AdminUser } from '../api'
import { useAuth } from '../auth'
import { AppShell } from '../components/AppShell'
import { Avatar } from '../components/Avatar'
import { IconPlus, IconUser } from '../components/Icons'
import { ago, date, greeting } from '../format'

type Summary = { total: number; online: number; activeToday: number }

/** Widget « Comptes S-Drive » (administrateurs) — actualisé toutes les 60 s. */
function UsersWidget() {
	const [data, setData] = useState<{ users: AdminUser[]; summary: Summary } | null>(null)
	const [error, setError] = useState('')

	useEffect(() => {
		let alive = true
		const load = () => api.adminUsers()
			.then((d) => { if (alive) { setData(d); setError('') } })
			.catch(() => { if (alive) setError('Impossible de charger les comptes.') })
		load()
		const t = setInterval(load, 60_000)
		return () => { alive = false; clearInterval(t) }
	}, [])

	return (
		<section className="widget" aria-labelledby="w-users">
			<h2 className="widget-title" id="w-users"><IconUser size={20} /> Comptes S-Drive</h2>
			{error && <p className="widget-empty">{error}</p>}
			{!data && !error && <p className="widget-empty">Chargement…</p>}
			{data && (
				<ul className="widget-list">
					<li className="widget-item widget-item--summary">
						<span className="widget-item-icon"><IconUser size={22} /></span>
						<div>
							<strong>{data.summary.total} compte{data.summary.total > 1 ? 's' : ''} · {data.summary.online} en ligne</strong>
							<span>Actifs aujourd'hui : {data.summary.activeToday}</span>
						</div>
					</li>
					{data.users.slice(0, 6).map((u) => (
						<li className="widget-item" key={u.id}>
							<Avatar name={u.displayName} seed={u.username} size={40} status={u.online ? 'online' : 'offline'} />
							<div>
								<strong>{u.displayName}</strong>
								<span>
									{[
										u.role === 'admin' ? 'Administrateur' : `@${u.username}`,
										u.online ? 'En ligne' : u.lastLoginAt ? `Vu ${ago(u.lastLoginAt)}` : 'Jamais connecté',
										u.status === 'disabled' ? 'désactivé' : '',
									].filter(Boolean).join(' · ')}
								</span>
							</div>
						</li>
					))}
				</ul>
			)}
			<div className="widget-buttons">
				<button type="button" className="btn btn-secondary" disabled title="Bientôt disponible"><IconPlus size={18} /> Ajouter un compte</button>
				<button type="button" className="btn btn-secondary" disabled title="Bientôt disponible">Gérer les comptes</button>
			</div>
		</section>
	)
}

function AccountWidget() {
	const { user } = useAuth()
	if (!user) return null
	return (
		<section className="widget" aria-labelledby="w-account">
			<h2 className="widget-title" id="w-account"><IconUser size={20} /> Mon compte</h2>
			<dl className="kv">
				<dt>Identifiant</dt><dd>{user.username}</dd>
				<dt>E-mail</dt><dd>{user.email}</dd>
				<dt>Rôle</dt><dd>{user.role === 'admin' ? 'Administrateur' : 'Utilisateur'}</dd>
				<dt>Membre depuis</dt><dd>{date(user.createdAt)}</dd>
				<dt>Dernière connexion</dt><dd>{ago(user.lastLoginAt)}</dd>
			</dl>
		</section>
	)
}

export function Dashboard() {
	const { user } = useAuth()
	if (!user) return null
	return (
		<AppShell>
			<div className="dashboard">
				<div className="dashboard-head">
					<h1>{greeting(user.displayName)}</h1>
					<p>{new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
				</div>
				<div className="dashboard-widgets">
					{user.role === 'admin' && <UsersWidget />}
					<AccountWidget />
				</div>
			</div>
		</AppShell>
	)
}
