import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { api, ApiError } from '../api'
import { useAuth } from '../auth'
import { Checkbox, Field, GuestLayout } from '../components/Guest'
import { IconAlert, IconArrowRight, IconSettings } from '../components/Icons'

export function Login() {
	const { user, config, setUser } = useAuth()
	const navigate = useNavigate()
	const location = useLocation()
	const from = (location.state as { from?: string } | null)?.from ?? '/tableau-de-bord'

	const [login, setLogin] = useState('')
	const [password, setPassword] = useState('')
	const [remember, setRemember] = useState(true)
	const [error, setError] = useState('')
	const [wait, setWait] = useState(0)
	const [busy, setBusy] = useState(false)
	const [forgot, setForgot] = useState(false)

	// Compte à rebours après trop de tentatives
	useEffect(() => {
		if (wait <= 0) return
		const t = setTimeout(() => setWait((w) => w - 1), 1000)
		return () => clearTimeout(t)
	}, [wait])

	if (user) return <Navigate to={from} replace />

	async function submit(e: FormEvent) {
		e.preventDefault()
		if (busy || wait > 0) return
		setBusy(true)
		setError('')
		try {
			const { user } = await api.login(login, password, remember)
			setUser(user)
			navigate(from, { replace: true })
		} catch (err) {
			if (err instanceof ApiError) {
				setError(err.message)
				if (err.retryAfter) setWait(err.retryAfter)
			} else {
				setError('Une erreur est survenue.')
			}
			setPassword('')
		} finally {
			setBusy(false)
		}
	}

	return (
		<GuestLayout>
			<form className="login-form" onSubmit={submit} noValidate>
				<h1 className="guest-title">Se connecter à S-Drive</h1>
				{config?.maintenance.enabled && (
					<div className="maintenance-banner" role="status">
						<IconSettings size={18} />
						<span><strong>Maintenance en cours.</strong> Seuls les administrateurs peuvent se connecter.</span>
					</div>
				)}

				<Field label="Nom d'utilisateur ou adresse e-mail" autoComplete="username" autoCapitalize="none"
					spellCheck={false} required value={login} onChange={(e) => setLogin(e.target.value)} autoFocus />
				<Field label="Mot de passe" type="password" autoComplete="current-password" required
					value={password} onChange={(e) => setPassword(e.target.value)} error={error ? ' ' : undefined} />

				{error && (
					<p className="form-error" role="alert">
						<IconAlert size={20} />
						<span>{wait > 0 ? `Trop de tentatives de connexion. Réessayez dans ${wait} seconde${wait > 1 ? 's' : ''}.` : error}</span>
					</p>
				)}

				<Checkbox label="Se souvenir de moi" checked={remember} onChange={setRemember} />

				<button type="submit" className="btn btn-primary btn-wide" disabled={busy || wait > 0 || !login || !password}>
					<IconArrowRight />
					<span>{busy ? 'Connexion…' : 'Se connecter'}</span>
				</button>

				<button type="button" className="link-button" onClick={() => setForgot((f) => !f)} aria-expanded={forgot}>
					Mot de passe oublié ?
				</button>
				{forgot && (
					<p className="guest-note">
						Demandez à l’administrateur de S-Drive de réinitialiser votre mot de passe.
						(La réinitialisation par e-mail arrivera dans une prochaine version.)
					</p>
				)}

				{config?.registrationMode === 'open' && !config.maintenance.enabled && (
					<Link to="/inscription" className="btn btn-secondary btn-wide">S'inscrire</Link>
				)}
				{config?.registrationMode === 'invite' && !config.maintenance.enabled && (
					<p className="guest-note">Inscription sur invitation : utilisez le lien que vous avez reçu.</p>
				)}
			</form>
		</GuestLayout>
	)
}
