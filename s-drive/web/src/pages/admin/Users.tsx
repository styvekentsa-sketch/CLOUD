import { useEffect, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, ApiError, type AdminUser } from '../../api'
import { useAuth } from '../../auth'
import { Avatar } from '../../components/Avatar'
import { Field } from '../../components/Guest'
import {
	IconAlert, IconKey, IconLock, IconMore, IconPie, IconPlus, IconSearch, IconShield, IconShieldOff, IconTrash, IconUnlock, IconX,
} from '../../components/Icons'
import { GIB, StorageBar } from '../../components/Storage'
import { ActionMenu, Badge, Dialog, Segmented, useData, useToast, type MenuAction } from '../../components/ui'
import { ago, bytes, date } from '../../format'
import { AdminLayout, PageHeader } from './AdminLayout'

type Sort = 'name' | 'created' | 'lastLogin' | 'lastSeen' | 'storage'

// --- Modification du quota de stockage ------------------------------------------------
type Preset = '5' | '20' | '100' | 'unlimited' | 'custom'
const PRESETS: { value: Preset; label: string }[] = [
	{ value: '5', label: '5 Go' },
	{ value: '20', label: '20 Go' },
	{ value: '100', label: '100 Go' },
	{ value: 'unlimited', label: 'Illimité' },
	{ value: 'custom', label: 'Personnalisé' },
]
const UNITS = { Mo: 1024 ** 2, Go: GIB, To: 1024 ** 4 } as const
type Unit = keyof typeof UNITS

function presetOf(quota: number | null): Preset {
	if (quota === null) return 'unlimited'
	const gb = quota / GIB
	return gb === 5 ? '5' : gb === 20 ? '20' : gb === 100 ? '100' : 'custom'
}

function QuotaDialog({ user, onClose, onSaved }: { user: AdminUser | null; onClose: () => void; onSaved: (u: AdminUser) => void }) {
	const used = user?.storageUsed ?? 0
	const current = user?.storageQuota ?? null
	const [preset, setPreset] = useState<Preset>('5')
	const [amount, setAmount] = useState('')
	const [unit, setUnit] = useState<Unit>('Go')
	const [error, setError] = useState('')
	const [busy, setBusy] = useState(false)

	useEffect(() => {
		if (!user) return
		setPreset(presetOf(current))
		const big = current !== null && current >= UNITS.To && current % UNITS.To === 0
		setUnit(big ? 'To' : current !== null && current < GIB ? 'Mo' : 'Go')
		setAmount(current === null ? '' : String(+(current / UNITS[big ? 'To' : current < GIB ? 'Mo' : 'Go']).toFixed(2)))
		setError('')
	}, [user]) // eslint-disable-line react-hooks/exhaustive-deps

	// Nouveau quota en octets (undefined = saisie invalide)
	const next: number | null | undefined = preset === 'unlimited' ? null
		: preset === 'custom'
			? (() => {
				const n = Number(amount.replace(',', '.'))
				return amount.trim() !== '' && Number.isFinite(n) && n >= 0 ? Math.round(n * UNITS[unit]) : undefined
			})()
			: Number(preset) * GIB

	if (!user) return <Dialog open={false} onClose={onClose} title=""><span /></Dialog>

	const save = async () => {
		if (next === undefined) return
		setBusy(true)
		try {
			const { user: updated } = await api.updateUser(user.id, { storageQuota: next })
			onSaved(updated)
		} catch (e) {
			setError(e instanceof ApiError ? e.message : 'Modification impossible.')
		} finally {
			setBusy(false)
		}
	}

	return (
		<Dialog open={!!user} onClose={onClose} title={`Quota de stockage — ${user.displayName}`}
			footer={<>
				<button type="button" className="btn btn-ghost" onClick={onClose}>Annuler</button>
				<button type="button" className="btn btn-primary" disabled={busy || next === undefined || next === current} onClick={save}>
					{busy ? 'Enregistrement…' : 'Enregistrer'}
				</button>
			</>}>
			<div className="quota-now">
				<span className="muted">Utilisation actuelle</span>
				<StorageBar used={used} quota={current} />
			</div>

			<p className="quota-label" id="quota-presets">Nouveau quota</p>
			<Segmented<Preset> label="Nouveau quota" value={preset} onChange={setPreset} options={PRESETS} />

			{preset === 'custom' && (
				<div className="quota-custom">
					<input type="number" inputMode="decimal" min={0} step="any" value={amount} aria-label="Quota personnalisé"
						onChange={(e) => setAmount(e.target.value)} placeholder="ex. 50" autoFocus />
					<select value={unit} onChange={(e) => setUnit(e.target.value as Unit)} aria-label="Unité">
						{(Object.keys(UNITS) as Unit[]).map((u) => <option key={u} value={u}>{u}</option>)}
					</select>
				</div>
			)}

			{next !== undefined && (
				<div className="quota-preview">
					<span className="muted">Après modification</span>
					<StorageBar used={used} quota={next} />
				</div>
			)}
			{next !== undefined && next !== null && used > next && (
				<p className="form-warning" role="alert">
					<IconAlert size={18} />
					<span>{user.displayName} utilise déjà {bytes(used)} : ses fichiers sont conservés, mais tout nouvel envoi sera refusé tant qu’il dépasse ce quota.</span>
				</p>
			)}
			{next === null && (
				<p className="muted quota-hint">Aucune limite : l’espace n’est plafonné que par le disque du serveur.</p>
			)}
			{error && <p className="form-error" role="alert">{error}</p>}
		</Dialog>
	)
}

