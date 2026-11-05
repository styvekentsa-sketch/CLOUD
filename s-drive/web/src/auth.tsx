import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { api, ApiError, type ServerConfig, type User } from './api'

type AuthState = {
	user: User | null
	config: ServerConfig | null
	loading: boolean
	setUser: (u: User | null) => void
	logout: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
	const [user, setUser] = useState<User | null>(null)
	const [config, setConfig] = useState<ServerConfig | null>(null)
	const [loading, setLoading] = useState(true)

	useEffect(() => {
		Promise.allSettled([api.me(), api.config()]).then(([me, cfg]) => {
			if (me.status === 'fulfilled') setUser(me.value.user)
			if (cfg.status === 'fulfilled') setConfig(cfg.value)
			setLoading(false)
		})
	}, [])

	const logout = useCallback(async () => {
		try {
			await api.logout()
		} catch (e) {
			if (!(e instanceof ApiError)) throw e
		}
		setUser(null)
	}, [])

	const value = useMemo(() => ({ user, config, loading, setUser, logout }), [user, config, loading, logout])
	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
	const ctx = useContext(AuthContext)
	if (!ctx) throw new Error('useAuth hors de AuthProvider')
	return ctx
}

/** Page réservée aux personnes connectées : sinon, retour à la connexion. */
export function RequireAuth({ children }: { children: ReactNode }) {
	const { user, loading } = useAuth()
	const location = useLocation()
	if (loading) return <div className="boot" aria-busy="true" />
	if (!user) return <Navigate to="/connexion" replace state={{ from: location.pathname }} />
	return <>{children}</>
}
