import { StrictMode, useEffect, useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, RequireAuth, useAuth } from './auth'
import { ToastProvider } from './components/ui'
import { Login } from './pages/Login'
import { Register } from './pages/Register'
import { Dashboard } from './pages/Dashboard'
import { ComingSoon, Files, FILES_SUBPAGES } from './pages/Apps'
import { Users } from './pages/admin/Users'
import { Sessions } from './pages/admin/Sessions'
import { Journal } from './pages/admin/Journal'
import { System } from './pages/admin/System'
import { Shares } from './pages/admin/Shares'
import { Settings } from './pages/admin/Settings'
import './styles.css'
import './admin.css'
import { applyPrefs, localPrefs } from './prefs'

// Thème et affichage appliqués avant le premier rendu (pas de « flash » de thème)
applyPrefs(localPrefs())

/** Redessine les pages quand les paramètres personnels changent (format des dates…). */
function PrefsRefresher({ children }: { children: () => ReactNode }) {
	const [, bump] = useState(0)
	useEffect(() => {
		const on = () => bump((n) => n + 1)
		window.addEventListener('sdrive:prefs', on)
		return () => window.removeEventListener('sdrive:prefs', on)
	}, [])
	return <>{children()}</>
}

const page = (el: ReactNode) => <RequireAuth>{el}</RequireAuth>

/** Pages d'administration : réservées aux administrateurs. */
function AdminOnly({ children }: { children: ReactNode }) {
	const { user } = useAuth()
	if (user?.role !== 'admin') return <Navigate to="/tableau-de-bord" replace />
	return <>{children}</>
}
const admin = (el: ReactNode) => page(<AdminOnly>{el}</AdminOnly>)

createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<BrowserRouter>
			<AuthProvider>
				<ToastProvider>
					<PrefsRefresher>{() => (
					<Routes>
						<Route path="/connexion" element={<Login />} />
						<Route path="/inscription" element={<Register />} />
						<Route path="/login" element={<Navigate to="/connexion" replace />} />
						<Route path="/tableau-de-bord" element={page(<Dashboard />)} />
						<Route path="/tableau-de-bord/comptes" element={admin(<Users />)} />
						<Route path="/tableau-de-bord/sessions" element={admin(<Sessions />)} />
						<Route path="/tableau-de-bord/partages" element={admin(<Shares />)} />
						<Route path="/tableau-de-bord/journal" element={admin(<Journal />)} />
						<Route path="/tableau-de-bord/systeme" element={admin(<System />)} />
						<Route path="/tableau-de-bord/parametres" element={admin(<Settings />)} />
						<Route path="/fichiers" element={page(<Files />)} />
						{FILES_SUBPAGES.map((p) => (
							<Route key={p.path} path={p.path} element={page(<Files title={p.title} />)} />
						))}
						<Route path="/photos" element={page(<ComingSoon app="photos" />)} />
						<Route path="/activite" element={page(<ComingSoon app="activite" />)} />
						<Route path="/videos" element={page(<ComingSoon app="videos" />)} />
						<Route path="/audio" element={page(<ComingSoon app="audio" />)} />
						<Route path="/application" element={page(<ComingSoon app="application" />)} />
						<Route path="*" element={<Navigate to="/tableau-de-bord" replace />} />
					</Routes>
					)}</PrefsRefresher>
				</ToastProvider>
			</AuthProvider>
		</BrowserRouter>
	</StrictMode>,
)
