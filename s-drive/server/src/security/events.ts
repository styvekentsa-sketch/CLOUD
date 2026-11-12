import type { FastifyRequest } from 'fastify'
import { pool } from '../db.js'
import { config } from '../config.js'

// Journal de sécurité : chaque action sensible laisse une trace consultable
// par les administrateurs (Tableau de bord > Journal de sécurité).
export type EventType =
	| 'login.success'
	| 'login.failure'
	| 'login.throttled'
	| 'logout'
	| 'register'
	| 'user.create'
	| 'user.update'
	| 'user.delete'
	| 'sessions.revoke'
	| 'session.revoke'
	| 'share.create'
	| 'share.revoke'
	| 'maintenance.trash_purge'
	| 'maintenance.orphan_scan'
	| 'maintenance.orphan_clean'
	| 'settings.update'
	| 'invitation.create'
	| 'invitation.revoke'
	| 'password.change'
	| 'password.change_failed'

export async function logEvent(
	req: FastifyRequest | null,
	type: EventType,
	opts: { userId?: string | null; actorId?: string | null; meta?: Record<string, unknown> } = {},
): Promise<void> {
	try {
		await pool.query(
			'INSERT INTO events (type, user_id, actor_id, ip, user_agent, meta) VALUES ($1, $2, $3, $4, $5, $6)',
			[
				type,
				opts.userId ?? null,
				opts.actorId ?? null,
				req?.ip ?? null,
				req ? (req.headers['user-agent'] ?? '').slice(0, 300) : null,
				JSON.stringify(opts.meta ?? {}),
			],
		)
	} catch (e) {
		// Le journal ne doit jamais empêcher une connexion : on signale et on continue
		req?.log.error({ err: e }, 'journal de sécurité indisponible')
	}
}

/** Marque l'utilisateur comme actif aujourd'hui (une ligne par personne et par jour). */
export async function touchActivity(userId: string): Promise<void> {
	await pool.query(
		`INSERT INTO user_daily_activity (user_id, day)
		 VALUES ($1, (now() AT TIME ZONE $2)::date) ON CONFLICT DO NOTHING`,
		[userId, config.timezone],
	)
}

export async function purgeOldEvents(): Promise<void> {
	await pool.query('DELETE FROM events WHERE created_at < now() - make_interval(days => $1)', [config.eventRetentionDays])
}
