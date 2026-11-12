import { useEffect, useRef, useState, type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth'
import { Avatar } from './Avatar'
import { LogoHeader } from './Logo'
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
	const [open, setOpen] = useState(false)
	const ref = useRef<HTMLDivElement>(null)

	useEffect(() => {
		if (!open) return
		const close = (e: MouseEvent | KeyboardEvent) => {
			if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false)
		}
		document.addEventListener('mousedown', close)
		document.addEventListener('keydown', close)
		return () => {
			document.removeEventListener('mousedown', close)
			document.removeEventListener('keydown', close)
		}
	}, [open])

	if (!user) return null
	return (
		<div className="user-menu" ref={ref}>
			<button type="button" className="header-btn user-menu-trigger" onClick={() => setOpen((o) => !o)}
				aria-haspopup="menu" aria-expanded={open} aria-label="Menu du compte">
				<Avatar name={user.displayName} seed={user.username} status="online" />
			</button>
			{open && (
				<div className="popover user-menu-pop" role="menu">
					<div className="user-menu-head">
						<Avatar name={user.displayName} seed={user.username} size={44} />
						<div>
							<strong>{user.displayName}</strong>
							<span>{user.email}</span>
						</div>
					</div>
					<button type="button" role="menuitem" className="menu-item" disabled title="Bientôt disponible">
						<IconUser /> <span>Voir le profil</span>
					</button>
					<button type="button" role="menuitem" className="menu-item" disabled title="Bientôt disponible">
						<IconSettings /> <span>Paramètres personnels</span>
					</button>
					<button type="button" role="menuitem" className="menu-item"
						onClick={async () => { await logout(); navigate('/connexion', { replace: true }) }}>
						<IconLogout /> <span>Se déconnecter</span>
					</button>
				</div>
			)}
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
