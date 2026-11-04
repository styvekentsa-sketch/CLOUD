<?php

declare(strict_types=1);

namespace OCA\SDriveInstall\AppInfo;

use OCP\AppFramework\App;

class Application extends App {
	public const APP_ID = 'sdrive_install';

	public function __construct() {
		parent::__construct(self::APP_ID);
	}
}
