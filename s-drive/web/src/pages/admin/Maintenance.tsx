import { useState } from 'react'
import { api, ApiError, type CleanResult, type MaintenanceInfo, type ScanResult } from '../../api'
import { SegmentedBar } from '../../components/charts/Charts'
import { IconAlert, IconRefresh, IconServer, IconTrash } from '../../components/Icons'
import { Badge, Dialog, useData, useToast } from '../../components/ui'
import { ago, bytes, dateTime, num } from '../../format'

// =============================================================================
//  Système > Maintenance du stockage : répartition, vidage des corbeilles anciennes,
//  analyse et nettoyage des fichiers orphelins. Chaque action est journalisée.
// =============================================================================

const plural = (n: number, s: string, p = `${s}s`) => `${num(n)} ${n > 1 ? p : s}`

function Breakdown({ m }: { m: MaintenanceInfo }) {
	// Un nettoyage postérieur à la dernière analyse a supprimé les orphelins trouvés
	const cleanedSinceScan = !!(m.lastScan && m.lastClean && new Date(m.lastClean.at) >= new Date(m.lastScan.at))
	const orphanBytes = cleanedSinceScan ? 0 : (m.lastScan?.orphanBytes ?? 0)
	const total = m.active.bytes + m.trash.bytes + m.temp.bytes + orphanBytes
	return (
		<section className="sys-card maint-breakdown">
			<h2>Répartition du stockage</h2>
			<p className="maint-total">
				<strong>{bytes(total)}</strong>
				<span className="muted">occupés par S-Drive{m.disk ? ` · ${bytes(m.disk.free)} libres sur le disque` : ''}</span>
			</p>
			<SegmentedBar parts={[
				{ label: 'Fichiers actifs', value: m.active.bytes, color: 'var(--series-1)' },
				{ label: 'Corbeilles des utilisateurs', value: m.trash.bytes, color: 'var(--series-2)' },
				{ label: 'Temporaires et orphelins', value: m.temp.bytes + orphanBytes, color: 'var(--neutral-mark)' },
			]} format={bytes} />
			<dl className="w-kv maint-details">
				<dt>Fichiers actifs</dt><dd>{plural(m.active.files, 'fichier')} · {plural(m.active.folders, 'dossier')}</dd>
				<dt>Corbeilles</dt><dd>{plural(m.trash.files, 'fichier')} chez {plural(m.trash.owners, 'personne')}</dd>
				<dt>Envois en cours ou abandonnés</dt>
				<dd className="dd-inline">
					{plural(m.temp.files, 'fichier temporaire', 'fichiers temporaires')}
					{m.temp.staleFiles > 0 && <Badge tone="warning">{m.temp.staleFiles} abandonné{m.temp.staleFiles > 1 ? 's' : ''} · {bytes(m.temp.staleBytes)}</Badge>}
				</dd>
				<dt>Orphelins sur le disque</dt>
				<dd>{!m.lastScan ? 'Pas encore analysé'
					: cleanedSinceScan ? `Aucun (nettoyé ${ago(m.lastClean!.at)})`
						: `${plural(m.lastScan.orphanFiles, 'fichier')} · ${bytes(m.lastScan.orphanBytes)} (analyse ${ago(m.lastScan.at)})`}</dd>
			</dl>
		</section>
	)
}

