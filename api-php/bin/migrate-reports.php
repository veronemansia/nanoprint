<?php

declare(strict_types=1);

require dirname(__DIR__) . '/src/autoload.php';

use NanoPrint\Config\Database;
use NanoPrint\Config\Env;

Env::load(dirname(__DIR__) . '/.env');
$pdo = Database::connect();

function addIndexIfMissing(PDO $pdo, string $table, string $name, string $ddl): void
{
    $stmt = $pdo->prepare(
        'SELECT 1 FROM information_schema.statistics
         WHERE table_schema = DATABASE() AND table_name = :table AND index_name = :name LIMIT 1',
    );
    $stmt->execute(['table' => $table, 'name' => $name]);
    if ($stmt->fetchColumn()) {
        echo "Index {$name} déjà présent.\n";
        return;
    }
    $pdo->exec($ddl);
    echo "Index {$name} créé.\n";
}

addIndexIfMissing(
    $pdo,
    'orders',
    'idx_orders_created',
    'ALTER TABLE orders ADD KEY idx_orders_created (company_id, created_at)',
);
addIndexIfMissing(
    $pdo,
    'orders',
    'idx_orders_due',
    'ALTER TABLE orders ADD KEY idx_orders_due (company_id, status, due_date)',
);
echo "Index reporting OK.\n";
