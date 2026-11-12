import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
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

	// Lien d'invitation : /inscription?invitation=…
	const [params] = useSearchParams()
	const token = params.get('invitation') ?? ''
	const [invite, setInvite] = useState<{ valid: boolean; email?: string | null; expiresAt?: string; reason?: string } | null>(null)
	useEffect(() => {
		if (!token) return
		api.invitationInfo(token)
			.then((r) => {
				setInvite(r)
				if (r.valid && r.email) setForm((f) => ({ ...f, email: r.email! }))
			})
			.catch(() => setInvite({ valid: false, reason: 'invalid' }))
	}, [token])

	if (user) return <Navigate to="/tableau-de-bord" replace />

	const blocked = (title: string, text: string) => (
		<GuestLayout>
			<h1 className="guest-title">{title}</h1>
			<p className="guest-note">{text}</p>
			<Link to="/connexion" className="btn btn-secondary btn-wide">Retour à la connexion</Link>
		</GuestLayout>
	)
	if (config?.maintenance.enabled) {
		return blocked('Inscriptions suspendues', 'S-Drive est en cours de maintenance. Réessayez un peu plus tard.')
	}
	if (config?.registrationMode === 'closed') {
		return blocked('Création de compte fermée', 'Demandez à un administrateur de S-Drive de vous créer un compte.')
	}
	if (config?.registrationMode === 'invite') {
		if (!token) return blocked('Inscription sur invitation', 'Pour créer un compte, utilisez le lien d’invitation que vous a envoyé un administrateur.')
		if (!invite) return <GuestLayout><p className="guest-note">Vérification de l’invitation…</p></GuestLayout>
		if (!invite.valid) {
			const why = { used: 'a déjà été utilisé', expired: 'a expiré', revoked: 'a été annulé' }[invite.reason ?? ''] ?? 'n’est pas valable'
			return blocked('Invitation non valable', `Ce lien d’invitation ${why}. Demandez-en un nouveau à l’administrateur.`)
		}
	}
	const lockedEmail = config?.registrationMode === 'invite' && !!invite?.email

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
			const { user } = await api.register({ ...form, remember, ...(token ? { invitation: token } : {}) })
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
				{invite?.valid && (
					<p className="invite-note">Vous avez été invité{invite.email ? ` (${invite.email})` : ""} · lien valable jusqu’au {new Date(invite.expiresAt!).toLocaleDateString("fr-FR")}</p>
				)}

				<Field label="Identifiant" autoComplete="username" autoCapitalize="none" spellCheck={false} autoFocus
					value={form.username} onChange={set('username')} error={fields.username}
					hint="Lettres minuscules, chiffres, « . », « - » ou « _ ». Vous l'utiliserez pour vous connecter." />
				<Field label="Nom complet" autoComplete="name" value={form.displayName} onChange={set('displayName')}
					error={fields.displayName} />
				<Field label="Adresse e-mail" type="email" autoComplete="email" value={form.email} onChange={set('email')}
					error={fields.email} readOnly={lockedEmail}
					hint={lockedEmail ? "Adresse prévue par l’invitation." : undefined} />
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
