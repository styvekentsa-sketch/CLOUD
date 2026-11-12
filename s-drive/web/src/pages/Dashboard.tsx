import { useAuth } from '../auth'
import { AppShell } from '../components/AppShell'
import { IconUser } from '../components/Icons'
import { ago, date, greeting } from '../format'
import { Overview } from './admin/Overview'

/** Tableau de bord personnel (utilisateurs) : accueil + mon compte. */
function PersonalDashboard() {
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
					<section className="widget" aria-labelledby="w-account">
						<h2 className="widget-title" id="w-account"><IconUser size={20} /> Mon compte</h2>
						<dl className="kv">
							<dt>Identifiant</dt><dd>{user.username}</dd>
							<dt>E-mail</dt><dd>{user.email}</dd>
							<dt>Rôle</dt><dd>Utilisateur</dd>
							<dt>Membre depuis</dt><dd>{date(user.createdAt)}</dd>
							<dt>Dernière connexion</dt><dd>{ago(user.lastLoginAt)}</dd>
						</dl>
					</section>
				</div>
			</div>
		</AppShell>
	)
}

/** Administrateurs : console d'administration ; utilisateurs : tableau de bord personnel. */
export function Dashboard() {
	const { user } = useAuth()
	if (!user) return null
	return user.role === 'admin' ? <Overview /> : <PersonalDashboard />
}
