// Configuration lue dans les variables d'environnement (.env via docker compose).

function env(name: string, fallback?: string): string {
	const v = process.env[name]
	if (v === undefined || v === '') {
		if (fallback !== undefined) return fallback
		throw new Error(`Variable d'environnement manquante : ${name}`)
	}
	return v
}

function bool(name: string, fallback: boolean): boolean {
	const v = process.env[name]
	if (v === undefined || v === '') return fallback
	return ['1', 'true', 'yes', 'oui'].includes(v.toLowerCase())
}

export const config = {
	port: Number(env('PORT', '3000')),
	databaseUrl: env('DATABASE_URL'),
	appName: env('APP_NAME', 'S-Drive'),

	registrationEnabled: bool('REGISTRATION_ENABLED', true),
	passwordMinLength: Number(env('PASSWORD_MIN_LENGTH', '12')),

	// Durée des sessions
	sessionHours: Number(env('SESSION_HOURS', '12')),
	rememberDays: Number(env('REMEMBER_DAYS', '30')),

	// Compte administrateur créé au premier démarrage s'il n'en existe aucun
	admin: {
		username: env('ADMIN_USERNAME', 'admin'),
		email: env('ADMIN_EMAIL', 'admin@localhost'),
		password: process.env.ADMIN_PASSWORD ?? '',
		displayName: env('ADMIN_DISPLAY_NAME', 'Administrateur'),
	},
} as const
