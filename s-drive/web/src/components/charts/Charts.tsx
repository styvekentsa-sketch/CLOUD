// Graphiques S-Drive en SVG, sans bibliothèque. Règles appliquées :
// traits 2 px, aire à 10 %, barres ≤ 24 px aux bouts arrondis (4 px), grille fine
// et discrète, un seul axe, infobulle au survol ET au clavier, légende dès 2 séries,
// vue tableau disponible, texte toujours dans les couleurs de texte (jamais de la série).
import { useState, type KeyboardEvent } from 'react'
import { DataTable, fmtTick, Legend, niceTicks, Tooltip, TooltipRow, useWidth } from './core'

/** Étiquette d'axe : une sur « step », plus la dernière — sauf si elle chevauche la précédente. */
const showTick = (i: number, n: number, step: number) =>
	i === n - 1 || (i % step === 0 && n - 1 - i >= step * 0.75)

export type Series = { key: string; label: string; color: string; area?: boolean; dash?: boolean }

// ---------------------------------------------------------------------------------
// Courbes (évolution dans le temps)
// ---------------------------------------------------------------------------------
export function LineChart({ data, series, xLabel, height = 220, tableTitle }: {
	data: ({ x: string } & Record<string, number | string>)[]
	series: Series[]
	xLabel: (x: string) => string
	height?: number
	tableTitle?: string
}) {
	const [ref, width] = useWidth<HTMLDivElement>()
	const [hover, setHover] = useState<number | null>(null)
	const [table, setTable] = useState(false)

	const pad = { top: 12, right: 28, bottom: 26, left: 36 }
	const w = Math.max(0, width - pad.left - pad.right)
	const h = height - pad.top - pad.bottom
	const max = Math.max(1, ...data.flatMap((d) => series.map((s) => Number(d[s.key]) || 0)))
	const ticks = niceTicks(max)
	const top = ticks[ticks.length - 1]
	const x = (i: number) => pad.left + (data.length <= 1 ? w / 2 : (i / (data.length - 1)) * w)
	const y = (v: number) => pad.top + h - (v / top) * h
	const step = Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor(w / 72))))

	const onMove = (clientX: number, rect: DOMRect) => {
		const rel = clientX - rect.left - pad.left
		const i = Math.round((rel / Math.max(1, w)) * (data.length - 1))
		setHover(Math.max(0, Math.min(data.length - 1, i)))
	}
	const onKey = (e: KeyboardEvent) => {
		if (e.key === 'ArrowRight') setHover((i) => Math.min(data.length - 1, (i ?? -1) + 1))
		else if (e.key === 'ArrowLeft') setHover((i) => Math.max(0, (i ?? data.length) - 1))
		else return
		e.preventDefault()
	}

	return (
		<div className="viz">
			<div className="viz-top">
				{series.length > 1 && <Legend items={series.map((s) => ({ label: s.label, color: s.color, dash: s.dash }))} />}
				<button type="button" className="viz-toggle" onClick={() => setTable((t) => !t)} aria-pressed={table}>
					{table ? 'Graphique' : 'Tableau'}
				</button>
			</div>
			{table ? (
				<DataTable columns={[tableTitle ?? 'Jour', ...series.map((s) => s.label)]}
					rows={data.map((d) => [xLabel(d.x), ...series.map((s) => Number(d[s.key]) || 0)])} />
			) : (
				<div ref={ref} className="viz-frame" style={{ height }}>
					{width > 0 && (
						<svg width={width} height={height} role="img"
							aria-label={`${series.map((s) => s.label).join(', ')} — ${data.length} points`}>
							{ticks.map((t) => (
								<g key={t}>
									<line x1={pad.left} x2={pad.left + w} y1={y(t)} y2={y(t)} className="viz-grid" />
									<text x={pad.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="viz-axis">{fmtTick(t)}</text>
								</g>
							))}
							{data.map((d, i) => showTick(i, data.length, step) && (
								<text key={d.x} x={x(i)} y={height - 6} textAnchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'}
									className="viz-axis">{xLabel(d.x)}</text>
							))}
							{series.map((s) => {
								const pts = data.map((d, i) => `${x(i)},${y(Number(d[s.key]) || 0)}`)
								return (
									<g key={s.key}>
										{s.area && data.length > 1 && (
											<path d={`M${x(0)},${y(0)} L${pts.join(' L')} L${x(data.length - 1)},${y(0)} Z`}
												fill={s.color} opacity={0.1} />
										)}
										<polyline points={pts.join(' ')} fill="none" stroke={s.color} strokeWidth={2}
											strokeLinejoin="round" strokeLinecap="round" strokeDasharray={s.dash ? '4 4' : undefined} />
									</g>
								)
							})}
							{/* Valeur de fin, à droite de chaque courbe (étiquetage sélectif) */}
							{hover === null && data.length > 0 && series.map((s) => {
								const v = Number(data[data.length - 1][s.key]) || 0
								return (
									<g key={s.key}>
										<circle cx={x(data.length - 1)} cy={y(v)} r={4} fill={s.color} className="viz-ring" />
										<text x={x(data.length - 1) + 8} y={y(v)} dy="0.32em" className="viz-end">{fmtTick(v)}</text>
									</g>
								)
							})}
							{hover !== null && (
								<g>
									<line x1={x(hover)} x2={x(hover)} y1={pad.top} y2={pad.top + h} className="viz-crosshair" />
									{series.map((s) => (
										<circle key={s.key} cx={x(hover)} cy={y(Number(data[hover][s.key]) || 0)} r={4} fill={s.color} className="viz-ring" />
									))}
								</g>
							)}
							<rect x={pad.left} y={pad.top} width={w} height={h} fill="transparent" tabIndex={0}
								className="viz-hit" aria-label="Parcourir les valeurs avec les flèches gauche et droite"
								onPointerMove={(e) => onMove(e.clientX, e.currentTarget.ownerSVGElement!.getBoundingClientRect())}
								onPointerLeave={() => setHover(null)} onFocus={() => setHover(data.length - 1)}
								onBlur={() => setHover(null)} onKeyDown={onKey} />
						</svg>
					)}
					{hover !== null && data[hover] && (
						<Tooltip x={x(hover)} y={pad.top} width={width}>
							<div className="viz-tooltip-title">{xLabel(data[hover].x)}</div>
							{series.map((s) => (
								<TooltipRow key={s.key} color={s.color} dash={s.dash} value={fmtTick(Number(data[hover][s.key]) || 0)} label={s.label} />
							))}
						</Tooltip>
					)}
				</div>
			)}
		</div>
	)
}

