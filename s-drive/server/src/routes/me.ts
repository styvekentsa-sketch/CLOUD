import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { pool } from '../db.js'
import { requireUser } from '../security/guards.js'
import { FileTooLargeError, fits, getUsage, QuotaExceededError, withinUploadLimit } from '../storage/quota.js'
import { getSettings } from '../settings.js'

// Préférences personnelles. Pour l'instant : la disposition du tableau de bord
// (widgets affichés, ordre, taille) et la période des statistiques.
const widget = z.object({
	id: z.string().regex(/^[a-z0-9-]{1,40}$/),
	size: z.union([z.literal(3), z.literal(4), z.literal(6), z.literal(8), z.literal(12)]),
})
const prefsSchema = z.object({
	dashboard: z.object({
		widgets: z.array(widget).max(40),
		days: z.union([z.literal(7), z.literal(30), z.literal(90)]).default(30),
	}).optional(),
})

export async function meRoutes(app: FastifyInstance): Promise<void> {
	app.addHook('preHandler', requireUser)

	app.get('/api/me/preferences', async (req) => {
		const { rows } = await pool.query('SELECT preferences FROM users WHERE id = $1', [req.sdUser!.id])
		return { preferences: rows[0]?.preferences ?? {} }
	})

	// Mon espace de stockage
	app.get('/api/me/storage', async (req) => {
		const [usage, s] = await Promise.all([getUsage(req.sdUser!.id), getSettings()])
		return { used: usage?.used ?? 0, quota: usage?.quota ?? null, maxUploadBytes: s.maxUploadBytes }
	})

	// Vérification AVANT un envoi : l'application refuse tout de suite un fichier trop
	// gros, sans le transférer. (L'envoi lui-même revérifie avec reserveSpace().)
	app.post('/api/me/storage/check', async (req, reply) => {
		const parsed = z.object({ size: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER) }).safeParse(req.body)
		if (!parsed.success) return reply.code(400).send({ error: 'validation', message: 'Taille invalide.' })
		const usage = await getUsage(req.sdUser!.id)
		if (!usage) return reply.code(404).send({ error: 'not_found' })
		const remaining = usage.quota === null ? null : Math.max(0, usage.quota - usage.used)
		const { maxUploadBytes } = await getSettings()
		if (!withinUploadLimit(parsed.data.size, maxUploadBytes)) {
			const e = new FileTooLargeError(maxUploadBytes!, parsed.data.size)
			return reply.code(413).send({ error: 'file_too_large', message: e.message, maxUploadBytes })
		}
		if (!fits(usage.used, usage.quota, parsed.data.size)) {
			const e = new QuotaExceededError(usage.used, usage.quota ?? 0, parsed.data.size)
			return reply.code(413).send({ error: 'quota_exceeded', message: e.message, used: usage.used, quota: usage.quota, remaining })
		}
		return { ok: true, used: usage.used, quota: usage.quota, remaining }
	})

	app.put('/api/me/preferences', async (req, reply) => {
		const parsed = prefsSchema.safeParse(req.body)
		if (!parsed.success) return reply.code(400).send({ error: 'validation', message: 'Préférences invalides.' })
		// Fusion : on ne remplace que les sections envoyées
		const { rows } = await pool.query(
			'UPDATE users SET preferences = preferences || $2::jsonb WHERE id = $1 RETURNING preferences',
			[req.sdUser!.id, JSON.stringify(parsed.data)],
		)
		return { preferences: rows[0].preferences }
	})
}
