<?php

declare(strict_types=1);

require dirname(__DIR__) . '/src/autoload.php';

use NanoPrint\Config\Database;
use NanoPrint\Config\Env;

Env::load(dirname(__DIR__) . '/.env');
$pdo = Database::connect();

$stmt = $pdo->query(
    "SELECT id, label, symbol FROM currencies WHERE label LIKE '%CFA%' OR symbol LIKE '%CFA%'",
);
$rows = $stmt ? $stmt->fetchAll() : [];
if (!$rows) {
    echo "Aucune devise CFA à mettre à jour.\n";
    exit(0);
}

$update = $pdo->prepare('UPDATE currencies SET label = :label, symbol = :symbol WHERE id = :id');
foreach ($rows as $row) {
    $label = NanoPrint\Support\RecordMapper::currencyLabel($row['label'] ?? '');
    if ($label === '') {
        $label = 'Franc';
    }
    $symbol = NanoPrint\Support\RecordMapper::currencySymbol($row['symbol'] ?? '');
    $update->execute([
        'label' => $label,
        'symbol' => $symbol,
        'id' => $row['id'],
    ]);
    echo "Devise {$row['id']} : {$row['label']} / {$row['symbol']} → {$label} / {$symbol}\n";
}

echo count($rows) . " devise(s) mise(s) à jour.\n";
