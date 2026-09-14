<?php

declare(strict_types=1);

require dirname(__DIR__) . '/src/autoload.php';

use NanoPrint\Config\Database;
use NanoPrint\Config\Env;
use NanoPrint\Install\SeedBilling;

Env::load(dirname(__DIR__) . '/.env');
$pdo = Database::connect();

function tableExists(PDO $pdo, string $name): bool
{
    $stmt = $pdo->query('SHOW TABLES LIKE ' . $pdo->quote($name));
    return (bool) $stmt->fetch();
}

if (!tableExists($pdo, 'invoices')) {
    $pdo->exec(
        "CREATE TABLE invoices (
          id CHAR(36) NOT NULL,
          company_id CHAR(36) NOT NULL,
          order_id CHAR(36) NOT NULL,
          reference VARCHAR(32) NOT NULL,
          name VARCHAR(190) NOT NULL,
          status VARCHAR(32) NOT NULL,
          settlement VARCHAR(16) NOT NULL,
          amount DECIMAL(14,2) NOT NULL DEFAULT 0,
          remaining DECIMAL(14,2) NOT NULL DEFAULT 0,
          issued_at DATE NOT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY uq_invoices_ref (company_id, reference),
          KEY idx_invoices_order (company_id, order_id),
          KEY idx_invoices_issued (company_id, issued_at),
          CONSTRAINT fk_invoices_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE,
          CONSTRAINT fk_invoices_order FOREIGN KEY (order_id) REFERENCES orders (id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
    );
    echo "Table invoices créée.\n";
} else {
    echo "Table invoices déjà présente.\n";
}

if (!tableExists($pdo, 'order_deposits')) {
    $pdo->exec(
        "CREATE TABLE order_deposits (
          id CHAR(36) NOT NULL,
          company_id CHAR(36) NOT NULL,
          order_id CHAR(36) NOT NULL,
          reference VARCHAR(32) NOT NULL,
          name VARCHAR(190) NOT NULL,
          status VARCHAR(32) NOT NULL DEFAULT 'Ouvert',
          asked DECIMAL(14,2) NOT NULL DEFAULT 0,
          received DECIMAL(14,2) NOT NULL DEFAULT 0,
          remaining DECIMAL(14,2) NOT NULL DEFAULT 0,
          payments JSON NOT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY uq_order_deposits_order (order_id),
          UNIQUE KEY uq_order_deposits_ref (company_id, reference),
          KEY idx_order_deposits_company (company_id, updated_at),
          CONSTRAINT fk_order_deposits_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE,
          CONSTRAINT fk_order_deposits_order FOREIGN KEY (order_id) REFERENCES orders (id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
    );
    echo "Table order_deposits créée.\n";
} else {
    echo "Table order_deposits déjà présente.\n";
}

$seeder = new SeedBilling($pdo);
foreach ($pdo->query('SELECT id FROM companies')->fetchAll() as $company) {
    $seeder->seedForCompany((string) $company['id']);
}

echo "Migration facturation terminée.\n";
