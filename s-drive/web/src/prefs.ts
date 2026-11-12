// Paramètres personnels : apparence, notifications, affichage.
// Enregistrés sur le compte (serveur) ET recopiés dans le navigateur, pour que le
// thème soit appliqué dès le chargement de la page, avant même la connexion.
import { setDateMode } from './format'

export type Appearance = { theme: 'system' | 'dark' | 'light'; density: 'comfortable' | 'compact'; reduceMotion: boolean }
export type Notifications = { newLogin: boolean; storageWarning: boolean; shares: boolean; weeklySummary: boolean }
export type Display = { language: 'fr'; startPage: 'dashboard' | 'files'; dateFormat: 'relative' | 'absolute' }
export type PersonalPrefs = { appearance: Appearance; notifications: Notifications; display: Display }

export const DEFAULT_PREFS: PersonalPrefs = {
	appearance: { theme: 'system', density: 'comfortable', reduceMotion: false },
	notifications: { newLogin: true, storageWarning: true, shares: true, weeklySummary: false },
	display: { language: 'fr', startPage: 'dashboard', dateFormat: 'relative' },
}

const KEY = 'sdrive-prefs'

/** Complète des préférences partielles avec les valeurs par défaut. */
export function withDefaults(p: Partial<PersonalPrefs> | null | undefined): PersonalPrefs {
	return {
		appearance: { ...DEFAULT_PREFS.appearance, ...(p?.appearance ?? {}) },
		notifications: { ...DEFAULT_PREFS.notifications, ...(p?.notifications ?? {}) },
		display: { ...DEFAULT_PREFS.display, ...(p?.display ?? {}) },
	}
}

/** Applique les préférences à la page (attributs sur <html>) et les mémorise localement. */
export function applyPrefs(p: PersonalPrefs): void {
	const root = document.documentElement
	if (p.appearance.theme === 'system') root.removeAttribute('data-theme')
	else root.setAttribute('data-theme', p.appearance.theme)
	root.setAttribute('data-density', p.appearance.density)
	root.toggleAttribute('data-reduce-motion', p.appearance.reduceMotion)
	root.lang = p.display.language
	setDateMode(p.display.dateFormat)
	try {
		localStorage.setItem(KEY, JSON.stringify(p))
	} catch {
		/* navigation privée : sans conséquence */
	}
	window.dispatchEvent(new CustomEvent('sdrive:prefs'))
}

/** Préférences mémorisées dans ce navigateur (au démarrage, avant la connexion). */
export function localPrefs(): PersonalPrefs {
	try {
		return withDefaults(JSON.parse(localStorage.getItem(KEY) ?? 'null'))
	} catch {
		return DEFAULT_PREFS
	}
}

/** Déconnexion : on revient au thème du système sur cet appareil partagé. */
export function resetLocalPrefs(): void {
	try {
		localStorage.removeItem(KEY)
	} catch {
		/* rien */
	}
	const root = document.documentElement
	root.removeAttribute('data-theme')
	root.removeAttribute('data-density')
	root.removeAttribute('data-reduce-motion')
	setDateMode('relative')
}
