// Avatar à initiale, couleur stable dérivée de l'identifiant (comme les avatars par défaut).
const COLORS = ['#0B5563', '#7A4E9B', '#B5503C', '#2E7D4F', '#9A6B12', '#3D5A99', '#A3456E', '#4F6B2E']

function colorFor(seed: string): string {
	let h = 0
	for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0
	return COLORS[h % COLORS.length]
}

export function Avatar({ name, seed, size = 32, status }: {
	name: string
	seed: string
	size?: number
	status?: 'online' | 'offline'
}) {
	return (
		<span className="avatar" style={{ width: size, height: size, background: colorFor(seed), fontSize: size * 0.45 }}
			aria-hidden="true">
			{(name.trim()[0] ?? '?').toUpperCase()}
			{status && <span className={`avatar-status avatar-status--${status}`} />}
		</span>
	)
}
