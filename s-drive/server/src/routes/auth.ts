import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { pool } from '../db.js'
import { config } from '../config.js'
import { burnPasswordCheck, hashPassword, verifyPassword } from '../security/password.js'
import { createSession, currentUser, destroySession, type SessionUser } from '../security/sessions.js'
import { recordFailure, recordSuccess, retryAfter } from '../security/throttle.js'
import { logEvent, touchActivity } from '../security/events.js'

export function publicUser(u: Omit<SessionUser, 'session_id'>) {
	return {
		id: u.id,
		username: u.username,
		email: u.email,
		displayName: u.display_name,
		role: u.role,
		createdAt: u.created_at,
		lastLoginAt: u.last_login_at,
	}
}

export const registerSchema = z.object({
	username: z.string().trim().toLowerCase()
		.regex(/^[a-z0-9][a-z0-9._-]{2,31}$/, {
			error: 'De 3 à 32 caractères : lettres minuscules, chiffres, point, tiret ou tiret bas.',
		}),
	email: z.string().trim().toLowerCase().max(254)
		.pipe(z.email({ error: 'Adresse e-mail invalide.' })),
	displayName: z.string().trim().min(1, { error: 'Indiquez votre nom.' }).max(80),
	password: z.string()
		.min(config.passwordMinLength, { error: `Au moins ${config.passwordMinLength} caractères.` })
		.max(256, { error: 'Mot de passe trop long.' }),
	remember: z.boolean().optional(),
})

const loginSchema = z.object({
	login: z.string().trim().min(1).max(254),
	password: z.string().min(1).max(256),
	remember: z.boolean().optional(),
})

export function fieldErrors(error: z.ZodError): Record<string, string> {
	const out: Record<string, string> = {}
	for (const issue of error.issues) {
		const k = String(issue.path[0] ?? 'form')
		out[k] ??= issue.message
	}
	return out
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
	app.get('/api/auth/config', async () => ({
		appName: config.appName,
		registrationEnabled: config.registrationEnabled,
		passwordMinLength: config.passwordMinLength,
	}))

	app.post('/api/auth/register', async (req, reply) => {
		if (!config.registrationEnabled) {
			return reply.code(403).send({ error: 'registration_disabled', message: 'La création de compte est désactivée.' })
		}
		const parsed = registerSchema.safeParse(req.body)
		if (!parsed.success) {
			return reply.code(400).send({ error: 'validation', fields: fieldErrors(parsed.error) })
		}
		const { username, email, displayName, password, remember } = parsed.data
		if (password.toLowerCase().includes(username)) {
			return reply.code(400).send({ error: 'validation', fields: { password: 'Le mot de passe ne doit pas contenir votre identifiant.' } })
		}

		const passwordHash = await hashPassword(password)
		try {
			const { rows } = await pool.query(
				`INSERT INTO users (username, email, display_name, password_hash, last_login_at)
				 VALUES ($1, $2, $3, $4, now())
				 RETURNING id, username, email, display_name, role, status, created_at, last_login_at`,
				[username, email, displayName, passwordHash],
			)
			await createSession(req, reply, rows[0].id, remember ?? false)
			await logEvent(req, 'register', { userId: rows[0].id, meta: { username } })
			await touchActivity(rows[0].id)
			return reply.code(201).send({ user: publicUser(rows[0]) })
		} catch (e: unknown) {
			const err = e as { code?: string; constraint?: string }
			if (err.code === '23505') {
				const fields = err.constraint === 'users_email_key'
					? { email: 'Cette adresse e-mail est déjà utilisée.' }
					: { username: 'Cet identifiant est déjà pris.' }
				return reply.code(409).send({ error: 'conflict', fields })
			}
			throw e
		}
	})

	app.post('/api/auth/login', async (req, reply) => {
		const parsed = loginSchema.safeParse(req.body)
		if (!parsed.success) {
			return reply.code(400).send({ error: 'validation', message: 'Identifiant et mot de passe requis.' })
		}
		const { login, password, remember } = parsed.data

		const wait = retryAfter(req.ip, login)
		if (wait > 0) {
			await logEvent(req, 'login.throttled', { meta: { login: login.slice(0, 100), retryAfter: wait } })
			reply.header('Retry-After', String(wait))
			return reply.code(429).send({
				error: 'throttled',
				retryAfter: wait,
				message: `Trop de tentatives. Réessayez dans ${wait} seconde${wait > 1 ? 's' : ''}.`,
			})
		}

		const { rows } = await pool.query(
			`SELECT id, username, email, display_name, role, status, created_at, last_login_at, password_hash
			   FROM users WHERE lower(username) = lower($1) OR lower(email) = lower($1) LIMIT 1`,
			[login],
		)
		const user = rows[0]
		const ok = user ? await verifyPassword(password, user.password_hash) : (await burnPasswordCheck(password), false)

		if (!ok) {
			recordFailure(req.ip, login)
			await logEvent(req, 'login.failure', {
				userId: user?.id ?? null,
				meta: { login: login.slice(0, 100), reason: user ? 'wrong_password' : 'unknown_user' },
			})
			return reply.code(401).send({ error: 'invalid_credentials', message: 'Identifiant ou mot de passe incorrect.' })
		}
		recordSuccess(req.ip, login)
		if (user.status !== 'active') {
			await logEvent(req, 'login.failure', { userId: user.id, meta: { login: user.username, reason: 'disabled' } })
			return reply.code(403).send({ error: 'disabled', message: 'Ce compte est désactivé. Contactez l’administrateur.' })
		}

		await pool.query('UPDATE users SET last_login_at = now(), last_seen_at = now() WHERE id = $1', [user.id])
		await createSession(req, reply, user.id, remember ?? false)
		await logEvent(req, 'login.success', { userId: user.id, meta: { username: user.username, remember: remember ?? false } })
		await touchActivity(user.id)
		return { user: publicUser({ ...user, last_login_at: new Date() }) }
	})

	app.post('/api/auth/logout', async (req, reply) => {
		const user = await currentUser(req)
		await destroySession(req, reply)
		if (user) await logEvent(req, 'logout', { userId: user.id, meta: { username: user.username } })
		return { ok: true }
	})

	app.get('/api/auth/me', async (req, reply) => {
		const user = await currentUser(req)
		if (!user) return reply.code(401).send({ error: 'unauthenticated' })
		return { user: publicUser(user) }
	})
}
