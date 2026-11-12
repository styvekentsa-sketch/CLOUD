import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { api, ApiError, type ServerConfig, type User } from './api'
import { MaintenanceScreen } from './components/MaintenanceScreen'

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
}

const AuthContext = createContext<AuthState | null>(null)

const isMaintenance = (e: unknown) => e instanceof ApiError && e.status === 503 && e.code === 'maintenance'

export function AuthProvider({ children }: { children: ReactNode }) {
	const [user, setUser] = useState<User | null>(null)
	const [config, setConfig] = useState<ServerConfig | null>(null)
	const [loading, setLoading] = useState(true)
	const [maintenance, setMaintenance] = useState({ blocked: false, message: '' })

	useEffect(() => {
		Promise.allSettled([api.me(), api.config()]).then(([me, cfg]) => {
			if (me.status === 'fulfilled') setUser(me.value.user)
			else if (isMaintenance(me.reason)) setMaintenance({ blocked: true, message: (me.reason as ApiError).message })
			if (cfg.status === 'fulfilled') setConfig(cfg.value)
			setLoading(false)
		})
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
			if (!(e instanceof ApiError)) throw e
		}
		setUser(null)
		setMaintenance({ blocked: false, message: '' })
	}, [])

	const value = useMemo(
		() => ({ user, config, loading, maintenance, setUser, logout, refreshConfig, retry }),
		[user, config, loading, maintenance, logout, refreshConfig, retry],
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
