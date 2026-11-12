import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.DATABASE_URL ??= 'postgres://test@localhost/test'
const { shareStatus } = await import('./shares.js')

const now = new Date('2026-11-12T12:00:00Z')

test('partage : sans expiration et non révoqué -> actif', () => {
	assert.equal(shareStatus({ revokedAt: null, expiresAt: null }, now), 'active')
})

test('partage : expiration future -> actif', () => {
	assert.equal(shareStatus({ revokedAt: null, expiresAt: new Date('2026-11-13T00:00:00Z') }, now), 'active')
})

test('partage : expiration passée ou atteinte -> expiré', () => {
	assert.equal(shareStatus({ revokedAt: null, expiresAt: new Date('2026-11-12T11:59:59Z') }, now), 'expired')
	assert.equal(shareStatus({ revokedAt: null, expiresAt: now }, now), 'expired')
})

test('partage : révoqué l’emporte sur tout le reste', () => {
	assert.equal(shareStatus({ revokedAt: new Date('2026-11-01'), expiresAt: null }, now), 'revoked')
	assert.equal(shareStatus({ revokedAt: new Date('2026-11-01'), expiresAt: new Date('2027-01-01') }, now), 'revoked')
})
