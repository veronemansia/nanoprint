<?php

declare(strict_types=1);

namespace NanoPrint\Services;

use NanoPrint\Auth\AuthContext;
use NanoPrint\Http\HttpException;
use NanoPrint\Support\AuditLogger;
use NanoPrint\Support\RecordMapper;
use NanoPrint\Support\Uuid;
use NanoPrint\Support\Validator;
use PDO;

final class WorkstationService
{
    public function __construct(
        private readonly PDO $pdo,
        private readonly AuditLogger $audit,
        private readonly LookupService $lookups,
    ) {
    }

    /** @return list<array<string, mixed>> */
    public function list(AuthContext $auth): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT w.*, ws.name AS workshop_name
             FROM workstations w
             INNER JOIN workshops ws ON ws.id = w.workshop_id
             WHERE w.company_id = :id
             ORDER BY w.updated_at DESC, w.name',
        );
        $stmt->execute(['id' => $auth->companyId]);
        return array_map(RecordMapper::workstation(...), $stmt->fetchAll());
    }

    public function create(AuthContext $auth, array $values, string $ip): array
    {
        $name = Validator::required((string) ($values['name'] ?? ''), 'Le poste est obligatoire.');
        $workshop = Validator::required((string) ($values['workshop'] ?? ''), 'L’atelier est obligatoire.');
        $cadence = Validator::required((string) ($values['cadence'] ?? ''), 'La cadence est obligatoire.');
        $hourly = Validator::money($values['hourlyCost'] ?? null, 'Saisissez un coût horaire valide.');
        $capacity = Validator::nonNegative($values['capacity'] ?? null, 'Saisissez une capacité valide.');
        $status = (string) ($values['status'] ?? 'Actif') ?: 'Actif';

        $this->lookups->add($auth, 'workshops', $workshop, $ip);
        $id = Uuid::v4();
        $reference = (string) ($values['reference'] ?? RecordMapper::nextReference('POS'));
        $this->pdo->prepare(
            'INSERT INTO workstations (id, company_id, workshop_id, name, reference, status, cadence, hourly_cost, capacity)
             VALUES (:id, :company_id, :workshop_id, :name, :reference, :status, :cadence, :hourly_cost, :capacity)',
        )->execute([
            'id' => $id,
            'company_id' => $auth->companyId,
            'workshop_id' => $this->workshopId($auth, $workshop),
            'name' => $name,
            'reference' => $reference,
            'status' => $status,
            'cadence' => $cadence,
            'hourly_cost' => $hourly,
            'capacity' => $capacity,
        ]);
        $this->audit->record($auth, 'workstation.create', 'configuration', 'postes', 'workstation', $id, $reference, $ip);
        return $this->one($auth, $id);
    }

    public function update(AuthContext $auth, string $id, array $values, string $ip): array
    {
        $this->mustExist($auth, $id);
        $name = Validator::required((string) ($values['name'] ?? ''), 'Le poste est obligatoire.');
        $workshop = Validator::required((string) ($values['workshop'] ?? ''), 'L’atelier est obligatoire.');
        $cadence = Validator::required((string) ($values['cadence'] ?? ''), 'La cadence est obligatoire.');
        $hourly = Validator::money($values['hourlyCost'] ?? null, 'Saisissez un coût horaire valide.');
        $capacity = Validator::nonNegative($values['capacity'] ?? null, 'Saisissez une capacité valide.');
        $status = (string) ($values['status'] ?? 'Actif') ?: 'Actif';
        $this->lookups->add($auth, 'workshops', $workshop, $ip);

        $this->pdo->prepare(
            'UPDATE workstations SET workshop_id = :workshop_id, name = :name, status = :status, cadence = :cadence, hourly_cost = :hourly_cost, capacity = :capacity
             WHERE id = :id AND company_id = :company_id',
        )->execute([
            'workshop_id' => $this->workshopId($auth, $workshop),
            'name' => $name,
            'status' => $status,
            'cadence' => $cadence,
            'hourly_cost' => $hourly,
            'capacity' => $capacity,
            'id' => $id,
            'company_id' => $auth->companyId,
        ]);
        $this->audit->record($auth, 'workstation.update', 'configuration', 'postes', 'workstation', $id, $name, $ip);
        return $this->one($auth, $id);
    }

    public function delete(AuthContext $auth, string $id, string $ip): void
    {
        $this->mustExist($auth, $id);
        $this->pdo->prepare('DELETE FROM workstations WHERE id = :id AND company_id = :company_id')
            ->execute(['id' => $id, 'company_id' => $auth->companyId]);
        $this->audit->record($auth, 'workstation.delete', 'configuration', 'postes', 'workstation', $id, '', $ip);
    }

    private function one(AuthContext $auth, string $id): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT w.*, ws.name AS workshop_name
             FROM workstations w
             INNER JOIN workshops ws ON ws.id = w.workshop_id
             WHERE w.id = :id AND w.company_id = :company_id
             LIMIT 1',
        );
        $stmt->execute(['id' => $id, 'company_id' => $auth->companyId]);
        $row = $stmt->fetch();
        if (!$row) {
            throw HttpException::notFound('Poste introuvable.');
        }
        return RecordMapper::workstation($row);
    }

    private function mustExist(AuthContext $auth, string $id): void
    {
        $stmt = $this->pdo->prepare('SELECT id FROM workstations WHERE id = :id AND company_id = :company_id LIMIT 1');
        $stmt->execute(['id' => $id, 'company_id' => $auth->companyId]);
        if (!$stmt->fetch()) {
            throw HttpException::notFound('Poste introuvable.');
        }
    }

    private function workshopId(AuthContext $auth, string $name): string
    {
        $stmt = $this->pdo->prepare('SELECT id FROM workshops WHERE company_id = :company_id AND name = :name LIMIT 1');
        $stmt->execute(['company_id' => $auth->companyId, 'name' => $name]);
        $id = $stmt->fetchColumn();
        if (!$id) {
            throw HttpException::unprocessable('Atelier introuvable.');
        }
        return (string) $id;
    }
}
