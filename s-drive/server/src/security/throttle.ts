// Protection contre les essais de mots de passe (force brute), en mémoire.
//  - par adresse IP + identifiant : après 3 échecs, délai croissant (2 s, 4 s, 8 s… max 5 min)
//  - par adresse IP seule : au-delà de 30 échecs en 15 min, blocage 15 min
// Un succès remet le compteur IP + identifiant à zéro.

type Entry = { failures: number; blockedUntil: number; firstAt: number }

const perKey = new Map<string, Entry>()
const perIp = new Map<string, Entry>()

const IP_WINDOW_MS = 15 * 60 * 1000
const IP_MAX_FAILURES = 30
const MAX_DELAY_MS = 5 * 60 * 1000

const key = (ip: string, login: string) => `${ip}|${login.toLowerCase()}`

/** Nombre de secondes à attendre avant de pouvoir réessayer (0 = autorisé). */
export function retryAfter(ip: string, login: string, now = Date.now()): number {
	const a = perKey.get(key(ip, login))
	const b = perIp.get(ip)
	const until = Math.max(a?.blockedUntil ?? 0, b?.blockedUntil ?? 0)
	return until > now ? Math.ceil((until - now) / 1000) : 0
}

export function recordFailure(ip: string, login: string, now = Date.now()): void {
	const k = key(ip, login)
	const a = perKey.get(k) ?? { failures: 0, blockedUntil: 0, firstAt: now }
	a.failures++
	if (a.failures >= 3) {
		a.blockedUntil = now + Math.min(MAX_DELAY_MS, 1000 * 2 ** (a.failures - 2))
	}
	perKey.set(k, a)

	let b = perIp.get(ip)
	if (!b || now - b.firstAt > IP_WINDOW_MS) b = { failures: 0, blockedUntil: 0, firstAt: now }
	b.failures++
	if (b.failures >= IP_MAX_FAILURES) b.blockedUntil = now + IP_WINDOW_MS
	perIp.set(ip, b)
}

export function recordSuccess(ip: string, login: string): void {
	perKey.delete(key(ip, login))
}

/** Nettoyage périodique des entrées expirées. */
export function prune(now = Date.now()): void {
	for (const [k, v] of perKey) if (v.blockedUntil < now && now - v.firstAt > 24 * 3600 * 1000) perKey.delete(k)
	for (const [k, v] of perIp) if (v.blockedUntil < now && now - v.firstAt > IP_WINDOW_MS) perIp.delete(k)
}

/** Pour les tests uniquement. */
export function _reset(): void {
	perKey.clear()
	perIp.clear()
}
