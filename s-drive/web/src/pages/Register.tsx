import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { api, ApiError } from '../api'
import { useAuth } from '../auth'
import { Checkbox, Field, GuestLayout } from '../components/Guest'
import { IconAlert } from '../components/Icons'

/** Indicateur simple de solidité du mot de passe (longueur + variété). */
function strength(pw: string, min: number): { score: number; label: string } {
	if (!pw) return { score: 0, label: '' }
	let s = 0
	if (pw.length >= min) s++
	if (pw.length >= min + 4) s++
	if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++
	if (/\d/.test(pw)) s++
	if (/[^A-Za-z0-9]/.test(pw)) s++
	if (pw.length < min) return { score: 1, label: `Trop court (${pw.length}/${min})` }
	return s <= 2 ? { score: 2, label: 'Moyen' } : s <= 3 ? { score: 3, label: 'Bon' } : { score: 4, label: 'Très bon' }
}

export function Register() {
	const { user, config, setUser } = useAuth()
	const navigate = useNavigate()
	const min = config?.passwordMinLength ?? 12

	const [form, setForm] = useState({ username: '', displayName: '', email: '', password: '' })
	const [remember, setRemember] = useState(true)
	const [fields, setFields] = useState<Record<string, string>>({})
	const [error, setError] = useState('')
	const [busy, setBusy] = useState(false)

	if (user) return <Navigate to="/tableau-de-bord" replace />
	if (config && !config.registrationEnabled) {
		return (
			<GuestLayout>
				<h1 className="guest-title">Création de compte fermée</h1>
				<p className="guest-note">Demandez à l’administrateur de S-Drive de vous créer un compte.</p>
				<Link to="/connexion" className="btn btn-secondary btn-wide">Retour à la connexion</Link>
			</GuestLayout>
		)
	}

	const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
		setForm((f) => ({ ...f, [k]: e.target.value }))
		setFields((f) => ({ ...f, [k]: '' }))
	}
	const st = strength(form.password, min)

	async function submit(e: FormEvent) {
		e.preventDefault()
		if (busy) return
		setBusy(true)
		setError('')
		setFields({})
		try {
			const { user } = await api.register({ ...form, remember })
			setUser(user)
			navigate('/tableau-de-bord', { replace: true })
		} catch (err) {
			if (err instanceof ApiError) {
				setFields(err.fields)
				if (!Object.keys(err.fields).length) setError(err.message)
			} else {
				setError('Une erreur est survenue.')
			}
		} finally {
			setBusy(false)
		}
	}

	return (
		<GuestLayout>
			<form className="login-form" onSubmit={submit} noValidate>
				<h1 className="guest-title">Créer un compte S-Drive</h1>

				<Field label="Identifiant" autoComplete="username" autoCapitalize="none" spellCheck={false} autoFocus
					value={form.username} onChange={set('username')} error={fields.username}
					hint="Lettres minuscules, chiffres, « . », « - » ou « _ ». Vous l'utiliserez pour vous connecter." />
				<Field label="Nom complet" autoComplete="name" value={form.displayName} onChange={set('displayName')}
					error={fields.displayName} />
				<Field label="Adresse e-mail" type="email" autoComplete="email" value={form.email} onChange={set('email')}
					error={fields.email} />
				<Field label="Mot de passe" type="password" autoComplete="new-password" value={form.password}
					onChange={set('password')} error={fields.password}
					hint={st.label ? undefined : `Au moins ${min} caractères.`} />
				{st.label && !fields.password && (
					<div className={`strength strength--${st.score}`} aria-live="polite">
						<span className="strength-bar" /><span className="strength-label">{st.label}</span>
					</div>
				)}

				{error && <p className="form-error" role="alert"><IconAlert size={20} /><span>{error}</span></p>}

				<Checkbox label="Se souvenir de moi" checked={remember} onChange={setRemember} />

				<button type="submit" className="btn btn-primary btn-wide"
					disabled={busy || !form.username || !form.displayName || !form.email || form.password.length < min}>
					{busy ? 'Création…' : 'Créer mon compte'}
				</button>
				<Link to="/connexion" className="link-button">J'ai déjà un compte : se connecter</Link>
			</form>
		</GuestLayout>
	)
}