/** Mot de passe aléatoire lisible (16 caractères, sans caractères ambigus). */
function generatePassword(): string {
	const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789-_'
	const a = new Uint32Array(16)
	crypto.getRandomValues(a)
	return Array.from(a, (n) => chars[n % chars.length]).join('')
}

function CreateUserDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (u: AdminUser) => void }) {
	const { config } = useAuth()
	const empty = { username: '', displayName: '', email: '', password: '', role: 'user' as 'user' | 'admin' }
	const [form, setForm] = useState(empty)
	const [fields, setFields] = useState<Record<string, string>>({})
	const [busy, setBusy] = useState(false)
	useEffect(() => { if (open) { setForm(empty); setFields({}) } }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

	async function submit(e: FormEvent) {
		e.preventDefault()
		setBusy(true)
		setFields({})
		try {
			const { user } = await api.createUser(form)
			onCreated(user)
		} catch (err) {
			if (err instanceof ApiError) setFields(Object.keys(err.fields).length ? err.fields : { form: err.message })
		} finally {
			setBusy(false)
		}
	}
	const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }))

	return (
		<Dialog open={open} onClose={onClose} title="Ajouter un compte"
			footer={<>
				<button type="button" className="btn btn-ghost" onClick={onClose}>Annuler</button>
				<button type="submit" form="create-user" className="btn btn-primary" disabled={busy}>{busy ? 'Création…' : 'Créer le compte'}</button>
			</>}>
			<form id="create-user" onSubmit={submit} noValidate>
				<Field label="Identifiant" autoCapitalize="none" spellCheck={false} value={form.username} onChange={set('username')} error={fields.username} />
				<Field label="Nom complet" value={form.displayName} onChange={set('displayName')} error={fields.displayName} />
				<Field label="Adresse e-mail" type="email" value={form.email} onChange={set('email')} error={fields.email} />
				<div className="field-with-action">
					<Field label="Mot de passe provisoire" type="password" autoComplete="new-password" value={form.password}
						onChange={set('password')} error={fields.password}
						hint={`Au moins ${config?.passwordMinLength ?? 12} caractères. Transmettez-le à la personne de façon sûre.`} />
					<button type="button" className="btn btn-ghost" onClick={() => setForm((f) => ({ ...f, password: generatePassword() }))}>
						<IconKey size={18} /> Générer
					</button>
				</div>
				{form.password && <p className="mono-box" aria-label="Mot de passe généré">{form.password}</p>}
				<div className="form-row">
					<span>Rôle</span>
					<Segmented label="Rôle" value={form.role} onChange={(role) => setForm((f) => ({ ...f, role }))}
						options={[{ value: 'user', label: 'Utilisateur' }, { value: 'admin', label: 'Administrateur' }]} />
				</div>
				{fields.form && <p className="form-error" role="alert">{fields.form}</p>}
			</form>
		</Dialog>
	)
}

function DeleteDialog({ user, onClose, onDeleted }: { user: AdminUser | null; onClose: () => void; onDeleted: () => void }) {
	const [typed, setTyped] = useState('')
	const [error, setError] = useState('')
	const [busy, setBusy] = useState(false)
	useEffect(() => { setTyped(''); setError('') }, [user])
	if (!user) return <Dialog open={false} onClose={onClose} title=""><span /></Dialog>
	const confirm = async () => {
		setBusy(true)
		try {
			await api.deleteUser(user.id)
			onDeleted()
		} catch (e) {
			setError(e instanceof ApiError ? e.message : 'Suppression impossible.')
		} finally {
			setBusy(false)
		}
	}
	return (
		<Dialog open={!!user} onClose={onClose} title={`Supprimer le compte de ${user.displayName} ?`}
			footer={<>
				<button type="button" className="btn btn-ghost" onClick={onClose}>Annuler</button>
				<button type="button" className="btn btn-danger" disabled={typed !== user.username || busy} onClick={confirm}>
					<IconTrash size={18} /> Supprimer définitivement
				</button>
			</>}>
			<p>Le compte <strong>@{user.username}</strong> et toutes ses sessions seront supprimés. Cette action est irréversible ; elle reste inscrite dans le journal de sécurité.</p>
			<Field label={`Tapez « ${user.username} » pour confirmer`} autoCapitalize="none" spellCheck={false}
				value={typed} onChange={(e) => setTyped(e.target.value)} />
			{error && <p className="form-error" role="alert">{error}</p>}
		</Dialog>
	)
}

