<?php

return [
	'routes' => [
		['name' => 'install#index', 'url' => '/', 'verb' => 'GET'],
		['name' => 'install#download', 'url' => '/download/{platform}', 'verb' => 'GET'],
		['name' => 'install#icon', 'url' => '/icon.png', 'verb' => 'GET'],
	],
];
