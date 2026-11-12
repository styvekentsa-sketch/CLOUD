import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { pool } from '../db.js'
import { requireAdmin } from '../security/guards.js'
import { hashPassword } from '../security/password.js'
import { logEvent } from '../security/events.js'
import { fieldErrors, registerSchema } from './auth.js'
import { config } from '../config.js'

const ONLINE_MS = 5 * 60 * 1000
const uuid = z.string().uuid()

const USER_COLUMNS = `u.id, u.username, u.email, u.display_name, u.role, u.status, u.created_at,
	u.last_login_at, u.last_seen_at, u.storage_quota, u.storage_used,
	(SELECT count(*)::int FROM sessions s WHERE s.user_id = u.id AND s.expires_at > now()) AS sessions`

type UserRow = {
	id: string; username: string; email: string; display_name: string; role: string; status: string
	created_at: Date; last_login_at: Date | null; last_seen_at: Date | null; sessions: number
	storage_quota: string | null; storage_used: string   // bigint -> chaîne côté pg
}

/** Quota en octets : entier ≥ 0, ou null = illimité. */
const quotaSchema = z.union([z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), z.null()])

function adminUser(u: UserRow) {
	return {
		id: u.id,
		username: u.username,
		email: u.email,
		displayName: u.display_name,
		role: u.role,
		status: u.status,
		createdAt: u.created_at,
		lastLoginAt: u.last_login_at,
		lastSeenAt: u.last_seen_at,
		sessions: u.sessions,
		storageUsed: Number(u.storage_used),
		storageQuota: u.storage_quota === null ? null : Number(u.storage_quota),
		online: u.status === 'active' && u.last_seen_at !== null && Date.now() - new Date(u.last_seen_at).getTime() < ONLINE_MS,
	}
}

/** Nombre d'administrateurs actifs, hors le compte indiqué. */
async function otherActiveAdmins(exceptId: string): Promise<number> {
	const { rows } = await pool.query(
		"SELECT count(*)::int AS n FROM users WHERE role = 'admin' AND status = 'active' AND id <> $1", [exceptId])
	return rows[0].n
}

const listQuery = z.object({
	q: z.string().trim().max(100).optional(),
	role: z.enum(['admin', 'user']).optional(),
	status: z.enum(['active', 'disabled']).optional(),
	presence: z.enum(['online', 'offline']).optional(),
	sort: z.enum(['name', 'created', 'lastLogin', 'lastSeen', 'storage']).default('lastSeen'),
	dir: z.enum(['asc', 'desc']).default('desc'),
})

const createSchema = registerSchema.omit({ remember: true }).extend({
	role: z.enum(['admin', 'user']).default('user'),
	storageQuota: quotaSchema.optional(),
})

const updateSchema = z.object({
	role: z.enum(['admin', 'user']).optional(),
	status: z.enum(['active', 'disabled']).optional(),
	displayName: z.string().trim().min(1).max(80).optional(),
	storageQuota: quotaSchema.optional(),
}).refine((v) => Object.keys(v).length > 0, { error: 'Rien à modifier.' })

