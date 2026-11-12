import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { pool } from '../db.js'
import { requireUser } from '../security/guards.js'
import { FileTooLargeError, fits, getUsage, QuotaExceededError, withinUploadLimit } from '../storage/quota.js'
import { getSettings } from '../settings.js'
import { config } from '../config.js'
import { hashPassword, verifyPassword } from '../security/password.js'
import { recordFailure, recordSuccess, retryAfter } from '../security/throttle.js'
import { logEvent } from '../security/events.js'
import { fieldErrors } from './auth.js'

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
	// Paramètres personnels
	appearance: z.object({
		theme: z.enum(['system', 'dark', 'light']),
		density: z.enum(['comfortable', 'compact']),
		reduceMotion: z.boolean(),
	}).optional(),
	notifications: z.object({
		newLogin: z.boolean(),
		storageWarning: z.boolean(),
		shares: z.boolean(),
		weeklySummary: z.boolean(),
	}).optional(),
	display: z.object({
		language: z.enum(['fr']),
		startPage: z.enum(['dashboard', 'files']),
		dateFormat: z.enum(['relative', 'absolute']),
	}).optional(),
})

const passwordSchema = z.object({
	currentPassword: z.string().min(1, { error: 'Indiquez votre mot de passe actuel.' }).max(256),
	newPassword: z.string()
		.min(config.passwordMinLength, { error: `Au moins ${config.passwordMinLength} caractères.` })
		.max(256, { error: 'Mot de passe trop long.' }),
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

	// Changement de son propre mot de passe : mot de passe actuel exigé, protection
	// contre les essais répétés, autres sessions fermées, inscrit au journal.
	app.post('/api/me/password', async (req, reply) => {
		const me = req.sdUser!
		const parsed = passwordSchema.safeParse(req.body)
		if (!parsed.success) return reply.code(400).send({ error: 'validation', fields: fieldErrors(parsed.error) })
		const { currentPassword, newPassword } = parsed.data

		const throttleKey = `mot-de-passe:${me.id}`
		const wait = retryAfter(req.ip, throttleKey)
		if (wait > 0) {
			reply.header('Retry-After', String(wait))
			return reply.code(429).send({ error: 'throttled', retryAfter: wait, message: `Trop de tentatives. Réessayez dans ${wait} seconde${wait > 1 ? 's' : ''}.` })
		}

		const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [me.id])
		if (!rows[0] || !(await verifyPassword(currentPassword, rows[0].password_hash))) {
			recordFailure(req.ip, throttleKey)
			await logEvent(req, 'password.change_failed', { userId: me.id, meta: { username: me.username } })
			return reply.code(403).send({ error: 'wrong_password', fields: { currentPassword: 'Mot de passe actuel incorrect.' } })
		}
		recordSuccess(req.ip, throttleKey)
		if (newPassword === currentPassword) {
			return reply.code(400).send({ error: 'validation', fields: { newPassword: 'Le nouveau mot de passe doit être différent de l’actuel.' } })
		}
		if (newPassword.toLowerCase().includes(me.username.toLowerCase())) {
			return reply.code(400).send({ error: 'validation', fields: { newPassword: 'Le mot de passe ne doit pas contenir votre identifiant.' } })
		}

		await pool.query('UPDATE users SET password_hash = $2 WHERE id = $1', [me.id, await hashPassword(newPassword)])
		// Les autres appareils devront se reconnecter avec le nouveau mot de passe
		const { rowCount } = await pool.query('DELETE FROM sessions WHERE user_id = $1 AND id <> $2', [me.id, me.session_id])
		await logEvent(req, 'password.change', { userId: me.id, meta: { username: me.username, otherSessionsClosed: rowCount ?? 0 } })
		return { ok: true, otherSessionsClosed: rowCount ?? 0 }
	})
}
