import pg from 'pg'
import { config } from './config.js'

export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 })

/**
 * Migrations SQL appliquées dans l'ordre, une seule fois chacune
 * (table schema_migrations). Ne jamais modifier une migration déjà livrée :
 * en ajouter une nouvelle à la fin.
 */
const migrations: string[] = [
	// 1 — comptes et sessions
	`
	CREATE TABLE users (
		id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
		username       text NOT NULL,
		email          text NOT NULL,
		display_name   text NOT NULL,
		password_hash  text NOT NULL,
		role           text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
		status         text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
		created_at     timestamptz NOT NULL DEFAULT now(),
		last_login_at  timestamptz,
		last_seen_at   timestamptz
	);
	CREATE UNIQUE INDEX users_username_key ON users (lower(username));
	CREATE UNIQUE INDEX users_email_key ON users (lower(email));

	CREATE TABLE sessions (
		id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
		user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		token_hash    text NOT NULL UNIQUE,
		created_at    timestamptz NOT NULL DEFAULT now(),
		expires_at    timestamptz NOT NULL,
		last_seen_at  timestamptz NOT NULL DEFAULT now(),
		ip            text,
		user_agent    text
	);
	CREATE INDEX sessions_user_idx ON sessions (user_id);
	CREATE INDEX sessions_expires_idx ON sessions (expires_at);
	`,
]

export async function migrate(): Promise<void> {
	const client = await pool.connect()
	try {
		await client.query('SELECT pg_advisory_lock(424242)')
		await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (version int PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())')
		const { rows } = await client.query<{ version: number }>('SELECT version FROM schema_migrations')
		const done = new Set(rows.map((r) => r.version))
		for (let i = 0; i < migrations.length; i++) {
			const version = i + 1
			if (done.has(version)) continue
			await client.query('BEGIN')
			try {
				await client.query(migrations[i])
				await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version])
				await client.query('COMMIT')
				console.log(`[db] migration ${version} appliquée`)
			} catch (e) {
				await client.query('ROLLBACK')
				throw e
			}
		}
	} finally {
		await client.query('SELECT pg_advisory_unlock(424242)').catch(() => {})
		client.release()
	}
}
