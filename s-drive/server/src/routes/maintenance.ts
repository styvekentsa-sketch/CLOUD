import type { FastifyInstance, FastifyReply } from 'fastify'
import { z } from 'zod'
import { pool } from '../db.js'
import { requireAdmin } from '../security/guards.js'
import { logEvent } from '../security/events.js'
import { cleanOrphans, purgeTrash, scanOrphans, storageBreakdown } from '../storage/maintenance.js'
import { diskUsage } from '../storage/quota.js'

const TRASH_DAYS = 30
const LIST_CAP = 50

// Une seule opération de maintenance à la fois (vidage, analyse ou nettoyage)
let running: string | null = null
async function exclusive<T>(name: string, reply: FastifyReply, fn: () => Promise<T>): Promise<T | FastifyReply> {
	if (running) return reply.code(409).send({ error: 'busy', message: `Une opération de maintenance est déjà en cours (${running}).` })
	running = name
	try {
		return await fn()
	} finally {
		running = null
	}
}

export async function maintenanceRoutes(app: FastifyInstance): Promise<void> {
	app.addHook('preHandler', requireAdmin)

	// Répartition + aperçu du vidage + résultat de la dernière analyse
	app.get('/api/admin/maintenance/storage', async () => {
		const [breakdown, last] = await Promise.all([
			storageBreakdown(TRASH_DAYS),
			pool.query(
				`SELECT e.type, e.created_at, e.meta, u.display_name AS actor
				   FROM events e LEFT JOIN users u ON u.id = e.actor_id
				  WHERE e.type IN ('maintenance.orphan_scan', 'maintenance.orphan_clean', 'maintenance.trash_purge')
				  ORDER BY e.id DESC LIMIT 10`,
			),
		])
		const find = (t: string) => {
			const e = last.rows.find((r) => r.type === t)
			return e ? { at: e.created_at, actor: e.actor, ...e.meta } : null
		}
		return {
			...breakdown,
			disk: diskUsage(),
			running,
			lastScan: find('maintenance.orphan_scan'),
			lastClean: find('maintenance.orphan_clean'),
			lastPurge: find('maintenance.trash_purge'),
		}
	})

	app.post('/api/admin/maintenance/trash/purge', async (req, reply) => {
		const body = z.object({ olderThanDays: z.literal(TRASH_DAYS) }).safeParse(req.body)
		if (!body.success) return reply.code(400).send({ error: 'validation', message: `Seul le vidage des éléments de plus de ${TRASH_DAYS} jours est autorisé.` })
		return exclusive('vidage des corbeilles', reply, async () => {
			const result = await purgeTrash(TRASH_DAYS)
			await logEvent(req, 'maintenance.trash_purge', { actorId: req.sdUser!.id, meta: result })
			return result
		})
	})

	app.post('/api/admin/maintenance/orphans/scan', async (req, reply) => {
		return exclusive('analyse des orphelins', reply, async () => {
			const r = await scanOrphans()
			const summary = {
				orphanFiles: r.orphans.length,
				orphanBytes: r.orphans.reduce((s, b) => s + b.size, 0),
				missingFiles: r.missing.length,
				missingBytes: r.missing.reduce((s, b) => s + b.size, 0),
				staleTempFiles: r.staleTemp.length,
				staleTempBytes: r.staleTemp.reduce((s, t) => s + t.size, 0),
				diskFiles: r.diskFiles,
				dbFiles: r.dbFiles,
				storageLooksMissing: r.storageLooksMissing,
			}
			await logEvent(req, 'maintenance.orphan_scan', { actorId: req.sdUser!.id, meta: summary })
			// Détail (limité) pour l'affichage : propriétaires connus résolus en noms
			const owners = [...new Set([...r.orphans.map((o) => o.owner), ...r.missing.map((m) => m.owner)])]
			const { rows } = owners.length
				? await pool.query('SELECT id, username FROM users WHERE id = ANY($1::uuid[])', [owners])
				: { rows: [] as { id: string; username: string }[] }
			const name = new Map(rows.map((u) => [u.id, u.username]))
			return {
				...summary,
				orphans: r.orphans.slice(0, LIST_CAP).map((o) => ({ owner: name.get(o.owner) ?? null, key: o.key, size: o.size, modifiedAt: new Date(o.mtimeMs) })),
				missing: r.missing.slice(0, LIST_CAP).map((m) => ({ owner: name.get(m.owner) ?? null, key: m.key, size: m.size })),
				staleTemp: r.staleTemp.slice(0, LIST_CAP).map((t) => ({ name: t.name, size: t.size, modifiedAt: new Date(t.mtimeMs) })),
			}
		})
	})

	app.post('/api/admin/maintenance/orphans/clean', async (req, reply) => {
		const body = z.object({ removeMissing: z.boolean().default(false) }).safeParse(req.body)
		if (!body.success) return reply.code(400).send({ error: 'validation' })
		return exclusive('nettoyage des orphelins', reply, async () => {
			const result = await cleanOrphans(body.data.removeMissing)
			await logEvent(req, 'maintenance.orphan_clean', { actorId: req.sdUser!.id, meta: { ...result, removeMissing: body.data.removeMissing } })
			return result
		})
	})
}
