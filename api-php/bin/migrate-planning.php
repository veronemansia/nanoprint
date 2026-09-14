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

if (!tableExists($pdo, 'machine_slots')) {
    $pdo->exec(
        "CREATE TABLE machine_slots (
          id CHAR(36) NOT NULL,
          company_id CHAR(36) NOT NULL,
          workstation_id CHAR(36) NOT NULL,
          order_id CHAR(36) NOT NULL,
          reference VARCHAR(32) NOT NULL,
          name VARCHAR(190) NOT NULL,
          status VARCHAR(32) NOT NULL DEFAULT 'Planifié',
          day DATE NOT NULL,
          start_time TIME NOT NULL,
          end_time TIME NOT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY uq_machine_slots_ref (company_id, reference),
          KEY idx_machine_slots_day (company_id, workstation_id, day),
          CONSTRAINT fk_machine_slots_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE,
          CONSTRAINT fk_machine_slots_workstation FOREIGN KEY (workstation_id) REFERENCES workstations (id) ON DELETE CASCADE,
          CONSTRAINT fk_machine_slots_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
    );
    echo "Table machine_slots créée.\n";
} else {
    echo "Table machine_slots déjà présente.\n";
}

echo "Migration planning machines terminée.\n";
