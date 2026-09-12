<?php

declare(strict_types=1);

namespace NanoPrint\Services;

use NanoPrint\Auth\AuthContext;
use NanoPrint\Http\HttpException;
use NanoPrint\Support\AuditLogger;
use NanoPrint\Support\Uuid;
use NanoPrint\Support\Validator;
use PDO;

final class LookupService
{
    private const TABLES = [
        'workshops' => ['table' => 'workshops', 'feature' => 'postes', 'cascade' => 'workstations', 'fk' => 'workshop_id'],
        'material-types' => ['table' => 'material_types', 'feature' => 'matieres', 'cascade' => 'materials', 'fk' => 'type_id'],
        'material-units' => ['table' => 'material_units', 'feature' => 'matieres', 'cascade' => 'materials', 'fk' => 'unit_id'],
        'catalogue-families' => ['table' => 'catalogue_families', 'feature' => 'catalogue', 'cascade' => null, 'fk' => null],
    ];

    public function __construct(
        private readonly PDO $pdo,
        private readonly AuditLogger $audit,
    ) {
    }

    /** @return list<string> */
    public function names(AuthContext $auth, string $kind): array
    {
        $meta = $this->meta($kind);
        $stmt = $this->pdo->prepare("SELECT name FROM {$meta['table']} WHERE company_id = :id ORDER BY sort_order, name");
        $stmt->execute(['id' => $auth->companyId]);
        return array_map(static fn(array $row) => (string) $row['name'], $stmt->fetchAll());
    }

    public function add(AuthContext $auth, string $kind, string $name, string $ip): string
    {
        $meta = $this->meta($kind);
        $name = Validator::required($name, 'Le libellé est obligatoire.');
        $existing = $this->names($auth, $kind);
        if (in_array($name, $existing, true)) {
            return $name;
        }
        $stmt = $this->pdo->prepare("INSERT INTO {$meta['table']} (id, company_id, name, sort_order) VALUES (:id, :company_id, :name, :sort_order)");
        $stmt->execute([
            'id' => Uuid::v4(),
            'company_id' => $auth->companyId,
            'name' => $name,
            'sort_order' => count($existing),
        ]);
        $this->audit->record($auth, $kind . '.create', 'configuration', $meta['feature'], $kind, $name, $name, $ip);
        return $name;
    }

    public function rename(AuthContext $auth, string $kind, string $from, string $to, string $ip): string
    {
        $meta = $this->meta($kind);
        $from = Validator::required($from, 'Libellé source manquant.');
        $to = Validator::required($to, 'Le nouveau libellé est obligatoire.');
        $row = $this->findByName($auth, $meta['table'], $from);
        $this->pdo->prepare("UPDATE {$meta['table']} SET name = :name WHERE id = :id AND company_id = :company_id")
            ->execute(['name' => $to, 'id' => $row['id'], 'company_id' => $auth->companyId]);
        $this->audit->record($auth, $kind . '.rename', 'configuration', $meta['feature'], $kind, (string) $row['id'], $from . ' → ' . $to, $ip);
        return $to;
    }

    public function delete(AuthContext $auth, string $kind, string $name, string $ip): string
    {
        $meta = $this->meta($kind);
        $names = $this->names($auth, $kind);
        if (count($names) <= 1) {
            throw HttpException::unprocessable('Impossible de supprimer le dernier élément.');
        }
        $row = $this->findByName($auth, $meta['table'], $name);
        $fallback = $names[0] === $name ? ($names[1] ?? $names[0]) : $names[0];
        if ($meta['cascade'] && $meta['fk']) {
            $fallbackRow = $this->findByName($auth, $meta['table'], $fallback);
            $this->pdo->prepare("UPDATE {$meta['cascade']} SET {$meta['fk']} = :next WHERE {$meta['fk']} = :old AND company_id = :company_id")
                ->execute(['next' => $fallbackRow['id'], 'old' => $row['id'], 'company_id' => $auth->companyId]);
        }
        $this->pdo->prepare("DELETE FROM {$meta['table']} WHERE id = :id AND company_id = :company_id")
            ->execute(['id' => $row['id'], 'company_id' => $auth->companyId]);
        $this->audit->record($auth, $kind . '.delete', 'configuration', $meta['feature'], $kind, (string) $row['id'], $name, $ip);
        return $fallback;
    }

    /** @return array{table:string,feature:string,cascade:?string,fk:?string} */
    private function meta(string $kind): array
    {
        if (!isset(self::TABLES[$kind])) {
            throw HttpException::notFound('Liste introuvable.');
        }
        return self::TABLES[$kind];
    }

    /** @return array<string, mixed> */
    private function findByName(AuthContext $auth, string $table, string $name): array
    {
        $stmt = $this->pdo->prepare("SELECT * FROM {$table} WHERE company_id = :company_id AND name = :name LIMIT 1");
        $stmt->execute(['company_id' => $auth->companyId, 'name' => $name]);
        $row = $stmt->fetch();
        if (!$row) {
            throw HttpException::notFound('Élément introuvable.');
        }
        return $row;
    }
}
