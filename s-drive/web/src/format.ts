// Formats français : « il y a 5 min », « hier », « 04/11/2026 ».

export function ago(iso: string | null): string {
	if (!iso) return 'jamais'
	const d = (Date.now() - new Date(iso).getTime()) / 1000
	if (d < 60) return 'à l’instant'
	if (d < 3600) return `il y a ${Math.floor(d / 60)} min`
	if (d < 86400) return `il y a ${Math.floor(d / 3600)} h`
	if (d < 172800) return 'hier'
	if (d < 30 * 86400) return `il y a ${Math.floor(d / 86400)} j`
	return `le ${date(iso)}`
}

export function date(iso: string): string {
	return new Date(iso).toLocaleDateString('fr-FR')
}

export function greeting(name: string): string {
	const h = new Date().getHours()
	const first = name.split(' ')[0]
	if (h < 6) return `Bonne nuit, ${first}`
	if (h < 12) return `Bonjour, ${first}`
	if (h < 18) return `Bon après-midi, ${first}`
	return `Bonsoir, ${first}`
}