export async function adminRoutes(app: FastifyInstance): Promise<void> {
	app.addHook('preHandler', requireAdmin)

	// --- Comptes ------------------------------------------------------------------
	app.get('/api/admin/users', async (req, reply) => {
		const parsed = listQuery.safeParse(req.query)
		if (!parsed.success) return reply.code(400).send({ error: 'validation', fields: fieldErrors(parsed.error) })
		const { q, role, status, presence, sort, dir } = parsed.data

		const where: string[] = []
		const params: unknown[] = []
		if (q) {
			params.push(`%${q.toLowerCase()}%`)
			where.push(`(lower(u.username) LIKE $${params.length} OR lower(u.email) LIKE $${params.length} OR lower(u.display_name) LIKE $${params.length})`)
		}
		if (role) { params.push(role); where.push(`u.role = $${params.length}`) }
		if (status) { params.push(status); where.push(`u.status = $${params.length}`) }
		if (presence === 'online') where.push(`u.status = 'active' AND u.last_seen_at > now() - interval '5 minutes'`)
		if (presence === 'offline') where.push(`(u.last_seen_at IS NULL OR u.last_seen_at <= now() - interval '5 minutes' OR u.status <> 'active')`)

		const order = {
			name: 'lower(u.display_name)', created: 'u.created_at', lastLogin: 'u.last_login_at', lastSeen: 'u.last_seen_at',
			storage: 'u.storage_used',
		}[sort]
		const { rows } = await pool.query<UserRow>(
			`SELECT ${USER_COLUMNS} FROM users u
			 ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
			 ORDER BY ${order} ${dir === 'asc' ? 'ASC' : 'DESC'} NULLS LAST, u.created_at DESC
			 LIMIT 500`,
			params,
		)
		const users = rows.map(adminUser)
		const startOfDay = new Date()
		startOfDay.setHours(0, 0, 0, 0)
		return {
			users,
			// Rétrocompatibilité avec l'ancien widget
			summary: {
				total: users.length,
				online: users.filter((u) => u.online).length,
				activeToday: users.filter((u) => u.lastLoginAt && new Date(u.lastLoginAt) >= startOfDay).length,
			},
		}
	})

	app.post('/api/admin/users', async (req, reply) => {
		const parsed = createSchema.safeParse(req.body)
		if (!parsed.success) return reply.code(400).send({ error: 'validation', fields: fieldErrors(parsed.error) })
		const { username, email, displayName, password, role, storageQuota } = parsed.data
		const quota = storageQuota === undefined ? config.defaultQuotaBytes : storageQuota
		try {
			const { rows } = await pool.query<{ id: string }>(
				`INSERT INTO users (username, email, display_name, password_hash, role, storage_quota)
				 VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
				[username, email, displayName, await hashPassword(password), role, quota],
			)
			await logEvent(req, 'user.create', { userId: rows[0].id, actorId: req.sdUser!.id, meta: { username, role, storageQuota: quota } })
			const { rows: full } = await pool.query<UserRow>(`SELECT ${USER_COLUMNS} FROM users u WHERE u.id = $1`, [rows[0].id])
			return reply.code(201).send({ user: adminUser(full[0]) })
		} catch (e: unknown) {
			const err = e as { code?: string; constraint?: string }
			if (err.code === '23505') {
				return reply.code(409).send({
					error: 'conflict',
					fields: err.constraint === 'users_email_key'
						? { email: 'Cette adresse e-mail est déjà utilisée.' }
						: { username: 'Cet identifiant est déjà pris.' },
				})
			}
			throw e
		}
	})

	app.patch('/api/admin/users/:id', async (req, reply) => {
		const id = uuid.safeParse((req.params as { id: string }).id)
		const body = updateSchema.safeParse(req.body)
		if (!id.success || !body.success) return reply.code(400).send({ error: 'validation', message: 'Requête invalide.' })
		const me = req.sdUser!
		const changes = body.data

		const { rows } = await pool.query<UserRow>(`SELECT ${USER_COLUMNS} FROM users u WHERE u.id = $1`, [id.data])
		const target = rows[0]
		if (!target) return reply.code(404).send({ error: 'not_found', message: 'Compte introuvable.' })

		if (target.id === me.id && (changes.role === 'user' || changes.status === 'disabled')) {
			return reply.code(409).send({ error: 'self', message: 'Vous ne pouvez pas retirer vos propres droits ni désactiver votre compte.' })
		}
		const losesAdmin = target.role === 'admin' && target.status === 'active' && (changes.role === 'user' || changes.status === 'disabled')
		if (losesAdmin && (await otherActiveAdmins(target.id)) === 0) {
			return reply.code(409).send({ error: 'last_admin', message: 'Il doit rester au moins un administrateur actif.' })
		}

		const sets: string[] = []
		const params: unknown[] = []
		if (changes.role) { params.push(changes.role); sets.push(`role = $${params.length}`) }
		if (changes.status) { params.push(changes.status); sets.push(`status = $${params.length}`) }
		if (changes.displayName) { params.push(changes.displayName); sets.push(`display_name = $${params.length}`) }
		// Quota : null = illimité. Un quota inférieur à l'espace déjà utilisé est accepté :
		// la personne garde ses fichiers mais ne peut plus rien envoyer.
		if (changes.storageQuota !== undefined) { params.push(changes.storageQuota); sets.push(`storage_quota = $${params.length}`) }
		params.push(target.id)
		await pool.query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${params.length}`, params)
		// Un compte désactivé est déconnecté partout immédiatement
		if (changes.status === 'disabled') await pool.query('DELETE FROM sessions WHERE user_id = $1', [target.id])

		const meta: Record<string, unknown> = { username: target.username, changes }
		if (changes.storageQuota !== undefined) {
			meta.previousQuota = target.storage_quota === null ? null : Number(target.storage_quota)
		}
		await logEvent(req, 'user.update', { userId: target.id, actorId: me.id, meta })
		const { rows: updated } = await pool.query<UserRow>(`SELECT ${USER_COLUMNS} FROM users u WHERE u.id = $1`, [target.id])
		return { user: adminUser(updated[0]) }
	})

	app.delete('/api/admin/users/:id', async (req, reply) => {
		const id = uuid.safeParse((req.params as { id: string }).id)
		if (!id.success) return reply.code(400).send({ error: 'validation' })
		const me = req.sdUser!
		if (id.data === me.id) return reply.code(409).send({ error: 'self', message: 'Vous ne pouvez pas supprimer votre propre compte.' })
		const { rows } = await pool.query<UserRow>(`SELECT ${USER_COLUMNS} FROM users u WHERE u.id = $1`, [id.data])
		const target = rows[0]
		if (!target) return reply.code(404).send({ error: 'not_found', message: 'Compte introuvable.' })
		if (target.role === 'admin' && target.status === 'active' && (await otherActiveAdmins(target.id)) === 0) {
			return reply.code(409).send({ error: 'last_admin', message: 'Il doit rester au moins un administrateur actif.' })
		}
		await pool.query('DELETE FROM users WHERE id = $1', [target.id])
		await logEvent(req, 'user.delete', { userId: target.id, actorId: me.id, meta: { username: target.username, email: target.email } })
		return { ok: true }
	})

	app.post('/api/admin/users/:id/revoke-sessions', async (req, reply) => {
		const id = uuid.safeParse((req.params as { id: string }).id)
		if (!id.success) return reply.code(400).send({ error: 'validation' })
		const me = req.sdUser!
		// Pour soi-même : toutes les sessions sauf celle en cours
		const { rowCount } = id.data === me.id
			? await pool.query('DELETE FROM sessions WHERE user_id = $1 AND id <> $2', [me.id, me.session_id])
			: await pool.query('DELETE FROM sessions WHERE user_id = $1', [id.data])
		const { rows } = await pool.query('SELECT username FROM users WHERE id = $1', [id.data])
		await logEvent(req, 'sessions.revoke', { userId: id.data, actorId: me.id, meta: { username: rows[0]?.username, count: rowCount } })
		return { revoked: rowCount }
	})

	// --- Sessions -----------------------------------------------------------------
	app.get('/api/admin/sessions', async (req) => {
		const { rows } = await pool.query(
			`SELECT s.id, s.created_at, s.expires_at, s.last_seen_at, s.ip, s.user_agent,
			        u.id AS user_id, u.username, u.display_name, u.role
			   FROM sessions s JOIN users u ON u.id = s.user_id
			  WHERE s.expires_at > now()
			  ORDER BY s.last_seen_at DESC LIMIT 500`,
		)
		return {
			sessions: rows.map((s) => ({
				id: s.id,
				createdAt: s.created_at,
				expiresAt: s.expires_at,
				lastSeenAt: s.last_seen_at,
				ip: s.ip,
				userAgent: s.user_agent,
				current: s.id === req.sdUser!.session_id,
				online: Date.now() - new Date(s.last_seen_at).getTime() < ONLINE_MS,
				user: { id: s.user_id, username: s.username, displayName: s.display_name, role: s.role },
			})),
		}
	})

	app.delete('/api/admin/sessions/:id', async (req, reply) => {
		const id = uuid.safeParse((req.params as { id: string }).id)
		if (!id.success) return reply.code(400).send({ error: 'validation' })
		if (id.data === req.sdUser!.session_id) {
			return reply.code(409).send({ error: 'self', message: 'Pour fermer la session en cours, utilisez « Se déconnecter ».' })
		}
		const { rows } = await pool.query(
			'DELETE FROM sessions s USING users u WHERE s.id = $1 AND u.id = s.user_id RETURNING u.id, u.username', [id.data])
		if (!rows[0]) return reply.code(404).send({ error: 'not_found', message: 'Session introuvable.' })
		await logEvent(req, 'session.revoke', { userId: rows[0].id, actorId: req.sdUser!.id, meta: { username: rows[0].username } })
		return { ok: true }
	})
}
