// S-Drive — bouton « Installer l'application » (PWA) quand le navigateur le permet
// (Chrome / Edge / Samsung Internet, en HTTPS ou sur localhost).
(function () {
	let deferred = null

	function ready(fn) {
		if (document.readyState !== 'loading') fn()
		else document.addEventListener('DOMContentLoaded', fn)
	}

	window.addEventListener('beforeinstallprompt', (event) => {
		event.preventDefault()
		deferred = event
		ready(() => {
			document.querySelectorAll('.sdi-pwa').forEach((el) => { el.hidden = false })
			document.querySelectorAll('.sdi-nopwa').forEach((el) => { el.hidden = true })
		})
	})

	window.addEventListener('appinstalled', () => {
		document.querySelectorAll('.sdi-pwa').forEach((el) => {
			el.innerHTML = '<p><strong>S-Drive est installé.</strong> Retrouvez-le dans vos applications.</p>'
		})
	})

	ready(() => {
		// iPadOS se présente comme un Mac : on le reconnaît à l'écran tactile
		const root = document.querySelector('.sdi')
		if (root && root.dataset.platform === 'mac' && navigator.maxTouchPoints > 1) {
			const ios = document.querySelector('.sdi-alt a[href*="/download/ios"]')
			if (ios) ios.classList.add('sdi-btn', 'sdi-primary')
		}

		const button = document.getElementById('sdi-install')
		if (button) {
			button.addEventListener('click', async () => {
				if (!deferred) return
				deferred.prompt()
				await deferred.userChoice
				deferred = null
			})
		}

		const url = document.getElementById('sdi-url')
		if (url) url.addEventListener('focus', () => url.select())
	})
})()
