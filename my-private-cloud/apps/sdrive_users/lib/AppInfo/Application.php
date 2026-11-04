<?php

declare(strict_types=1);

namespace OCA\SDriveUsers\AppInfo;

use OCA\SDriveUsers\Dashboard\UsersWidget;
use OCP\AppFramework\App;
use OCP\AppFramework\Bootstrap\IBootContext;
use OCP\AppFramework\Bootstrap\IBootstrap;
use OCP\AppFramework\Bootstrap\IRegistrationContext;

class Application extends App implements IBootstrap {
	public const APP_ID = 'sdrive_users';

	public function __construct() {
		parent::__construct(self::APP_ID);
	}

	public function register(IRegistrationContext $context): void {
		$context->registerDashboardWidget(UsersWidget::class);
	}

	public function boot(IBootContext $context): void {
	}
}
