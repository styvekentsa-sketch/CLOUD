<?php

declare(strict_types=1);

namespace OCA\SDriveInstall\Controller;

use OCA\SDriveInstall\AppInfo\Application;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\Attribute\PublicPage;
use OCP\AppFramework\Http\DataDisplayResponse;
use OCP\AppFramework\Http\DataDownloadResponse;
use OCP\AppFramework\Http\NotFoundResponse;
use OCP\AppFramework\Http\Response;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\IRequest;
use OCP\IURLGenerator;
use OCP\IUserSession;
use OCP\Util;

/**
 * « Télécharger l'application » : page publique qui détecte l'appareil et
 * fournit le bon raccourci vers S-Drive (même adresse que celle utilisée
 * pour ouvrir la page : localhost sur le PC, IP du réseau local ailleurs).
 */
class InstallController extends Controller {
	private const NAME = 'S-Drive';

	public function __construct(
		IRequest $request,
		private IURLGenerator $url,
		private IUserSession $userSession,
	) {
		parent::__construct(Application::APP_ID, $request);
	}

	#[PublicPage]
	#[NoAdminRequired]
	#[NoCSRFRequired]
	public function index(): TemplateResponse {
		Util::addStyle(Application::APP_ID, 'install');
		Util::addScript(Application::APP_ID, 'install');

		$platform = $this->detect();
		$base = $this->baseUrl();
		$dl = fn (string $p) => $this->url->linkToRoute(Application::APP_ID . '.install.download', ['platform' => $p]);

		$response = new TemplateResponse(Application::APP_ID, 'install', [
			'platform' => $platform,
			'cloudUrl' => $base,
			'pageUrl' => $this->url->linkToRouteAbsolute(Application::APP_ID . '.install.index'),
			'secure' => $this->isSecureContext(),
			'iconUrl' => $this->url->linkToRoute(Application::APP_ID . '.install.icon'),
			'downloads' => [
				'windows' => $dl('windows'),
				'mac' => $dl('mac'),
				'linux' => $dl('linux'),
				'ios' => $dl('ios'),
			],
		], $this->userSession->isLoggedIn() ? TemplateResponse::RENDER_AS_USER : TemplateResponse::RENDER_AS_GUEST);
		return $response;
	}

	#[PublicPage]
	#[NoAdminRequired]
	#[NoCSRFRequired]
	public function download(string $platform): Response {
		$url = $this->baseUrl();
		return match ($platform) {
			'windows' => new DataDownloadResponse(
				"[InternetShortcut]\r\nURL={$url}\r\nIconIndex=0\r\nIconFile="
					. $this->url->getAbsoluteURL($this->url->linkToRoute('theming.Icon.getFavicon', ['app' => 'core'])) . "\r\n",
				self::NAME . '.url', 'application/octet-stream'),
			'mac' => new DataDownloadResponse(
				'<?xml version="1.0" encoding="UTF-8"?>' . "\n"
					. '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">' . "\n"
					. '<plist version="1.0"><dict><key>URL</key><string>' . $this->xml($url) . '</string></dict></plist>' . "\n",
				self::NAME . '.webloc', 'application/octet-stream'),
			'linux' => new DataDownloadResponse(
				"[Desktop Entry]\nType=Link\nName=" . self::NAME . "\nComment=Votre cloud privé\nURL={$url}\nIcon=folder-cloud\n",
				'S-Drive.desktop', 'application/octet-stream'),
			'ios' => new DataDownloadResponse($this->webClip($url), self::NAME . '.mobileconfig', 'application/x-apple-aspen-config'),
			default => new NotFoundResponse(),
		};
	}

	#[PublicPage]
	#[NoAdminRequired]
	#[NoCSRFRequired]
	public function icon(): Response {
		$png = $this->iconPng(180);
		if ($png === null) {
			return new NotFoundResponse();
		}
		$r = new DataDisplayResponse($png, Http::STATUS_OK, ['Content-Type' => 'image/png']);
		$r->cacheFor(86400);
		return $r;
	}

