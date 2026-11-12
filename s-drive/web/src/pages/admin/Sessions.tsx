import { api, ApiError } from '../../api'
import { Avatar } from '../../components/Avatar'
import { IconDevice, IconPhone, IconX } from '../../components/Icons'
import { Badge, useData, useToast } from '../../components/ui'
import { ago, dateTime, device } from '../../format'
import { AdminLayout, PageHeader } from './AdminLayout'

export function Sessions() {
	const toast = useToast()
	const { data, loading, reload, error } = useData(() => api.sessions(), [], 30_000)
	const sessions = data?.sessions ?? []
	const people = new Set(sessions.map((s) => s.user.id)).size
	const online = sessions.filter((s) => s.online).length

	const revoke = async (id: string, name: string) => {
		try {
			await api.revokeSession(id)
			toast(`Session de ${name} fermée.`)
			reload()
		} catch (e) {
			toast(e instanceof ApiError ? e.message : 'Action impossible.', 'critical')
		}
	}

	return (
		<AdminLayout>
			<PageHeader title="Sessions"
				subtitle={data ? `${sessions.length} session${sessions.length > 1 ? 's' : ''} ouverte${sessions.length > 1 ? 's' : ''} · ${people} personne${people > 1 ? 's' : ''} · ${online} active${online > 1 ? 's' : ''} en ce moment` : 'Chargement…'} />
			{error && <p className="form-error" role="alert">{error}</p>}
			<div className={`table-card${loading && data ? ' is-refreshing' : ''}`}>
				<table className="data-table data-table--cards">
					<thead>
						<tr>
							<th>Utilisateur</th>
							<th className="c-dev">Appareil</th>
							<th className="c-ip">Adresse IP</th>
							<th className="c-md">Activité</th>
							<th className="c-xl hide-lg">Ouverte</th>
							<th className="c-xl hide-xxl">Expire</th>
							<th className="c-act"><span className="sr-only">Actions</span></th>
						</tr>
					</thead>
					<tbody>
						{sessions.map((s) => {
							const d = device(s.userAgent)
							return (
								<tr key={s.id}>
									<td className="cell-primary">
										<div className="user-cell">
											<Avatar name={s.user.displayName} seed={s.user.username} size={32} status={s.online ? 'online' : 'offline'} />
											<div><strong>{s.user.displayName}</strong><span className="muted">@{s.user.username}</span></div>
										</div>
									</td>
									<td data-label="Appareil">
										<div className="device-cell" title={s.userAgent ?? undefined}>
											{d.mobile ? <IconPhone size={18} /> : <IconDevice size={18} />}
											<span>{d.browser}{d.os ? ` · ${d.os}` : ''}</span>
											{s.current && <Badge tone="info">Cette session</Badge>}
										</div>
									</td>
									<td className="mono" data-label="Adresse IP">{s.ip ?? '—'}</td>
									<td data-label="Activité">{s.online ? <Badge tone="good">Active</Badge> : <span className="muted">{ago(s.lastSeenAt)}</span>}</td>
									<td className="muted hide-lg" data-label="Ouverte">{dateTime(s.createdAt)}</td>
									<td className="muted hide-xxl" data-label="Expire">{dateTime(s.expiresAt)}</td>
									<td className="actions-cell">
										<button type="button" className="btn btn-ghost btn-sm" disabled={s.current}
											title={s.current ? 'Utilisez « Se déconnecter » pour fermer votre session' : undefined}
											onClick={() => revoke(s.id, s.user.displayName)}>
											<IconX size={16} /> Fermer
										</button>
									</td>
								</tr>
							)
						})}
						{!loading && sessions.length === 0 && <tr><td colSpan={7} className="table-empty">Aucune session ouverte.</td></tr>}
					</tbody>
				</table>
			</div>
		</AdminLayout>
	)
}
