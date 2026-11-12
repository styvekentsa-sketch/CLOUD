// Appels à l'API S-Drive (même origine : /api). Les erreurs sont normalisées
// en ApiError (message lisible + erreurs par champ de formulaire).

export type User = {
	id: string
	username: string
	email: string
	displayName: string
	role: 'user' | 'admin'
	createdAt: string
	lastLoginAt: string | null
}

export type AdminUser = User & {
	status: 'active' | 'disabled'
	online: boolean
	lastSeenAt?: string | null
	sessions?: number
	storageUsed?: number
	storageQuota?: number | null
}

export type ServerConfig = {
	appName: string
	registrationEnabled: boolean
	passwordMinLength: number
}

export class ApiError extends Error {
	constructor(
		public status: number,
		public code: string,
		message: string,
		public fields: Record<string, string> = {},
		public retryAfter = 0,
	) {
		super(message)
	}
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
	let res: Response
	try {
		res = await fetch(path, {
			method,
			credentials: 'same-origin',
			headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
			body: body !== undefined ? JSON.stringify(body) : undefined,
		})
	} catch {
		throw new ApiError(0, 'network',
			'Impossible de joindre S-Drive. Vérifiez votre connexion, et que le PC serveur et Docker Desktop sont allumés.')
	}
	const data = await res.json().catch(() => ({}))
	// Nginx répond mais le serveur Node.js est arrêté ou en cours de démarrage
	if (res.status >= 502 && res.status <= 504 && !data.message) {
		throw new ApiError(res.status, 'unavailable',
			'S-Drive ne répond pas pour le moment (serveur arrêté ou en cours de démarrage). Réessayez dans une minute.')
	}
	if (!res.ok) {
		throw new ApiError(
			res.status,
			data.error ?? 'error',
			data.message ?? 'Une erreur est survenue.',
			data.fields ?? {},
			data.retryAfter ?? 0,
		)
	}
	return data as T
}

export const api = {
	config: () => request<ServerConfig>('GET', '/api/auth/config'),
	me: () => request<{ user: User }>('GET', '/api/auth/me'),
	login: (login: string, password: string, remember: boolean) =>
		request<{ user: User }>('POST', '/api/auth/login', { login, password, remember }),
	register: (data: { username: string; email: string; displayName: string; password: string; remember: boolean }) =>
		request<{ user: User }>('POST', '/api/auth/register', data),
	logout: () => request<{ ok: true }>('POST', '/api/auth/logout'),
	adminUsers: (filters: Record<string, string> = {}) =>
		request<{ users: AdminUser[]; summary: { total: number; online: number; activeToday: number } }>(
			'GET', `/api/admin/users${qs(filters)}`),
	createUser: (data: { username: string; email: string; displayName: string; password: string; role: 'user' | 'admin' }) =>
		request<{ user: AdminUser }>('POST', '/api/admin/users', data),
	updateUser: (id: string, changes: { role?: 'user' | 'admin'; status?: 'active' | 'disabled'; displayName?: string; storageQuota?: number | null }) =>
		request<{ user: AdminUser }>('PATCH', `/api/admin/users/${encodeURIComponent(id)}`, changes),
	deleteUser: (id: string) => request<{ ok: true }>('DELETE', `/api/admin/users/${encodeURIComponent(id)}`),
	revokeUserSessions: (id: string) =>
		request<{ revoked: number }>('POST', `/api/admin/users/${encodeURIComponent(id)}/revoke-sessions`),
	sessions: () => request<{ sessions: AdminSession[] }>('GET', '/api/admin/sessions'),
	revokeSession: (id: string) => request<{ ok: true }>('DELETE', `/api/admin/sessions/${encodeURIComponent(id)}`),
	overview: (days: number) => request<Overview>('GET', `/api/admin/overview?days=${days}`),
	events: (filters: Record<string, string | number | undefined> = {}) =>
		request<{ events: SecurityEvent[]; nextBefore: number | null }>('GET', `/api/admin/events${qs(filters)}`),
	system: () => request<SystemInfo>('GET', '/api/admin/system'),
	storage: () => request<StorageInfo>('GET', '/api/admin/storage'),
	myStorage: () => request<{ used: number; quota: number | null }>('GET', '/api/me/storage'),
	shares: (filters: Record<string, string> = {}) => request<{ shares: Share[] }>('GET', `/api/admin/shares${qs(filters)}`),
	shareStats: () => request<ShareStats>('GET', '/api/admin/shares/stats'),
	revokeShare: (id: string) => request<{ ok: true }>('DELETE', `/api/admin/shares/${encodeURIComponent(id)}`),
	preferences: () => request<{ preferences: Preferences }>('GET', '/api/me/preferences'),
	savePreferences: (p: Preferences) => request<{ preferences: Preferences }>('PUT', '/api/me/preferences', p),
}

