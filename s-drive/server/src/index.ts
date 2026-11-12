import { buildApp } from './app.js'
import { config } from './config.js'
import { migrate, pool } from './db.js'
import { hashPassword } from './security/password.js'
import { purgeExpiredSessions } from './security/sessions.js'
import { purgeOldEvents } from './security/events.js'
import { prune } from './security/throttle.js'

/** Crée le compte administrateur au premier démarrage (aucun admin en base). */
async function ensureAdmin(): Promise<void> {
	const { rows } = await pool.query("SELECT 1 FROM users WHERE role = 'admin' LIMIT 1")
	if (rows.length > 0) return
	const { username, email, password, displayName } = config.admin
	if (password.length < config.passwordMinLength) {
		console.error(`[admin] ADMIN_PASSWORD absent ou trop court (min ${config.passwordMinLength}) : aucun administrateur créé.`)
		return
	}
	await pool.query(
		`INSERT INTO users (username, email, display_name, password_hash, role, storage_quota)
		 VALUES (lower($1), lower($2), $3, $4, 'admin', $5)`,
		[username, email, displayName, await hashPassword(password), config.defaultQuotaBytes],
	)
	console.log(`[admin] compte administrateur « ${username} » créé`)
}

async function main(): Promise<void> {
	await migrate()
	await ensureAdmin()
	const app = await buildApp()

	setInterval(() => {
		prune()
		purgeExpiredSessions().catch((e) => app.log.error(e))
		purgeOldEvents().catch((e) => app.log.error(e))
	}, 3600_000).unref()

	const stop = async () => {
		await app.close()
		await pool.end()
		process.exit(0)
	}
	process.on('SIGTERM', stop)
	process.on('SIGINT', stop)

	await app.listen({ host: '0.0.0.0', port: config.port })
}

main().catch((e) => {
	console.error(e)
	process.exit(1)
})
