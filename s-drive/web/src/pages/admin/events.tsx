import type { ReactNode } from 'react'
import type { SecurityEvent } from '../../api'
import type { Tone } from '../../components/ui'
import { bytes } from '../../format'
import {
	IconAlert, IconEdit, IconLock, IconLogin, IconLogout, IconShield, IconTrash, IconUserPlus, IconX,
} from '../../components/Icons'

/** Présentation de chaque type d'événement du journal de sécurité. */
const KINDS: Record<string, { label: string; tone: Tone; icon: (s: number) => ReactNode }> = {
	'login.success': { label: 'Connexion', tone: 'good', icon: (s) => <IconLogin size={s} /> },
	'login.failure': { label: 'Échec de connexion', tone: 'critical', icon: (s) => <IconAlert size={s} /> },
	'login.throttled': { label: 'Tentatives bloquées', tone: 'critical', icon: (s) => <IconLock size={s} /> },
	logout: { label: 'Déconnexion', tone: 'neutral', icon: (s) => <IconLogout size={s} /> },
	register: { label: 'Inscription', tone: 'info', icon: (s) => <IconUserPlus size={s} /> },
	'user.create': { label: 'Compte créé', tone: 'info', icon: (s) => <IconUserPlus size={s} /> },
	'user.update': { label: 'Compte modifié', tone: 'warning', icon: (s) => <IconEdit size={s} /> },
	'user.delete': { label: 'Compte supprimé', tone: 'warning', icon: (s) => <IconTrash size={s} /> },
	'sessions.revoke': { label: 'Sessions fermées', tone: 'warning', icon: (s) => <IconX size={s} /> },
	'session.revoke': { label: 'Session fermée', tone: 'warning', icon: (s) => <IconX size={s} /> },
}

export function eventKind(type: string) {
	return KINDS[type] ?? { label: type, tone: 'neutral' as Tone, icon: (s: number) => <IconShield size={s} /> }
}

const REASONS: Record<string, string> = {
	wrong_password: 'mot de passe incorrect',
	unknown_user: 'identifiant inconnu',
	disabled: 'compte désactivé',
}

const who = (e: SecurityEvent) =>
	e.user?.displayName ?? e.user?.username ?? (e.meta.username as string | undefined) ?? (e.meta.login as string | undefined) ?? 'inconnu'

/** Phrase lisible : « Échec pour « paul » — mot de passe incorrect ». */
export function eventSentence(e: SecurityEvent): string {
	const actor = e.actor ? ` par ${e.actor.displayName ?? e.actor.username}` : ''
	switch (e.type) {
		case 'login.success': return `${who(e)} s’est connecté${e.meta.remember ? ' (se souvenir de moi)' : ''}`
		case 'login.failure': return `Échec pour « ${String(e.meta.login ?? who(e))} » — ${REASONS[String(e.meta.reason)] ?? 'refusé'}`
		case 'login.throttled': return `« ${String(e.meta.login ?? '?')} » bloqué ${e.meta.retryAfter ? `${e.meta.retryAfter} s` : ''} après trop d’essais`
		case 'logout': return `${who(e)} s’est déconnecté`
		case 'register': return `${who(e)} a créé son compte`
		case 'user.create': return `Compte « ${String(e.meta.username)} » créé${actor}${e.meta.role === 'admin' ? ' (administrateur)' : ''}`
		case 'user.delete': return `Compte « ${String(e.meta.username)} » supprimé${actor}`
		case 'sessions.revoke': return `${e.meta.count ?? 'Les'} session(s) de ${who(e)} fermée(s)${actor}`
		case 'session.revoke': return `Une session de ${who(e)} fermée${actor}`
		case 'user.update': {
			const c = (e.meta.changes ?? {}) as Record<string, string>
			const quota = 'storageQuota' in c
				? `quota de stockage ${c.storageQuota === null ? 'illimité' : `fixé à ${bytes(Number(c.storageQuota))}`}`
				: false
			const parts = [
				quota,
				c.role === 'admin' && 'promu administrateur',
				c.role === 'user' && 'n’est plus administrateur',
				c.status === 'disabled' && 'désactivé',
				c.status === 'active' && 'réactivé',
				c.displayName && `renommé « ${c.displayName} »`,
			].filter(Boolean)
			return `${who(e)} : ${parts.join(', ') || 'modifié'}${actor}`
		}
		default: return who(e)
	}
}
