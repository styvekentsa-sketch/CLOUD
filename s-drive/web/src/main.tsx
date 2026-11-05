import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, RequireAuth } from './auth'
import { Login } from './pages/Login'
import { Register } from './pages/Register'
import { Dashboard } from './pages/Dashboard'
import { ComingSoon, Files, FILES_SUBPAGES } from './pages/Apps'
import './styles.css'

const page = (el: React.ReactNode) => <RequireAuth>{el}</RequireAuth>

createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<BrowserRouter>
			<AuthProvider>
				<Routes>
					<Route path="/connexion" element={<Login />} />
					<Route path="/inscription" element={<Register />} />
					<Route path="/tableau-de-bord" element={page(<Dashboard />)} />
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
			</AuthProvider>
		</BrowserRouter>
	</StrictMode>,
)
