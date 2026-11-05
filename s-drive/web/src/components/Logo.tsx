// Logo S-Drive : pictogramme « disque » + nom, en blanc (sur fond bleu pétrole).
export function Logo({ height = 32, title = true }: { height?: number; title?: boolean }) {
	return (
		<svg height={height} viewBox="0 0 220 56" role={title ? 'img' : undefined} aria-label={title ? 'S-Drive' : undefined}
			aria-hidden={title ? undefined : true}>
			<g fill="none" stroke="#fff" strokeWidth={3}>
				<rect x="3" y="14" width="44" height="28" rx="5" />
				<path d="M12 28h14" strokeLinecap="round" />
			</g>
			<circle cx="37" cy="28" r="3.2" fill="#fff" />
			<text x="62" y="38" fill="#fff" fontFamily="'Segoe UI', 'Helvetica Neue', Arial, sans-serif"
				fontSize="29" fontWeight={600} letterSpacing="0.2">S-Drive</text>
		</svg>
	)
}

/** Version compacte de la barre du haut (même dessin, proportions ajustées). */
export function LogoHeader() {
	return (
		<svg height={28} viewBox="0 0 120 32" role="img" aria-label="S-Drive">
			<g fill="none" stroke="#fff" strokeWidth={2}>
				<rect x="2" y="8" width="26" height="16" rx="3" />
				<path d="M7.5 16h8" strokeLinecap="round" />
			</g>
			<circle cx="22" cy="16" r="1.9" fill="#fff" />
			<text x="37" y="22" fill="#fff" fontFamily="'Segoe UI', 'Helvetica Neue', Arial, sans-serif"
				fontSize="17" fontWeight={600} letterSpacing="0.2">S-Drive</text>
		</svg>
	)
}
