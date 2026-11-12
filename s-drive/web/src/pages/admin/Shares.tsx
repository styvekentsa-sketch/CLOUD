import { useEffect, useState } from 'react'
import { api, ApiError, type Share } from '../../api'
import { Avatar } from '../../components/Avatar'
import { IconDownload, IconEye, IconFile, IconFolder, IconLink, IconLock, IconSearch, IconUnlock, IconX } from '../../components/Icons'
import { Badge, Dialog, Segmented, useData, useToast } from '../../components/ui'
import { ago, date, dateTime, num } from '../../format'
import { AdminLayout, PageHeader } from './AdminLayout'

type Status = 'active' | 'expired' | 'revoked' | 'all'
type Protection = '' | 'with' | 'without'
type Sort = 'created' | 'expires' | 'views' | 'downloads' | 'name'

const DAY = 86_400_000

/** Échéance lisible + état : « Dans 2 j » (bientôt), « Jamais », « Expiré le … ». */
function Expiry({ s }: { s: Share }) {
	if (!s.expiresAt) return <span className="muted">Jamais</span>
	const left = new Date(s.expiresAt).getTime() - Date.now()
	if (left <= 0) return <span className="muted">Expiré le {date(s.expiresAt)}</span>
	const days = Math.ceil(left / DAY)
	return (
		<span className="expiry" title={dateTime(s.expiresAt)}>
			{date(s.expiresAt)}
			{days <= 7 && <Badge tone="warning">dans {days} j</Badge>}
		</span>
	)
}

function StatusBadge({ s }: { s: Share }) {
	if (s.status === 'active') return <Badge tone="good">Actif</Badge>
	if (s.status === 'expired') return <Badge tone="neutral">Expiré</Badge>
	return <Badge tone="critical">Révoqué</Badge>
}

function RevokeDialog({ share, onClose, onDone }: { share: Share | null; onClose: () => void; onDone: () => void }) {
	const toast = useToast()
	const [busy, setBusy] = useState(false)
	if (!share) return <Dialog open={false} onClose={onClose} title=""><span /></Dialog>
	const confirm = async () => {
		setBusy(true)
		try {
			await api.revokeShare(share.id)
			toast(`Partage de « ${share.itemName} » révoqué : le lien ne fonctionne plus.`)
			onDone()
		} catch (e) {
			toast(e instanceof ApiError ? e.message : 'Révocation impossible.', 'critical')
		} finally {
			setBusy(false)
		}
	}
	return (
		<Dialog open={!!share} onClose={onClose} title="Révoquer ce partage ?"
			footer={<>
				<button type="button" className="btn btn-ghost" onClick={onClose}>Annuler</button>
				<button type="button" className="btn btn-danger" onClick={confirm} disabled={busy}>
					<IconX size={18} /> Révoquer maintenant
				</button>
			</>}>
			<p>
				Le lien public vers <strong>« {share.itemName} »</strong> (partagé par {share.owner.displayName}) cessera
				immédiatement de fonctionner, pour tous ceux qui l’ont reçu. Le fichier lui-même n’est pas supprimé.
			</p>
			<p className="muted">La révocation est inscrite dans le journal de sécurité. Le propriétaire pourra créer un nouveau lien s’il le souhaite.</p>
		</Dialog>
	)
}

