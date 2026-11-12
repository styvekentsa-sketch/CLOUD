import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { pool } from '../db.js'
import { requireUser } from '../security/guards.js'

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
