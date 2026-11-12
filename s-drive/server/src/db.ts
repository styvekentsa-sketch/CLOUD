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

	// 2 — journal de sécurité, activité quotidienne, préférences (disposition du tableau de bord)
	`
	ALTER TABLE users ADD COLUMN preferences jsonb NOT NULL DEFAULT '{}'::jsonb;

	-- Pas de clé étrangère sur user_id : l'historique survit à la suppression d'un compte
	CREATE TABLE events (
		id          bigserial PRIMARY KEY,
		type        text NOT NULL,
		user_id     uuid,
		actor_id    uuid,
		ip          text,
		user_agent  text,
		meta        jsonb NOT NULL DEFAULT '{}'::jsonb,
		created_at  timestamptz NOT NULL DEFAULT now()
	);
	CREATE INDEX events_created_idx ON events (created_at DESC);
	CREATE INDEX events_type_created_idx ON events (type, created_at DESC);
	CREATE INDEX events_user_idx ON events (user_id, created_at DESC);

	CREATE TABLE user_daily_activity (
		user_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		day      date NOT NULL,
		PRIMARY KEY (user_id, day)
	);
	CREATE INDEX user_daily_activity_day_idx ON user_daily_activity (day);
	`,

	// 3 — stockage : quota par compte (NULL = illimité) et espace utilisé, en octets
	`
	ALTER TABLE users ADD COLUMN storage_quota bigint DEFAULT 5368709120
		CHECK (storage_quota IS NULL OR storage_quota >= 0);
	ALTER TABLE users ADD COLUMN storage_used bigint NOT NULL DEFAULT 0
		CHECK (storage_used >= 0);
	CREATE INDEX users_storage_used_idx ON users (storage_used DESC);
	`,

	// 4 — partages publics (liens). Le jeton du lien n'est jamais stocké en clair.
	`
	-- Un partage révoqué est conservé (traçabilité) avec la date et l'auteur de la révocation.
	CREATE TABLE shares (
		id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
		token_hash      text NOT NULL UNIQUE,
		owner_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		item_type       text NOT NULL CHECK (item_type IN ('file', 'folder')),
		item_name       text NOT NULL,
		item_path       text NOT NULL DEFAULT '',
		password_hash   text,
		expires_at      timestamptz,
		created_at      timestamptz NOT NULL DEFAULT now(),
		revoked_at      timestamptz,
		revoked_by      uuid REFERENCES users(id) ON DELETE SET NULL,
		views           integer NOT NULL DEFAULT 0 CHECK (views >= 0),
		downloads       integer NOT NULL DEFAULT 0 CHECK (downloads >= 0),
		last_access_at  timestamptz
	);
	CREATE INDEX shares_owner_idx ON shares (owner_id);
	CREATE INDEX shares_active_idx ON shares (revoked_at, expires_at);
	CREATE INDEX shares_created_idx ON shares (created_at DESC);
	`,

	// 5 — fichiers et dossiers (métadonnées). Le contenu d'un fichier est stocké sur le
	// disque dans <STORAGE_DIR>/blobs/<owner_id>/<storage_key>. Corbeille = trashed_at.
	// L'espace d'un fichier compte dans le quota tant qu'il n'est pas définitivement supprimé.
	`
	CREATE TABLE files (
		id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
		owner_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		parent_id    uuid REFERENCES files(id) ON DELETE CASCADE,
		kind         text NOT NULL CHECK (kind IN ('file', 'folder')),
		name         text NOT NULL,
		size         bigint NOT NULL DEFAULT 0 CHECK (size >= 0),
		mime         text,
		storage_key  text UNIQUE,
		created_at   timestamptz NOT NULL DEFAULT now(),
		updated_at   timestamptz NOT NULL DEFAULT now(),
		trashed_at   timestamptz,
		CHECK ((kind = 'file') = (storage_key IS NOT NULL))
	);
	CREATE INDEX files_owner_idx ON files (owner_id);
	CREATE INDEX files_parent_idx ON files (parent_id);
	CREATE INDEX files_trashed_idx ON files (trashed_at) WHERE trashed_at IS NOT NULL;
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
