import { z } from 'zod'
import { pool } from './db.js'
import { config } from './config.js'

// =============================================================================
//  Paramètres de la plateforme, modifiables depuis la console (Paramètres).
//  Stockés en base (table settings, une seule ligne). Les valeurs de .env ne
//  servent que de valeurs initiales au tout premier démarrage.
// =============================================================================

export type RegistrationMode = 'open' | 'invite' | 'closed'

export type Settings = {
	registrationMode: RegistrationMode
	/** Quota des nouveaux comptes, en octets ; null = illimité */
	defaultQuotaBytes: number | null
	/** Taille maximale d'un fichier envoyé, en octets ; null = pas de limite */
	maxUploadBytes: number | null
	maintenance: { enabled: boolean; message: string }
}

const bytesOrNull = z.union([z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), z.null()])

export const settingsSchema = z.object({
	registrationMode: z.enum(['open', 'invite', 'closed']),
	defaultQuotaBytes: bytesOrNull,
	maxUploadBytes: z.union([z.number().int().min(1024 * 1024).max(Number.MAX_SAFE_INTEGER), z.null()]),
	maintenance: z.object({
		enabled: z.boolean(),
		message: z.string().trim().max(500),
	}),
})

/** Mise à jour partielle (seules les sections envoyées changent). */
export const settingsPatchSchema = settingsSchema.partial().extend({
	/** Date de la version modifiée : refus si quelqu'un a enregistré entre-temps */
	expectedUpdatedAt: z.string().optional(),
})

export function defaultSettings(): Settings {
	return {
		registrationMode: config.registrationEnabled ? 'open' : 'closed',
		defaultQuotaBytes: config.defaultQuotaBytes,
		maxUploadBytes: 2 * 1024 ** 3,
		maintenance: { enabled: false, message: '' },
	}
}

/** Complète des données partielles ou anciennes avec les valeurs par défaut (fonction pure). */
export function withDefaults(data: unknown): Settings {
	const d = defaultSettings()
	const parsed = settingsSchema.partial().safeParse(data)
	const p = parsed.success ? parsed.data : {}
	return {
		registrationMode: p.registrationMode ?? d.registrationMode,
		defaultQuotaBytes: p.defaultQuotaBytes !== undefined ? p.defaultQuotaBytes : d.defaultQuotaBytes,
		maxUploadBytes: p.maxUploadBytes !== undefined ? p.maxUploadBytes : d.maxUploadBytes,
		maintenance: p.maintenance ?? d.maintenance,
	}
}

/** Liste des champs modifiés, pour le journal (avant -> après). */
export function diffSettings(before: Settings, after: Settings): Record<string, { from: unknown; to: unknown }> {
	const out: Record<string, { from: unknown; to: unknown }> = {}
	const flat = (s: Settings) => ({
		registrationMode: s.registrationMode,
		defaultQuotaBytes: s.defaultQuotaBytes,
		maxUploadBytes: s.maxUploadBytes,
		maintenanceEnabled: s.maintenance.enabled,
		maintenanceMessage: s.maintenance.message,
	})
	const a = flat(before)
	const b = flat(after)
	for (const k of Object.keys(a) as (keyof typeof a)[]) {
		if (a[k] !== b[k]) out[k] = { from: a[k], to: b[k] }
	}
	return out
}

// --- Lecture avec cache court (lu à chaque connexion / requête) ------------------------
type Stored = { settings: Settings; updatedAt: string; updatedBy: string | null }
let cache: { value: Stored; at: number } | null = null
const TTL_MS = 3000

export async function getStoredSettings(): Promise<Stored> {
	if (cache && Date.now() - cache.at < TTL_MS) return cache.value
	let { rows } = await pool.query('SELECT data, updated_at, updated_by FROM settings WHERE id = 1')
	if (!rows[0]) {
		// Premier démarrage : valeurs de .env
		await pool.query('INSERT INTO settings (id, data) VALUES (1, $1) ON CONFLICT (id) DO NOTHING', [JSON.stringify(defaultSettings())])
		;({ rows } = await pool.query('SELECT data, updated_at, updated_by FROM settings WHERE id = 1'))
	}
	const value = { settings: withDefaults(rows[0].data), updatedAt: new Date(rows[0].updated_at).toISOString(), updatedBy: rows[0].updated_by }
	cache = { value, at: Date.now() }
	return value
}

export async function getSettings(): Promise<Settings> {
	return (await getStoredSettings()).settings
}

export class SettingsConflictError extends Error {
	readonly statusCode = 409
	constructor() {
		super('Les paramètres ont été modifiés par quelqu’un d’autre entre-temps. Rechargez la page avant d’enregistrer.')
	}
}

export async function updateSettings(patch: Partial<Settings>, actorId: string, expectedUpdatedAt?: string) {
	cache = null // toujours repartir de la version en base
	const current = await getStoredSettings()
	const before = current.settings
	if (expectedUpdatedAt && new Date(expectedUpdatedAt).toISOString() !== current.updatedAt) throw new SettingsConflictError()
	const after: Settings = {
		...before,
		...patch,
		maintenance: patch.maintenance ? { ...patch.maintenance } : before.maintenance,
	}
	const { rows } = await pool.query(
		`UPDATE settings SET data = $1, updated_at = now(), updated_by = $2 WHERE id = 1
		  AND ($3::timestamptz IS NULL OR date_trunc('milliseconds', updated_at) = date_trunc('milliseconds', $3::timestamptz))
		  RETURNING updated_at`,
		[JSON.stringify(after), actorId, expectedUpdatedAt ?? null],
	)
	if (!rows[0]) throw new SettingsConflictError()
	cache = null
	return { before, after, changes: diffSettings(before, after), stored: await getStoredSettings() }
}