// ---------------------------------------------------------------------------------
// Colonnes (une valeur par jour)
// ---------------------------------------------------------------------------------
export function ColumnChart({ data, color, label, xLabel, height = 220 }: {
	data: { x: string; value: number }[]
	color: string
	label: string
	xLabel: (x: string) => string
	height?: number
}) {
	const [ref, width] = useWidth<HTMLDivElement>()
	const [hover, setHover] = useState<number | null>(null)
	const [table, setTable] = useState(false)

	const pad = { top: 18, right: 8, bottom: 26, left: 36 }
	const w = Math.max(0, width - pad.left - pad.right)
	const h = height - pad.top - pad.bottom
	const max = Math.max(1, ...data.map((d) => d.value))
	const ticks = niceTicks(max)
	const top = ticks[ticks.length - 1]
	const band = data.length ? w / data.length : 0
	const bw = Math.max(2, Math.min(24, band - 2))
	const y = (v: number) => pad.top + h - (v / top) * h
	const maxIndex = data.reduce((best, d, i) => (d.value > (data[best]?.value ?? -1) ? i : best), 0)
	const step = Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor(w / 72))))

	// Colonne : bout arrondi (4 px) en haut, base carrée
	const bar = (cx: number, v: number) => {
		const x0 = cx - bw / 2
		const y0 = y(v)
		const r = Math.min(4, bw / 2, (pad.top + h - y0))
		return `M${x0},${pad.top + h} V${y0 + r} Q${x0},${y0} ${x0 + r},${y0} H${x0 + bw - r} Q${x0 + bw},${y0} ${x0 + bw},${y0 + r} V${pad.top + h} Z`
	}

	return (
		<div className="viz">
			<div className="viz-top">
				<span />
				<button type="button" className="viz-toggle" onClick={() => setTable((t) => !t)} aria-pressed={table}>
					{table ? 'Graphique' : 'Tableau'}
				</button>
			</div>
			{table ? (
				<DataTable columns={['Jour', label]} rows={data.map((d) => [xLabel(d.x), d.value])} />
			) : (
				<div ref={ref} className="viz-frame" style={{ height }}>
					{width > 0 && (
						<svg width={width} height={height} role="img" aria-label={`${label} — ${data.length} jours`}>
							{ticks.map((t) => (
								<g key={t}>
									<line x1={pad.left} x2={pad.left + w} y1={y(t)} y2={y(t)} className="viz-grid" />
									<text x={pad.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="viz-axis">{fmtTick(t)}</text>
								</g>
							))}
							{data.map((d, i) => {
								const cx = pad.left + band * (i + 0.5)
								return (
									<g key={d.x}>
										{d.value > 0 && <path d={bar(cx, d.value)} fill={color} opacity={hover === null || hover === i ? 1 : 0.55} />}
										{d.value > 0 && i === maxIndex && hover === null && (
											<text x={cx} y={y(d.value) - 6} textAnchor="middle" className="viz-end">{fmtTick(d.value)}</text>
										)}
										{showTick(i, data.length, step) && (
											<text x={cx} y={height - 6} textAnchor="middle" className="viz-axis">{xLabel(d.x)}</text>
										)}
										<rect x={pad.left + band * i} y={pad.top} width={band} height={h} fill="transparent" tabIndex={0}
											className="viz-hit" aria-label={`${xLabel(d.x)} : ${d.value} ${label.toLowerCase()}`}
											onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}
											onFocus={() => setHover(i)} onBlur={() => setHover(null)} />
									</g>
								)
							})}
						</svg>
					)}
					{hover !== null && data[hover] && (
						<Tooltip x={pad.left + band * (hover + 0.5)} y={Math.max(0, y(data[hover].value) - 56)} width={width}>
							<div className="viz-tooltip-title">{xLabel(data[hover].x)}</div>
							<TooltipRow color={color} value={fmtTick(data[hover].value)} label={label} />
						</Tooltip>
					)}
				</div>
			)}
		</div>
	)
}

