<?php

declare(strict_types=1);

require dirname(__DIR__) . '/src/autoload.php';

use NanoPrint\Config\Database;
use NanoPrint\Config\Env;
use NanoPrint\Install\SeedDemo;

$root = dirname(__DIR__);
if (!is_file($root . '/.env')) {
    copy($root . '/.env.example', $root . '/.env');
    echo "Fichier .env créé depuis .env.example\n";
}
Env::load($root . '/.env');

$dbName = Env::get('DB_NAME', 'impression');
$server = Database::server();
$server->exec('CREATE DATABASE IF NOT EXISTS `' . str_replace('`', '', $dbName) . '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
echo "Base {$dbName} prête.\n";

$schema = file_get_contents($root . '/sql/schema.sql');
if ($schema === false) {
    fwrite(STDERR, "schema.sql introuvable\n");
    exit(1);
}
$server->exec('USE `' . str_replace('`', '', $dbName) . '`');
$statements = array_filter(array_map('trim', explode(';', $schema)));
foreach ($statements as $sql) {
    if ($sql === '' || str_starts_with($sql, '--') || str_starts_with(strtoupper($sql), 'CREATE DATABASE') || str_starts_with(strtoupper($sql), 'USE ')) {
        continue;
    }
    $server->exec($sql);
}
echo "Schéma installé.\n";

$pdo = Database::connect();
(new SeedDemo($pdo))->run();
echo "Installation terminée.\n";
