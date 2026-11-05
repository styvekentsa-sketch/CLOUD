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

export type AdminUser = User & { status: 'active' | 'disabled'; online: boolean }

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
		throw new ApiError(0, 'network', 'Impossible de joindre S-Drive. Vérifiez votre connexion.')
	}
	const data = await res.json().catch(() => ({}))
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
	adminUsers: () =>
		request<{ users: AdminUser[]; summary: { total: number; online: number; activeToday: number } }>('GET', '/api/admin/users'),
}
