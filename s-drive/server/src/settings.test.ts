import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.DATABASE_URL ??= 'postgres://test@localhost/test'
const { diffSettings, settingsPatchSchema, withDefaults } = await import('./settings.js')
const { invitationState } = await import('./security/invitations.js')
const { withinUploadLimit } = await import('./storage/quota.js')

const GB = 1024 ** 3

test('paramètres : valeurs manquantes complétées par les valeurs par défaut', () => {
	const s = withDefaults({ registrationMode: 'invite' })
	assert.equal(s.registrationMode, 'invite')
	assert.equal(s.maintenance.enabled, false)
	assert.equal(s.maxUploadBytes, 2 * GB)
})

test('paramètres : « illimité » (null) est conservé, pas remplacé par le défaut', () => {
	const s = withDefaults({ defaultQuotaBytes: null, maxUploadBytes: null })
	assert.equal(s.defaultQuotaBytes, null)
	assert.equal(s.maxUploadBytes, null)
})

test('paramètres : données invalides en base -> valeurs par défaut', () => {
	const s = withDefaults({ registrationMode: 'n-importe-quoi' })
	assert.ok(['open', 'closed'].includes(s.registrationMode))
})

test('paramètres : validation des mises à jour', () => {
	assert.equal(settingsPatchSchema.safeParse({ registrationMode: 'invite' }).success, true)
	assert.equal(settingsPatchSchema.safeParse({ registrationMode: 'public' }).success, false)
	assert.equal(settingsPatchSchema.safeParse({ maxUploadBytes: 100 }).success, false, 'limite d’envoi < 1 Mo refusée')
	assert.equal(settingsPatchSchema.safeParse({ defaultQuotaBytes: -1 }).success, false)
	assert.equal(settingsPatchSchema.safeParse({ maintenance: { enabled: true, message: 'x'.repeat(501) } }).success, false)
})

test('paramètres : journal = uniquement les champs modifiés, avant -> après', () => {
	const a = withDefaults({ registrationMode: 'open', maintenance: { enabled: false, message: '' } })
	const b = { ...a, registrationMode: 'closed' as const, maintenance: { enabled: true, message: '' } }
	assert.deepEqual(diffSettings(a, b), {
		registrationMode: { from: 'open', to: 'closed' },
		maintenanceEnabled: { from: false, to: true },
	})
	assert.deepEqual(diffSettings(a, a), {})
})

test('limite d’envoi : respectée, dépassée, illimitée', () => {
	assert.equal(withinUploadLimit(2 * GB, 2 * GB), true)
	assert.equal(withinUploadLimit(2 * GB + 1, 2 * GB), false)
	assert.equal(withinUploadLimit(50 * GB, null), true)
})

test('invitation : en attente, utilisée, révoquée, expirée', () => {
	const now = new Date('2026-11-12T12:00:00Z')
	const later = new Date('2026-11-19T12:00:00Z')
	assert.equal(invitationState({ usedAt: null, revokedAt: null, expiresAt: later }, now), 'pending')
	assert.equal(invitationState({ usedAt: now, revokedAt: null, expiresAt: later }, now), 'used')
	assert.equal(invitationState({ usedAt: null, revokedAt: now, expiresAt: later }, now), 'revoked')
	assert.equal(invitationState({ usedAt: null, revokedAt: null, expiresAt: now }, now), 'expired')
})
