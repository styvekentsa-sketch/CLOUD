import { useState, type InputHTMLAttributes, type ReactNode } from 'react'
import { Logo } from './Logo'
import { IconAlert, IconEye, IconEyeOff } from './Icons'

/** Mise en page des pages « invité » : logo centré, carte, bandeau en bas. */
export function GuestLayout({ children }: { children: ReactNode }) {
	return (
		<div className="guest">
			<main className="guest-main">
				<div className="guest-logo"><Logo height={56} /></div>
				<div className="guest-box">{children}</div>
			</main>
			<footer className="guest-footer">
				<strong>S-Drive</strong> – Votre cloud privé et sécurisé
			</footer>
		</div>
	)
}

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
	label: string
	error?: string
	hint?: string
}

/** Champ à étiquette flottante (comme sur la page de connexion actuelle). */
export function Field({ label, error, hint, id, type = 'text', ...rest }: FieldProps) {
	const [show, setShow] = useState(false)
	const isPassword = type === 'password'
	const inputId = id ?? `f-${label.replace(/\W+/g, '-').toLowerCase()}`
	return (
		<div className={`field${error ? ' field--error' : ''}`}>
			<div className="field-box">
				<input id={inputId} type={isPassword && show ? 'text' : type} placeholder=" "
					aria-invalid={error ? true : undefined}
					aria-describedby={error || hint ? `${inputId}-msg` : undefined} {...rest} />
				<label htmlFor={inputId}>{label}</label>
				{isPassword && (
					<button type="button" className="field-eye" onClick={() => setShow((s) => !s)}
						aria-label={show ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}>
						{show ? <IconEyeOff /> : <IconEye />}
					</button>
				)}
			</div>
			{error?.trim() ? (
				<p className="field-msg field-msg--error" id={`${inputId}-msg`}><IconAlert size={18} /><span>{error}</span></p>
			) : hint ? (
				<p className="field-msg" id={`${inputId}-msg`}>{hint}</p>
			) : null}
		</div>
	)
}

export function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
	return (
		<label className="checkbox">
			<input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
			<span className="checkbox-box" aria-hidden="true" />
			<span>{label}</span>
		</label>
	)
}
