import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { api, ApiError, type Invitation, type PlatformSettings, type RegistrationMode, type SettingsPayload } from '../../api'
import { useAuth } from '../../auth'
import { Field } from '../../components/Guest'
import { IconAlert, IconLink, IconLock, IconPlus, IconSettings, IconUserPlus, IconX } from '../../components/Icons'
import { SizePicker, type SizePreset } from '../../components/SizePicker'
import { Badge, Dialog, Segmented, useData, useToast } from '../../components/ui'
import { ago, date, dateTime } from '../../format'
import { AdminLayout, PageHeader } from './AdminLayout'

const GB = 1024 ** 3
const MB = 1024 ** 2
const QUOTA_PRESETS: SizePreset[] = [
	{ label: '5 Go', bytes: 5 * GB },
	{ label: '20 Go', bytes: 20 * GB },
	{ label: '100 Go', bytes: 100 * GB },
	{ label: 'Illimité', bytes: null },
]
const UPLOAD_PRESETS: SizePreset[] = [
	{ label: '500 Mo', bytes: 500 * MB },
	{ label: '2 Go', bytes: 2 * GB },
	{ label: '10 Go', bytes: 10 * GB },
	{ label: 'Sans limite', bytes: null },
]
const MODES: { value: RegistrationMode; title: string; text: string; icon: JSX.Element }[] = [
	{ value: 'open', title: 'Ouvertes', text: 'Tout le monde peut créer un compte depuis la page de connexion (« S’inscrire »).', icon: <IconUserPlus size={20} /> },
	{ value: 'invite', title: 'Sur invitation', text: 'Seules les personnes ayant reçu un lien d’invitation peuvent créer un compte.', icon: <IconLink size={20} /> },
	{ value: 'closed', title: 'Fermées', text: 'Personne ne peut s’inscrire : les comptes sont créés par un administrateur (Comptes).', icon: <IconLock size={20} /> },
]

const same = (a: PlatformSettings, b: PlatformSettings) => JSON.stringify(a) === JSON.stringify(b)

