<?php

declare(strict_types=1);

namespace OCA\SDriveMedia\Controller;

use OCA\SDriveMedia\AppInfo\Application;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\Files\File;
use OCP\Files\IRootFolder;
use OCP\IRequest;
use OCP\IURLGenerator;
use OCP\IUserSession;
use OCP\Util;

/**
 * Pages « Vidéos » et « Audio » : tous les fichiers du type demandé,
 * du plus récent au plus ancien, avec recherche par nom.
 * La lecture se fait dans le lecteur intégré de Nextcloud (app Fichiers).
 */
class PageController extends Controller {
	private const MAX_ITEMS = 1000;

	public function __construct(
		IRequest $request,
		private IRootFolder $rootFolder,
		private IUserSession $userSession,
		private IURLGenerator $url,
	) {
		parent::__construct(Application::APP_ID, $request);
	}

	#[NoAdminRequired]
	#[NoCSRFRequired]
	public function video(string $q = ''): TemplateResponse {
		return $this->page('video', $q);
	}

	#[NoAdminRequired]
	#[NoCSRFRequired]
	public function audio(string $q = ''): TemplateResponse {
		return $this->page('audio', $q);
	}

	private function page(string $kind, string $q): TemplateResponse {
		Util::addStyle(Application::APP_ID, 'media');

		$user = $this->userSession->getUser();
		$home = $this->rootFolder->getUserFolder($user->getUID());
		$q = trim($q);

		$items = [];
		$totalSize = 0;
		foreach ($home->searchByMime($kind) as $node) {
			if (!$node instanceof File) {
				continue;
			}
			if ($q !== '' && mb_stripos($node->getName(), $q) === false) {
				continue;
			}
			$id = $node->getId();
			$relative = $home->getRelativePath($node->getPath()) ?? '';
			$dir = trim(dirname($relative), '/.');
			$items[] = [
				'name' => $node->getName(),
				'dir' => $dir === '' ? 'Dossier principal' : $dir,
				'size' => $node->getSize(),
				'mtime' => $node->getMTime(),
				'open' => $this->url->linkToRoute('files.View.showFile', ['fileid' => $id]),
				'preview' => $kind === 'video'
					? $this->url->linkToRoute('core.Preview.getPreviewByFileId', ['fileId' => $id, 'x' => 480, 'y' => 270, 'a' => 1])
					: '',
			];
			$totalSize += $node->getSize();
		}
		usort($items, fn (array $a, array $b) => $b['mtime'] <=> $a['mtime']);
		$truncated = count($items) > self::MAX_ITEMS;
		$items = array_slice($items, 0, self::MAX_ITEMS);

		foreach ($items as &$item) {
			$item['sizeText'] = self::size($item['size']);
			$item['dateText'] = date('d/m/Y', $item['mtime']);
		}
		unset($item);

		return new TemplateResponse(Application::APP_ID, 'page', [
			'kind' => $kind,
			'title' => $kind === 'video' ? 'Vidéos' : 'Audio',
			'items' => $items,
			'count' => count($items),
			'totalText' => self::size($totalSize),
			'truncated' => $truncated,
			'q' => $q,
			'action' => $this->url->linkToRoute(Application::APP_ID . '.page.' . $kind),
			'filesUrl' => $this->url->linkToRoute('files.view.index'),
		]);
	}

	private static function size(int $bytes): string {
		$units = ['o', 'Ko', 'Mo', 'Go', 'To'];
		$i = 0;
		$v = (float)$bytes;
		while ($v >= 1024 && $i < count($units) - 1) {
			$v /= 1024;
			$i++;
		}
		return ($i === 0 ? (string)$bytes : number_format($v, $v < 10 ? 1 : 0, ',', ' ')) . ' ' . $units[$i];
	}
}
