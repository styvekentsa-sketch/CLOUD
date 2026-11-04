<?php

declare(strict_types=1);

namespace OCA\SDriveUsers\Dashboard;

use OCA\SDriveUsers\AppInfo\Application;
use OCP\Dashboard\IAPIWidgetV2;
use OCP\Dashboard\IButtonWidget;
use OCP\Dashboard\IConditionalWidget;
use OCP\Dashboard\IIconWidget;
use OCP\Dashboard\IReloadableWidget;
use OCP\Dashboard\Model\WidgetButton;
use OCP\Dashboard\Model\WidgetItem;
use OCP\Dashboard\Model\WidgetItems;
use OCP\Files\IRootFolder;
use OCP\IGroupManager;
use OCP\IURLGenerator;
use OCP\IUser;
use OCP\IUserManager;
use OCP\IUserSession;
use OCP\UserStatus\IManager as IUserStatusManager;
use OCP\UserStatus\IUserStatus;
use OCP\Util;
use Psr\Log\LoggerInterface;

/**
 * Widget "Comptes S-Drive" — réservé aux administrateurs.
 * Une ligne de synthèse, puis un compte par ligne : présence, dernière
 * connexion, espace utilisé / quota, groupes.
 */
class UsersWidget implements IAPIWidgetV2, IIconWidget, IButtonWidget, IConditionalWidget, IReloadableWidget {

	public function __construct(
		private IUserManager $userManager,
		private IGroupManager $groupManager,
		private IUserSession $userSession,
		private IUserStatusManager $statusManager,
		private IRootFolder $rootFolder,
		private IURLGenerator $url,
		private LoggerInterface $logger,
	) {
	}

	public function getId(): string {
		return Application::APP_ID;
	}

	public function getTitle(): string {
		return 'Comptes S-Drive';
	}

	public function getOrder(): int {
		return 1;
	}

	public function getIconClass(): string {
		return 'icon-user';
	}

	public function getIconUrl(): string {
		return $this->url->getAbsoluteURL($this->url->imagePath(Application::APP_ID, 'app-dark.svg'));
	}

	public function getUrl(): ?string {
		return $this->usersPage();
	}

	public function load(): void {
		// Widget rendu nativement par le tableau de bord (API v2) : aucun script.
	}

	public function isEnabled(): bool {
		$user = $this->userSession->getUser();
		return $user !== null && $this->groupManager->isAdmin($user->getUID());
	}

	public function getReloadInterval(): int {
		return 60;
	}

	public function getWidgetButtons(string $userId): array {
		return [
			new WidgetButton(WidgetButton::TYPE_NEW, $this->usersPage(), 'Ajouter un compte'),
			new WidgetButton(WidgetButton::TYPE_MORE, $this->usersPage(), 'Gérer les comptes'),
		];
	}

	public function getItemsV2(string $userId, ?string $since = null, int $limit = 7): WidgetItems {
		if (!$this->groupManager->isAdmin($userId)) {
			return new WidgetItems([], 'Réservé aux administrateurs');
		}

		/** @var IUser[] $users */
		$users = [];
		$this->userManager->callForAllUsers(function (IUser $u) use (&$users): void {
			$users[$u->getUID()] = $u;
		});
		if ($users === []) {
			return new WidgetItems([], 'Aucun compte');
		}

		$statuses = [];
		try {
			$statuses = $this->statusManager->getUserStatuses(array_keys($users));
		} catch (\Throwable $e) {
			$this->logger->debug('Statuts indisponibles', ['exception' => $e]);
		}

		$todayStart = (new \DateTimeImmutable('today'))->getTimestamp();
		$rows = [];
		$online = 0;
		$activeToday = 0;
		$totalUsed = 0;

		foreach ($users as $uid => $user) {
			$status = $this->statusOf($statuses[$uid] ?? null);
			$lastLogin = $user->getLastLogin();
			$used = $this->usedSpace($user);
			$totalUsed += $used;
			if ($status === IUserStatus::ONLINE) {
				$online++;
			}
			if ($lastLogin >= $todayStart) {
				$activeToday++;
			}
			$rows[] = [
				'user' => $user,
				'status' => $status,
				'lastLogin' => $lastLogin,
				'used' => $used,
				'rank' => match ($status) {
					IUserStatus::ONLINE => 0,
					IUserStatus::AWAY, IUserStatus::DND, IUserStatus::BUSY => 1,
					default => 2,
				},
			];
		}

		// En ligne d'abord, puis par dernière connexion (la plus récente en haut)
		usort($rows, fn (array $a, array $b) => [$a['rank'], -$a['lastLogin']] <=> [$b['rank'], -$b['lastLogin']]);

		$count = count($rows);
		$items = [new WidgetItem(
			sprintf('%d compte%s · %d en ligne', $count, $count > 1 ? 's' : '', $online),
			sprintf('Actifs aujourd\'hui : %d · Espace utilisé : %s', $activeToday, $this->size($totalUsed)),
			$this->usersPage(),
			$this->getIconUrl(),
			'summary',
		)];

		foreach (array_slice($rows, 0, max(1, $limit - 1)) as $row) {
			/** @var IUser $user */
			$user = $row['user'];
			$uid = $user->getUID();
			$items[] = new WidgetItem(
				$user->getDisplayName(),
				$this->subtitle($user, $row),
				$this->usersPage(),
				$this->url->linkToRouteAbsolute('core.avatar.getAvatar', ['userId' => $uid, 'size' => 64]),
				$uid,
				$this->url->getAbsoluteURL($this->url->imagePath(Application::APP_ID, 'status-' . $this->statusIcon($row['status']) . '.svg')),
			);
		}

		return new WidgetItems($items, 'Aucun compte');
	}

