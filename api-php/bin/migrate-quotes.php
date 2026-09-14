<?php

declare(strict_types=1);

require dirname(__DIR__) . '/src/autoload.php';

use NanoPrint\Config\Database;
use NanoPrint\Config\Env;
use NanoPrint\Install\SeedQuotes;

Env::load(dirname(__DIR__) . '/.env');
$pdo = Database::connect();

function tableExists(PDO $pdo, string $name): bool
{
    $stmt = $pdo->query("SHOW TABLES LIKE " . $pdo->quote($name));
    return (bool) $stmt->fetch();
}

if (!tableExists($pdo, 'quotes')) {
    $pdo->exec(
        "CREATE TABLE quotes (
          id CHAR(36) NOT NULL,
          company_id CHAR(36) NOT NULL,
          kind VARCHAR(16) NOT NULL,
          reference VARCHAR(32) NOT NULL,
          name VARCHAR(190) NOT NULL,
          status VARCHAR(32) NOT NULL,
          client_id CHAR(36) NOT NULL,
          apply_discount TINYINT(1) NOT NULL DEFAULT 0,
          quantity DECIMAL(14,3) NOT NULL DEFAULT 0,
          amount DECIMAL(14,2) NOT NULL DEFAULT 0,
          option_a VARCHAR(255) NOT NULL DEFAULT '',
          option_b VARCHAR(255) NOT NULL DEFAULT '',
          option_c VARCHAR(255) NOT NULL DEFAULT '',
          payload JSON NOT NULL,
          order_id CHAR(36) NULL,
          order_ref VARCHAR(32) NOT NULL DEFAULT '',
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY uq_quotes_ref (company_id, reference),
          KEY idx_quotes_kind (company_id, kind, updated_at),
          KEY idx_quotes_client (company_id, client_id),
          KEY idx_quotes_status (company_id, status),
          CONSTRAINT fk_quotes_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE,
          CONSTRAINT fk_quotes_client FOREIGN KEY (client_id) REFERENCES clients (id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
    );
    echo "Table quotes créée.\n";
} else {
    echo "Table quotes déjà présente.\n";
}

if (!tableExists($pdo, 'orders')) {
    $pdo->exec(
        "CREATE TABLE orders (
          id CHAR(36) NOT NULL,
          company_id CHAR(36) NOT NULL,
          reference VARCHAR(32) NOT NULL,
          name VARCHAR(190) NOT NULL,
          status VARCHAR(32) NOT NULL DEFAULT 'En attente',
          client_id CHAR(36) NOT NULL,
          quote_id CHAR(36) NULL,
          quote_ref VARCHAR(32) NOT NULL DEFAULT '',
          quantity DECIMAL(14,3) NOT NULL DEFAULT 0,
          amount DECIMAL(14,2) NOT NULL DEFAULT 0,
          due_date DATE NOT NULL,
          payload JSON NOT NULL,
          history_json JSON NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY uq_orders_ref (company_id, reference),
          UNIQUE KEY uq_orders_quote (quote_id),
          KEY idx_orders_client (company_id, client_id),
          KEY idx_orders_status (company_id, status),
          CONSTRAINT fk_orders_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE,
          CONSTRAINT fk_orders_client FOREIGN KEY (client_id) REFERENCES clients (id),
          CONSTRAINT fk_orders_quote FOREIGN KEY (quote_id) REFERENCES quotes (id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
    );
    echo "Table orders créée.\n";
} else {
    echo "Table orders déjà présente.\n";
}

if (!tableExists($pdo, 'order_amendments')) {
    $pdo->exec(
        "CREATE TABLE order_amendments (
          id CHAR(36) NOT NULL,
          company_id CHAR(36) NOT NULL,
          order_id CHAR(36) NOT NULL,
          reference VARCHAR(32) NOT NULL,
          name VARCHAR(80) NOT NULL,
          status VARCHAR(32) NOT NULL DEFAULT 'Validé',
          reason VARCHAR(400) NOT NULL,
          delta DECIMAL(14,2) NOT NULL DEFAULT 0,
          previous_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
          new_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
          quantity DECIMAL(14,3) NOT NULL DEFAULT 0,
          previous_snapshot JSON NULL,
          next_snapshot JSON NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY uq_order_amendments_ref (company_id, reference),
          KEY idx_order_amendments_order (order_id),
          CONSTRAINT fk_order_amendments_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE,
          CONSTRAINT fk_order_amendments_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
    );
    echo "Table order_amendments créée.\n";
} else {
    echo "Table order_amendments déjà présente.\n";
}

$seeder = new SeedQuotes($pdo);
foreach ($pdo->query('SELECT id FROM companies')->fetchAll() as $company) {
    $seeder->seedForCompany((string) $company['id']);
}

echo "Migration devis & commandes terminée.\n";
