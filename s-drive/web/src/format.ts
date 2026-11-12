// Formats français : « il y a 5 min », « 12 nov. », « 1,2 Go », « 3 j 4 h ».

// Affichage des dates (Paramètres personnels) : « il y a 5 min » ou date et heure précises
let dateMode: 'relative' | 'absolute' = 'relative'
export function setDateMode(m: 'relative' | 'absolute'): void {
	dateMode = m
}

export function ago(iso: string | null | undefined): string {
	if (!iso) return 'jamais'
	if (dateMode === 'absolute') return dateTime(iso)
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

export function dateTime(iso: string): string {
	return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })
}

/** « 12 nov. » à partir de « 2026-11-12 » (jour calendaire, sans décalage horaire). */
export function shortDay(day: string): string {
	const [y, m, d] = day.split('-').map(Number)
	return new Date(y, m - 1, d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

export function longDay(day: string): string {
	const [y, m, d] = day.split('-').map(Number)
	const s = new Date(y, m - 1, d).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
	return s.charAt(0).toUpperCase() + s.slice(1)
}

const nf = new Intl.NumberFormat('fr-FR')
const compact = new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 })

export function num(n: number): string {
	return Math.abs(n) >= 10_000 ? compact.format(n) : nf.format(n)
}

export function bytes(n: number): string {
	const units = ['o', 'Ko', 'Mo', 'Go', 'To']
	let i = 0
	let v = n
	while (v >= 1024 && i < units.length - 1) {
		v /= 1024
		i++
	}
	return `${i === 0 ? v : v.toLocaleString('fr-FR', { maximumFractionDigits: v < 10 ? 1 : 0 })} ${units[i]}`
}

export function duration(seconds: number): string {
	const d = Math.floor(seconds / 86400)
	const h = Math.floor((seconds % 86400) / 3600)
	const m = Math.floor((seconds % 3600) / 60)
	if (d > 0) return `${d} j ${h} h`
	if (h > 0) return `${h} h ${m} min`
	if (m > 0) return `${m} min`
	return `${Math.round(seconds)} s`
}

export function greeting(name: string): string {
	const h = new Date().getHours()
	const first = name.split(' ')[0]
	if (h < 6) return `Bonne nuit, ${first}`
	if (h < 12) return `Bonjour, ${first}`
	if (h < 18) return `Bon après-midi, ${first}`
	return `Bonsoir, ${first}`
}

/** Navigateur et système à partir du User-Agent (lecture simple, sans bibliothèque). */
export function device(ua: string | null | undefined): { browser: string; os: string; mobile: boolean } {
	const s = ua ?? ''
	const browser =
		/Edg\//.test(s) ? 'Edge'
			: /SamsungBrowser/.test(s) ? 'Samsung Internet'
				: /OPR\/|Opera/.test(s) ? 'Opera'
					: /Firefox\//.test(s) ? 'Firefox'
						: /Chrome\//.test(s) ? 'Chrome'
							: /Safari\//.test(s) ? 'Safari'
								: /^curl\//.test(s) ? 'curl'
									: s ? 'Autre navigateur' : 'Inconnu'
	const os =
		/Windows/.test(s) ? 'Windows'
			: /iPhone|iPad|iPod/.test(s) ? 'iOS'
				: /Android/.test(s) ? 'Android'
					: /Mac OS X|Macintosh/.test(s) ? 'macOS'
						: /CrOS/.test(s) ? 'ChromeOS'
							: /Linux/.test(s) ? 'Linux'
								: ''
	return { browser, os, mobile: /Mobile|Android|iPhone/.test(s) }
}
