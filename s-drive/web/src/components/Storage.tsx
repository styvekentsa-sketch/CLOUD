import { bytes } from '../format'
import { IconAlert } from './Icons'

export const GIB = 1024 ** 3

/** Niveau de remplissage : sert à la couleur d'état (toujours accompagnée d'un texte). */
export function fillLevel(used: number, quota: number | null): 'ok' | 'near' | 'full' | 'unlimited' {
	if (quota === null) return 'unlimited'
	if (quota === 0 || used >= quota) return 'full'
	return used / quota >= 0.8 ? 'near' : 'ok'
}

/**
 * Barre « Utilisé / Quota » : fine (6 px), remplissage aux couleurs d'état
 * (normal → bientôt plein → plein), libellé texte toujours présent.
 */
export function StorageBar({ used, quota, compact = false }: { used: number; quota: number | null; compact?: boolean }) {
	const level = fillLevel(used, quota)
	const pct = quota ? Math.min(100, (used / quota) * 100) : 0
	const label = quota === null ? `${bytes(used)} · Illimité` : `${bytes(used)} / ${bytes(quota)}`
	return (
		<div className={`sbar sbar--${level}${compact ? ' sbar--compact' : ''}`}>
			<div className="sbar-track" role="meter" aria-valuemin={0} aria-valuemax={quota ?? undefined} aria-valuenow={used}
				aria-label={`Stockage : ${label}`}>
				{quota !== null && <span style={{ width: `${pct}%` }} />}
			</div>
			<div className="sbar-text">
				<span>{label}</span>
				{level === 'full' && <span className="sbar-state"><IconAlert size={14} /> Plein</span>}
				{level === 'near' && <span className="sbar-state">{Math.round(pct)} %</span>}
				{level === 'ok' && quota !== null && !compact && <span className="muted">{Math.round(pct)} %</span>}
			</div>
		</div>
	)
}
