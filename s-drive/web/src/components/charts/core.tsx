import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

/** Largeur réelle d'un conteneur (les graphiques se redessinent quand elle change). */
export function useWidth<T extends HTMLElement>(): [React.RefObject<T>, number] {
	const ref = useRef<T>(null)
	const [width, setWidth] = useState(0)
	useLayoutEffect(() => {
		const el = ref.current
		if (!el) return
		setWidth(el.getBoundingClientRect().width)
		const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
		ro.observe(el)
		return () => ro.disconnect()
	}, [])
	return [ref, width]
}

/** Graduations « rondes » (1, 2, 5 × 10ⁿ) de 0 à au moins `max`. */
export function niceTicks(max: number, count = 4): number[] {
	if (max <= 0) return [0, 1]
	const raw = max / count
	const mag = 10 ** Math.floor(Math.log10(raw))
	// Comptages : jamais de graduation à virgule (pas de « 0,5 inscription »)
	const step = Math.max(1, [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag)
	const top = Math.ceil(max / step) * step
	const ticks: number[] = []
	for (let v = 0; v <= top + 1e-9; v += step) ticks.push(Math.round(v * 1e6) / 1e6)
	return ticks
}

export const fmtTick = (n: number) =>
	n >= 10_000 ? new Intl.NumberFormat('fr-FR', { notation: 'compact' }).format(n) : new Intl.NumberFormat('fr-FR').format(n)

/** Infobulle positionnée dans le cadre du graphique, sans jamais déborder. */
export function Tooltip({ x, y, width, children }: { x: number; y: number; width: number; children: ReactNode }) {
	const ref = useRef<HTMLDivElement>(null)
	const [w, setW] = useState(160)
	useEffect(() => {
		if (ref.current) setW(ref.current.offsetWidth)
	})
	const left = Math.max(0, Math.min(x + 12, width - w))
	const flip = x + 12 + w > width
	return (
		<div ref={ref} className="viz-tooltip" role="status"
			style={{ left: flip ? Math.max(0, x - w - 12) : left, top: Math.max(0, y) }}>
			{children}
		</div>
	)
}

export function TooltipRow({ color, value, label, dash }: { color: string; value: string; label: string; dash?: boolean }) {
	return (
		<div className="viz-tooltip-row">
			<svg width="14" height="8" aria-hidden="true">
				<line x1="1" y1="4" x2="13" y2="4" stroke={color} strokeWidth="2" strokeLinecap="round" strokeDasharray={dash ? '3 3' : undefined} />
			</svg>
			<strong>{value}</strong>
			<span>{label}</span>
		</div>
	)
}

export function Legend({ items }: { items: { label: string; color: string; kind?: 'line' | 'rect'; dash?: boolean }[] }) {
	return (
		<ul className="viz-legend">
			{items.map((it) => (
				<li key={it.label}>
					{it.kind === 'rect'
						? <span className="viz-key-rect" style={{ background: it.color }} />
						: (
							<svg width="16" height="8" aria-hidden="true">
								<line x1="1" y1="4" x2="15" y2="4" stroke={it.color} strokeWidth="2" strokeLinecap="round" strokeDasharray={it.dash ? '3 3' : undefined} />
							</svg>
						)}
					{it.label}
				</li>
			))}
		</ul>
	)
}

/** Vue tableau (accessibilité : toutes les valeurs sans survol). */
export function DataTable({ columns, rows }: { columns: string[]; rows: (string | number)[][] }) {
	return (
		<div className="viz-table-wrap">
			<table className="viz-table">
				<thead><tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
				<tbody>
					{rows.map((r, i) => (
						<tr key={i}>{r.map((v, j) => <td key={j} className={typeof v === 'number' ? 'num' : undefined}>{typeof v === 'number' ? fmtTick(v) : v}</td>)}</tr>
					))}
				</tbody>
			</table>
		</div>
	)
}