// ---------------------------------------------------------------------------------
// Carte des heures (jour de semaine × heure), échelle séquentielle à une teinte
// ---------------------------------------------------------------------------------
const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']

export function Heatmap({ cells, label }: { cells: { dow: number; hour: number; n: number }[]; label: string }) {
	const [ref, width] = useWidth<HTMLDivElement>()
	const [hover, setHover] = useState<{ d: number; hr: number } | null>(null)
	const [table, setTable] = useState(false)

	const grid = Array.from({ length: 7 }, () => Array<number>(24).fill(0))
	for (const c of cells) if (c.dow >= 1 && c.dow <= 7) grid[c.dow - 1][c.hour] = c.n
	const max = Math.max(0, ...grid.flat())
	const level = (n: number) => (n === 0 ? 0 : Math.min(4, Math.ceil((n / max) * 4)))

	const left = 34
	const gap = 2
	const cell = Math.max(6, Math.min(26, (width - left - gap * 23) / 24))
	const height = 7 * cell + 6 * gap + 22

	return (
		<div className="viz">
			<div className="viz-top">
				<div className="viz-scale" aria-hidden="true">
					<span>Moins</span>
					{[0, 1, 2, 3, 4].map((l) => <i key={l} className={`heat-${l}`} />)}
					<span>Plus</span>
				</div>
				<button type="button" className="viz-toggle" onClick={() => setTable((t) => !t)} aria-pressed={table}>
					{table ? 'Graphique' : 'Tableau'}
				</button>
			</div>
			{table ? (
				<DataTable columns={['Jour', ...Array.from({ length: 24 }, (_, h) => `${h} h`)]}
					rows={grid.map((r, d) => [DAYS[d], ...r])} />
			) : (
				<div ref={ref} className="viz-frame" style={{ height }}>
					{width > 0 && (
						<svg width={width} height={height} role="img" aria-label={label}>
							{DAYS.map((d, di) => (
								<text key={d} x={0} y={di * (cell + gap) + cell / 2} dy="0.32em" className="viz-axis">{d.slice(0, 3)}</text>
							))}
							{[0, 6, 12, 18, 23].map((hr) => (
								<text key={hr} x={left + hr * (cell + gap) + cell / 2} y={height - 4} textAnchor="middle" className="viz-axis">{hr} h</text>
							))}
							{grid.map((row, di) => row.map((n, hr) => (
								<rect key={`${di}-${hr}`} x={left + hr * (cell + gap)} y={di * (cell + gap)} width={cell} height={cell} rx={3}
									className={`heat-${level(n)}${hover && hover.d === di && hover.hr === hr ? ' heat-hover' : ''}`}
									tabIndex={-1} aria-label={`${DAYS[di]} ${hr} h : ${n}`}
									onPointerEnter={() => setHover({ d: di, hr })} onPointerLeave={() => setHover(null)} />
							)))}
						</svg>
					)}
					{hover && (
						<Tooltip x={left + hover.hr * (cell + gap) + cell} y={Math.max(0, hover.d * (cell + gap) - 40)} width={width}>
							<div className="viz-tooltip-title">{DAYS[hover.d]}, {hover.hr} h – {hover.hr + 1} h</div>
							<div className="viz-tooltip-row"><strong>{grid[hover.d][hover.hr]}</strong><span>{label.toLowerCase()}</span></div>
						</Tooltip>
					)}
				</div>
			)}
		</div>
	)
}

