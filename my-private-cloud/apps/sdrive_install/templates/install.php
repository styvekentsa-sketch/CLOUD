<?php
/** @var array $_ */
$p = $_['platform'];
$d = $_['downloads'];
$desktop = in_array($p, ['windows', 'mac', 'linux', 'other'], true);
$labels = ['windows' => 'Windows', 'mac' => 'Mac', 'linux' => 'Linux', 'ios' => 'iPhone / iPad', 'android' => 'Android', 'other' => 'cet appareil'];
$ext = ['windows' => '.url', 'mac' => '.webloc', 'linux' => '.desktop'];
?>
<div id="app-content" class="sdi" data-platform="<?php p($p); ?>">
	<div class="sdi-wrap">

		<header class="sdi-head">
			<img class="sdi-logo" src="<?php p($_['iconUrl']); ?>" alt="" width="64" height="64">
			<div>
				<h2>Installer S-Drive</h2>
				<p>Ouvrez votre cloud en un clic, comme une application. Appareil détecté : <strong><?php p($labels[$p]); ?></strong></p>
			</div>
		</header>

		<section class="sdi-card sdi-main">
			<?php if ($desktop): ?>
				<h3>Sur cet ordinateur</h3>

				<div class="sdi-pwa" hidden>
					<button type="button" class="sdi-btn sdi-primary" id="sdi-install">Installer l'application S-Drive</button>
					<p class="sdi-note">S-Drive s'ouvrira dans sa propre fenêtre, avec une icône dans le menu Démarrer / le Dock.</p>
				</div>

				<?php if ($p !== 'other'): ?>
					<a class="sdi-btn <?php p($_['secure'] ? '' : 'sdi-primary'); ?>" href="<?php p($d[$p]); ?>">Télécharger le raccourci (<?php p($ext[$p]); ?>)</a>
					<ol class="sdi-steps">
						<li>Ouvrez le dossier <strong>Téléchargements</strong>.</li>
						<li>Faites glisser <strong>S-Drive<?php p($ext[$p]); ?></strong> sur le <strong>Bureau</strong><?php if ($p === 'windows'): ?> (ou clic droit → <em>Épingler à l'écran de démarrage</em>)<?php endif; ?>.</li>
						<li>Double-cliquez dessus : S-Drive s'ouvre dans votre navigateur.</li>
					</ol>
					<?php if ($p === 'windows'): ?>
						<p class="sdi-note">Si le navigateur demande confirmation pour ce type de fichier, choisissez <em>Conserver</em> : c'est un simple lien vers S-Drive.</p>
					<?php endif; ?>
				<?php endif; ?>

				<p class="sdi-note sdi-nopwa">
					<?php if ($_['secure']): ?>
						Le bouton « Installer l'application » apparaît dans <strong>Chrome</strong> et <strong>Edge</strong>. Sinon : menu <strong>⋮</strong> → <em>Caster, enregistrer et partager</em> → <em>Installer la page en tant qu'application</em>.
					<?php else: ?>
						L'installation en fenêtre séparée n'est possible qu'en HTTPS : depuis ce PC serveur, ouvrez <strong>http://localhost:8081</strong> pour l'avoir.
					<?php endif; ?>
				</p>

			<?php elseif ($p === 'ios'): ?>
				<h3>Sur cet iPhone / iPad</h3>
				<a class="sdi-btn sdi-primary" href="<?php p($d['ios']); ?>">Ajouter l'icône S-Drive</a>
				<ol class="sdi-steps">
					<li>Ouvrez cette page dans <strong>Safari</strong>, touchez le bouton ci-dessus, puis <strong>Autoriser</strong>.</li>
					<li>Allez dans <strong>Réglages</strong> → <strong>Profil téléchargé</strong> (en haut).</li>
					<li>Touchez <strong>Installer</strong> (2 fois). L'icône S-Drive apparaît sur l'écran d'accueil.</li>
				</ol>
				<p class="sdi-note">Autre méthode, sans profil : dans Safari, touchez <strong>Partager</strong> <span aria-hidden="true">⬆</span> → <strong>Sur l'écran d'accueil</strong> → <strong>Ajouter</strong>.</p>

			<?php else: ?>
				<h3>Sur ce téléphone Android</h3>
				<div class="sdi-pwa" hidden>
					<button type="button" class="sdi-btn sdi-primary" id="sdi-install">Installer l'application S-Drive</button>
				</div>
				<ol class="sdi-steps">
					<li>Dans <strong>Chrome</strong>, touchez le menu <strong>⋮</strong> en haut à droite.</li>
					<li>Touchez <strong>Ajouter à l'écran d'accueil</strong> (ou <em>Installer l'application</em>).</li>
					<li>Touchez <strong>Ajouter</strong> : l'icône S-Drive apparaît sur votre écran d'accueil.</li>
				</ol>
				<p class="sdi-note">Sur Samsung Internet : menu <strong>≡</strong> → <strong>Ajouter la page à</strong> → <strong>Écran d'accueil</strong>.</p>
			<?php endif; ?>
		</section>

		<section class="sdi-card">
			<h3>Sur un autre appareil</h3>
			<p>Ouvrez cette adresse sur l'appareil (connecté au même Wi-Fi), puis suivez les instructions :</p>
			<input class="sdi-url" type="text" readonly value="<?php p($_['pageUrl']); ?>" aria-label="Adresse de cette page" id="sdi-url">
			<p class="sdi-alt">Ou téléchargez directement :
				<a href="<?php p($d['windows']); ?>">Windows</a> ·
				<a href="<?php p($d['mac']); ?>">Mac</a> ·
				<a href="<?php p($d['linux']); ?>">Linux</a> ·
				<a href="<?php p($d['ios']); ?>">iPhone / iPad</a>
			</p>
		</section>

		<section class="sdi-card">
			<h3>Synchronisation automatique</h3>
			<p>Pour envoyer automatiquement vos photos ou synchroniser un dossier, installez l'application officielle (elle s'appelle « Nextcloud » et se connecte à S-Drive avec l'adresse <strong><?php p($_['cloudUrl']); ?></strong>) :</p>
			<p class="sdi-alt">
				<a href="https://play.google.com/store/apps/details?id=com.nextcloud.client" rel="noreferrer noopener" target="_blank">Android</a> ·
				<a href="https://apps.apple.com/app/nextcloud/id1125420102" rel="noreferrer noopener" target="_blank">iPhone / iPad</a> ·
				<a href="https://nextcloud.com/install/#install-clients" rel="noreferrer noopener" target="_blank">Windows / Mac / Linux</a>
			</p>
		</section>

	</div>
</div>
