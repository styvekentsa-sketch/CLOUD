import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'

// Hachage des mots de passe avec scrypt (inclus dans Node.js, aucune dépendance native).
// Format stocké : scrypt$N$r$p$sel$hash (base64). Les paramètres sont stockés avec
// le hash : on pourra les renforcer plus tard sans casser les anciens comptes.
const N = 2 ** 15
const R = 8
const P = 1
const KEYLEN = 64
const MAXMEM = 128 * N * R * 2

function scrypt(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		scryptCb(password.normalize('NFKC'), salt, KEYLEN, { N: n, r, p, maxmem: MAXMEM }, (err, key) =>
			err ? reject(err) : resolve(key))
	})
}

export async function hashPassword(password: string): Promise<string> {
	const salt = randomBytes(16)
	const key = await scrypt(password, salt, N, R, P)
	return ['scrypt', N, R, P, salt.toString('base64'), key.toString('base64')].join('$')
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
	const parts = stored.split('$')
	if (parts.length !== 6 || parts[0] !== 'scrypt') return false
	const [, n, r, p, salt, hash] = parts
	const expected = Buffer.from(hash, 'base64')
	const key = await scrypt(password, Buffer.from(salt, 'base64'), Number(n), Number(r), Number(p))
	return key.length === expected.length && timingSafeEqual(key, expected)
}

// Hash factice : vérifié quand l'identifiant n'existe pas, pour que la réponse
// prenne le même temps (on ne peut pas deviner quels comptes existent).
let dummy: string | null = null
export async function burnPasswordCheck(password: string): Promise<void> {
	dummy ??= await hashPassword(randomBytes(12).toString('hex'))
	await verifyPassword(password, dummy)
}
