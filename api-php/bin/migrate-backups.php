<?php

declare(strict_types=1);

require dirname(__DIR__) . '/src/autoload.php';

use NanoPrint\Config\Database;
use NanoPrint\Config\Env;

Env::load(dirname(__DIR__) . '/.env');
$pdo = Database::connect();

$exists = $pdo->query("SHOW TABLES LIKE 'data_backups'")->fetch();
if ($exists) {
    echo "Table data_backups déjà présente.\n";
    exit(0);
}

$pdo->exec(
    "CREATE TABLE data_backups (
      id CHAR(36) NOT NULL,
      company_id CHAR(36) NOT NULL,
      reference VARCHAR(32) NOT NULL,
      name VARCHAR(190) NOT NULL,
      frequency VARCHAR(64) NOT NULL DEFAULT 'Manuelle',
      size VARCHAR(32) NOT NULL DEFAULT '',
      location VARCHAR(255) NOT NULL DEFAULT '',
      status VARCHAR(32) NOT NULL DEFAULT 'Réussie',
      last_run DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_data_backups_ref (company_id, reference),
      KEY idx_data_backups_company_run (company_id, last_run),
      CONSTRAINT fk_data_backups_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
);
echo "Table data_backups créée.\n";
