<?php

declare(strict_types=1);

require dirname(__DIR__) . '/src/autoload.php';

use NanoPrint\Config\Database;
use NanoPrint\Config\Env;
use NanoPrint\Install\SeedClients;

Env::load(dirname(__DIR__) . '/.env');
$pdo = Database::connect();

function tableExists(PDO $pdo, string $name): bool
{
    $stmt = $pdo->query("SHOW TABLES LIKE " . $pdo->quote($name));
    return (bool) $stmt->fetch();
}

if (!tableExists($pdo, 'client_sectors')) {
    $pdo->exec(
        "CREATE TABLE client_sectors (
          id CHAR(36) NOT NULL,
          company_id CHAR(36) NOT NULL,
          name VARCHAR(120) NOT NULL,
          sort_order INT NOT NULL DEFAULT 0,
          PRIMARY KEY (id),
          UNIQUE KEY uq_client_sectors_name (company_id, name),
          CONSTRAINT fk_client_sectors_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
    );
    echo "Table client_sectors créée.\n";
} else {
    echo "Table client_sectors déjà présente.\n";
}

if (!tableExists($pdo, 'clients')) {
    $pdo->exec(
        "CREATE TABLE clients (
          id CHAR(36) NOT NULL,
          company_id CHAR(36) NOT NULL,
          reference VARCHAR(32) NOT NULL,
          name VARCHAR(190) NOT NULL,
          client_type VARCHAR(32) NOT NULL DEFAULT 'Entreprise',
          status VARCHAR(32) NOT NULL DEFAULT 'Actif',
          sector VARCHAR(120) NOT NULL DEFAULT '',
          legal_name VARCHAR(190) NOT NULL DEFAULT '',
          legal_form VARCHAR(64) NOT NULL DEFAULT '',
          ninea VARCHAR(64) NOT NULL DEFAULT '',
          rccm VARCHAR(64) NOT NULL DEFAULT '',
          contact VARCHAR(190) NOT NULL DEFAULT '',
          email VARCHAR(190) NOT NULL DEFAULT '',
          phone VARCHAR(64) NOT NULL DEFAULT '',
          website VARCHAR(255) NOT NULL DEFAULT '',
          address VARCHAR(255) NOT NULL DEFAULT '',
          city VARCHAR(120) NOT NULL DEFAULT '',
          country VARCHAR(120) NOT NULL DEFAULT 'Sénégal',
          discount DECIMAL(8,3) NOT NULL DEFAULT 0,
          notes TEXT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY uq_clients_ref (company_id, reference),
          KEY idx_clients_type (company_id, client_type),
          KEY idx_clients_sector (company_id, sector),
          CONSTRAINT fk_clients_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
    );
    echo "Table clients créée.\n";
} else {
    echo "Table clients déjà présente.\n";
}

if (!tableExists($pdo, 'client_contacts')) {
    $pdo->exec(
        "CREATE TABLE client_contacts (
          id CHAR(36) NOT NULL,
          company_id CHAR(36) NOT NULL,
          client_id CHAR(36) NOT NULL,
          reference VARCHAR(32) NOT NULL,
          name VARCHAR(190) NOT NULL,
          role VARCHAR(120) NOT NULL DEFAULT '',
          email VARCHAR(190) NOT NULL DEFAULT '',
          phone VARCHAR(64) NOT NULL DEFAULT '',
          status VARCHAR(32) NOT NULL DEFAULT 'Actif',
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY uq_client_contacts_ref (company_id, reference),
          KEY idx_client_contacts_client (client_id),
          CONSTRAINT fk_client_contacts_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE,
          CONSTRAINT fk_client_contacts_client FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
    );
    echo "Table client_contacts créée.\n";
} else {
    echo "Table client_contacts déjà présente.\n";
}

$seeder = new SeedClients($pdo);
foreach ($pdo->query('SELECT id FROM companies')->fetchAll() as $company) {
    $seeder->seedForCompany((string) $company['id']);
}

echo "Migration clients terminée.\n";