function TrashCard({ m, onDone }: { m: MaintenanceInfo; onDone: () => void }) {
	const toast = useToast()
	const [open, setOpen] = useState(false)
	const [busy, setBusy] = useState(false)
	const p = m.purge

	const confirm = async () => {
		setBusy(true)
		try {
			const r = await api.purgeTrash()
			toast(`Corbeilles vidées : ${plural(r.files, 'fichier')} supprimé${r.files > 1 ? 's' : ''}, ${bytes(r.bytes)} libérés.`)
			setOpen(false)
			onDone()
		} catch (e) {
			toast(e instanceof ApiError ? e.message : 'Vidage impossible.', 'critical')
		} finally {
			setBusy(false)
		}
	}

	return (
		<section className="sys-card maint-card">
			<h2><IconTrash size={18} /> Corbeilles</h2>
			<p className="muted">Les fichiers supprimés restent dans la corbeille de chaque personne, et comptent dans son quota, jusqu’à ce qu’ils soient vidés.</p>
			<dl className="w-kv">
				<dt>Dans les corbeilles</dt><dd>{bytes(m.trash.bytes)} · {plural(m.trash.files, 'fichier')}</dd>
				<dt>Depuis plus de 30 jours</dt>
				<dd className="dd-inline">
					<strong>{bytes(p.bytes)}</strong>
					<span className="muted">{plural(p.files, 'fichier')} · {plural(p.owners, 'personne')}</span>
				</dd>
				<dt>Dernier vidage</dt>
				<dd>{m.lastPurge ? `${ago(m.lastPurge.at)} par ${m.lastPurge.actor ?? '?'} (${bytes(m.lastPurge.bytes)})` : 'Jamais'}</dd>
			</dl>
			<div className="maint-actions">
				<button type="button" className="btn btn-danger" disabled={p.items === 0 || !!m.running} onClick={() => setOpen(true)}>
					<IconTrash size={18} /> Vider les corbeilles de + de 30 jours
				</button>
				{p.items === 0 && <span className="muted">Rien à vider pour l’instant.</span>}
			</div>

			<Dialog open={open} onClose={() => setOpen(false)} title="Vider les corbeilles de plus de 30 jours ?"
				footer={<>
					<button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Annuler</button>
					<button type="button" className="btn btn-danger" onClick={confirm} disabled={busy}>
						<IconTrash size={18} /> {busy ? 'Suppression…' : `Supprimer définitivement ${bytes(p.bytes)}`}
					</button>
				</>}>
				<div className="maint-free">
					<span className="muted">Espace libéré</span>
					<strong>{bytes(p.bytes)}</strong>
				</div>
				<ul className="maint-list">
					<li>{plural(p.files, 'fichier')}{p.items > p.files ? ` et ${plural(p.items - p.files, 'dossier')}` : ''}, mis à la corbeille il y a plus de 30 jours</li>
					<li>Appartenant à {plural(p.owners, 'personne')} : leur quota est libéré d’autant</li>
					<li>Les éléments mis à la corbeille plus récemment sont conservés</li>
				</ul>
				<p className="form-warning"><IconAlert size={18} /><span>Suppression définitive : ces fichiers ne pourront pas être récupérés.</span></p>
			</Dialog>
		</section>
	)
}

