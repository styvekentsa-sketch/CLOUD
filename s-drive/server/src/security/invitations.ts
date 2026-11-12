import { createHash, randomBytes } from 'node:crypto'
import type { PoolClient } from 'pg'
import { pool } from '../db.js'

// Invitations (mode d'inscription « Sur invitation ») : lien à usage unique,
// éventuellement réservé à une adresse e-mail, avec une date d'expiration.

export const hashInvitation = (token: string) => createHash('sha256').update(token).digest('hex')

export type InvitationState = 'pending' | 'used' | 'revoked' | 'expired'

/** État d'une invitation (fonction pure, testée). */
export function invitationState(i: { usedAt: Date | null; revokedAt: Date | null; expiresAt: Date }, now = new Date()): InvitationState {
	if (i.usedAt) return 'used'
	if (i.revokedAt) return 'revoked'
	if (i.expiresAt.getTime() <= now.getTime()) return 'expired'
	return 'pending'
}

export async function createInvitation(actorId: string, opts: { email?: string | null; note?: string | null; days: number }) {
	const token = randomBytes(24).toString('base64url')
	const { rows } = await pool.query(
		`INSERT INTO invitations (token_hash, email, note, created_by, expires_at)
		 VALUES ($1, $2, $3, $4, now() + make_interval(days => $5)) RETURNING id, expires_at`,
		[hashInvitation(token), opts.email?.toLowerCase() || null, opts.note || null, actorId, opts.days],
	)
	return { id: rows[0].id as string, token, expiresAt: rows[0].expires_at as Date }
}

/** Informations publiques d'un lien (page d'inscription) — rien de plus que l'e-mail attendu. */
export async function lookupInvitation(token: string) {
	const { rows } = await pool.query(
		'SELECT email, expires_at, used_at, revoked_at FROM invitations WHERE token_hash = $1', [hashInvitation(token)])
	const r = rows[0]
	if (!r) return { state: 'invalid' as const }
	return { state: invitationState({ usedAt: r.used_at, revokedAt: r.revoked_at, expiresAt: r.expires_at }), email: r.email as string | null, expiresAt: r.expires_at as Date }
}

/**
 * Consomme l'invitation dans la même transaction que la création du compte.
 * Retourne null si le lien n'est pas (ou plus) valable, ou réservé à une autre adresse.
 */
export async function consumeInvitation(client: PoolClient, token: string, email: string, userId: string): Promise<string | null> {
	const { rows } = await client.query(
		`UPDATE invitations SET used_at = now(), used_by = $3
		  WHERE token_hash = $1 AND used_at IS NULL AND revoked_at IS NULL AND expires_at > now()
		    AND (email IS NULL OR email = lower($2))
		  RETURNING id`,
		[hashInvitation(token), email, userId],
	)
	return rows[0]?.id ?? null
}
