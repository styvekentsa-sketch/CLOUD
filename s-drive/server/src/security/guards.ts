import type { FastifyReply, FastifyRequest } from 'fastify'
import { currentUser, type SessionUser } from './sessions.js'
import { getSettings } from '../settings.js'

declare module 'fastify' {
	interface FastifyRequest {
		sdUser: SessionUser | null
	}
}

/**
 * preHandler : personne connectée obligatoire (req.sdUser renseigné).
 * En mode maintenance, les sessions déjà ouvertes des non-administrateurs sont
 * suspendues (503) : l'interface affiche alors l'écran de maintenance.
 */
export async function requireUser(req: FastifyRequest, reply: FastifyReply): Promise<void> {
	const user = await currentUser(req)
	if (!user) return reply.code(401).send({ error: 'unauthenticated' })
	if (user.role !== 'admin') {
		const s = await getSettings()
		if (s.maintenance.enabled) {
			reply.header('Retry-After', '120')
			return reply.code(503).send({ error: 'maintenance', message: s.maintenance.message || 'S-Drive est en cours de maintenance. Merci de réessayer un peu plus tard.' })
		}
	}
	req.sdUser = user
}

/** preHandler : administrateur obligatoire. */
export async function requireAdmin(req: FastifyRequest, reply: FastifyReply): Promise<void> {
	const user = await currentUser(req)
	if (!user) return reply.code(401).send({ error: 'unauthenticated' })
	if (user.role !== 'admin') return reply.code(403).send({ error: 'forbidden' })
	req.sdUser = user
}
