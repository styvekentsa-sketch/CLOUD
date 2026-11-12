import { createHash, randomBytes } from 'node:crypto'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { pool } from '../db.js'
import { config } from '../config.js'
import { touchActivity } from './events.js'

export const COOKIE = 'sdrive_session'

// Le jeton n'est jamais stocké en clair : seule son empreinte SHA-256 est en base.
const hash = (token: string) => createHash('sha256').update(token).digest('hex')

export type SessionUser = {
	id: string
	username: string
	email: string
	display_name: string
	role: 'user' | 'admin'
	status: 'active' | 'disabled'
	created_at: Date
	last_login_at: Date | null
	session_id: string
}

export async function createSession(req: FastifyRequest, reply: FastifyReply, userId: string, remember: boolean): Promise<void> {
	const token = randomBytes(32).toString('base64url')
	const ms = remember ? config.rememberDays * 86400_000 : config.sessionHours * 3600_000
	const expires = new Date(Date.now() + ms)
	await pool.query(
		'INSERT INTO sessions (user_id, token_hash, expires_at, ip, user_agent) VALUES ($1, $2, $3, $4, $5)',
		[userId, hash(token), expires, req.ip, (req.headers['user-agent'] ?? '').slice(0, 300)],
	)
	reply.setCookie(COOKIE, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: req.protocol === 'https',
		// « Se souvenir de moi » : cookie persistant ; sinon il disparaît à la fermeture du navigateur
		...(remember ? { expires } : {}),
	})
}

export async function currentUser(req: FastifyRequest): Promise<SessionUser | null> {
	const token = req.cookies[COOKIE]
	if (!token) return null
	const { rows } = await pool.query<SessionUser & { seen: Date }>(
		`SELECT u.id, u.username, u.email, u.display_name, u.role, u.status, u.created_at, u.last_login_at,
		        s.id AS session_id, s.last_seen_at AS seen
		   FROM sessions s JOIN users u ON u.id = s.user_id
		  WHERE s.token_hash = $1 AND s.expires_at > now()`,
		[hash(token)],
	)
	const row = rows[0]
	if (!row || row.status !== 'active') return null
	// Présence « en ligne » : mise à jour au plus une fois par minute
	if (Date.now() - new Date(row.seen).getTime() > 60_000) {
		await pool.query('UPDATE sessions SET last_seen_at = now() WHERE id = $1', [row.session_id])
		await pool.query('UPDATE users SET last_seen_at = now() WHERE id = $1', [row.id])
		await touchActivity(row.id)
	}
	return row
}

export async function destroySession(req: FastifyRequest, reply: FastifyReply): Promise<void> {
	const token = req.cookies[COOKIE]
	if (token) await pool.query('DELETE FROM sessions WHERE token_hash = $1', [hash(token)])
	reply.clearCookie(COOKIE, { path: '/' })
}

export async function purgeExpiredSessions(): Promise<void> {
	await pool.query('DELETE FROM sessions WHERE expires_at < now()')
}
