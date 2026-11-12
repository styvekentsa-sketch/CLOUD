import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { pool } from '../db.js'
import { requireAdmin } from '../security/guards.js'
import { logEvent } from '../security/events.js'
import { ACTIVE_SQL, shareStatus } from '../sharing/shares.js'

// Gouvernance des partages publics (administration)
const listQuery = z.object({
	status: z.enum(['active', 'expired', 'revoked', 'all']).default('active'),
	protection: z.enum(['with', 'without']).optional(),
	q: z.string().trim().max(100).optional(),
	sort: z.enum(['created', 'expires', 'views', 'downloads', 'name']).default('created'),
	dir: z.enum(['asc', 'desc']).default('desc'),
})

export async function sharesRoutes(app: FastifyInstance): Promise<void> {
	app.addHook('preHandler', requireAdmin)

	app.get('/api/admin/shares', async (req, reply) => {
		const parsed = listQuery.safeParse(req.query)
		if (!parsed.success) return reply.code(400).send({ error: 'validation', message: 'Filtre invalide.' })
		const { status, protection, q, sort, dir } = parsed.data

		const where: string[] = []
		const params: unknown[] = []
		if (status === 'active') where.push(ACTIVE_SQL.replaceAll('revoked_at', 's.revoked_at').replaceAll('expires_at', 's.expires_at'))
		if (status === 'expired') where.push('s.revoked_at IS NULL AND s.expires_at IS NOT NULL AND s.expires_at <= now()')
		if (status === 'revoked') where.push('s.revoked_at IS NOT NULL')
		if (protection === 'with') where.push('s.password_hash IS NOT NULL')
		if (protection === 'without') where.push('s.password_hash IS NULL')
		if (q) {
			params.push(`%${q.toLowerCase()}%`)
			where.push(`(lower(s.item_name) LIKE $${params.length} OR lower(s.item_path) LIKE $${params.length}
			            OR lower(o.username) LIKE $${params.length} OR lower(o.display_name) LIKE $${params.length})`)
		}
		const order = {
			created: 's.created_at', expires: 's.expires_at', views: 's.views', downloads: 's.downloads', name: 'lower(s.item_name)',
		}[sort]

		const { rows } = await pool.query(
			`SELECT s.id, s.item_type, s.item_name, s.item_path, s.created_at, s.expires_at, s.revoked_at,
			        s.password_hash IS NOT NULL AS protected, s.views, s.downloads, s.last_access_at,
			        o.id AS owner_id, o.username AS owner_username, o.display_name AS owner_name,
			        r.username AS revoked_by_username, r.display_name AS revoked_by_name
			   FROM shares s
			   JOIN users o ON o.id = s.owner_id
			   LEFT JOIN users r ON r.id = s.revoked_by
			  ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
			  ORDER BY ${order} ${dir === 'asc' ? 'ASC' : 'DESC'} NULLS LAST, s.created_at DESC
			  LIMIT 500`,
			params,
		)
		return {
			shares: rows.map((s) => ({
				id: s.id,
				itemType: s.item_type,
				itemName: s.item_name,
				itemPath: s.item_path,
				createdAt: s.created_at,
				expiresAt: s.expires_at,
				revokedAt: s.revoked_at,
				revokedBy: s.revoked_by_username ? { username: s.revoked_by_username, displayName: s.revoked_by_name } : null,
				protected: s.protected,
				views: s.views,
				downloads: s.downloads,
				lastAccessAt: s.last_access_at,
				status: shareStatus({ revokedAt: s.revoked_at, expiresAt: s.expires_at }),
				owner: { id: s.owner_id, username: s.owner_username, displayName: s.owner_name },
			})),
		}
	})

	// Chiffres pour le widget « Partages publics actifs » et l'en-tête de la page
	app.get('/api/admin/shares/stats', async () => {
		const { rows } = await pool.query(
			`SELECT
			   count(*) FILTER (WHERE ${ACTIVE_SQL})::int AS active,
			   count(*) FILTER (WHERE ${ACTIVE_SQL} AND password_hash IS NULL)::int AS unprotected,
			   count(*) FILTER (WHERE ${ACTIVE_SQL} AND expires_at IS NULL)::int AS no_expiry,
			   count(*) FILTER (WHERE ${ACTIVE_SQL} AND expires_at <= now() + interval '7 days')::int AS expiring_soon,
			   count(*) FILTER (WHERE revoked_at IS NULL AND expires_at IS NOT NULL AND expires_at <= now())::int AS expired,
			   count(*) FILTER (WHERE revoked_at IS NOT NULL)::int AS revoked,
			   count(*) FILTER (WHERE created_at > now() - interval '7 days')::int AS created_7d,
			   coalesce(sum(views) FILTER (WHERE ${ACTIVE_SQL}), 0)::int AS views,
			   coalesce(sum(downloads) FILTER (WHERE ${ACTIVE_SQL}), 0)::int AS downloads,
			   count(DISTINCT owner_id) FILTER (WHERE ${ACTIVE_SQL})::int AS owners
			 FROM shares`,
		)
		const r = rows[0]
		return {
			active: r.active,
			unprotected: r.unprotected,
			noExpiry: r.no_expiry,
			expiringSoon: r.expiring_soon,
			expired: r.expired,
			revoked: r.revoked,
			createdLast7Days: r.created_7d,
			views: r.views,
			downloads: r.downloads,
			owners: r.owners,
		}
	})

	// Révocation immédiate : le lien cesse de fonctionner, la trace est conservée
	app.delete('/api/admin/shares/:id', async (req, reply) => {
		const id = z.string().uuid().safeParse((req.params as { id: string }).id)
		if (!id.success) return reply.code(400).send({ error: 'validation' })
		const me = req.sdUser!
		const { rows } = await pool.query(
			`UPDATE shares s SET revoked_at = now(), revoked_by = $2
			   FROM users o
			  WHERE s.id = $1 AND o.id = s.owner_id AND s.revoked_at IS NULL
			  RETURNING s.item_name, s.item_type, s.item_path, s.views, s.downloads, s.password_hash IS NOT NULL AS protected,
			            o.id AS owner_id, o.username AS owner_username`,
			[id.data, me.id],
		)
		if (!rows[0]) {
			const exists = await pool.query('SELECT 1 FROM shares WHERE id = $1', [id.data])
			return exists.rows[0]
				? reply.code(409).send({ error: 'already_revoked', message: 'Ce partage est déjà révoqué.' })
				: reply.code(404).send({ error: 'not_found', message: 'Partage introuvable.' })
		}
		const s = rows[0]
		await logEvent(req, 'share.revoke', {
			userId: s.owner_id,
			actorId: me.id,
			meta: {
				shareId: id.data, username: s.owner_username, itemName: s.item_name, itemType: s.item_type,
				itemPath: s.item_path, views: s.views, downloads: s.downloads, protected: s.protected,
			},
		})
		return { ok: true }
	})
}
