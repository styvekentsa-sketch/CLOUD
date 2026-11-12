import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { pool } from '../db.js'
import { requireAdmin } from '../security/guards.js'
import { logEvent } from '../security/events.js'
import { createInvitation, invitationState } from '../security/invitations.js'
import { getStoredSettings, settingsPatchSchema, SettingsConflictError, updateSettings } from '../settings.js'
import { fieldErrors } from './auth.js'

// Paramètres de la plateforme et invitations (administrateurs uniquement)
export async function settingsRoutes(app: FastifyInstance): Promise<void> {
	app.addHook('preHandler', requireAdmin)

	async function payload() {
		const s = await getStoredSettings()
		let updatedBy: { username: string; displayName: string } | null = null
		if (s.updatedBy) {
			const { rows } = await pool.query('SELECT username, display_name FROM users WHERE id = $1', [s.updatedBy])
			if (rows[0]) updatedBy = { username: rows[0].username, displayName: rows[0].display_name }
		}
		const { rows: online } = await pool.query(
			`SELECT count(*)::int AS n FROM users
			  WHERE role <> 'admin' AND status = 'active' AND last_seen_at > now() - interval '5 minutes'`)
		return { settings: s.settings, updatedAt: s.updatedAt, updatedBy, onlineNonAdmins: online[0].n }
	}

	app.get('/api/admin/settings', async () => payload())

	app.put('/api/admin/settings', async (req, reply) => {
		const parsed = settingsPatchSchema.safeParse(req.body)
		if (!parsed.success) return reply.code(400).send({ error: 'validation', fields: fieldErrors(parsed.error), message: 'Paramètres invalides.' })
		const { expectedUpdatedAt, ...patch } = parsed.data
		try {
			const r = await updateSettings(patch, req.sdUser!.id, expectedUpdatedAt)
			if (Object.keys(r.changes).length) {
				await logEvent(req, 'settings.update', { actorId: req.sdUser!.id, meta: { changes: r.changes } })
			}
			return payload()
		} catch (e) {
			if (e instanceof SettingsConflictError) return reply.code(409).send({ error: 'conflict', message: e.message })
			throw e
		}
	})

	// --- Invitations ------------------------------------------------------------------
	app.get('/api/admin/invitations', async () => {
		const { rows } = await pool.query(
			`SELECT i.id, i.email, i.note, i.created_at, i.expires_at, i.used_at, i.revoked_at,
			        c.display_name AS created_by, u.username AS used_by_username, u.display_name AS used_by_name
			   FROM invitations i
			   LEFT JOIN users c ON c.id = i.created_by
			   LEFT JOIN users u ON u.id = i.used_by
			  ORDER BY i.created_at DESC LIMIT 200`,
		)
		return {
			invitations: rows.map((r) => ({
				id: r.id,
				email: r.email,
				note: r.note,
				createdAt: r.created_at,
				expiresAt: r.expires_at,
				usedAt: r.used_at,
				revokedAt: r.revoked_at,
				createdBy: r.created_by,
				usedBy: r.used_by_username ? { username: r.used_by_username, displayName: r.used_by_name } : null,
				state: invitationState({ usedAt: r.used_at, revokedAt: r.revoked_at, expiresAt: r.expires_at }),
			})),
		}
	})

	app.post('/api/admin/invitations', async (req, reply) => {
		const parsed = z.object({
			email: z.union([z.string().trim().toLowerCase().max(254).pipe(z.email({ error: 'Adresse e-mail invalide.' })), z.literal('')]).optional(),
			note: z.string().trim().max(120).optional(),
			days: z.union([z.literal(1), z.literal(7), z.literal(30)]).default(7),
		}).safeParse(req.body)
		if (!parsed.success) return reply.code(400).send({ error: 'validation', fields: fieldErrors(parsed.error) })
		const inv = await createInvitation(req.sdUser!.id, { email: parsed.data.email || null, note: parsed.data.note || null, days: parsed.data.days })
		await logEvent(req, 'invitation.create', {
			actorId: req.sdUser!.id,
			meta: { invitationId: inv.id, email: parsed.data.email || null, days: parsed.data.days },
		})
		// Le lien complet n'est renvoyé qu'une seule fois : il n'est pas conservé en clair
		return reply.code(201).send({ id: inv.id, token: inv.token, expiresAt: inv.expiresAt })
	})

	app.delete('/api/admin/invitations/:id', async (req, reply) => {
		const id = z.string().uuid().safeParse((req.params as { id: string }).id)
		if (!id.success) return reply.code(400).send({ error: 'validation' })
		const { rows } = await pool.query(
			`UPDATE invitations SET revoked_at = now()
			  WHERE id = $1 AND used_at IS NULL AND revoked_at IS NULL RETURNING email`, [id.data])
		if (!rows[0]) return reply.code(409).send({ error: 'not_pending', message: 'Cette invitation n’est plus en attente (utilisée ou déjà révoquée).' })
		await logEvent(req, 'invitation.revoke', { actorId: req.sdUser!.id, meta: { invitationId: id.data, email: rows[0].email } })
		return { ok: true }
	})
}
