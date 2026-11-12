import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth'
import { GuestLayout } from './Guest'
import { IconRefresh, IconSettings } from './Icons'

/**
 * Écran affiché aux utilisateurs pendant une maintenance. Vérifie tout seul
 * toutes les 30 s si S-Drive est de nouveau disponible.
 */
export function MaintenanceScreen() {
	const { maintenance, config, retry, logout } = useAuth()
	const [checking, setChecking] = useState(false)
	const [checkedAt, setCheckedAt] = useState<Date | null>(null)
	const message = maintenance.message || config?.maintenance.message ||
		'S-Drive est en cours de maintenance. Merci de réessayer un peu plus tard.'

	const check = async () => {
		setChecking(true)
		await retry()
		setCheckedAt(new Date())
		setChecking(false)
	}

	useEffect(() => {
		const t = setInterval(() => { void retry().then(() => setCheckedAt(new Date())) }, 30_000)
		return () => clearInterval(t)
	}, [retry])

	return (
		<GuestLayout>
			<div className="maintenance-screen" role="status" aria-live="polite">
				<span className="maintenance-icon" aria-hidden="true"><IconSettings size={34} /></span>
				<h1 className="guest-title">Maintenance en cours</h1>
				<p className="maintenance-message">{message}</p>
				<p className="guest-note">Vos fichiers sont en sécurité. Cette page se rafraîchit d’elle-même dès que S-Drive est de nouveau disponible.</p>
				<button type="button" className="btn btn-primary btn-wide" onClick={check} disabled={checking}>
					<IconRefresh size={18} className={checking ? 'spin' : undefined} />
					<span>{checking ? 'Vérification…' : 'Réessayer maintenant'}</span>
				</button>
				{checkedAt && <p className="guest-note">Dernière vérification à {checkedAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</p>}
				<Link to="/connexion" className="link-button" onClick={() => { void logout() }}>
					Connexion administrateur
				</Link>
			</div>
		</GuestLayout>
	)
}
