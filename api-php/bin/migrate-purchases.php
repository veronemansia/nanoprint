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

if (!tableExists($pdo, 'suppliers')) {
    $pdo->exec(
        "CREATE TABLE suppliers (
          id CHAR(36) NOT NULL,
          company_id CHAR(36) NOT NULL,
          name VARCHAR(190) NOT NULL,
          reference VARCHAR(64) NOT NULL,
          status VARCHAR(32) NOT NULL DEFAULT 'Actif',
          phone VARCHAR(64) NOT NULL DEFAULT '',
          address TEXT NOT NULL,
          email VARCHAR(190) NOT NULL DEFAULT '',
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY uq_suppliers_ref (company_id, reference),
          KEY idx_suppliers_company (company_id, updated_at),
          CONSTRAINT fk_suppliers_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
    );
    echo "Table suppliers créée.\n";
} else {
    echo "Table suppliers déjà présente.\n";
}

if (!tableExists($pdo, 'supplies')) {
    $pdo->exec(
        "CREATE TABLE supplies (
          id CHAR(36) NOT NULL,
          company_id CHAR(36) NOT NULL,
          supplier_id CHAR(36) NOT NULL,
          reference VARCHAR(32) NOT NULL,
          name VARCHAR(190) NOT NULL,
          status VARCHAR(32) NOT NULL DEFAULT 'Validé',
          quantity DECIMAL(14,3) NOT NULL DEFAULT 0,
          amount DECIMAL(14,2) NOT NULL DEFAULT 0,
          issued_at DATE NOT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY uq_supplies_ref (company_id, reference),
          KEY idx_supplies_supplier (company_id, supplier_id, issued_at),
          CONSTRAINT fk_supplies_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE,
          CONSTRAINT fk_supplies_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers (id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
    );
    echo "Table supplies créée.\n";
} else {
    echo "Table supplies déjà présente.\n";
}

if (!tableExists($pdo, 'supply_lines')) {
    $pdo->exec(
        "CREATE TABLE supply_lines (
          id CHAR(36) NOT NULL,
          company_id CHAR(36) NOT NULL,
          supply_id CHAR(36) NOT NULL,
          material_id CHAR(36) NOT NULL,
          label VARCHAR(190) NOT NULL,
          unit VARCHAR(64) NOT NULL DEFAULT '',
          qty_init DECIMAL(14,3) NOT NULL DEFAULT 0,
          qty_appro DECIMAL(14,3) NOT NULL DEFAULT 0,
          qty_solde DECIMAL(14,3) NOT NULL DEFAULT 0,
          unit_price DECIMAL(14,2) NOT NULL DEFAULT 0,
          sell_price DECIMAL(14,2) NOT NULL DEFAULT 0,
          sort_order INT NOT NULL DEFAULT 0,
          PRIMARY KEY (id),
          KEY idx_supply_lines_supply (supply_id, sort_order),
          KEY idx_supply_lines_material (material_id),
          CONSTRAINT fk_supply_lines_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE,
          CONSTRAINT fk_supply_lines_supply FOREIGN KEY (supply_id) REFERENCES supplies (id) ON DELETE CASCADE,
          CONSTRAINT fk_supply_lines_material FOREIGN KEY (material_id) REFERENCES materials (id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
    );
    echo "Table supply_lines créée.\n";
} else {
    echo "Table supply_lines déjà présente.\n";
}

echo "Migration achats / approvisionnement terminée.\n";
