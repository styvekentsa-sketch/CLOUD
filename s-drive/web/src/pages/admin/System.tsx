import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api'
import { IconRefresh } from '../../components/Icons'
import { Badge, useData, type Tone } from '../../components/ui'
import { bytes, dateTime, duration, num } from '../../format'
import { AdminLayout, PageHeader } from './AdminLayout'
import { StorageMaintenance } from './Maintenance'

function Card({ title, children }: { title: string; children: ReactNode }) {
	return (
		<section className="sys-card">
			<h2>{title}</h2>
			<dl className="w-kv">{children}</dl>
		</section>
	)
}

function Meter({ value, label }: { value: number; label: string }) {
	const pct = Math.round(value * 100)
	return (
		<div className="meter-row">
			<div className="meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={label}>
				<span className={value > 0.9 ? 'meter--critical' : value > 0.75 ? 'meter--warning' : ''} style={{ width: `${pct}%` }} />
			</div>
			<span>{pct} %</span>
		</div>
	)
}

/** Temps de réponse de l'API mesuré depuis ce navigateur. */
function useApiLatency() {
	const [ms, setMs] = useState<number | null>(null)
	useEffect(() => {
		const measure = async () => {
			const t0 = performance.now()
			await fetch('/api/health', { cache: 'no-store' }).catch(() => null)
			setMs(Math.round(performance.now() - t0))
		}
		void measure()
		const t = setInterval(measure, 15_000)
		return () => clearInterval(t)
	}, [])
	return ms
}

const tone = (ms: number, ok: number, warn: number): Tone => (ms < ok ? 'good' : ms < warn ? 'warning' : 'critical')

export function System() {
	const { data: s, reload, loading } = useData(() => api.system(), [], 30_000)
	const latency = useApiLatency()

	return (
		<AdminLayout>
			<PageHeader title="Système" subtitle="Maintenance du stockage, état du serveur, de la base de données et réglages actifs."
				actions={<button type="button" className="btn btn-ghost" onClick={reload} disabled={loading}>
					<IconRefresh size={18} className={loading ? 'spin' : undefined} /> Actualiser
				</button>} />
			<StorageMaintenance />
			<h2 className="maint-title">État du serveur</h2>
			{!s ? <p className="muted">Chargement…</p> : (
				<div className="sys-grid">
					<Card title="Application">
						<dt>État</dt><dd><Badge tone="good">Opérationnel</Badge></dd>
						<dt>Version</dt><dd>{s.app.name} {s.app.version}</dd>
						<dt>Démarrée</dt><dd>{dateTime(s.app.startedAt)} <span className="muted">({duration(s.app.uptimeSeconds)})</span></dd>
						<dt>Temps de réponse</dt><dd>{latency === null ? '…' : <Badge tone={tone(latency, 150, 500)}>{latency} ms</Badge>}</dd>
						<dt>Moteur</dt><dd>Node.js {s.app.node.replace(/^v/, '')}</dd>
						<dt>Mémoire de l’API</dt><dd>{bytes(s.process.rss)}</dd>
					</Card>
					<Card title="Serveur">
						<dt>Système</dt><dd>{s.host.platform}</dd>
						<dt>Processeurs</dt><dd>{s.host.cpus} cœurs · charge {s.host.load.map((l) => l.toFixed(2)).join(' / ')}</dd>
						<dt>Mémoire</dt>
						<dd>
							<Meter value={1 - s.host.freeMem / s.host.totalMem} label="Mémoire utilisée" />
							<span className="muted">{bytes(s.host.totalMem - s.host.freeMem)} utilisés sur {bytes(s.host.totalMem)}</span>
						</dd>
						<dt>Allumé depuis</dt><dd>{duration(s.host.uptimeSeconds)}</dd>
					</Card>
					<Card title="Base de données">
						<dt>Moteur</dt><dd>PostgreSQL {s.database.version}</dd>
						<dt>Latence</dt><dd><Badge tone={tone(s.database.latencyMs, 20, 100)}>{s.database.latencyMs} ms</Badge></dd>
						<dt>Taille</dt><dd>{bytes(s.database.sizeBytes)}</dd>
						<dt>Connexions</dt><dd>{s.database.connections}</dd>
					</Card>
					<Card title="Contenu">
						<dt>Comptes</dt><dd>{num(s.counts.users)}</dd>
						<dt>Sessions ouvertes</dt><dd>{num(s.counts.sessions)}</dd>
						<dt>Événements journalisés</dt><dd>{num(s.counts.events)}</dd>
						<dt>Journal depuis</dt><dd>{s.counts.firstEvent ? dateTime(s.counts.firstEvent) : '—'}</dd>
					</Card>
					<Card title="Réglages actifs">
						<dt>Inscriptions</dt><dd>{{ open: <Badge tone="good">Ouvertes</Badge>, invite: <Badge tone="info">Sur invitation</Badge>, closed: <Badge tone="neutral">Fermées</Badge> }[s.settings.registrationMode]}</dd>
						<dt>Maintenance</dt><dd>{s.settings.maintenance.enabled ? <Badge tone="warning">Activée</Badge> : <Badge tone="good">Désactivée</Badge>}</dd>
						<dt>Quota par défaut</dt><dd>{s.settings.defaultQuotaBytes === null ? "Illimité" : bytes(s.settings.defaultQuotaBytes)}</dd>
						<dt>Taille max. d’envoi</dt><dd>{s.settings.maxUploadBytes === null ? "Sans limite" : bytes(s.settings.maxUploadBytes)}</dd>
						<dt>Mot de passe</dt><dd>{s.settings.passwordMinLength} caractères minimum</dd>
						<dt>Durée des sessions</dt><dd>{s.settings.sessionHours} h · {s.settings.rememberDays} j avec « Se souvenir de moi »</dd>
						<dt>Fuseau horaire</dt><dd>{s.settings.timezone}</dd>
						<dt>Conservation du journal</dt><dd>{s.settings.eventRetentionDays} jours</dd>
					</Card>
					<p className="muted sys-note">Inscriptions, quota par défaut, taille d’envoi et maintenance : <Link to="/tableau-de-bord/parametres">Paramètres</Link>. Les autres réglages (durée des sessions, fuseau, conservation du journal) se modifient dans <span className="mono">s-drive/.env</span>.</p>
				</div>
			)}
		</AdminLayout>
	)
}