export function Shares() {
	const [status, setStatus] = useState<Status>('active')
	const [protection, setProtection] = useState<Protection>('')
	const [q, setQ] = useState('')
	const [query, setQuery] = useState('')
	const [sort, setSort] = useState<Sort>('created')
	const [dir, setDir] = useState<'asc' | 'desc'>('desc')
	const [revoking, setRevoking] = useState<Share | null>(null)

	useEffect(() => {
		const t = setTimeout(() => setQuery(q), 250)
		return () => clearTimeout(t)
	}, [q])

	const list = useData(() => api.shares({ status, protection, q: query, sort, dir }), [status, protection, query, sort, dir], 60_000)
	const stats = useData(() => api.shareStats(), [], 60_000)
	const shares = list.data?.shares ?? []
	const st = stats.data

	const sortBy = (s: Sort) => {
		if (s === sort) setDir((d) => (d === 'asc' ? 'desc' : 'asc'))
		else { setSort(s); setDir(s === 'name' || s === 'expires' ? 'asc' : 'desc') }
	}
	const mark = (s: Sort) => (sort === s ? (dir === 'asc' ? ' ▲' : ' ▼') : '')
	const aria = (s: Sort) => (sort === s ? (dir === 'asc' ? 'ascending' : 'descending') : 'none')

	return (
		<AdminLayout>
			<PageHeader title="Partages"
				subtitle={st
					? `${num(st.active)} lien${st.active > 1 ? 's' : ''} public${st.active > 1 ? 's' : ''} actif${st.active > 1 ? 's' : ''} · ${num(st.views)} consultation${st.views > 1 ? 's' : ''} · ${num(st.downloads)} téléchargement${st.downloads > 1 ? 's' : ''}`
					: 'Chargement…'} />

			{st && (st.unprotected > 0 || st.noExpiry > 0) && (
				<div className="share-alerts">
					{st.unprotected > 0 && (
						<button type="button" className="share-alert" onClick={() => { setStatus('active'); setProtection('without') }}>
							<IconUnlock size={18} />
							<span><strong>{st.unprotected}</strong> lien{st.unprotected > 1 ? 's' : ''} actif{st.unprotected > 1 ? 's' : ''} sans mot de passe</span>
						</button>
					)}
					{st.noExpiry > 0 && (
						<div className="share-alert share-alert--info">
							<IconLink size={18} />
							<span><strong>{st.noExpiry}</strong> sans date d’expiration{st.expiringSoon > 0 ? ` · ${st.expiringSoon} expire${st.expiringSoon > 1 ? 'nt' : ''} dans les 7 jours` : ''}</span>
						</div>
					)}
				</div>
			)}

			<div className="toolbar">
				<label className="search">
					<IconSearch size={18} />
					<input type="search" placeholder="Nom du fichier, dossier ou propriétaire…" value={q}
						onChange={(e) => setQ(e.target.value)} aria-label="Rechercher un partage" />
				</label>
				<Segmented<Status> label="État" value={status} onChange={setStatus}
					options={[
						{ value: 'active', label: 'Actifs' },
						{ value: 'expired', label: 'Expirés' },
						{ value: 'revoked', label: 'Révoqués' },
						{ value: 'all', label: 'Tous' },
					]} />
				<Segmented<Protection> label="Mot de passe" value={protection} onChange={setProtection}
					options={[
						{ value: '', label: 'Tous' },
						{ value: 'with', label: 'Protégés' },
						{ value: 'without', label: 'Sans mot de passe' },
					]} />
			</div>

			{list.error && <p className="form-error" role="alert">{list.error}</p>}
			<div className={`table-card${list.loading && list.data ? ' is-refreshing' : ''}`}>
				<table className="data-table data-table--cards-lg">
					<thead>
						<tr>
							<th aria-sort={aria('name')}><button type="button" onClick={() => sortBy('name')}>Élément partagé{mark('name')}</button></th>
							<th className="c-xl">Propriétaire</th>
							<th className="c-md hide-xxl" aria-sort={aria('created')}><button type="button" onClick={() => sortBy('created')}>Créé le{mark('created')}</button></th>
							<th className="c-exp" aria-sort={aria('expires')}><button type="button" onClick={() => sortBy('expires')}>Expiration{mark('expires')}</button></th>
							<th className="c-md">Mot de passe</th>
							<th className="c-lg" aria-sort={aria('views')}><button type="button" onClick={() => sortBy('views')} title="Trier par nombre de vues">Accès{mark('views')}</button></th>
							<th className="c-lg">État</th>
							<th className="c-act"><span className="sr-only">Actions</span></th>
						</tr>
					</thead>
					<tbody>
						{shares.map((s) => (
							<tr key={s.id} className={s.status !== 'active' ? 'row-dim' : undefined}>
								<td className="cell-primary">
									<div className="item-cell">
										<span className="item-icon">{s.itemType === 'folder' ? <IconFolder size={18} /> : <IconFile size={18} />}</span>
										<div>
											<strong title={s.itemName}>{s.itemName}</strong>
											<span className="muted">{s.itemType === 'folder' ? 'Dossier' : 'Fichier'}{s.itemPath ? ` · ${s.itemPath}` : ''}</span>
										</div>
									</div>
								</td>
								<td data-label="Propriétaire">
									<div className="user-cell">
										<Avatar name={s.owner.displayName} seed={s.owner.username} size={28} />
										<div><strong>{s.owner.displayName}</strong><span className="muted">@{s.owner.username}</span></div>
									</div>
								</td>
								<td className="hide-xxl muted nowrap" data-label="Créé le" title={dateTime(s.createdAt)}>{date(s.createdAt)}</td>
								<td className="nowrap" data-label="Expiration"><Expiry s={s} /></td>
								<td data-label="Mot de passe">
									{s.protected
										? <Badge tone="good" icon={<IconLock size={13} />}>Oui</Badge>
										: <Badge tone="warning" icon={<IconUnlock size={13} />}>Non</Badge>}
								</td>
								<td className="access-cell" data-label="Accès" title={s.lastAccessAt ? `Dernier accès ${ago(s.lastAccessAt)}` : 'Jamais ouvert'}>
									<span aria-label={`${s.views} vues`}><IconEye size={15} /> {num(s.views)}</span>
									<span aria-label={`${s.downloads} téléchargements`}><IconDownload size={15} /> {num(s.downloads)}</span>
								</td>
								<td className="state-cell" data-label="État">
									<StatusBadge s={s} />
									{s.status === 'revoked' && s.revokedBy && (
										<span className="muted revoked-by">par {s.revokedBy.displayName}, {ago(s.revokedAt)}</span>
									)}
								</td>
								<td className="actions-cell">
									{s.status === 'active' && (
										<button type="button" className="btn btn-ghost btn-sm btn-danger-ghost" onClick={() => setRevoking(s)}>
											<IconX size={16} /> Révoquer
										</button>
									)}
								</td>
							</tr>
						))}
						{!list.loading && shares.length === 0 && (
							<tr>
								<td colSpan={8} className="table-empty">
									{status === 'active' && !query && !protection
										? 'Aucun lien public actif. Les partages créés depuis « Fichiers » apparaîtront ici.'
										: 'Aucun partage ne correspond à ces critères.'}
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>

			<RevokeDialog share={revoking} onClose={() => setRevoking(null)}
				onDone={() => { setRevoking(null); list.reload(); stats.reload() }} />
		</AdminLayout>
	)
}