// ---------------------------------------------------------------------------------
// Petite courbe de tendance (tuiles d'indicateurs) : teinte discrète, dernier point accentué
// ---------------------------------------------------------------------------------
export function Sparkline({ values, height = 36 }: { values: number[]; height?: number }) {
	const [ref, width] = useWidth<HTMLDivElement>()
	const max = Math.max(1, ...values)
	const min = Math.min(0, ...values)
	const x = (i: number) => 3 + (values.length <= 1 ? 0 : (i / (values.length - 1)) * (width - 8))
	const y = (v: number) => 4 + (height - 8) * (1 - (v - min) / (max - min || 1))
	return (
		<div ref={ref} className="spark" aria-hidden="true">
			{width > 0 && values.length > 1 && (
				<svg width={width} height={height}>
					<polyline points={values.map((v, i) => `${x(i)},${y(v)}`).join(' ')} fill="none" className="spark-line"
						strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
					<circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r={3.5} className="spark-dot viz-ring" />
				</svg>
			)}
		</div>
	)
}

// ---------------------------------------------------------------------------------
// Barre segmentée fine (répartition d'un tout)
// ---------------------------------------------------------------------------------
export function SegmentedBar({ parts, format = String }: {
	parts: { label: string; value: number; color: string }[]
	/** Mise en forme des valeurs (ex. tailles en Mo) ; par défaut, le nombre brut */
	format?: (n: number) => string
}) {
	const total = parts.reduce((s, p) => s + p.value, 0)
	return (
		<div className="segbar-wrap">
			<div className="segbar" role="img" aria-label={parts.map((p) => `${p.label} : ${p.value}`).join(', ')}>
				{parts.filter((p) => p.value > 0).map((p) => (
					<span key={p.label} style={{ flexGrow: p.value, background: p.color }} title={`${p.label} : ${format(p.value)}`} />
				))}
				{total === 0 && <span style={{ flexGrow: 1 }} className="segbar-empty" />}
			</div>
			<ul className="segbar-legend">
				{parts.map((p) => (
					<li key={p.label}>
						<span className="viz-key-rect" style={{ background: p.color }} />
						<span>{p.label}</span>
						<strong>{format(p.value)}</strong>
						<span className="muted">{total ? Math.round((p.value / total) * 100) : 0} %</span>
					</li>
				))}
			</ul>
		</div>
	)
}
