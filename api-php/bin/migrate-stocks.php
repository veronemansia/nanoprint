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

if (!tableExists($pdo, 'stock_movements')) {
    $pdo->exec(
        "CREATE TABLE stock_movements (
          id CHAR(36) NOT NULL,
          company_id CHAR(36) NOT NULL,
          article_kind VARCHAR(16) NOT NULL,
          article_id CHAR(36) NOT NULL,
          article_name VARCHAR(190) NOT NULL,
          article_reference VARCHAR(64) NOT NULL,
          reason VARCHAR(32) NOT NULL,
          note VARCHAR(255) NOT NULL DEFAULT '',
          qty_init DECIMAL(14,3) NOT NULL DEFAULT 0,
          qty_out DECIMAL(14,3) NOT NULL DEFAULT 0,
          qty_solde DECIMAL(14,3) NOT NULL DEFAULT 0,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          KEY idx_stock_movements_company (company_id, created_at),
          KEY idx_stock_movements_article (company_id, article_kind, article_id),
          CONSTRAINT fk_stock_movements_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
    );
    echo "Table stock_movements créée.\n";
} else {
    echo "Table stock_movements déjà présente.\n";
}

if (!tableExists($pdo, 'stock_alerts')) {
    $pdo->exec(
        "CREATE TABLE stock_alerts (
          id CHAR(36) NOT NULL,
          company_id CHAR(36) NOT NULL,
          article_kind VARCHAR(16) NOT NULL,
          article_id CHAR(36) NOT NULL,
          name VARCHAR(190) NOT NULL,
          reference VARCHAR(64) NOT NULL,
          status VARCHAR(32) NOT NULL DEFAULT 'OK',
          minimum DECIMAL(14,3) NOT NULL DEFAULT 0,
          current_qty DECIMAL(14,3) NOT NULL DEFAULT 0,
          supplier VARCHAR(190) NOT NULL DEFAULT '',
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY uq_stock_alerts_article (company_id, article_kind, article_id),
          UNIQUE KEY uq_stock_alerts_ref (company_id, reference),
          KEY idx_stock_alerts_company (company_id, updated_at),
          CONSTRAINT fk_stock_alerts_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
    );
    echo "Table stock_alerts créée.\n";
} else {
    echo "Table stock_alerts déjà présente.\n";
}

if (!tableExists($pdo, 'inventory_lines')) {
    $pdo->exec(
        "CREATE TABLE inventory_lines (
          id CHAR(36) NOT NULL,
          company_id CHAR(36) NOT NULL,
          article_kind VARCHAR(16) NOT NULL,
          article_id CHAR(36) NOT NULL,
          name VARCHAR(190) NOT NULL,
          reference VARCHAR(64) NOT NULL,
          status VARCHAR(32) NOT NULL DEFAULT 'En cours',
          system_qty DECIMAL(14,3) NOT NULL DEFAULT 0,
          physical_qty DECIMAL(14,3) NOT NULL DEFAULT 0,
          gap DECIMAL(14,3) NOT NULL DEFAULT 0,
          reason TEXT NOT NULL,
          qty_init DECIMAL(14,3) NOT NULL DEFAULT 0,
          qty_solde DECIMAL(14,3) NOT NULL DEFAULT 0,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY uq_inventory_ref (company_id, reference),
          KEY idx_inventory_article (company_id, article_kind, article_id, status),
          KEY idx_inventory_company (company_id, updated_at),
          CONSTRAINT fk_inventory_lines_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
    );
    echo "Table inventory_lines créée.\n";
} else {
    echo "Table inventory_lines déjà présente.\n";
}

echo "Migration stocks terminée.\n";
