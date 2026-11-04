<?php
/** @var array $_ */
$video = $_['kind'] === 'video';
$noun = $video ? 'vidéo' : 'fichier audio';
$nouns = $video ? 'vidéos' : 'fichiers audio';
?>
<div id="app-content" class="sdm">
	<header class="sdm-head">
		<div>
			<h2 class="sdm-title"><?php p($_['title']); ?></h2>
			<p class="sdm-meta">
				<?php p($_['count'] . ' ' . ($_['count'] > 1 ? $nouns : $noun) . ' · ' . $_['totalText']); ?>
				<?php if ($_['truncated']): ?> · affichage limité aux 1 000 plus récents<?php endif; ?>
			</p>
		</div>
		<form class="sdm-search" method="get" action="<?php p($_['action']); ?>">
			<input type="search" name="q" value="<?php p($_['q']); ?>"
				placeholder="Rechercher par nom…" aria-label="Rechercher par nom">
		</form>
	</header>

	<?php if ($_['count'] === 0): ?>
		<div class="sdm-empty">
			<img src="<?php p(image_path('sdrive_media', $video ? 'video-dark.svg' : 'audio-dark.svg')); ?>" alt="">
			<?php if ($_['q'] !== ''): ?>
				<p>Aucun résultat pour « <?php p($_['q']); ?> ».</p>
			<?php else: ?>
				<p>Aucun<?php p($video ? 'e vidéo' : ' fichier audio'); ?> pour l’instant.</p>
				<p class="sdm-hint">Envoyez vos fichiers dans <a href="<?php p($_['filesUrl']); ?>">Fichiers</a> : ils apparaîtront ici automatiquement, quel que soit le dossier.</p>
			<?php endif; ?>
		</div>

	<?php elseif ($video): ?>
		<ul class="sdm-grid">
			<?php foreach ($_['items'] as $item): ?>
				<li>
					<a class="sdm-card" href="<?php p($item['open']); ?>" title="<?php p($item['name']); ?>">
						<span class="sdm-thumb" style="background-image: url('<?php p($item['preview']); ?>')">
							<span class="sdm-play" aria-hidden="true"></span>
						</span>
						<span class="sdm-name"><?php p($item['name']); ?></span>
						<span class="sdm-sub"><?php p($item['dir'] . ' · ' . $item['sizeText'] . ' · ' . $item['dateText']); ?></span>
					</a>
				</li>
			<?php endforeach; ?>
		</ul>

	<?php else: ?>
		<table class="sdm-table">
			<thead>
				<tr><th>Nom</th><th>Dossier</th><th class="num">Taille</th><th class="num">Modifié</th></tr>
			</thead>
			<tbody>
				<?php foreach ($_['items'] as $item): ?>
					<tr>
						<td><a href="<?php p($item['open']); ?>" class="sdm-track"><span class="sdm-note" aria-hidden="true"></span><?php p($item['name']); ?></a></td>
						<td class="sdm-dim"><?php p($item['dir']); ?></td>
						<td class="num sdm-dim"><?php p($item['sizeText']); ?></td>
						<td class="num sdm-dim"><?php p($item['dateText']); ?></td>
					</tr>
				<?php endforeach; ?>
			</tbody>
		</table>
	<?php endif; ?>
</div>
