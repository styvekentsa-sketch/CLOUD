import { createHash, randomBytes } from 'node:crypto'
import { pool } from '../db.js'
import { hashPassword, verifyPassword } from '../security/password.js'

// =============================================================================
//  Partages publics (liens). Utilisé par la future version « Fichiers » :
//    createShare()  -> crée le lien (renvoie l'URL secrète UNE seule fois)
//    openShare()    -> vérifie le lien (actif, non expiré, mot de passe) et compte
//                      la consultation ou le téléchargement
//  L'administration (routes/shares.ts) liste et révoque ces partages.
// =============================================================================

export type ShareStatus = 'active' | 'expired' | 'revoked'

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

/** État d'un partage à un instant donné (fonction pure, testée). */
export function shareStatus(s: { revokedAt: Date | null; expiresAt: Date | null }, now = new Date()): ShareStatus {
	if (s.revokedAt) return 'revoked'
	if (s.expiresAt && s.expiresAt.getTime() <= now.getTime()) return 'expired'
	return 'active'
}

/** Condition SQL « partage actif » (même règle que shareStatus). */
export const ACTIVE_SQL = '(revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now()))'

export async function createShare(opts: {
	ownerId: string
	itemType: 'file' | 'folder'
	itemName: string
	itemPath?: string
	password?: string | null
	expiresAt?: Date | null
}): Promise<{ id: string; token: string }> {
	const token = randomBytes(24).toString('base64url')
	const { rows } = await pool.query<{ id: string }>(
		`INSERT INTO shares (token_hash, owner_id, item_type, item_name, item_path, password_hash, expires_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
		[
			hashToken(token), opts.ownerId, opts.itemType, opts.itemName, opts.itemPath ?? '',
			opts.password ? await hashPassword(opts.password) : null, opts.expiresAt ?? null,
		],
	)
	return { id: rows[0].id, token }
}

export type OpenResult =
	| { ok: true; shareId: string; itemType: 'file' | 'folder'; itemName: string; itemPath: string; ownerId: string }
	| { ok: false; reason: 'not_found' | 'expired' | 'revoked' | 'password_required' | 'wrong_password' }

/** Ouvre un lien : contrôle l'état et le mot de passe, puis compte l'accès. */
export async function openShare(token: string, kind: 'view' | 'download', password?: string): Promise<OpenResult> {
	const { rows } = await pool.query(
		`SELECT id, owner_id, item_type, item_name, item_path, password_hash, expires_at, revoked_at
		   FROM shares WHERE token_hash = $1`,
		[hashToken(token)],
	)
	const s = rows[0]
	if (!s) return { ok: false, reason: 'not_found' }
	const status = shareStatus({ revokedAt: s.revoked_at, expiresAt: s.expires_at })
	if (status !== 'active') return { ok: false, reason: status }
	if (s.password_hash) {
		if (!password) return { ok: false, reason: 'password_required' }
		if (!(await verifyPassword(password, s.password_hash))) return { ok: false, reason: 'wrong_password' }
	}
	await pool.query(
		`UPDATE shares SET ${kind === 'download' ? 'downloads = downloads + 1' : 'views = views + 1'}, last_access_at = now()
		  WHERE id = $1`,
		[s.id],
	)
	return { ok: true, shareId: s.id, itemType: s.item_type, itemName: s.item_name, itemPath: s.item_path, ownerId: s.owner_id }
}