export function Users() {
	const { user: me } = useAuth()
	const toast = useToast()
	const [q, setQ] = useState('')
	const [query, setQuery] = useState('')
	const [role, setRole] = useState<'' | 'admin' | 'user'>('')
	const [status, setStatus] = useState<'' | 'active' | 'disabled'>('')
	const [presence, setPresence] = useState<'' | 'online'>('')
	// « ?tri=stockage » (liens des widgets de stockage) : tableau trié par espace utilisé
	const [params] = useSearchParams()
	const [sort, setSort] = useState<Sort>(params.get('tri') === 'stockage' ? 'storage' : 'lastSeen')
	const [dir, setDir] = useState<'asc' | 'desc'>('desc')
	const [creating, setCreating] = useState(false)
	const [deleting, setDeleting] = useState<AdminUser | null>(null)
	const [quotaUser, setQuotaUser] = useState<AdminUser | null>(null)

	// Recherche : on attend 250 ms après la dernière frappe
	useEffect(() => {
		const t = setTimeout(() => setQuery(q), 250)
		return () => clearTimeout(t)
	}, [q])

	const { data, loading, reload, error } = useData(
		() => api.adminUsers({ q: query, role, status, presence, sort, dir }),
		[query, role, status, presence, sort, dir], 60_000)
	const users = data?.users ?? []

	const sortBy = (s: Sort) => {
		if (s === sort) setDir((d) => (d === 'asc' ? 'desc' : 'asc'))
		else { setSort(s); setDir(s === 'name' ? 'asc' : 'desc') }
	}
	const sortMark = (s: Sort) => (sort === s ? (dir === 'asc' ? ' ▲' : ' ▼') : '')
	const ariaSort = (s: Sort) => (sort === s ? (dir === 'asc' ? 'ascending' : 'descending') : 'none')

	const run = async (fn: () => Promise<unknown>, ok: string) => {
		try {
			await fn()
			toast(ok)
			reload()
		} catch (e) {
			toast(e instanceof ApiError ? e.message : 'Action impossible.', 'critical')
		}
	}

	const actionsFor = (u: AdminUser): MenuAction[] => {
		const self = u.id === me?.id
		return [
			u.role === 'admin'
				? { label: 'Retirer le rôle administrateur', icon: <IconShieldOff size={18} />, disabled: self, hint: self ? 'Impossible sur votre propre compte' : undefined,
					onSelect: () => run(() => api.updateUser(u.id, { role: 'user' }), `${u.displayName} n’est plus administrateur.`) }
				: { label: 'Promouvoir administrateur', icon: <IconShield size={18} />,
					onSelect: () => run(() => api.updateUser(u.id, { role: 'admin' }), `${u.displayName} est maintenant administrateur.`) },
			u.status === 'active'
				? { label: 'Désactiver le compte', icon: <IconLock size={18} />, disabled: self, hint: self ? 'Impossible sur votre propre compte' : undefined,
					onSelect: () => run(() => api.updateUser(u.id, { status: 'disabled' }), `Compte de ${u.displayName} désactivé et déconnecté.`) }
				: { label: 'Réactiver le compte', icon: <IconUnlock size={18} />,
					onSelect: () => run(() => api.updateUser(u.id, { status: 'active' }), `Compte de ${u.displayName} réactivé.`) },
			{ label: 'Modifier le quota de stockage…', icon: <IconPie size={18} />, onSelect: () => setQuotaUser(u) },
			{ label: self ? 'Fermer mes autres sessions' : 'Fermer toutes ses sessions', icon: <IconX size={18} />,
				onSelect: () => run(() => api.revokeUserSessions(u.id), 'Sessions fermées.') },
			'separator',
			{ label: 'Supprimer le compte…', icon: <IconTrash size={18} />, danger: true, disabled: self,
				hint: self ? 'Impossible sur votre propre compte' : undefined, onSelect: () => setDeleting(u) },
		]
	}

	const filtered = !!(query || role || status || presence)

	return (
		<AdminLayout>
			<PageHeader title="Comptes"
				subtitle={data ? `${data.users.length} compte${data.users.length > 1 ? 's' : ''}${filtered ? ' correspondant aux filtres' : ''} · ${data.summary.online} en ligne` : 'Chargement…'}
				actions={<button type="button" className="btn btn-primary" onClick={() => setCreating(true)}><IconPlus size={18} /> Ajouter un compte</button>} />

			<div className="toolbar">
				<label className="search">
					<IconSearch size={18} />
					<input type="search" placeholder="Rechercher un nom, un identifiant, un e-mail…" value={q}
						onChange={(e) => setQ(e.target.value)} aria-label="Rechercher un compte" />
				</label>
				<Segmented label="Rôle" value={role} onChange={setRole}
					options={[{ value: '', label: 'Tous les rôles' }, { value: 'admin', label: 'Admins' }, { value: 'user', label: 'Utilisateurs' }]} />
				<Segmented label="Statut" value={status} onChange={setStatus}
					options={[{ value: '', label: 'Tous' }, { value: 'active', label: 'Actifs' }, { value: 'disabled', label: 'Désactivés' }]} />
				<Segmented label="Présence" value={presence} onChange={setPresence}
					options={[{ value: '', label: 'Tous' }, { value: 'online', label: 'En ligne' }]} />
			</div>

			{error && <p className="form-error" role="alert">{error}</p>}
			<div className={`table-card${loading && data ? ' is-refreshing' : ''}`}>
				<table className="data-table">
					<thead>
						<tr>
							<th aria-sort={ariaSort('name')}><button type="button" onClick={() => sortBy('name')}>Utilisateur{sortMark('name')}</button></th>
							<th className="hide-md">E-mail</th>
							<th>Rôle</th>
							<th>Statut</th>
							<th aria-sort={ariaSort('storage')}><button type="button" onClick={() => sortBy('storage')}>Stockage{sortMark('storage')}</button></th>
							<th aria-sort={ariaSort('lastSeen')}><button type="button" onClick={() => sortBy('lastSeen')}>Activité{sortMark('lastSeen')}</button></th>
							<th className="hide-md" aria-sort={ariaSort('created')}><button type="button" onClick={() => sortBy('created')}>Inscrit le{sortMark('created')}</button></th>
							<th className="num hide-lg">Sessions</th>
							<th><span className="sr-only">Actions</span></th>
						</tr>
					</thead>
					<tbody>
						{users.map((u) => (
							<tr key={u.id}>
								<td>
									<div className="user-cell">
										<Avatar name={u.displayName} seed={u.username} size={32} status={u.online ? 'online' : 'offline'} />
										<div>
											<strong>{u.displayName}{u.id === me?.id && <span className="muted"> (vous)</span>}</strong>
											<span className="muted">@{u.username}</span>
										</div>
									</div>
								</td>
								<td className="hide-md">{u.email}</td>
								<td>{u.role === 'admin' ? <Badge tone="info">Administrateur</Badge> : <span className="muted">Utilisateur</span>}</td>
								<td>{u.status === 'active' ? <Badge tone="good">Actif</Badge> : <Badge tone="warning">Désactivé</Badge>}</td>
								<td className="storage-cell">
									<button type="button" className="storage-edit" onClick={() => setQuotaUser(u)}
										title="Modifier le quota de stockage" aria-label={`Modifier le quota de ${u.displayName}`}>
										<StorageBar used={u.storageUsed ?? 0} quota={u.storageQuota ?? null} compact />
									</button>
								</td>
								<td className="nowrap">{u.online ? <Badge tone="good">En ligne</Badge> : <span className="muted">{u.lastSeenAt ? `Vu ${ago(u.lastSeenAt)}` : 'Jamais connecté'}</span>}</td>
								<td className="hide-md muted">{date(u.createdAt)}</td>
								<td className="num hide-lg">{u.sessions ?? 0}</td>
								<td className="actions-cell">
									<ActionMenu label={`Actions pour ${u.displayName}`} trigger={<IconMore />} actions={actionsFor(u)} />
								</td>
							</tr>
						))}
						{!loading && users.length === 0 && (
							<tr><td colSpan={9} className="table-empty">Aucun compte ne correspond à ces critères.</td></tr>
						)}
					</tbody>
				</table>
			</div>

			<CreateUserDialog open={creating} onClose={() => setCreating(false)}
				onCreated={(u) => { setCreating(false); toast(`Compte de ${u.displayName} créé.`); reload() }} />
			<DeleteDialog user={deleting} onClose={() => setDeleting(null)}
				onDeleted={() => { toast(`Compte de ${deleting?.displayName} supprimé.`); setDeleting(null); reload() }} />
			<QuotaDialog user={quotaUser} onClose={() => setQuotaUser(null)}
				onSaved={(u) => {
					setQuotaUser(null)
					toast(`Quota de ${u.displayName} : ${u.storageQuota === null || u.storageQuota === undefined ? 'illimité' : bytes(u.storageQuota)}.`)
					reload()
				}} />
		</AdminLayout>
	)
}