	/** Profil iOS/iPadOS « Web Clip » : ajoute l'icône S-Drive à l'écran d'accueil. */
	private function webClip(string $url): string {
		$icon = $this->iconPng(180);
		$uuid1 = $this->uuid('clip' . $url);
		$uuid2 = $this->uuid('profile' . $url);
		$u = $this->xml($url);
		$iconXml = $icon !== null ? '<key>Icon</key><data>' . base64_encode($icon) . '</data>' : '';
		return <<<XML
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>PayloadContent</key>
	<array>
		<dict>
			<key>FullScreen</key><true/>
			{$iconXml}
			<key>IsRemovable</key><true/>
			<key>Label</key><string>S-Drive</string>
			<key>Precomposed</key><true/>
			<key>URL</key><string>{$u}</string>
			<key>PayloadDisplayName</key><string>Icône S-Drive</string>
			<key>PayloadIdentifier</key><string>local.sdrive.webclip.{$uuid1}</string>
			<key>PayloadType</key><string>com.apple.webClip.managed</string>
			<key>PayloadUUID</key><string>{$uuid1}</string>
			<key>PayloadVersion</key><integer>1</integer>
		</dict>
	</array>
	<key>PayloadDescription</key><string>Ajoute S-Drive à l'écran d'accueil ({$u}).</string>
	<key>PayloadDisplayName</key><string>S-Drive</string>
	<key>PayloadIdentifier</key><string>local.sdrive.profile.{$uuid2}</string>
	<key>PayloadRemovalDisallowed</key><false/>
	<key>PayloadType</key><string>Configuration</string>
	<key>PayloadUUID</key><string>{$uuid2}</string>
	<key>PayloadVersion</key><integer>1</integer>
</dict>
</plist>
XML;
	}

	private function iconPng(int $size): ?string {
		$svg = __DIR__ . '/../../img/icon.svg';
		if (!extension_loaded('imagick') || !is_file($svg)) {
			return null;
		}
		try {
			$im = new \Imagick();
			$im->setBackgroundColor(new \ImagickPixel('transparent'));
			$im->setResolution(600, 600);
			$im->readImageBlob((string)file_get_contents($svg));
			$im->setImageFormat('png32');
			$im->resizeImage($size, $size, \Imagick::FILTER_LANCZOS, 1);
			return $im->getImageBlob();
		} catch (\Throwable $e) {
			return null;
		}
	}

	private function detect(): string {
		$ua = $this->request->getHeader('User-Agent');
		return match (true) {
			(bool)preg_match('/iPhone|iPad|iPod/i', $ua) => 'ios',
			(bool)preg_match('/Android/i', $ua) => 'android',
			(bool)preg_match('/Windows/i', $ua) => 'windows',
			(bool)preg_match('/Macintosh|Mac OS X/i', $ua) => 'mac',
			(bool)preg_match('/Linux|X11|CrOS/i', $ua) => 'linux',
			default => 'other',
		};
	}

	/** Installation « vraie application » possible : HTTPS ou localhost uniquement. */
	private function isSecureContext(): bool {
		$host = strtolower($this->request->getServerHost());
		$host = preg_replace('/:\d+$/', '', $host);
		return $this->request->getServerProtocol() === 'https'
			|| in_array($host, ['localhost', '127.0.0.1', '[::1]'], true);
	}

	private function baseUrl(): string {
		return rtrim($this->url->getAbsoluteURL('/'), '/') . '/';
	}

	private function uuid(string $seed): string {
		$h = md5($seed);
		return strtoupper(sprintf('%s-%s-%s-%s-%s', substr($h, 0, 8), substr($h, 8, 4), substr($h, 12, 4), substr($h, 16, 4), substr($h, 20, 12)));
	}

	private function xml(string $s): string {
		return htmlspecialchars($s, ENT_XML1 | ENT_QUOTES, 'UTF-8');
	}
}
