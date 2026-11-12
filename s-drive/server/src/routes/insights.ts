import os from 'node:os'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { pool } from '../db.js'
import { config } from '../config.js'
import { requireAdmin } from '../security/guards.js'
import { activeBlocks } from '../security/throttle.js'

const startedAt = new Date()
const periodQuery = z.object({ days: z.coerce.number().int().refine((d) => [7, 30, 90].includes(d)).default(30) })

/** Variation en % entre deux périodes (null si la période précédente est vide). */
const delta = (cur: number, prev: number) => (prev === 0 ? null : Math.round(((cur - prev) / prev) * 100))

export async function insightsRoutes(app: FastifyInstance): Promise<void> {
	app.addHook('preHandler', requireAdmin)

	/**
	 * Vue d'ensemble : indicateurs + séries quotidiennes + carte des heures,
	 * sur la période choisie (7, 30 ou 90 jours) comparée à la précédente.
	 */
	app.get('/api/admin/overview', async (req, reply) => {
		const parsed = periodQuery.safeParse(req.query)
		if (!parsed.success) return reply.code(400).send({ error: 'validation', message: 'Période invalide (7, 30 ou 90).' })
		const days = parsed.data.days
		const tz = config.timezone

		const [series, kpi, heat, failures, roles] = await Promise.all([
			// Une ligne par jour : connexions, échecs, inscriptions, actifs, total cumulé
			pool.query(
				`WITH d AS (
				   SELECT generate_series((now() AT TIME ZONE $2)::date - ($1::int - 1), (now() AT TIME ZONE $2)::date, interval '1 day')::date AS day
				 ),
				 ev AS (
				   SELECT (created_at AT TIME ZONE $2)::date AS day, type FROM events
				    WHERE type IN ('login.success', 'login.failure')
				      AND created_at >= ((now() AT TIME ZONE $2)::date - ($1::int - 1)) AT TIME ZONE $2
				 )
				 SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
				        (SELECT count(*) FROM ev WHERE ev.day = d.day AND ev.type = 'login.success')::int AS logins,
				        (SELECT count(*) FROM ev WHERE ev.day = d.day AND ev.type = 'login.failure')::int AS failures,
				        (SELECT count(*) FROM users u WHERE (u.created_at AT TIME ZONE $2)::date = d.day)::int AS signups,
				        (SELECT count(*) FROM user_daily_activity a WHERE a.day = d.day)::int AS active,
				        (SELECT count(*) FROM users u WHERE (u.created_at AT TIME ZONE $2)::date <= d.day)::int AS total
				   FROM d ORDER BY d.day`,
				[days, tz],
			),
			// Indicateurs de la période et de la période précédente
			pool.query(
				`WITH b AS (
				   SELECT ((now() AT TIME ZONE $2)::date - ($1::int - 1)) AS cur_start,
				          ((now() AT TIME ZONE $2)::date - (2 * $1::int - 1)) AS prev_start
				 )
				 SELECT
				   (SELECT count(*) FROM users)::int AS total_users,
				   (SELECT count(*) FROM users WHERE status = 'disabled')::int AS disabled_users,
				   (SELECT count(*) FROM users WHERE status = 'active' AND last_seen_at > now() - interval '5 minutes')::int AS online,
				   (SELECT count(*) FROM sessions WHERE expires_at > now())::int AS sessions,
				   (SELECT count(*) FROM users, b WHERE (created_at AT TIME ZONE $2)::date >= b.cur_start)::int AS signups,
				   (SELECT count(*) FROM users, b WHERE (created_at AT TIME ZONE $2)::date >= b.prev_start AND (created_at AT TIME ZONE $2)::date < b.cur_start)::int AS signups_prev,
				   (SELECT count(DISTINCT user_id) FROM user_daily_activity, b WHERE day >= b.cur_start)::int AS active,
				   (SELECT count(DISTINCT user_id) FROM user_daily_activity, b WHERE day >= b.prev_start AND day < b.cur_start)::int AS active_prev,
				   (SELECT count(*) FROM events, b WHERE type = 'login.failure' AND (created_at AT TIME ZONE $2)::date >= b.cur_start)::int AS failures,
				   (SELECT count(*) FROM events, b WHERE type = 'login.failure' AND (created_at AT TIME ZONE $2)::date >= b.prev_start AND (created_at AT TIME ZONE $2)::date < b.cur_start)::int AS failures_prev,
				   (SELECT count(*) FROM events, b WHERE type = 'login.success' AND (created_at AT TIME ZONE $2)::date >= b.cur_start)::int AS logins,
				   (SELECT count(*) FROM events, b WHERE type = 'login.success' AND (created_at AT TIME ZONE $2)::date >= b.prev_start AND (created_at AT TIME ZONE $2)::date < b.cur_start)::int AS logins_prev`,
				[days, tz],
			),
			// Carte des heures : connexions réussies par jour de semaine (1 = lundi) et heure
			pool.query(
				`SELECT extract(isodow FROM created_at AT TIME ZONE $2)::int AS dow,
				        extract(hour FROM created_at AT TIME ZONE $2)::int AS hour,
				        count(*)::int AS n
				   FROM events
				  WHERE type = 'login.success' AND created_at > now() - make_interval(days => $1)
				  GROUP BY 1, 2`,
				[days, tz],
			),
			// Identifiants les plus visés par des échecs
			pool.query(
				`SELECT e.meta->>'login' AS login, count(*)::int AS attempts, count(DISTINCT e.ip)::int AS ips,
				        max(e.created_at) AS last_at,
				        bool_or(u.id IS NOT NULL) AS existing
				   FROM events e
				   LEFT JOIN users u ON lower(u.username) = lower(e.meta->>'login') OR lower(u.email) = lower(e.meta->>'login')
				  WHERE e.type = 'login.failure' AND e.created_at > now() - make_interval(days => $1)
				  GROUP BY 1 ORDER BY attempts DESC, last_at DESC LIMIT 8`,
				[days],
			),
			pool.query(
				`SELECT
				   count(*) FILTER (WHERE role = 'admin' AND status = 'active')::int AS admins,
				   count(*) FILTER (WHERE role = 'user' AND status = 'active')::int AS users,
				   count(*) FILTER (WHERE status = 'disabled')::int AS disabled
				 FROM users`,
			),
		])

		const k = kpi.rows[0]
		return {
			days,
			timezone: tz,
			generatedAt: new Date(),
			kpis: {
				totalUsers: { value: k.total_users, added: k.signups },
				online: { value: k.online },
				sessions: { value: k.sessions },
				activeUsers: { value: k.active, previous: k.active_prev, delta: delta(k.active, k.active_prev) },
				signups: { value: k.signups, previous: k.signups_prev, delta: delta(k.signups, k.signups_prev) },
				logins: { value: k.logins, previous: k.logins_prev, delta: delta(k.logins, k.logins_prev) },
				failures: { value: k.failures, previous: k.failures_prev, delta: delta(k.failures, k.failures_prev) },
			},
			series: series.rows,
			heatmap: heat.rows,
			topFailures: failures.rows.map((r) => ({
				login: r.login, attempts: r.attempts, ips: r.ips, lastAt: r.last_at, existing: r.existing,
			})),
			blocks: activeBlocks(),
			roles: roles.rows[0],
		}
	})

	// Journal de sécurité, paginé (curseur = id du dernier élément reçu)
	const eventsQuery = z.object({
		limit: z.coerce.number().int().min(1).max(200).default(50),
		before: z.coerce.number().int().positive().optional(),
		type: z.string().regex(/^[a-z.]+$/).max(40).optional(),
		group: z.enum(['auth', 'failures', 'accounts', 'sessions']).optional(),
		q: z.string().trim().max(100).optional(),
	})
	const GROUPS: Record<string, string[]> = {
		auth: ['login.success', 'logout', 'register'],
		failures: ['login.failure', 'login.throttled'],
		accounts: ['user.create', 'user.update', 'user.delete', 'register'],
		sessions: ['sessions.revoke', 'session.revoke', 'logout'],
	}

	app.get('/api/admin/events', async (req, reply) => {
		const parsed = eventsQuery.safeParse(req.query)
		if (!parsed.success) return reply.code(400).send({ error: 'validation', message: 'Filtre invalide.' })
		const { limit, before, type, group, q } = parsed.data
		const where: string[] = []
		const params: unknown[] = []
		if (before) { params.push(before); where.push(`e.id < $${params.length}`) }
		if (type) { params.push(type); where.push(`e.type = $${params.length}`) }
		if (group) { params.push(GROUPS[group]); where.push(`e.type = ANY($${params.length})`) }
		if (q) {
			params.push(`%${q.toLowerCase()}%`)
			where.push(`(lower(coalesce(u.username, e.meta->>'username', e.meta->>'login', '')) LIKE $${params.length} OR e.ip LIKE $${params.length})`)
		}
		params.push(limit + 1)
		const { rows } = await pool.query(
			`SELECT e.id, e.type, e.created_at, e.ip, e.user_agent, e.meta,
			        e.user_id, u.username, u.display_name,
			        e.actor_id, a.username AS actor_username, a.display_name AS actor_display_name
			   FROM events e
			   LEFT JOIN users u ON u.id = e.user_id
			   LEFT JOIN users a ON a.id = e.actor_id
			  ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
			  ORDER BY e.id DESC LIMIT $${params.length}`,
			params,
		)
		const more = rows.length > limit
		return {
			events: rows.slice(0, limit).map((e) => ({
				id: Number(e.id),
				type: e.type,
				createdAt: e.created_at,
				ip: e.ip,
				userAgent: e.user_agent,
				meta: e.meta,
				user: e.user_id ? { id: e.user_id, username: e.username ?? e.meta?.username ?? null, displayName: e.display_name ?? null } : null,
				actor: e.actor_id ? { id: e.actor_id, username: e.actor_username, displayName: e.actor_display_name } : null,
			})),
			nextBefore: more ? Number(rows[limit - 1].id) : null,
		}
	})

	// Santé du serveur
	app.get('/api/admin/system', async () => {
		const [db, counts] = await Promise.all([
			pool.query(`SELECT pg_database_size(current_database())::bigint AS size, current_setting('server_version') AS version,
			                   (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database())::int AS connections`),
			pool.query(`SELECT (SELECT count(*) FROM users)::int AS users,
			                   (SELECT count(*) FROM sessions WHERE expires_at > now())::int AS sessions,
			                   (SELECT count(*) FROM events)::int AS events,
			                   (SELECT min(created_at) FROM events) AS first_event`),
		])
		const t0 = performance.now()
		await pool.query('SELECT 1')
		const dbLatencyMs = Math.round((performance.now() - t0) * 10) / 10
		const mem = process.memoryUsage()
		return {
			app: { name: config.appName, version: process.env.npm_package_version ?? '0.2.0', node: process.version, startedAt, uptimeSeconds: Math.round(process.uptime()) },
			process: { rss: mem.rss, heapUsed: mem.heapUsed, heapTotal: mem.heapTotal },
			host: { platform: `${os.type()} ${os.release()}`, cpus: os.cpus().length, load: os.loadavg(), totalMem: os.totalmem(), freeMem: os.freemem(), uptimeSeconds: Math.round(os.uptime()) },
			database: { version: db.rows[0].version, sizeBytes: Number(db.rows[0].size), connections: db.rows[0].connections, latencyMs: dbLatencyMs },
			counts: { ...counts.rows[0], firstEvent: counts.rows[0].first_event },
			settings: {
				registrationEnabled: config.registrationEnabled,
				passwordMinLength: config.passwordMinLength,
				sessionHours: config.sessionHours,
				rememberDays: config.rememberDays,
				timezone: config.timezone,
				eventRetentionDays: config.eventRetentionDays,
			},
		}
	})
}
