import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { api, ApiError, type ServerConfig, type User } from './api'
import { MaintenanceScreen } from './components/MaintenanceScreen'
import { applyPrefs, resetLocalPrefs, withDefaults } from './prefs'

type AuthState = {
	user: User | null
	config: ServerConfig | null
	loading: boolean
	/** Mode maintenance : ce compte (non administrateur) est suspendu */
	maintenance: { blocked: boolean; message: string }
	setUser: (u: User | null) => void
	logout: () => Promise<void>
	refreshConfig: () => Promise<void>
	/** Nouvelle tentative après une maintenance */
	retry: () => Promise<boolean>
	/** Vrai juste après une déconnexion volontaire (message sur la page de connexion) */
	loggedOutNotice: boolean
	clearLoggedOutNotice: () => void
}

const AuthContext = createContext<AuthState | null>(null)

const isMaintenance = (e: unknown) => e instanceof ApiError && e.status === 503 && e.code === 'maintenance'

export function AuthProvider({ children }: { children: ReactNode }) {
	const [user, setUser] = useState<User | null>(null)
	const [config, setConfig] = useState<ServerConfig | null>(null)
	const [loading, setLoading] = useState(true)
	const [maintenance, setMaintenance] = useState({ blocked: false, message: '' })
	const [loggedOutNotice, setLoggedOutNotice] = useState(false)
	const clearLoggedOutNotice = useCallback(() => setLoggedOutNotice(false), [])
	// Nouvelle connexion : le message de déconnexion n’a plus lieu d’être
	useEffect(() => { if (user) setLoggedOutNotice(false) }, [user])

	useEffect(() => {
		Promise.allSettled([api.me(), api.config()]).then(([me, cfg]) => {
			if (me.status === 'fulfilled') setUser(me.value.user)
			else if (isMaintenance(me.reason)) setMaintenance({ blocked: true, message: (me.reason as ApiError).message })
			if (cfg.status === 'fulfilled') setConfig(cfg.value)
			setLoading(false)
		})
	}, [])

	// Paramètres personnels du compte connecté (thème, densité, dates…)
	useEffect(() => {
		if (!user) return
		api.preferences().then(({ preferences }) => applyPrefs(withDefaults(preferences))).catch(() => {})
	}, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

	// Bouton « Précédent » après une déconnexion : une page restaurée depuis le cache du
	// navigateur (bfcache) serait un instantané de l’époque où l’on était connecté.
	// On la recharge pour revérifier la session auprès du serveur.
	useEffect(() => {
		const onShow = (e: PageTransitionEvent) => { if (e.persisted) window.location.reload() }
		window.addEventListener('pageshow', onShow)
		return () => window.removeEventListener('pageshow', onShow)
	}, [])

	// Maintenance activée pendant la navigation (n'importe quel appel répond 503)
	useEffect(() => {
		const on = (e: Event) => setMaintenance({ blocked: true, message: String((e as CustomEvent).detail ?? '') })
		window.addEventListener('sdrive:maintenance', on)
		return () => window.removeEventListener('sdrive:maintenance', on)
	}, [])

	const refreshConfig = useCallback(async () => {
		try {
			setConfig(await api.config())
		} catch {
			/* garde la configuration précédente */
		}
	}, [])

	const retry = useCallback(async () => {
		try {
			const { user } = await api.me()
			setUser(user)
			setMaintenance({ blocked: false, message: '' })
			void refreshConfig()
			return true
		} catch (e) {
			if (!isMaintenance(e)) {
				setMaintenance({ blocked: false, message: '' })
				setUser(null)
				return true
			}
			return false
		}
	}, [refreshConfig])

	const logout = useCallback(async () => {
		try {
			await api.logout()
		} catch (e) {
			// Session déjà expirée côté serveur (401) : rien à fermer, on continue.
			// Serveur injoignable ou en erreur : on ne fait PAS semblant d’être déconnecté.
			if (!(e instanceof ApiError) || e.status === 0 || e.status >= 500) throw e
		}
		setLoggedOutNotice(true)
		setUser(null)
		setMaintenance({ blocked: false, message: '' })
		resetLocalPrefs() // appareil partagé : la personne suivante n’hérite pas de vos réglages
	}, [])

	const value = useMemo(
		() => ({ user, config, loading, maintenance, setUser, logout, refreshConfig, retry, loggedOutNotice, clearLoggedOutNotice }),
		[user, config, loading, maintenance, logout, refreshConfig, retry, loggedOutNotice, clearLoggedOutNotice],
	)
	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
	const ctx = useContext(AuthContext)
	if (!ctx) throw new Error('useAuth hors de AuthProvider')
	return ctx
}

/** Page réservée aux personnes connectées : sinon, retour à la connexion (ou écran de maintenance). */
export function RequireAuth({ children }: { children: ReactNode }) {
	const { user, loading, maintenance } = useAuth()
	const location = useLocation()
	if (loading) return <div className="boot" aria-busy="true" />
	if (maintenance.blocked && user?.role !== 'admin') return <MaintenanceScreen />
	if (!user) return <Navigate to="/connexion" replace state={{ from: location.pathname }} />
	return <>{children}</>
}
