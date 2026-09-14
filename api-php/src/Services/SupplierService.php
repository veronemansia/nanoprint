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

final class SupplierService
{
    private const STATUSES = ['Actif', 'En évaluation', 'Suspendu'];

    public function __construct(
        private readonly PDO $pdo,
        private readonly AuditLogger $audit,
    ) {
    }

    /** @return list<array<string, mixed>> */
    public function list(AuthContext $auth): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT * FROM suppliers WHERE company_id = :id ORDER BY updated_at DESC, name',
        );
        $stmt->execute(['id' => $auth->companyId]);
        return array_map(RecordMapper::supplier(...), $stmt->fetchAll());
    }

    public function create(AuthContext $auth, array $values, string $ip): array
    {
        $parsed = $this->validated($values);
        $id = trim((string) ($values['id'] ?? '')) ?: Uuid::v4();
        $reference = trim((string) ($values['reference'] ?? '')) ?: $this->nextReference($auth->companyId);
        $this->pdo->prepare(
            'INSERT INTO suppliers (id, company_id, name, reference, status, phone, address, email)
             VALUES (:id, :company_id, :name, :reference, :status, :phone, :address, :email)',
        )->execute([
            'id' => $id,
            'company_id' => $auth->companyId,
            'name' => $parsed['name'],
            'reference' => $reference,
            'status' => $parsed['status'],
            'phone' => $parsed['phone'],
            'address' => $parsed['address'],
            'email' => $parsed['email'],
        ]);
        $this->audit->record($auth, 'supplier.create', 'achats', 'fournisseurs', 'supplier', $id, $reference . ' · ' . $parsed['name'], $ip);
        return $this->one($auth, $id);
    }

    public function update(AuthContext $auth, string $id, array $values, string $ip): array
    {
        $this->mustExist($auth, $id);
        $parsed = $this->validated($values);
        $this->pdo->prepare(
            'UPDATE suppliers SET name = :name, status = :status, phone = :phone, address = :address, email = :email
             WHERE id = :id AND company_id = :company_id',
        )->execute([
            ...$parsed,
            'id' => $id,
            'company_id' => $auth->companyId,
        ]);
        $this->pdo->prepare(
            'UPDATE supplies SET name = :name WHERE supplier_id = :id AND company_id = :company_id',
        )->execute(['name' => $parsed['name'], 'id' => $id, 'company_id' => $auth->companyId]);
        $this->audit->record($auth, 'supplier.update', 'achats', 'fournisseurs', 'supplier', $id, $parsed['name'], $ip);
        return $this->one($auth, $id);
    }

    public function delete(AuthContext $auth, string $id, string $ip): void
    {
        $row = $this->mustExist($auth, $id);
        $linked = $this->pdo->prepare(
            'SELECT 1 FROM supplies WHERE company_id = :company_id AND supplier_id = :id LIMIT 1',
        );
        $linked->execute(['company_id' => $auth->companyId, 'id' => $id]);
        if ($linked->fetchColumn()) {
            throw HttpException::conflict('Impossible de supprimer ce fournisseur : des approvisionnements y sont rattachés.');
        }
        $this->pdo->prepare('DELETE FROM suppliers WHERE id = :id AND company_id = :company_id')
            ->execute(['id' => $id, 'company_id' => $auth->companyId]);
        $this->audit->record(
            $auth,
            'supplier.delete',
            'achats',
            'fournisseurs',
            'supplier',
            $id,
            (string) $row['reference'] . ' · ' . (string) $row['name'],
            $ip,
        );
    }

    /** @return array{name: string, status: string, phone: string, address: string, email: string} */
    private function validated(array $values): array
    {
        $status = trim((string) ($values['status'] ?? 'Actif'));
        if (!in_array($status, self::STATUSES, true)) {
            $status = 'Actif';
        }
        return [
            'name' => Validator::required((string) ($values['name'] ?? ''), 'Le nom complet est obligatoire.'),
            'status' => $status,
            'phone' => Validator::required((string) ($values['phone'] ?? ''), 'Le téléphone est obligatoire.'),
            'address' => Validator::required((string) ($values['address'] ?? ''), 'L’adresse est obligatoire.'),
            'email' => Validator::email((string) ($values['email'] ?? '')),
        ];
    }

    private function one(AuthContext $auth, string $id): array
    {
        return RecordMapper::supplier($this->mustExist($auth, $id));
    }

    /** @return array<string, mixed> */
    private function mustExist(AuthContext $auth, string $id): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT * FROM suppliers WHERE id = :id AND company_id = :company_id LIMIT 1',
        );
        $stmt->execute(['id' => $id, 'company_id' => $auth->companyId]);
        $row = $stmt->fetch();
        if (!$row) {
            throw HttpException::notFound('Fournisseur introuvable.');
        }
        return $row;
    }

    private function nextReference(string $companyId): string
    {
        $stmt = $this->pdo->prepare('SELECT reference FROM suppliers WHERE company_id = :id AND reference LIKE :prefix');
        $stmt->execute(['id' => $companyId, 'prefix' => 'FRN-%']);
        $max = 0;
        foreach ($stmt->fetchAll() as $row) {
            if (preg_match('/^FRN-(\d+)$/i', (string) $row['reference'], $match)) {
                $max = max($max, (int) $match[1]);
            }
        }
        return 'FRN-' . str_pad((string) ($max + 1), 3, '0', STR_PAD_LEFT);
    }
}
