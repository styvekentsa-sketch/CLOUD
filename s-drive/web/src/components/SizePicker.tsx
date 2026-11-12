import { useEffect, useState } from 'react'
import { Segmented } from './ui'

const UNITS = { Mo: 1024 ** 2, Go: 1024 ** 3, To: 1024 ** 4 } as const
type Unit = keyof typeof UNITS

export type SizePreset = { label: string; bytes: number | null }

/**
 * Choix d'une taille : valeurs proposées (ex. 5 Go, 20 Go, Illimité) ou saisie
 * personnalisée en Mo / Go / To. `onChange(undefined)` = saisie invalide.
 */
export function SizePicker({ value, onChange, presets, label, min = 0 }: {
	value: number | null
	onChange: (v: number | null | undefined) => void
	presets: SizePreset[]
	label: string
	min?: number
}) {
	const match = presets.findIndex((p) => p.bytes === value)
	const [choice, setChoice] = useState<string>(match >= 0 ? String(match) : 'custom')
	const initialUnit: Unit = value !== null && value >= UNITS.To && value % UNITS.To === 0 ? 'To' : value !== null && value < UNITS.Go ? 'Mo' : 'Go'
	const [unit, setUnit] = useState<Unit>(initialUnit)
	const [amount, setAmount] = useState(value === null ? '' : String(+(value / UNITS[initialUnit]).toFixed(2)))

	// Valeur changée de l'extérieur (rechargement, annulation)
	useEffect(() => {
		const m = presets.findIndex((p) => p.bytes === value)
		if (m >= 0) setChoice(String(m))
	}, [value, presets])

	const pick = (c: string) => {
		setChoice(c)
		if (c === 'custom') {
			const n = Number(amount.replace(',', '.'))
			onChange(amount.trim() !== '' && Number.isFinite(n) && n * UNITS[unit] >= min ? Math.round(n * UNITS[unit]) : undefined)
		} else {
			onChange(presets[Number(c)].bytes)
		}
	}
	const custom = (a: string, u: Unit) => {
		setAmount(a)
		setUnit(u)
		const n = Number(a.replace(',', '.'))
		onChange(a.trim() !== '' && Number.isFinite(n) && n >= 0 && n * UNITS[u] >= min ? Math.round(n * UNITS[u]) : undefined)
	}

	return (
		<div className="size-picker">
			<Segmented label={label} value={choice} onChange={pick}
				options={[...presets.map((p, i) => ({ value: String(i), label: p.label })), { value: 'custom', label: 'Personnalisé' }]} />
			{choice === 'custom' && (
				<div className="quota-custom">
					<input type="number" inputMode="decimal" min={0} step="any" value={amount} aria-label={`${label} (valeur personnalisée)`}
						onChange={(e) => custom(e.target.value, unit)} placeholder="ex. 50" />
					<select value={unit} onChange={(e) => custom(amount, e.target.value as Unit)} aria-label="Unité">
						{(Object.keys(UNITS) as Unit[]).map((u) => <option key={u} value={u}>{u}</option>)}
					</select>
				</div>
			)}
		</div>
	)
}
