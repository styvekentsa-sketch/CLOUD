import { useState } from 'react'
import { bytes } from '../../format'

/**
 * Jauge en demi-cercle du disque du serveur : fichiers S-Drive (couleur de série 1),
 * autres données du disque (gris neutre), espace libre (piste). Les segments sont
 * séparés par un petit espace couleur de fond ; la légende donne chaque valeur en texte.
 */
export function StorageGauge({ total, sdrive, other }: { total: number; sdrive: number; other: number }) {
	const [hover, setHover] = useState<'sdrive' | 'other' | 'free' | null>(null)
	const free = Math.max(0, total - sdrive - other)
	const r = 80
	const sw = 16
	const cx = 100
	const cy = 96
	const L = Math.PI * r
	const gap = 2
	const len = (v: number) => (total > 0 ? (v / total) * L : 0)
	const a = len(sdrive)
	const b = len(other)
	// Un segment non nul reste visible (au moins 2 px) pour ne pas « disparaître »
	const aVis = sdrive > 0 ? Math.max(2, a - (b > 0 ? gap : 0)) : 0
	const arc = `M${cx - r},${cy} A${r},${r} 0 0 1 ${cx + r},${cy}`
	const usedPct = total > 0 ? ((sdrive + other) / total) * 100 : 0
	const parts = [
		{ key: 'sdrive' as const, label: 'Fichiers S-Drive', value: sdrive, cls: 'gauge-key--sdrive' },
		{ key: 'other' as const, label: 'Autres données du disque', value: other, cls: 'gauge-key--other' },
		{ key: 'free' as const, label: 'Espace libre', value: free, cls: 'gauge-key--free' },
	]

	return (
		<div className="gauge">
			<svg viewBox="0 0 200 112" className="gauge-svg" role="img"
				aria-label={`Disque utilisé à ${Math.round(usedPct)} % : fichiers S-Drive ${bytes(sdrive)}, autres données ${bytes(other)}, libre ${bytes(free)} sur ${bytes(total)}`}>
				<path d={arc} fill="none" className="gauge-track" strokeWidth={sw} />
				{b > 0 && (
					<path d={arc} fill="none" className={`gauge-other${hover === 'other' ? ' is-hover' : ''}`} strokeWidth={sw}
						strokeDasharray={`${Math.max(0, b)} ${L}`} strokeDashoffset={-(a)} />
				)}
				{aVis > 0 && (
					<path d={arc} fill="none" className={`gauge-sdrive${hover === 'sdrive' ? ' is-hover' : ''}`} strokeWidth={sw}
						strokeDasharray={`${aVis} ${L}`} />
				)}
				<text x={cx} y={cy - 18} textAnchor="middle" className="gauge-value">{Math.round(usedPct)} %</text>
				<text x={cx} y={cy - 2} textAnchor="middle" className="gauge-caption">du disque utilisé</text>
			</svg>
			<ul className="gauge-legend">
				{parts.map((p) => (
					<li key={p.key} onPointerEnter={() => setHover(p.key)} onPointerLeave={() => setHover(null)}>
						<span className={`viz-key-rect ${p.cls}`} />
						<span>{p.label}</span>
						<strong>{bytes(p.value)}</strong>
					</li>
				))}
				<li className="gauge-total"><span /><span className="muted">Capacité totale</span><strong>{bytes(total)}</strong></li>
			</ul>
		</div>
	)
}