function OrphansCard({ m, onDone }: { m: MaintenanceInfo; onDone: () => void }) {
	const toast = useToast()
	const [scan, setScan] = useState<ScanResult | null>(null)
	const [scanning, setScanning] = useState(false)
	const [open, setOpen] = useState(false)
	const [removeMissing, setRemoveMissing] = useState(false)
	const [cleaning, setCleaning] = useState(false)
	const [result, setResult] = useState<CleanResult | null>(null)

	const run = async () => {
		setScanning(true)
		setResult(null)
		try {
			setScan(await api.scanOrphans())
			onDone()
		} catch (e) {
			toast(e instanceof ApiError ? e.message : 'Analyse impossible.', 'critical')
		} finally {
			setScanning(false)
		}
	}
	const clean = async () => {
		setCleaning(true)
		try {
			const r = await api.cleanOrphans(removeMissing)
			setResult(r)
			setScan(null)
			setOpen(false)
			toast(`Nettoyage terminé : ${bytes(r.orphanBytes + r.tempBytes)} libérés.`)
			onDone()
		} catch (e) {
			toast(e instanceof ApiError ? e.message : 'Nettoyage impossible.', 'critical')
		} finally {
			setCleaning(false)
		}
	}

	const s = scan ?? null
	const toClean = s ? s.orphanFiles + s.staleTempFiles + s.missingFiles : 0

	return (
		<section className="sys-card maint-card">
			<h2><IconServer size={18} /> Fichiers orphelins</h2>
			<p className="muted">Compare la base de données aux fichiers réellement présents sur le disque : fichiers sans entrée, entrées sans fichier, envois abandonnés depuis plus de 24 h.</p>
			<dl className="w-kv">
				<dt>Dernière analyse</dt>
				<dd>{m.lastScan ? `${dateTime(m.lastScan.at)} par ${m.lastScan.actor ?? '?'}` : 'Jamais'}</dd>
				<dt>Dernier nettoyage</dt>
				<dd>{m.lastClean ? `${ago(m.lastClean.at)} · ${bytes(m.lastClean.orphanBytes + m.lastClean.tempBytes)} libérés` : 'Jamais'}</dd>
			</dl>
			<div className="maint-actions">
				<button type="button" className="btn btn-secondary" onClick={run} disabled={scanning || !!m.running}>
					<IconRefresh size={18} className={scanning ? 'spin' : undefined} /> {scanning ? 'Analyse en cours…' : 'Analyser maintenant'}
				</button>
				{s && toClean > 0 && (
					<button type="button" className="btn btn-danger" onClick={() => setOpen(true)}>Nettoyer…</button>
				)}
			</div>

			{s && (
				<div className="maint-report" role="status">
					{toClean === 0
						? <p><Badge tone="good">Stockage cohérent</Badge> <span className="muted">{num(s.diskFiles)} fichiers sur le disque, {num(s.dbFiles)} en base : rien à nettoyer.</span></p>
						: (
							<>
								<ul className="maint-findings">
									<li><span>Fichiers sur le disque sans entrée</span><strong>{num(s.orphanFiles)}</strong><span className="muted">{bytes(s.orphanBytes)}</span></li>
									<li><span>Entrées sans fichier sur le disque</span><strong>{num(s.missingFiles)}</strong><span className="muted">{bytes(s.missingBytes)}</span></li>
									<li><span>Envois abandonnés (&gt; 24 h)</span><strong>{num(s.staleTempFiles)}</strong><span className="muted">{bytes(s.staleTempBytes)}</span></li>
								</ul>
								{s.storageLooksMissing && (
									<p className="form-warning"><IconAlert size={18} /><span>La plupart des fichiers sont introuvables : le disque de stockage n’est peut-être pas monté. Les entrées ne seront pas supprimées.</span></p>
								)}
								<details className="maint-detail">
									<summary>Voir le détail</summary>
									<ul>
										{s.orphans.map((o) => <li key={`o-${o.key}`}><span className="mono">{o.key.slice(0, 12)}…</span> <span className="muted">orphelin · {o.owner ? `@${o.owner}` : 'compte supprimé'} · {bytes(o.size)}</span></li>)}
										{s.missing.map((x) => <li key={`m-${x.key}`}><span className="mono">{x.key.slice(0, 12)}…</span> <span className="muted">fichier introuvable · @{x.owner ?? '?'} · {bytes(x.size)}</span></li>)}
										{s.staleTemp.map((t) => <li key={`t-${t.name}`}><span className="mono">{t.name}</span> <span className="muted">envoi abandonné · {ago(t.modifiedAt)} · {bytes(t.size)}</span></li>)}
									</ul>
								</details>
							</>
						)}
				</div>
			)}
			{result && (
				<p className="maint-result" role="status">
					<Badge tone="good">Nettoyé</Badge>{' '}
					{plural(result.orphanFiles + result.tempFiles, 'fichier')} supprimé{result.orphanFiles + result.tempFiles > 1 ? 's' : ''} ({bytes(result.orphanBytes + result.tempBytes)})
					{result.missingRemoved > 0 && `, ${plural(result.missingRemoved, 'entrée')} retirée${result.missingRemoved > 1 ? 's' : ''}`}
					{result.skippedMissing && ' — entrées conservées (stockage introuvable)'}
				</p>
			)}

			<Dialog open={open} onClose={() => setOpen(false)} title="Nettoyer les fichiers orphelins ?"
				footer={<>
					<button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Annuler</button>
					<button type="button" className="btn btn-danger" onClick={clean} disabled={cleaning}>
						{cleaning ? 'Nettoyage…' : `Nettoyer ${s ? bytes(s.orphanBytes + s.staleTempBytes) : ''}`}
					</button>
				</>}>
				{s && (
					<>
						<ul className="maint-list">
							<li>{plural(s.orphanFiles, 'fichier orphelin', 'fichiers orphelins')} supprimé{s.orphanFiles > 1 ? 's' : ''} du disque ({bytes(s.orphanBytes)})</li>
							<li>{plural(s.staleTempFiles, 'envoi abandonné', 'envois abandonnés')} supprimé{s.staleTempFiles > 1 ? 's' : ''} ({bytes(s.staleTempBytes)})</li>
							<li>Les fichiers récents (envois en cours) ne sont jamais touchés</li>
						</ul>
						{s.missingFiles > 0 && (
							<label className={`check-row${s.storageLooksMissing ? ' is-disabled' : ''}`}>
								<input type="checkbox" checked={removeMissing && !s.storageLooksMissing} disabled={s.storageLooksMissing}
									onChange={(e) => setRemoveMissing(e.target.checked)} />
								<span>
									Retirer aussi les <strong>{num(s.missingFiles)}</strong> entrée{s.missingFiles > 1 ? 's' : ''} dont le fichier est introuvable
									<span className="muted"> — elles disparaissent des fichiers de leur propriétaire et libèrent {bytes(s.missingBytes)} de quota.</span>
								</span>
							</label>
						)}
					</>
				)}
			</Dialog>
		</section>
	)
}

export function StorageMaintenance() {
	const { data: m, reload, error } = useData(() => api.maintenance(), [], 60_000)
	if (error) return <p className="form-error" role="alert">{error}</p>
	if (!m) return <p className="muted">Chargement de la maintenance…</p>
	return (
		<div className="maint">
			<h2 className="maint-title">Maintenance du stockage</h2>
			<div className="maint-grid">
				<Breakdown m={m} />
				<TrashCard m={m} onDone={reload} />
				<OrphansCard m={m} onDone={reload} />
			</div>
		</div>
	)
}