// --- Invitations ------------------------------------------------------------------------
function Invitations({ active }: { active: boolean }) {
	const toast = useToast()
	const { data, reload } = useData(() => api.invitations(), [])
	const [open, setOpen] = useState(false)
	const [email, setEmail] = useState('')
	const [note, setNote] = useState('')
	const [days, setDays] = useState<1 | 7 | 30>(7)
	const [created, setCreated] = useState<{ link: string; expiresAt: string; email: string } | null>(null)
	const [error, setError] = useState('')
	const [busy, setBusy] = useState(false)

	const create = async (e: FormEvent) => {
		e.preventDefault()
		setBusy(true)
		setError('')
		try {
			const r = await api.createInvitation({ email: email.trim(), note: note.trim(), days })
			setCreated({ link: `${window.location.origin}/inscription?invitation=${r.token}`, expiresAt: r.expiresAt, email: email.trim() })
			reload()
		} catch (err) {
			setError(err instanceof ApiError ? (Object.values(err.fields)[0] ?? err.message) : 'Création impossible.')
		} finally {
			setBusy(false)
		}
	}
	const close = () => {
		setOpen(false)
		setCreated(null)
		setEmail('')
		setNote('')
		setDays(7)
		setError('')
	}
	const copy = async (text: string) => {
		try {
			await navigator.clipboard.writeText(text)
			toast('Lien copié dans le presse-papiers.')
		} catch {
			toast('Copie impossible : sélectionnez le lien et copiez-le.', 'critical')
		}
	}
	const revoke = async (i: Invitation) => {
		try {
			await api.revokeInvitation(i.id)
			toast('Invitation annulée : le lien ne fonctionne plus.')
			reload()
		} catch (e) {
			toast(e instanceof ApiError ? e.message : 'Annulation impossible.', 'critical')
		}
	}
	const list = data?.invitations ?? []
	const pending = list.filter((i) => i.state === 'pending').length
	const tone = { pending: 'info', used: 'good', revoked: 'neutral', expired: 'neutral' } as const
	const label = { pending: 'En attente', used: 'Utilisée', revoked: 'Annulée', expired: 'Expirée' }

	return (
		<div className={`invites${active ? '' : ' invites--inactive'}`}>
			<div className="invites-head">
				<div>
					<h3>Invitations</h3>
					<p className="muted">{active
						? `${pending} lien${pending > 1 ? 's' : ''} en attente. Chaque lien ne sert qu’une fois.`
						: 'Les invitations ne servent qu’en mode « Sur invitation ».'}</p>
				</div>
				<button type="button" className="btn btn-secondary" onClick={() => setOpen(true)}><IconPlus size={18} /> Créer une invitation</button>
			</div>
			{list.length > 0 && (
				<table className="data-table invites-table">
					<thead><tr><th>Destinataire</th><th>Créée</th><th>Expire</th><th>État</th><th><span className="sr-only">Actions</span></th></tr></thead>
					<tbody>
						{list.slice(0, 8).map((i) => (
							<tr key={i.id}>
								<td>
									<strong>{i.email ?? 'Toute personne ayant le lien'}</strong>
									{i.note && <span className="muted invite-sub">{i.note}</span>}
								</td>
								<td className="muted nowrap" title={dateTime(i.createdAt)}>{ago(i.createdAt)}{i.createdBy ? ` · ${i.createdBy}` : ''}</td>
								<td className="muted nowrap">{date(i.expiresAt)}</td>
								<td className="nowrap">
									<Badge tone={tone[i.state]}>{label[i.state]}</Badge>
									{i.usedBy && <span className="muted invite-sub">par @{i.usedBy.username}</span>}
								</td>
								<td className="actions-cell">
									{i.state === 'pending' && (
										<button type="button" className="btn btn-ghost btn-sm btn-danger-ghost" onClick={() => revoke(i)}><IconX size={16} /> Annuler</button>
									)}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			)}

			<Dialog open={open} onClose={close} title={created ? 'Invitation créée' : 'Créer une invitation'}
				footer={created
					? <button type="button" className="btn btn-primary" onClick={close}>Terminé</button>
					: <>
						<button type="button" className="btn btn-ghost" onClick={close}>Annuler</button>
						<button type="submit" form="invite-form" className="btn btn-primary" disabled={busy}>{busy ? 'Création…' : 'Créer le lien'}</button>
					</>}>
				{created ? (
					<>
						<p>Envoyez ce lien {created.email ? <>à <strong>{created.email}</strong></> : 'à la personne invitée'}. Il fonctionne une seule fois, jusqu’au {date(created.expiresAt)}.</p>
						<div className="invite-link">
							<input readOnly value={created.link} aria-label="Lien d’invitation" onFocus={(e) => e.target.select()} />
							<button type="button" className="btn btn-secondary" onClick={() => copy(created.link)}>Copier</button>
						</div>
						<p className="form-warning"><IconAlert size={18} /><span>Ce lien ne sera plus affiché : copiez-le maintenant. Vous pourrez l’annuler à tout moment.</span></p>
					</>
				) : (
					<form id="invite-form" onSubmit={create} noValidate>
						<Field label="Adresse e-mail (facultatif)" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
							hint="Si vous l’indiquez, seule cette adresse pourra utiliser le lien." />
						<Field label="Note (facultatif)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={120}
							hint="Pour vous souvenir à qui est destiné le lien." />
						<div className="form-row">
							<span>Valable</span>
							<Segmented<1 | 7 | 30> label="Durée de validité" value={days} onChange={setDays}
								options={[{ value: 1, label: '24 h' }, { value: 7, label: '7 jours' }, { value: 30, label: '30 jours' }]} />
						</div>
						{error && <p className="form-error" role="alert">{error}</p>}
					</form>
				)}
			</Dialog>
		</div>
	)
}

// --- Page --------------------------------------------------------------------------------
export function Settings() {
	const toast = useToast()
	const { refreshConfig } = useAuth()
	const { data, setData, error: loadError } = useData(() => api.settings(), [])
	const [draft, setDraft] = useState<PlatformSettings | null>(null)
	const [quotaValid, setQuotaValid] = useState(true)
	const [uploadValid, setUploadValid] = useState(true)
	const [busy, setBusy] = useState(false)
	const [confirmMaintenance, setConfirmMaintenance] = useState(false)

	useEffect(() => { if (data && !draft) setDraft(data.settings) }, [data, draft])

	const dirty = useMemo(() => !!(data && draft && !same(data.settings, draft)), [data, draft])
	// Quitter la page avec des modifications non enregistrées : le navigateur prévient
	useEffect(() => {
		if (!dirty) return
		const warn = (e: BeforeUnloadEvent) => { e.preventDefault() }
		window.addEventListener('beforeunload', warn)
		return () => window.removeEventListener('beforeunload', warn)
	}, [dirty])

	if (loadError) return <AdminLayout><p className="form-error">{loadError}</p></AdminLayout>
	if (!data || !draft) return <AdminLayout><p className="muted">Chargement…</p></AdminLayout>

	const set = <K extends keyof PlatformSettings>(k: K, v: PlatformSettings[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d))
	const maintenanceTurningOn = draft.maintenance.enabled && !data.settings.maintenance.enabled

	const save = async () => {
		setBusy(true)
		try {
			const r: SettingsPayload = await api.saveSettings({ ...draft, expectedUpdatedAt: data.updatedAt })
			setData(r)
			setDraft(r.settings)
			setConfirmMaintenance(false)
			toast('Paramètres enregistrés.')
			void refreshConfig()
		} catch (e) {
			toast(e instanceof ApiError ? e.message : 'Enregistrement impossible.', 'critical')
		} finally {
			setBusy(false)
		}
	}
	const submit = () => (maintenanceTurningOn ? setConfirmMaintenance(true) : save())

	return (
		<AdminLayout>
			<PageHeader title="Paramètres"
				subtitle={<>Règles de la plateforme, appliquées immédiatement.{data.updatedBy ? ` Dernière modification ${ago(data.updatedAt)} par ${data.updatedBy.displayName}.` : ''}</>} />

			<div className="settings">
				{/* Inscriptions */}
				<section className="sys-card settings-card">
					<h2>Inscriptions</h2>
					<p className="muted">Qui peut créer un compte sur S-Drive.</p>
					<div className="mode-grid" role="radiogroup" aria-label="Mode d’inscription">
						{MODES.map((m) => (
							<label key={m.value} className={`mode-card${draft.registrationMode === m.value ? ' is-selected' : ''}`}>
								<input type="radio" name="registration" value={m.value} checked={draft.registrationMode === m.value}
									onChange={() => set('registrationMode', m.value)} />
								<span className="mode-icon">{m.icon}</span>
								<strong>{m.title}</strong>
								<span className="muted">{m.text}</span>
							</label>
						))}
					</div>
					<Invitations active={draft.registrationMode === 'invite'} />
				</section>

				{/* Stockage */}
				<section className="sys-card settings-card">
					<h2>Stockage et envois</h2>
					<div className="setting-row">
						<div>
							<h3>Quota des nouveaux comptes</h3>
							<p className="muted">Appliqué aux comptes créés à partir de maintenant (inscription ou création par un administrateur). Les comptes existants gardent leur quota : modifiez-le dans Comptes.</p>
						</div>
						<SizePicker label="Quota par défaut" value={draft.defaultQuotaBytes} presets={QUOTA_PRESETS}
							onChange={(v) => { setQuotaValid(v !== undefined); if (v !== undefined) set('defaultQuotaBytes', v) }} />
					</div>
					<div className="setting-row">
						<div>
							<h3>Taille maximale d’un fichier envoyé</h3>
							<p className="muted">Un fichier plus gros est refusé avant même d’être transféré. Minimum 1 Mo.</p>
						</div>
						<SizePicker label="Taille maximale d’envoi" value={draft.maxUploadBytes} presets={UPLOAD_PRESETS} min={MB}
							onChange={(v) => { setUploadValid(v !== undefined); if (v !== undefined) set('maxUploadBytes', v) }} />
					</div>
				</section>

				{/* Maintenance */}
				<section className={`sys-card settings-card${draft.maintenance.enabled ? ' settings-card--warn' : ''}`}>
					<div className="setting-row">
						<div>
							<h2><IconSettings size={18} /> Mode maintenance</h2>
							<p className="muted">Pendant une maintenance, seuls les administrateurs peuvent se connecter. Les utilisateurs voient un écran de maintenance (leurs sessions sont suspendues, pas fermées) et S-Drive revient tout seul à la fin.</p>
						</div>
						<label className="switch">
							<input type="checkbox" role="switch" checked={draft.maintenance.enabled}
								onChange={(e) => set('maintenance', { ...draft.maintenance, enabled: e.target.checked })} />
							<span className="switch-track" aria-hidden="true"><span className="switch-thumb" /></span>
							<span>{draft.maintenance.enabled ? 'Activé' : 'Désactivé'}</span>
						</label>
					</div>
					<label className="textarea-field">
						<span>Message affiché aux utilisateurs (facultatif)</span>
						<textarea rows={2} maxLength={500} value={draft.maintenance.message}
							placeholder="S-Drive est en cours de maintenance. Merci de réessayer un peu plus tard."
							onChange={(e) => set('maintenance', { ...draft.maintenance, message: e.target.value })} />
						<span className="muted">{draft.maintenance.message.length} / 500</span>
					</label>
				</section>
			</div>

			{/* Barre d'enregistrement */}
			<div className={`save-bar${dirty ? ' is-visible' : ''}`} role="region" aria-label="Enregistrement">
				<span>{!quotaValid || !uploadValid ? <><IconAlert size={18} /> Saisie personnalisée invalide</> : 'Modifications non enregistrées'}</span>
				<div>
					<button type="button" className="btn btn-ghost" onClick={() => { setDraft(data.settings); setQuotaValid(true); setUploadValid(true) }} disabled={busy}>Annuler</button>
					<button type="button" className="btn btn-primary" onClick={submit} disabled={busy || !quotaValid || !uploadValid}>
						{busy ? 'Enregistrement…' : 'Enregistrer'}
					</button>
				</div>
			</div>

			<Dialog open={confirmMaintenance} onClose={() => setConfirmMaintenance(false)} title="Activer le mode maintenance ?"
				footer={<>
					<button type="button" className="btn btn-ghost" onClick={() => setConfirmMaintenance(false)}>Annuler</button>
					<button type="button" className="btn btn-danger" onClick={save} disabled={busy}>Activer et enregistrer</button>
				</>}>
				<p>Les utilisateurs ne pourront plus se connecter ni utiliser S-Drive jusqu’à la désactivation.</p>
				{data.onlineNonAdmins > 0
					? <p className="form-warning"><IconAlert size={18} /><span><strong>{data.onlineNonAdmins}</strong> utilisateur{data.onlineNonAdmins > 1 ? 's sont' : ' est'} connecté{data.onlineNonAdmins > 1 ? 's' : ''} en ce moment : {data.onlineNonAdmins > 1 ? 'ils verront' : 'il verra'} l’écran de maintenance.</span></p>
					: <p className="muted">Aucun utilisateur n’est connecté en ce moment.</p>}
			</Dialog>
		</AdminLayout>
	)
}

