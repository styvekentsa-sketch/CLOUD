import { useEffect, useState } from 'react'
import { api, ApiError } from '../../api'
import { applyPrefs, withDefaults, type PersonalPrefs } from '../../prefs'
import { Dialog, Segmented, useToast } from '../ui'

function Toggle({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
	return (
		<label className="pref-toggle">
			<span>
				<strong>{label}</strong>
				<span className="muted">{hint}</span>
			</span>
			<span className="switch switch--small">
				<input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
				<span className="switch-track" aria-hidden="true"><span className="switch-thumb" /></span>
			</span>
		</label>
	)
}

/** « Paramètres personnels » : apparence, notifications, langue et affichage. */
export function PreferencesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
	const toast = useToast()
	const [saved, setSaved] = useState<PersonalPrefs | null>(null)
	const [draft, setDraft] = useState<PersonalPrefs | null>(null)
	const [busy, setBusy] = useState(false)

	useEffect(() => {
		if (!open) return
		api.preferences()
			.then(({ preferences }) => {
				const p = withDefaults(preferences)
				setSaved(p)
				setDraft(p)
			})
			.catch(() => toast('Impossible de charger vos paramètres.', 'critical'))
	}, [open, toast])

	// Aperçu immédiat de l'apparence ; annulé si on ferme sans enregistrer
	useEffect(() => { if (open && draft) applyPrefs(draft) }, [open, draft])
	const cancel = () => {
		if (saved) applyPrefs(saved)
		onClose()
	}

	const save = async () => {
		if (!draft) return
		setBusy(true)
		try {
			await api.savePreferences({ appearance: draft.appearance, notifications: draft.notifications, display: draft.display })
			setSaved(draft)
			applyPrefs(draft)
			toast('Paramètres personnels enregistrés.')
			onClose()
		} catch (e) {
			toast(e instanceof ApiError ? e.message : 'Enregistrement impossible.', 'critical')
		} finally {
			setBusy(false)
		}
	}

	const set = <S extends keyof PersonalPrefs, K extends keyof PersonalPrefs[S]>(section: S, key: K, value: PersonalPrefs[S][K]) =>
		setDraft((d) => (d ? { ...d, [section]: { ...d[section], [key]: value } } : d))
	const dirty = !!(draft && saved && JSON.stringify(draft) !== JSON.stringify(saved))

	return (
		<Dialog open={open} onClose={cancel} title="Paramètres personnels" wide
			footer={<>
				<button type="button" className="btn btn-ghost" onClick={cancel}>Annuler</button>
				<button type="button" className="btn btn-primary" onClick={save} disabled={busy || !dirty}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
			</>}>
			{!draft ? <p className="muted">Chargement…</p> : (
				<div className="prefs">
					<section>
						<h3>Apparence</h3>
						<div className="pref-row">
							<span><strong>Thème</strong><span className="muted">« Système » suit le réglage de votre appareil.</span></span>
							<Segmented label="Thème" value={draft.appearance.theme} onChange={(v) => set('appearance', 'theme', v)}
								options={[{ value: 'system', label: 'Système' }, { value: 'dark', label: 'Sombre' }, { value: 'light', label: 'Clair' }]} />
						</div>
						<div className="pref-row">
							<span><strong>Densité</strong><span className="muted">« Compacte » affiche plus de lignes dans les tableaux et listes.</span></span>
							<Segmented label="Densité" value={draft.appearance.density} onChange={(v) => set('appearance', 'density', v)}
								options={[{ value: 'comfortable', label: 'Confortable' }, { value: 'compact', label: 'Compacte' }]} />
						</div>
						<Toggle label="Réduire les animations" hint="Supprime les transitions et effets de mouvement."
							checked={draft.appearance.reduceMotion} onChange={(v) => set('appearance', 'reduceMotion', v)} />
					</section>

					<section>
						<h3>Notifications</h3>
						<p className="muted pref-note">Vos choix sont enregistrés ; les envois se feront par la cloche (en haut à droite) et par e-mail dès que ces canaux seront activés sur S-Drive.</p>
						<Toggle label="Connexion depuis un nouvel appareil" hint="Pour repérer tout accès inhabituel à votre compte."
							checked={draft.notifications.newLogin} onChange={(v) => set('notifications', 'newLogin', v)} />
						<Toggle label="Espace de stockage presque plein" hint="Quand vous dépassez 80 % de votre quota."
							checked={draft.notifications.storageWarning} onChange={(v) => set('notifications', 'storageWarning', v)} />
						<Toggle label="Partages" hint="Quand quelqu’un partage un fichier ou un dossier avec vous."
							checked={draft.notifications.shares} onChange={(v) => set('notifications', 'shares', v)} />
						<Toggle label="Résumé hebdomadaire" hint="Un récapitulatif de l’activité de votre espace chaque lundi."
							checked={draft.notifications.weeklySummary} onChange={(v) => set('notifications', 'weeklySummary', v)} />
					</section>

					<section>
						<h3>Langue et affichage</h3>
						<div className="pref-row">
							<span><strong>Langue</strong><span className="muted">D’autres langues seront proposées plus tard.</span></span>
							<select value={draft.display.language} onChange={(e) => set('display', 'language', e.target.value as 'fr')} aria-label="Langue">
								<option value="fr">Français</option>
							</select>
						</div>
						<div className="pref-row">
							<span><strong>Page d’accueil</strong><span className="muted">Ce que vous voyez après la connexion.</span></span>
							<Segmented label="Page d’accueil" value={draft.display.startPage} onChange={(v) => set('display', 'startPage', v)}
								options={[{ value: 'dashboard', label: 'Tableau de bord' }, { value: 'files', label: 'Fichiers' }]} />
						</div>
						<div className="pref-row">
							<span><strong>Dates</strong><span className="muted">Exemple : {draft.display.dateFormat === 'relative' ? '« il y a 5 min »' : '« 12 nov. 2026, 14:05 »'}</span></span>
							<Segmented label="Format des dates" value={draft.display.dateFormat} onChange={(v) => set('display', 'dateFormat', v)}
								options={[{ value: 'relative', label: 'Relatives' }, { value: 'absolute', label: 'Date et heure' }]} />
						</div>
					</section>
				</div>
			)}
		</Dialog>
	)
}
