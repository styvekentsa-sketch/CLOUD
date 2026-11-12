import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { AppShell } from '../../components/AppShell'
import { IconActivity, IconDashboard, IconDevice, IconServer, IconShield, IconUser } from '../../components/Icons'

// Navigation de gauche de l'administration (même composant que « Fichiers »)
const SECTIONS = [
	{ to: '/tableau-de-bord', label: 'Vue d’ensemble', Icon: IconDashboard, end: true },
	{ to: '/tableau-de-bord/comptes', label: 'Comptes', Icon: IconUser },
	{ to: '/tableau-de-bord/sessions', label: 'Sessions', Icon: IconDevice },
	{ to: '/tableau-de-bord/journal', label: 'Journal de sécurité', Icon: IconShield },
	{ to: '/tableau-de-bord/systeme', label: 'Système', Icon: IconServer },
]

function AdminNavigation() {
	return (
		<>
			<p className="nav-caption">Administration</p>
			<ul className="nav-list">
				{SECTIONS.map(({ to, label, Icon, end }) => (
					<li key={to}>
						<NavLink to={to} end={end} className={({ isActive }) => `nav-entry${isActive ? ' is-active' : ''}`}>
							<Icon /> <span>{label}</span>
						</NavLink>
					</li>
				))}
			</ul>
			<div className="nav-list--bottom nav-foot">
				<IconActivity size={16} />
				<span>Données actualisées toutes les minutes</span>
			</div>
		</>
	)
}

/** En-tête de page de l'administration : titre, sous-titre et actions à droite. */
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
	return (
		<div className="page-head">
			<div>
				<h1>{title}</h1>
				{subtitle && <p>{subtitle}</p>}
			</div>
			{actions && <div className="page-actions">{actions}</div>}
		</div>
	)
}

export function AdminLayout({ children }: { children: ReactNode }) {
	return (
		<AppShell navigation={<AdminNavigation />}>
			<div className="admin">{children}</div>
		</AppShell>
	)
}
