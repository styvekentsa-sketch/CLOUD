import type { FastifyInstance } from 'fastify'
import { pool } from '../db.js'
import { currentUser } from '../security/sessions.js'

const ONLINE_MS = 5 * 60 * 1000

export async function adminRoutes(app: FastifyInstance): Promise<void> {
	// Toutes les routes /api/admin/* : administrateurs uniquement
	app.addHook('onRequest', async (req, reply) => {
		if (!req.url.startsWith('/api/admin/')) return
		const user = await currentUser(req)
		if (!user) return reply.code(401).send({ error: 'unauthenticated' })
		if (user.role !== 'admin') return reply.code(403).send({ error: 'forbidden' })
	})

	// Widget « Comptes S-Drive » du tableau de bord
	app.get('/api/admin/users', async () => {
		const { rows } = await pool.query(
			`SELECT id, username, email, display_name, role, status, created_at, last_login_at, last_seen_at
			   FROM users ORDER BY last_seen_at DESC NULLS LAST, created_at DESC`,
		)
		const now = Date.now()
		const users = rows.map((u) => ({
			id: u.id,
			username: u.username,
			email: u.email,
			displayName: u.display_name,
			role: u.role,
			status: u.status,
			createdAt: u.created_at,
			lastLoginAt: u.last_login_at,
			online: u.status === 'active' && u.last_seen_at !== null && now - new Date(u.last_seen_at).getTime() < ONLINE_MS,
		}))
		const startOfDay = new Date()
		startOfDay.setHours(0, 0, 0, 0)
		return {
			users,
			summary: {
				total: users.length,
				online: users.filter((u) => u.online).length,
				activeToday: users.filter((u) => u.lastLoginAt && new Date(u.lastLoginAt) >= startOfDay).length,
			},
		}
	})
}