function qs(params: Record<string, string | number | undefined>): string {
	const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== '')
	return entries.length ? '?' + new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString() : ''
}

// --- Types de l'administration -------------------------------------------------

export type AdminUserFull = AdminUser & { lastSeenAt: string | null; sessions: number }

export type AdminSession = {
	id: string
	createdAt: string
	expiresAt: string
	lastSeenAt: string
	ip: string | null
	userAgent: string | null
	current: boolean
	online: boolean
	user: { id: string; username: string; displayName: string; role: 'user' | 'admin' }
}

export type Kpi = { value: number; previous?: number; delta?: number | null; added?: number }

export type DayPoint = { day: string; logins: number; failures: number; signups: number; active: number; total: number }

export type Overview = {
	days: number
	timezone: string
	generatedAt: string
	kpis: {
		totalUsers: Kpi
		online: Kpi
		sessions: Kpi
		activeUsers: Kpi
		signups: Kpi
		logins: Kpi
		failures: Kpi
	}
	series: DayPoint[]
	heatmap: { dow: number; hour: number; n: number }[]
	topFailures: { login: string | null; attempts: number; ips: number; lastAt: string; existing: boolean }[]
	blocks: { ip: string; login: string | null; seconds: number; failures: number }[]
	roles: { admins: number; users: number; disabled: number }
}

export type SecurityEvent = {
	id: number
	type: string
	createdAt: string
	ip: string | null
	userAgent: string | null
	meta: Record<string, unknown>
	user: { id: string; username: string | null; displayName: string | null } | null
	actor: { id: string; username: string; displayName: string } | null
}

export type SystemInfo = {
	app: { name: string; version: string; node: string; startedAt: string; uptimeSeconds: number }
	process: { rss: number; heapUsed: number; heapTotal: number }
	host: { platform: string; cpus: number; load: number[]; totalMem: number; freeMem: number; uptimeSeconds: number }
	database: { version: string; sizeBytes: number; connections: number; latencyMs: number }
	counts: { users: number; sessions: number; events: number; firstEvent: string | null }
	settings: {
		registrationEnabled: boolean
		passwordMinLength: number
		sessionHours: number
		rememberDays: number
		timezone: string
		eventRetentionDays: number
	}
}

export type WidgetSize = 3 | 4 | 6 | 8 | 12
export type Preferences = {
	dashboard?: { widgets: { id: string; size: WidgetSize }[]; days: 7 | 30 | 90 }
}

export type StorageInfo = {
	used: number
	allocated: number
	unlimitedUsers: number
	fullUsers: number
	nearFullUsers: number
	users: number
	defaultQuota: number | null
	disk: { total: number; free: number; used: number; path: string } | null
	top: { id: string; username: string; displayName: string; role: string; status: string; used: number; quota: number | null }[]
}

export type Share = {
	id: string
	itemType: 'file' | 'folder'
	itemName: string
	itemPath: string
	createdAt: string
	expiresAt: string | null
	revokedAt: string | null
	revokedBy: { username: string; displayName: string } | null
	protected: boolean
	views: number
	downloads: number
	lastAccessAt: string | null
	status: 'active' | 'expired' | 'revoked'
	owner: { id: string; username: string; displayName: string }
}

export type ShareStats = {
	active: number
	unprotected: number
	noExpiry: number
	expiringSoon: number
	expired: number
	revoked: number
	createdLast7Days: number
	views: number
	downloads: number
	owners: number
}
