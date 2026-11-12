import type { FastifyReply, FastifyRequest } from 'fastify'
import { currentUser, type SessionUser } from './sessions.js'

declare module 'fastify' {
	interface FastifyRequest {
		sdUser: SessionUser | null
	}
}

/** preHandler : personne connectée obligatoire (req.sdUser renseigné). */
export async function requireUser(req: FastifyRequest, reply: FastifyReply): Promise<void> {
	const user = await currentUser(req)
	if (!user) return reply.code(401).send({ error: 'unauthenticated' })
	req.sdUser = user
}

/** preHandler : administrateur obligatoire. */
export async function requireAdmin(req: FastifyRequest, reply: FastifyReply): Promise<void> {
	const user = await currentUser(req)
	if (!user) return reply.code(401).send({ error: 'unauthenticated' })
	if (user.role !== 'admin') return reply.code(403).send({ error: 'forbidden' })
	req.sdUser = user
}
