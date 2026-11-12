import { useEffect, useState, type FormEvent } from 'react'
import { api, ApiError } from '../../api'
import { useAuth } from '../../auth'
import { ago, date, dateTime } from '../../format'
import { Avatar } from '../Avatar'
import { Field } from '../Guest'
import { IconAlert, IconKey, IconLock } from '../Icons'
import { StorageBar } from '../Storage'
import { Badge, Dialog, useToast } from '../ui'

/** Indicateur simple de solidité (même règle que l'inscription). */
function strength(pw: string, min: number): { score: number; label: string } {
	if (!pw) return { score: 0, label: '' }
	if (pw.length < min) return { score: 1, label: `Trop court (${pw.length}/${min})` }
	let s = 1
	if (pw.length >= min + 4) s++
	if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++
	if (/\d/.test(pw)) s++
	if (/[^A-Za-z0-9]/.test(pw)) s++
	return s <= 2 ? { score: 2, label: 'Moyen' } : s <= 3 ? { score: 3, label: 'Bon' } : { score: 4, label: 'Très bon' }
}

function PasswordForm({ onDone }: { onDone: () => void }) {
	const { config } = useAuth()
	const toast = useToast()
	const min = config?.passwordMinLength ?? 12
	const [current, setCurrent] = useState('')
	const [next, setNext] = useState('')
	const [confirm, setConfirm] = useState('')
	const [fields, setFields] = useState<Record<string, string>>({})
	const [error, setError] = useState('')
	const [busy, setBusy] = useState(false)
	const st = strength(next, min)
	const mismatch = confirm.length > 0 && confirm !== next

	const submit = async (e: FormEvent) => {
		e.preventDefault()
		if (mismatch) return
		setBusy(true)
		setFields({})
		setError('')
		try {
			const r = await api.changePassword(current, next)
			toast(r.otherSessionsClosed > 0
				? `Mot de passe modifié. ${r.otherSessionsClosed} autre${r.otherSessionsClosed > 1 ? 's' : ''} session${r.otherSessionsClosed > 1 ? 's ont' : ' a'} été fermée${r.otherSessionsClosed > 1 ? 's' : ''}.`
				: 'Mot de passe modifié.')
			onDone()
		} catch (err) {
			if (err instanceof ApiError) {
				if (Object.keys(err.fields).length) setFields(err.fields)
				else setError(err.message)
				if (err.fields.currentPassword) setCurrent('')
			} else setError('Modification impossible.')
		} finally {
			setBusy(false)
		}
	}

	return (
		<form className="pw-form" onSubmit={submit} noValidate>
			<Field label="Mot de passe actuel" type="password" autoComplete="current-password" value={current}
				onChange={(e) => setCurrent(e.target.value)} error={fields.currentPassword} autoFocus />
			<Field label="Nouveau mot de passe" type="password" autoComplete="new-password" value={next}
				onChange={(e) => setNext(e.target.value)} error={fields.newPassword}
				hint={st.label ? undefined : `Au moins ${min} caractères.`} />
			{st.label && !fields.newPassword && (
				<div className={`strength strength--${st.score}`} aria-live="polite">
					<span className="strength-bar" /><span className="strength-label">{st.label}</span>
				</div>
			)}
			<Field label="Confirmer le nouveau mot de passe" type="password" autoComplete="new-password" value={confirm}
				onChange={(e) => setConfirm(e.target.value)} error={mismatch ? 'Les deux mots de passe ne correspondent pas.' : undefined} />
			{error && <p className="form-error" role="alert"><IconAlert size={18} /><span>{error}</span></p>}
			<p className="muted pw-note">Par sécurité, vos autres appareils seront déconnectés et devront utiliser le nouveau mot de passe.</p>
			<div className="pw-actions">
				<button type="button" className="btn btn-ghost" onClick={onDone}>Annuler</button>
				<button type="submit" className="btn btn-primary"
					disabled={busy || !current || next.length < min || confirm !== next}>
					<IconLock size={18} /> {busy ? 'Modification…' : 'Changer le mot de passe'}
				</button>
			</div>
		</form>
	)
}

/** « Voir le profil » : identité, rôle, stockage, dates, changement de mot de passe. */
export function ProfileDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
	const { user } = useAuth()
	const [storage, setStorage] = useState<{ used: number; quota: number | null } | null>(null)
	const [changing, setChanging] = useState(false)

	useEffect(() => {
		if (!open) { setChanging(false); return }
		api.myStorage().then(setStorage).catch(() => setStorage(null))
	}, [open])

	if (!user) return null
	return (
		<Dialog open={open} onClose={onClose} title="Mon profil" wide
			footer={changing ? undefined : <button type="button" className="btn btn-secondary" onClick={onClose}>Fermer</button>}>
			<div className="profile">
				<div className="profile-head">
					<Avatar name={user.displayName} seed={user.username} size={64} />
					<div className="profile-id">
						<strong>{user.displayName}</strong>
						<span className="muted">@{user.username}</span>
						<span>{user.email}</span>
					</div>
					{user.role === 'admin' ? <Badge tone="info">Administrateur</Badge> : <Badge tone="neutral">Utilisateur</Badge>}
				</div>

				<dl className="profile-facts">
					<div className="profile-fact profile-fact--wide">
						<dt>Stockage</dt>
						<dd>{storage ? <StorageBar used={storage.used} quota={storage.quota} /> : <span className="muted">Chargement…</span>}</dd>
					</div>
					<div className="profile-fact">
						<dt>Membre depuis</dt>
						<dd title={dateTime(user.createdAt)}>{date(user.createdAt)}</dd>
					</div>
					<div className="profile-fact">
						<dt>Dernière connexion</dt>
						<dd title={user.lastLoginAt ? dateTime(user.lastLoginAt) : undefined}>{user.lastLoginAt ? ago(user.lastLoginAt) : 'Jamais'}</dd>
					</div>
				</dl>

				<section className="profile-security">
					<div className="profile-security-head">
						<div>
							<h3><IconKey size={18} /> Mot de passe</h3>
							<p className="muted">Choisissez un mot de passe long et unique, que vous n’utilisez nulle part ailleurs.</p>
						</div>
						{!changing && (
							<button type="button" className="btn btn-secondary" onClick={() => setChanging(true)}>Changer le mot de passe</button>
						)}
					</div>
					{changing && <PasswordForm onDone={() => setChanging(false)} />}
				</section>
			</div>
		</Dialog>
	)
}
