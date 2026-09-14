<?php

declare(strict_types=1);

require dirname(__DIR__) . '/src/autoload.php';

use NanoPrint\Config\Database;
use NanoPrint\Config\Env;

Env::load(dirname(__DIR__) . '/.env');
$pdo = Database::connect();

function tableExists(PDO $pdo, string $name): bool
{
    $stmt = $pdo->query('SHOW TABLES LIKE ' . $pdo->quote($name));
    return (bool) $stmt->fetch();
}

if (!tableExists($pdo, 'order_files')) {
    $pdo->exec(
        "CREATE TABLE order_files (
          id CHAR(36) NOT NULL,
          company_id CHAR(36) NOT NULL,
          order_id CHAR(36) NOT NULL,
          reference VARCHAR(32) NOT NULL,
          name VARCHAR(190) NOT NULL,
          status VARCHAR(32) NOT NULL DEFAULT 'Reçu',
          format VARCHAR(16) NOT NULL DEFAULT 'Fichier',
          version INT NOT NULL DEFAULT 1,
          size_bytes BIGINT NOT NULL DEFAULT 0,
          `stored` TINYINT(1) NOT NULL DEFAULT 1,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY uq_order_files_ref (company_id, reference),
          KEY idx_order_files_order (company_id, order_id),
          CONSTRAINT fk_order_files_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE,
          CONSTRAINT fk_order_files_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
    );
    echo "Table order_files créée.\n";
} else {
    echo "Table order_files déjà présente.\n";
}

$dir = dirname(__DIR__) . '/storage/client-files';
if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
    fwrite(STDERR, "Impossible de créer {$dir}\n");
    exit(1);
}

echo "Migration fichiers clients terminée.\n";
