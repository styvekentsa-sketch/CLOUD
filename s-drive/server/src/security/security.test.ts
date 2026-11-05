import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hashPassword, verifyPassword } from './password.js'
import { _reset, recordFailure, recordSuccess, retryAfter } from './throttle.js'

test('mot de passe : le bon est accepté, un mauvais refusé', async () => {
	const h = await hashPassword('correct horse battery')
	assert.match(h, /^scrypt\$32768\$8\$1\$/)
	assert.equal(await verifyPassword('correct horse battery', h), true)
	assert.equal(await verifyPassword('correct horse batterY', h), false)
})

test('mot de passe : deux hachages du même mot de passe diffèrent (sel)', async () => {
	assert.notEqual(await hashPassword('même mot de passe'), await hashPassword('même mot de passe'))
})

test('mot de passe : format inconnu refusé', async () => {
	assert.equal(await verifyPassword('x', 'md5$abc'), false)
})

test('anti force brute : délai après 3 échecs, levé par un succès', () => {
	_reset()
	const t = 1_000_000
	recordFailure('1.2.3.4', 'Alice', t)
	recordFailure('1.2.3.4', 'alice', t)
	assert.equal(retryAfter('1.2.3.4', 'alice', t), 0)
	recordFailure('1.2.3.4', 'alice', t)
	assert.equal(retryAfter('1.2.3.4', 'alice', t), 2)
	assert.equal(retryAfter('1.2.3.4', 'bob', t), 0, 'un autre identifiant n’est pas bloqué')
	recordSuccess('1.2.3.4', 'alice')
	assert.equal(retryAfter('1.2.3.4', 'alice', t), 0)
})

test('anti force brute : blocage de l’IP au-delà de 30 échecs', () => {
	_reset()
	const t = 2_000_000
	for (let i = 0; i < 30; i++) recordFailure('5.6.7.8', `user${i}`, t)
	assert.ok(retryAfter('5.6.7.8', 'nouveau', t) > 800)
})
