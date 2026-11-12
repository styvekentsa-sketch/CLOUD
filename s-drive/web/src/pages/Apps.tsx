import { useEffect, useState } from 'react'
import { api } from '../api'
import { StorageBar } from '../components/Storage'
import { NavLink } from 'react-router-dom'
import { AppShell, Soon } from '../components/AppShell'
import {
	IconActivity, IconAudio, IconClock, IconDownload, IconFolder, IconGrid, IconPhoto, IconPie, IconPlus,
	IconSettings, IconShare, IconStar, IconTag, IconTrash, IconTree, IconUser, IconVideo,
} from '../components/Icons'

// Navigation de gauche de « Fichiers » : mêmes entrées et même ordre que la version Nextcloud.
const FILES_NAV = [
	{ to: '/fichiers', label: 'Tous les fichiers', Icon: IconFolder, end: true },
	{ to: '/fichiers/personnels', label: 'Fichiers personnels', Icon: IconUser },
	{ to: '/fichiers/recents', label: 'Récents', Icon: IconClock },
	{ to: '/fichiers/favoris', label: 'Favoris', Icon: IconStar },
	{ to: '/fichiers/partages', label: 'Partages', Icon: IconShare },
	{ to: '/fichiers/etiquettes', label: 'Étiquettes', Icon: IconTag },
	{ to: '/fichiers/arborescence', label: 'Arborescence des dossiers', Icon: IconTree },
]

function FilesNavigation() {
	return (
		<>
			<input className="nav-search" type="search" placeholder="Rechercher ici …" aria-label="Rechercher dans les fichiers" disabled />
			<ul className="nav-list">
				{FILES_NAV.map(({ to, label, Icon, end }) => (
					<li key={to}>
						<NavLink to={to} end={end} className={({ isActive }) => `nav-entry${isActive ? ' is-active' : ''}`}>
							<Icon /> <span>{label}</span>
						</NavLink>
					</li>
				))}
			</ul>
			<ul className="nav-list nav-list--bottom">
				<li><NavLink to="/fichiers/corbeille" className={({ isActive }) => `nav-entry${isActive ? ' is-active' : ''}`}><IconTrash /> <span>Fichiers supprimés</span></NavLink></li>
				<li><MyStorage /></li>
				<li><button type="button" className="nav-entry" disabled title="Bientôt disponible"><IconSettings /> <span>Paramètres de Fichiers</span></button></li>
			</ul>
		</>
	)
}

export function Files({ title = 'Tous les fichiers' }: { title?: string }) {
	return (
		<AppShell navigation={<FilesNavigation />}>
			<div className="files-toolbar">
				<span className="files-breadcrumb"><IconFolder /> {title}</span>
				<button type="button" className="btn btn-secondary" disabled title="Arrive dans la version 2"><IconPlus size={18} /> Nouveau</button>
				<button type="button" className="header-btn files-view" disabled aria-label="Affichage en grille"><IconGrid /></button>
			</div>
			<table className="files-table">
				<thead><tr><th>Nom</th><th className="num">Taille</th><th className="num">Modifié</th></tr></thead>
			</table>
			<Soon Icon={IconFolder} title="Aucun fichier pour l’instant"
				text="L’envoi, le téléchargement et l’organisation des fichiers arrivent dans la prochaine version de S-Drive." />
		</AppShell>
	)
}

export const FILES_SUBPAGES = FILES_NAV.slice(1).map((n) => ({ path: n.to, title: n.label }))
	.concat({ path: '/fichiers/corbeille', title: 'Fichiers supprimés' })

const SOON = {
	photos: { Icon: IconPhoto, title: 'Photos', text: 'Vos photos, classées par date, avec une visionneuse plein écran.' },
	activite: { Icon: IconActivity, title: 'Activité', text: 'L’historique de ce qui se passe sur S-Drive : envois, partages, suppressions.' },
	videos: { Icon: IconVideo, title: 'Vidéos', text: 'Toutes vos vidéos en vignettes, avec lecteur intégré.' },
	audio: { Icon: IconAudio, title: 'Audio', text: 'Votre musique et vos enregistrements, avec lecteur intégré.' },
	application: { Icon: IconDownload, title: 'Application', text: 'Installez S-Drive sur votre téléphone ou votre ordinateur en un clic (nécessite HTTPS).' },
} as const

export function ComingSoon({ app }: { app: keyof typeof SOON }) {
	const s = SOON[app]
	return (
		<AppShell>
			<Soon Icon={s.Icon} title={s.title} text={`${s.text} Disponible dans une prochaine version.`} />
		</AppShell>
	)
}

/** Espace de l'utilisateur, en bas de la navigation de « Fichiers ». */
function MyStorage() {
	const [s, setS] = useState<{ used: number; quota: number | null } | null>(null)
	useEffect(() => {
		api.myStorage().then(setS).catch(() => setS(null))
	}, [])
	return (
		<div className="nav-entry nav-entry--static nav-storage">
			<IconPie />
			{s ? <StorageBar used={s.used} quota={s.quota} compact /> : <span>Stockage…</span>}
		</div>
	)
}
