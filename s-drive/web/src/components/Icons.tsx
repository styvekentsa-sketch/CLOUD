// Jeu d'icônes S-Drive : grille 24 px, trait 1,75 px, extrémités arrondies.
// Mêmes dessins que les icônes du menu de la version Nextcloud.
import type { ReactNode, SVGProps } from 'react'

type P = SVGProps<SVGSVGElement> & { size?: number }

function Icon({ size = 20, children, ...rest }: P & { children: ReactNode }) {
	return (
		<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
			strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
			{children}
		</svg>
	)
}

export const IconDashboard = (p: P) => <Icon {...p}><rect x="3.5" y="3.5" width="7" height="8" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="4.5" rx="1.5" /><rect x="13.5" y="11" width="7" height="9.5" rx="1.5" /><rect x="3.5" y="14.5" width="7" height="6" rx="1.5" /></Icon>
export const IconFolder = (p: P) => <Icon {...p}><path d="M3.5 7A1.5 1.5 0 0 1 5 5.5h4.2l2 2.2H19A1.5 1.5 0 0 1 20.5 9.2V17A1.5 1.5 0 0 1 19 18.5H5A1.5 1.5 0 0 1 3.5 17z" /></Icon>
export const IconPhoto = (p: P) => <Icon {...p}><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><circle cx="9" cy="9.5" r="1.6" /><path d="M20.5 15.5l-4.5-4.5-8.5 8.5" /></Icon>
export const IconActivity = (p: P) => <Icon {...p}><path d="M3 12.5h3.8l2.7-6.5 4.5 12 2.7-5.5H21" /></Icon>
export const IconVideo = (p: P) => <Icon {...p}><rect x="3" y="6" width="12.5" height="12" rx="2" /><path d="M15.5 10.2l5.5-3.2v10l-5.5-3.2z" /></Icon>
export const IconAudio = (p: P) => <Icon {...p}><path d="M9 17.5V5.5l11-2v12" /><circle cx="6.5" cy="17.5" r="2.5" /><circle cx="17.5" cy="15.5" r="2.5" /></Icon>
export const IconDownload = (p: P) => <Icon {...p}><path d="M12 3.5v11" /><path d="M7.5 10l4.5 4.5 4.5-4.5" /><path d="M4.5 19.5h15" /></Icon>
export const IconSearch = (p: P) => <Icon {...p}><circle cx="10.5" cy="10.5" r="6" /><path d="M15 15l5.5 5.5" /></Icon>
export const IconBell = (p: P) => <Icon {...p}><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></Icon>
export const IconContacts = (p: P) => <Icon {...p}><rect x="4.5" y="3.5" width="15" height="17" rx="2" /><circle cx="12" cy="10" r="2.5" /><path d="M8 17c.6-2 2.2-3 4-3s3.4 1 4 3" /></Icon>
export const IconUser = (p: P) => <Icon {...p}><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20c.8-3.5 3.6-5.5 7-5.5s6.2 2 7 5.5" /></Icon>
export const IconClock = (p: P) => <Icon {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></Icon>
export const IconStar = (p: P) => <Icon {...p}><path d="M12 3.8l2.5 5.2 5.7.8-4.1 4 1 5.6L12 16.7l-5.1 2.7 1-5.6-4.1-4 5.7-.8z" /></Icon>
export const IconShare = (p: P) => <Icon {...p}><circle cx="9" cy="8" r="3" /><path d="M3.5 19c.6-3 2.8-4.8 5.5-4.8s4.9 1.8 5.5 4.8" /><path d="M18 8v6M15 11h6" /></Icon>
export const IconTag = (p: P) => <Icon {...p}><path d="M3.5 4.5v6.3l9.2 9.2 7.3-7.3-9.2-9.2z" /><circle cx="7.8" cy="8.3" r="1.2" /></Icon>
export const IconTree = (p: P) => <Icon {...p}><rect x="3.5" y="4" width="7" height="5" rx="1" /><rect x="13.5" y="10" width="7" height="4" rx="1" /><rect x="13.5" y="16" width="7" height="4" rx="1" /><path d="M7 9v9h6.5M7 12h6.5" /></Icon>
export const IconTrash = (p: P) => <Icon {...p}><path d="M4.5 6.5h15M9.5 6.5V4.5h5v2M6.5 6.5l1 13h9l1-13" /></Icon>
export const IconPie = (p: P) => <Icon {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 3.5V12l6 6" /></Icon>
export const IconSettings = (p: P) => <Icon {...p}><circle cx="12" cy="12" r="3" /><path d="M12 3.5v2.2M12 18.3v2.2M20.5 12h-2.2M5.7 12H3.5M18 6l-1.6 1.6M7.6 16.4 6 18M18 18l-1.6-1.6M7.6 7.6 6 6" /></Icon>
export const IconPlus = (p: P) => <Icon {...p}><path d="M12 5v14M5 12h14" /></Icon>
export const IconArrowRight = (p: P) => <Icon {...p}><path d="M4.5 12h15M13.5 6l6 6-6 6" /></Icon>
export const IconLogout = (p: P) => <Icon {...p}><path d="M14.5 4.5h4a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5h-4" /><path d="M10 16.5 5.5 12 10 7.5M5.5 12h10" /></Icon>
export const IconEye = (p: P) => <Icon {...p}><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></Icon>
export const IconEyeOff = (p: P) => <Icon {...p}><path d="M10 5.7A9.4 9.4 0 0 1 12 5.5C18 5.5 21.5 12 21.5 12a17 17 0 0 1-2.6 3.4M14.1 14.2a3 3 0 0 1-4.3-4.3M6.6 6.7C3.9 8.4 2.5 12 2.5 12S6 18.5 12 18.5c1.6 0 3-.4 4.2-1.1" /><path d="M3.5 3.5l17 17" /></Icon>
export const IconMenu = (p: P) => <Icon {...p}><path d="M4 6.5h16M4 12h16M4 17.5h16" /></Icon>
export const IconGrid = (p: P) => <Icon {...p}><rect x="4" y="4" width="6.5" height="6.5" rx="1" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1" /></Icon>
export const IconMore = (p: P) => <Icon {...p}><circle cx="5.5" cy="12" r="1" fill="currentColor" /><circle cx="12" cy="12" r="1" fill="currentColor" /><circle cx="18.5" cy="12" r="1" fill="currentColor" /></Icon>
export const IconRefresh = (p: P) => <Icon {...p}><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" /><path d="M19.5 4.5v4h-4" /></Icon>
export const IconEdit = (p: P) => <Icon {...p}><path d="M4.5 19.5h4l10-10-4-4-10 10z" /><path d="M13.5 6.5l4 4" /></Icon>
export const IconShield = (p: P) => <Icon {...p}><path d="M12 3.5l7 2.8v5.2c0 4.3-2.9 7.7-7 9-4.1-1.3-7-4.7-7-9V6.3z" /><path d="M9 12l2.2 2.2L15.5 10" /></Icon>
export const IconShieldOff = (p: P) => <Icon {...p}><path d="M12 3.5l7 2.8v5.2c0 4.3-2.9 7.7-7 9-4.1-1.3-7-4.7-7-9V6.3z" /><path d="M9.5 9.5l5 5M14.5 9.5l-5 5" /></Icon>
export const IconLock = (p: P) => <Icon {...p}><rect x="5" y="10.5" width="14" height="10" rx="2" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></Icon>
export const IconUnlock = (p: P) => <Icon {...p}><rect x="5" y="10.5" width="14" height="10" rx="2" /><path d="M8 10.5V8a4 4 0 0 1 7.6-1.7" /></Icon>
export const IconServer = (p: P) => <Icon {...p}><rect x="3.5" y="4" width="17" height="7" rx="1.5" /><rect x="3.5" y="13" width="17" height="7" rx="1.5" /><path d="M7 7.5h.01M7 16.5h.01" /></Icon>
export const IconDevice = (p: P) => <Icon {...p}><rect x="3" y="4.5" width="18" height="11.5" rx="1.5" /><path d="M8.5 20h7M12 16v4" /></Icon>
export const IconPhone = (p: P) => <Icon {...p}><rect x="7" y="2.5" width="10" height="19" rx="2" /><path d="M11 18.5h2" /></Icon>
export const IconLogin = (p: P) => <Icon {...p}><path d="M9.5 4.5h-4A1.5 1.5 0 0 0 4 6v12a1.5 1.5 0 0 0 1.5 1.5h4" /><path d="M14 16.5l4.5-4.5L14 7.5M18.5 12h-10" /></Icon>
export const IconUserPlus = (p: P) => <Icon {...p}><circle cx="9.5" cy="8.5" r="3.5" /><path d="M3 20c.7-3.4 3.3-5.5 6.5-5.5 1.6 0 3 .5 4.1 1.4" /><path d="M18 14v6M15 17h6" /></Icon>
export const IconUserX = (p: P) => <Icon {...p}><circle cx="9.5" cy="8.5" r="3.5" /><path d="M3 20c.7-3.4 3.3-5.5 6.5-5.5 1.6 0 3 .5 4.1 1.4" /><path d="M16 15l4.5 4.5M20.5 15 16 19.5" /></Icon>
export const IconDrag = (p: P) => <Icon {...p}><circle cx="9" cy="6" r="1" fill="currentColor" /><circle cx="15" cy="6" r="1" fill="currentColor" /><circle cx="9" cy="12" r="1" fill="currentColor" /><circle cx="15" cy="12" r="1" fill="currentColor" /><circle cx="9" cy="18" r="1" fill="currentColor" /><circle cx="15" cy="18" r="1" fill="currentColor" /></Icon>
export const IconX = (p: P) => <Icon {...p}><path d="M6 6l12 12M18 6 6 18" /></Icon>
export const IconChevronLeft = (p: P) => <Icon {...p}><path d="M14.5 6 8.5 12l6 6" /></Icon>
export const IconChevronRight = (p: P) => <Icon {...p}><path d="M9.5 6l6 6-6 6" /></Icon>
export const IconExport = (p: P) => <Icon {...p}><path d="M12 15V3.5M7.5 8 12 3.5 16.5 8" /><path d="M4.5 13.5v5a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-5" /></Icon>
export const IconKey = (p: P) => <Icon {...p}><circle cx="8" cy="15" r="4.5" /><path d="M11.2 11.8 19.5 3.5M16 7l2.5 2.5M14 9l2 2" /></Icon>
export const IconLink = (p: P) => <Icon {...p}><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></Icon>
export const IconFile = (p: P) => <Icon {...p}><path d="M13.5 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8.5z" /><path d="M13.5 3.5v5h5" /></Icon>
export const IconAlert = (p: P) => <Icon {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5v5.5M12 16.2v.1" /></Icon>
