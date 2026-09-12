<?php

declare(strict_types=1);

require dirname(__DIR__) . '/src/autoload.php';

use NanoPrint\Config\Database;
use NanoPrint\Config\Env;

$root = dirname(__DIR__);
Env::load($root . '/.env');
$pdo = Database::connect();

$hasReference = $pdo->query("SHOW COLUMNS FROM users LIKE 'reference'")->fetch();
if (!$hasReference) {
    $pdo->exec("ALTER TABLE users ADD COLUMN reference VARCHAR(32) NOT NULL DEFAULT '' AFTER role_id");
    echo "Colonne users.reference ajoutée.\n";
} else {
    echo "Colonne users.reference déjà présente.\n";
}

$users = $pdo->query('SELECT id, company_id, reference FROM users ORDER BY company_id, created_at, name')->fetchAll();
$counters = [];
$update = $pdo->prepare('UPDATE users SET reference = :reference WHERE id = :id');
foreach ($users as $user) {
    $companyId = (string) $user['company_id'];
    $current = trim((string) $user['reference']);
    if ($current !== '' && preg_match('/^USR-\d+$/', $current)) {
        if (preg_match('/^USR-(\d+)$/', $current, $m)) {
            $counters[$companyId] = max($counters[$companyId] ?? 0, (int) $m[1]);
        }
        continue;
    }
    $counters[$companyId] = ($counters[$companyId] ?? 0) + 1;
    $reference = 'USR-' . str_pad((string) $counters[$companyId], 3, '0', STR_PAD_LEFT);
    $update->execute(['reference' => $reference, 'id' => $user['id']]);
    echo "Référence {$reference} → {$user['id']}\n";
}

$indexes = $pdo->query("SHOW INDEX FROM users WHERE Key_name = 'uq_users_company_reference'")->fetch();
if (!$indexes) {
    $pdo->exec('ALTER TABLE users ADD UNIQUE KEY uq_users_company_reference (company_id, reference)');
    echo "Index unique users.reference créé.\n";
}

echo "Migration utilisateurs terminée.\n";