	private function subtitle(IUser $user, array $row): string {
		$parts = [];
		if ($this->groupManager->isAdmin($user->getUID())) {
			$parts[] = 'Administrateur';
		}
		$parts[] = $this->presence($row['status'], $row['lastLogin']);

		$quota = $user->getQuota();
		$quotaBytes = ($quota === 'none' || $quota === '') ? null : Util::computerFileSize($quota);
		$parts[] = $quotaBytes
			? sprintf('%s / %s', $this->size($row['used']), $this->size((int)$quotaBytes))
			: $this->size($row['used']);

		$groups = array_values(array_diff($this->groupManager->getUserGroupIds($user), ['admin']));
		if ($groups !== []) {
			$parts[] = implode(', ', $groups);
		}
		if (!$user->isEnabled()) {
			$parts[] = 'désactivé';
		}
		return implode(' · ', $parts);
	}

	private function presence(string $status, int $lastLogin): string {
		return match ($status) {
			IUserStatus::ONLINE => 'En ligne',
			IUserStatus::AWAY => 'Absent',
			IUserStatus::DND, IUserStatus::BUSY => 'Ne pas déranger',
			default => $lastLogin > 0 ? 'Vu ' . $this->ago($lastLogin) : 'Jamais connecté',
		};
	}

	private function statusOf(?IUserStatus $s): string {
		if ($s === null) {
			return IUserStatus::OFFLINE;
		}
		$status = $s->getStatus();
		return $status === IUserStatus::INVISIBLE ? IUserStatus::OFFLINE : $status;
	}

	private function statusIcon(string $status): string {
		return match ($status) {
			IUserStatus::ONLINE => 'online',
			IUserStatus::AWAY => 'away',
			IUserStatus::DND, IUserStatus::BUSY => 'dnd',
			default => 'offline',
		};
	}

	private function usedSpace(IUser $user): int {
		if ($user->getLastLogin() === 0) {
			return 0; // dossier pas encore créé
		}
		try {
			return (int)$this->rootFolder->getUserFolder($user->getUID())->getSize(false);
		} catch (\Throwable $e) {
			return 0;
		}
	}

	private function ago(int $ts): string {
		$d = time() - $ts;
		return match (true) {
			$d < 60 => 'à l\'instant',
			$d < 3600 => sprintf('il y a %d min', intdiv($d, 60)),
			$d < 86400 => sprintf('il y a %d h', intdiv($d, 3600)),
			$d < 172800 => 'hier',
			$d < 30 * 86400 => sprintf('il y a %d j', intdiv($d, 86400)),
			default => 'le ' . date('d/m/Y', $ts),
		};
	}

	private function size(int $bytes): string {
		$units = ['o', 'Ko', 'Mo', 'Go', 'To'];
		$i = 0;
		$v = (float)$bytes;
		while ($v >= 1024 && $i < count($units) - 1) {
			$v /= 1024;
			$i++;
		}
		return ($i === 0 ? (string)$bytes : number_format($v, $v < 10 ? 1 : 0, ',', ' ')) . ' ' . $units[$i];
	}

	private function usersPage(): string {
		return $this->url->linkToRouteAbsolute('settings.Users.usersList');
	}
}
