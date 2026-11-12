import Fastify, { type FastifyInstance } from 'fastify'
import cookie from '@fastify/cookie'
import { authRoutes } from './routes/auth.js'
import { adminRoutes } from './routes/admin.js'
import { insightsRoutes } from './routes/insights.js'
import { meRoutes } from './routes/me.js'
import { sharesRoutes } from './routes/shares.js'
import { maintenanceRoutes } from './routes/maintenance.js'
import { settingsRoutes } from './routes/settings.js'

export async function buildApp(): Promise<FastifyInstance> {
	const app = Fastify({
		// Derrière le proxy (Nginx du conteneur web, puis Cloudflare) : IP et HTTPS réels
		trustProxy: true,
		bodyLimit: 64 * 1024,
		logger: { level: process.env.LOG_LEVEL ?? 'info' },
	})

	await app.register(cookie)
	app.decorateRequest('sdUser', null)

	// JSON : un corps vide vaut {} (ex. déconnexion envoyée avec Content-Type: application/json)
	app.removeContentTypeParser('application/json')
	app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
		const text = String(body ?? '').trim()
		if (text === '') return done(null, {})
		try {
			done(null, JSON.parse(text))
		} catch {
			done(Object.assign(new Error('JSON invalide.'), { statusCode: 400 }), undefined)
		}
	})

	// Protection CSRF : les requêtes qui modifient quelque chose doivent venir de S-Drive
	// lui-même (en-tête Origin identique à l'hôte) et être en JSON. Les cookies sont en
	// SameSite=Lax : un autre site ne peut pas les envoyer avec un POST.
	app.addHook('onRequest', async (req, reply) => {
		if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return
		const origin = req.headers.origin
		if (origin) {
			let host = ''
			try {
				host = new URL(origin).host
			} catch {
				/* origine invalide */
			}
			if (host !== req.headers.host && host !== req.headers['x-forwarded-host']) {
				return reply.code(403).send({ error: 'bad_origin' })
			}
		}
		// JSON obligatoire dès qu'un corps est envoyé. Une requête SANS corps (ex. DELETE,
		// souvent envoyé sans Content-Length) n'a rien à analyser : elle passe.
		const length = req.headers['content-length']
		const hasBody = (length !== undefined && length !== '0') || req.headers['transfer-encoding'] !== undefined
		const type = req.headers['content-type'] ?? ''
		if (hasBody && !type.startsWith('application/json')) {
			return reply.code(415).send({ error: 'json_required' })
		}
	})

	// En-têtes de sécurité sur toutes les réponses de l'API
	app.addHook('onSend', async (_req, reply) => {
		reply.header('X-Content-Type-Options', 'nosniff')
		reply.header('Cache-Control', 'no-store')
	})

	app.setErrorHandler((err, req, reply) => {
		const error = err as { statusCode?: number; message?: string }
		const status = error.statusCode ?? 500
		if (status >= 500) req.log.error(error)
		reply.code(status).send({
			error: status >= 500 ? 'server_error' : 'bad_request',
			message: status >= 500 ? 'Erreur interne du serveur.' : error.message,
		})
	})

	app.get('/api/health', async () => ({ ok: true }))
	await app.register(authRoutes)
	await app.register(adminRoutes)
	await app.register(insightsRoutes)
	await app.register(meRoutes)
	await app.register(sharesRoutes)
	await app.register(maintenanceRoutes)
	await app.register(settingsRoutes)
	return app
}
