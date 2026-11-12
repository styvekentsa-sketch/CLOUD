import type { ReactNode } from 'react'
import type { SecurityEvent } from '../../api'
import type { Tone } from '../../components/ui'
import { bytes } from '../../format'
import {
	IconAlert, IconEdit, IconLink, IconLock, IconLogin, IconLogout, IconServer, IconShield, IconTrash, IconUserPlus, IconX,
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
	'share.create': { label: 'Partage créé', tone: 'info', icon: (s) => <IconLink size={s} /> },
	'share.revoke': { label: 'Partage révoqué', tone: 'warning', icon: (s) => <IconLink size={s} /> },
	'maintenance.trash_purge': { label: 'Maintenance — corbeilles vidées', tone: 'warning', icon: (s) => <IconTrash size={s} /> },
	'maintenance.orphan_scan': { label: 'Maintenance — analyse des orphelins', tone: 'info', icon: (s) => <IconServer size={s} /> },
	'maintenance.orphan_clean': { label: 'Maintenance — orphelins nettoyés', tone: 'warning', icon: (s) => <IconServer size={s} /> },
	'password.change': { label: 'Mot de passe changé', tone: 'info', icon: (s) => <IconLock size={s} /> },
	'password.change_failed': { label: 'Changement de mot de passe refusé', tone: 'critical', icon: (s) => <IconAlert size={s} /> },
	'settings.update': { label: 'Paramètres modifiés', tone: 'warning', icon: (s) => <IconEdit size={s} /> },
	'invitation.create': { label: 'Invitation créée', tone: 'info', icon: (s) => <IconUserPlus size={s} /> },
	'invitation.revoke': { label: 'Invitation annulée', tone: 'neutral', icon: (s) => <IconX size={s} /> },
}

const MODE_LABEL: Record<string, string> = { open: 'ouvertes', invite: 'sur invitation', closed: 'fermées' }
const size = (v: unknown) => (v === null ? 'illimité' : bytes(Number(v)))

/** « inscriptions : ouvertes → sur invitation ; maintenance activée » */
function describeSettings(changes: Record<string, { from: unknown; to: unknown }>): string {
	const parts: string[] = []
	for (const [k, { from, to }] of Object.entries(changes)) {
		if (k === 'registrationMode') parts.push(`inscriptions ${MODE_LABEL[String(from)] ?? from} → ${MODE_LABEL[String(to)] ?? to}`)
		else if (k === 'defaultQuotaBytes') parts.push(`quota par défaut ${size(from)} → ${size(to)}`)
		else if (k === 'maxUploadBytes') parts.push(`taille max. d’envoi ${from === null ? 'sans limite' : bytes(Number(from))} → ${to === null ? 'sans limite' : bytes(Number(to))}`)
		else if (k === 'maintenanceEnabled') parts.push(to ? 'mode maintenance ACTIVÉ' : 'mode maintenance désactivé')
		else if (k === 'maintenanceMessage') parts.push('message de maintenance modifié')
	}
	return parts.join(' ; ')
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
		case 'share.create': return `${who(e)} a partagé « ${String(e.meta.itemName ?? '?')} » par lien public`
		case 'password.change': {
			const n = Number(e.meta.otherSessionsClosed ?? 0)
			return `${who(e)} a changé son mot de passe${n > 0 ? ` (${n} autre${n > 1 ? 's' : ''} session${n > 1 ? 's' : ''} fermée${n > 1 ? 's' : ''})` : ''}`
		}
		case 'password.change_failed':
			return `${who(e)} : changement de mot de passe refusé (mot de passe actuel incorrect)`
		case 'settings.update':
			return `Paramètres : ${describeSettings((e.meta.changes ?? {}) as Record<string, { from: unknown; to: unknown }>) || 'modifiés'}${actor}`
		case 'invitation.create':
			return `Invitation créée${e.meta.email ? ` pour ${String(e.meta.email)}` : ' (lien ouvert)'}, valable ${String(e.meta.days ?? 7)} j${actor}`
		case 'invitation.revoke':
			return `Invitation${e.meta.email ? ` pour ${String(e.meta.email)}` : ''} annulée${actor}`
		case 'maintenance.trash_purge': {
			const m = e.meta as Record<string, number>
			return `Corbeilles vidées (éléments de plus de ${m.olderThanDays ?? 30} j) : ${m.files ?? 0} fichier(s) supprimé(s), ${bytes(m.bytes ?? 0)} libérés${actor}`
		}
		case 'maintenance.orphan_scan': {
			const m = e.meta as Record<string, number>
			return `Analyse du stockage : ${m.orphanFiles ?? 0} orphelin(s) sur le disque, ${m.missingFiles ?? 0} entrée(s) sans fichier, ${m.staleTempFiles ?? 0} envoi(s) abandonné(s)${actor}`
		}
		case 'maintenance.orphan_clean': {
			const m = e.meta as Record<string, number>
			return `Nettoyage du stockage : ${(m.orphanFiles ?? 0) + (m.tempFiles ?? 0)} fichier(s) supprimé(s) (${bytes((m.orphanBytes ?? 0) + (m.tempBytes ?? 0))}), ${m.missingRemoved ?? 0} entrée(s) retirée(s)${actor}`
		}
		case 'share.revoke': {
			const stats = typeof e.meta.views === 'number' ? ` (${e.meta.views} vue${Number(e.meta.views) > 1 ? 's' : ''}, ${e.meta.downloads ?? 0} téléchargement${Number(e.meta.downloads) > 1 ? 's' : ''})` : ''
			return `Lien public vers « ${String(e.meta.itemName ?? '?')} » de ${who(e)} révoqué${actor}${stats}`
		}
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
