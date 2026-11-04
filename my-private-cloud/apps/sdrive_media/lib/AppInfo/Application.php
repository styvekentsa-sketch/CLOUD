<?php

declare(strict_types=1);

namespace OCA\SDriveMedia\AppInfo;

use OCP\AppFramework\App;

class Application extends App {
	public const APP_ID = 'sdrive_media';

	public function __construct() {
		parent::__construct(self::APP_ID);
	}
}
