import { useEffect, useRef, useState, type ReactNode } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth'
import { Avatar } from './Avatar'
import { LogoHeader } from './Logo'
import { useToast } from './ui'
import { ProfileDialog } from './account/ProfileDialog'
import { PreferencesDialog } from './account/PreferencesDialog'
import {
	IconActivity, IconAudio, IconBell, IconContacts, IconDashboard, IconDownload, IconFolder,
	IconLogout, IconMenu, IconPhoto, IconSearch, IconSettings, IconUser, IconVideo,
} from './Icons'

// Barre du haut : mêmes applications, même ordre que la version Nextcloud.
export const APPS = [
	{ to: '/tableau-de-bord', label: 'Tableau de bord', Icon: IconDashboard },
	{ to: '/fichiers', label: 'Fichiers', Icon: IconFolder },
	{ to: '/photos', label: 'Photos', Icon: IconPhoto },
	{ to: '/activite', label: 'Activité', Icon: IconActivity },
	{ to: '/videos', label: 'Vidéos', Icon: IconVideo },
	{ to: '/audio', label: 'Audio', Icon: IconAudio },
	{ to: '/application', label: 'Application', Icon: IconDownload },
]

function UserMenu() {
	const { user, logout } = useAuth()
	const navigate = useNavigate()
	const location = useLocation()
	const toast = useToast()
	const [open, setOpen] = useState(false)
	const [dialog, setDialog] = useState<'profile' | 'prefs' | null>(null)
	const [leaving, setLeaving] = useState(false)
	const ref = useRef<HTMLDivElement>(null)
	const trigger = useRef<HTMLButtonElement>(null)

	const close = (focusTrigger = false) => {
		setOpen(false)
		if (focusTrigger) trigger.current?.focus()
	}

	// Fermeture : clic ou toucher en dehors, Échap, changement de page
	useEffect(() => {
		if (!open) return
		const onDown = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') { e.preventDefault(); close(true); return }
			if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
			const items = [...(ref.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [])]
			if (!items.length) return
			e.preventDefault()
			const i = items.indexOf(document.activeElement as HTMLButtonElement)
			items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus()
		}
		document.addEventListener('pointerdown', onDown)
		document.addEventListener('keydown', onKey)
		ref.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
		return () => {
			document.removeEventListener('pointerdown', onDown)
			document.removeEventListener('keydown', onKey)
		}
	}, [open]) // eslint-disable-line react-hooks/exhaustive-deps
	useEffect(() => { setOpen(false) }, [location.pathname])

	const signOut = async () => {
		setOpen(false)
		setLeaving(true)
		try {
			await logout()
			navigate('/connexion', { replace: true })
		} catch {
			setLeaving(false)
			toast('Déconnexion impossible : vérifiez votre connexion et réessayez.', 'critical')
		}
	}

	if (!user) return null
	return (
		<div className="user-menu" ref={ref}>
			<button ref={trigger} type="button" className="header-btn user-menu-trigger" onClick={() => setOpen((o) => !o)}
				aria-haspopup="menu" aria-expanded={open} aria-label="Menu du compte" disabled={leaving}>
				<Avatar name={user.displayName} seed={user.username} status="online" />
			</button>
			{open && (
				<div className="popover user-menu-pop" role="menu" aria-label="Menu du compte">
					<div className="user-menu-head">
						<Avatar name={user.displayName} seed={user.username} size={44} />
						<div>
							<strong>{user.displayName}</strong>
							<span>{user.email}</span>
						</div>
					</div>
					<button type="button" role="menuitem" className="menu-item" onClick={() => { setOpen(false); setDialog('profile') }}>
						<IconUser /> <span>Voir le profil</span>
					</button>
					<button type="button" role="menuitem" className="menu-item" onClick={() => { setOpen(false); setDialog('prefs') }}>
						<IconSettings /> <span>Paramètres personnels</span>
					</button>
					<hr className="menu-sep" />
					<button type="button" role="menuitem" className="menu-item" onClick={signOut}>
						<IconLogout /> <span>Se déconnecter</span>
					</button>
				</div>
			)}
			<ProfileDialog open={dialog === 'profile'} onClose={() => { setDialog(null); trigger.current?.focus() }} />
			<PreferencesDialog open={dialog === 'prefs'} onClose={() => { setDialog(null); trigger.current?.focus() }} />
		</div>
	)
}

export function AppShell({ children, navigation }: { children: ReactNode; navigation?: ReactNode }) {
	// Petits écrans : la navigation de gauche devient un tiroir ouvert par le bouton ☰
	const [navOpen, setNavOpen] = useState(false)
	// Rappel permanent pour les administrateurs quand la maintenance est active
	const { user, config } = useAuth()
	const maintenanceOn = user?.role === 'admin' && !!config?.maintenance.enabled
	return (
		<div className="shell">
			<header className="header">
				<div className="header-start">
					<NavLink to="/tableau-de-bord" className="header-logo" aria-label="S-Drive — Tableau de bord">
						<LogoHeader />
					</NavLink>
					<nav className="app-menu" aria-label="Applications">
						{APPS.map(({ to, label, Icon }) => (
							<NavLink key={to} to={to} className={({ isActive }) => `app-menu-entry${isActive ? ' is-active' : ''}`}
								aria-label={label}>
								<Icon size={20} />
								<span className="app-menu-label">{label}</span>
							</NavLink>
						))}
					</nav>
				</div>
				<div className="header-end">
					<button type="button" className="header-btn" aria-label="Rechercher" title="Rechercher (bientôt)" disabled>
						<IconSearch />
					</button>
					<button type="button" className="header-btn" aria-label="Notifications" title="Notifications (bientôt)" disabled>
						<IconBell />
					</button>
					<button type="button" className="header-btn" aria-label="Contacts" title="Contacts (bientôt)" disabled>
						<IconContacts />
					</button>
					<UserMenu />
				</div>
			</header>
			{maintenanceOn && (
				<div className="admin-maintenance-bar" role="status">
					<IconSettings size={16} />
					<span><strong>Mode maintenance actif</strong> — les utilisateurs ne peuvent pas se connecter.</span>
					<NavLink to="/tableau-de-bord/parametres">Gérer</NavLink>
				</div>
			)}
			<div className={`content${navigation ? ' content--with-nav' : ''}${navOpen ? ' nav-is-open' : ''}`}>
				{navigation && (
					<>
						<button type="button" className="header-btn nav-toggle" onClick={() => setNavOpen((o) => !o)}
							aria-label={navOpen ? 'Fermer la navigation' : 'Ouvrir la navigation'} aria-expanded={navOpen}>
							<IconMenu />
						</button>
						<aside className="app-navigation"
							onClick={(e) => { if ((e.target as HTMLElement).closest('a')) setNavOpen(false) }}>
							{navigation}
						</aside>
						<div className="nav-backdrop" onClick={() => setNavOpen(false)} aria-hidden="true" />
					</>
				)}
				<main className="app-content">{children}</main>
			</div>
		</div>
	)
}

/** Message « bientôt disponible » utilisé par les applications de la version 2+. */
export function Soon({ Icon, title, text }: { Icon: (p: { size?: number }) => ReactNode; title: string; text: string }) {
	return (
		<div className="empty">
			<span className="empty-icon"><Icon size={48} /></span>
			<h2>{title}</h2>
			<p>{text}</p>
		</div>
	)
}
