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

final class ClientContactService
{
    private const STATUSES = ['Actif', 'Archivé'];

    public function __construct(
        private readonly PDO $pdo,
        private readonly AuditLogger $audit,
    ) {
    }

    /** @return list<array<string, mixed>> */
    public function list(AuthContext $auth): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT c.*, cl.name AS company_name
             FROM client_contacts c
             INNER JOIN clients cl ON cl.id = c.client_id
             WHERE c.company_id = :id
             ORDER BY c.updated_at DESC, c.name',
        );
        $stmt->execute(['id' => $auth->companyId]);
        return array_map(RecordMapper::clientContact(...), $stmt->fetchAll());
    }

    public function create(AuthContext $auth, array $values, string $ip): array
    {
        $company = $this->companyClient($auth, (string) ($values['companyId'] ?? ''));
        $parsed = $this->validated($values);
        $id = trim((string) ($values['id'] ?? '')) ?: Uuid::v4();
        $reference = trim((string) ($values['reference'] ?? '')) ?: $this->nextReference($auth->companyId);
        $this->pdo->prepare(
            'INSERT INTO client_contacts (id, company_id, client_id, reference, name, role, email, phone, status)
             VALUES (:id, :company_id, :client_id, :reference, :name, :role, :email, :phone, :status)',
        )->execute([
            'id' => $id,
            'company_id' => $auth->companyId,
            'client_id' => $company['id'],
            'reference' => $reference,
            ...$parsed,
        ]);
        $this->audit->record(
            $auth,
            'contact.create',
            'clients',
            'contacts-multiples',
            'contact',
            $id,
            $parsed['name'] . ' · ' . (string) $company['name'],
            $ip,
        );
        return $this->one($auth, $id);
    }

    public function update(AuthContext $auth, string $id, array $values, string $ip): array
    {
        $row = $this->mustExist($auth, $id);
        $companyId = trim((string) ($values['companyId'] ?? $row['client_id']));
        $company = $this->companyClient($auth, $companyId);
        $parsed = $this->validated($values, $row);
        $this->pdo->prepare(
            'UPDATE client_contacts SET client_id = :client_id, name = :name, role = :role, email = :email, phone = :phone, status = :status
             WHERE id = :id AND company_id = :company_id',
        )->execute([
            'client_id' => $company['id'],
            ...$parsed,
            'id' => $id,
            'company_id' => $auth->companyId,
        ]);
        $this->audit->record(
            $auth,
            'contact.update',
            'clients',
            'contacts-multiples',
            'contact',
            $id,
            $parsed['name'] . ' · ' . (string) $company['name'],
            $ip,
        );
        return $this->one($auth, $id);
    }

    public function delete(AuthContext $auth, string $id, string $ip): void
    {
        $row = $this->mustExist($auth, $id);
        $this->pdo->prepare('DELETE FROM client_contacts WHERE id = :id AND company_id = :company_id')
            ->execute(['id' => $id, 'company_id' => $auth->companyId]);
        $this->audit->record(
            $auth,
            'contact.delete',
            'clients',
            'contacts-multiples',
            'contact',
            $id,
            (string) $row['name'],
            $ip,
        );
    }

    public function nextReference(string $companyId): string
    {
        $stmt = $this->pdo->prepare(
            'SELECT reference FROM client_contacts WHERE company_id = :id AND reference LIKE :prefix',
        );
        $stmt->execute(['id' => $companyId, 'prefix' => 'CTC-%']);
        $max = 0;
        foreach ($stmt->fetchAll() as $row) {
            if (preg_match('/^CTC-(\d+)$/', (string) $row['reference'], $m)) {
                $max = max($max, (int) $m[1]);
            }
        }
        return 'CTC-' . str_pad((string) ($max + 1), 3, '0', STR_PAD_LEFT);
    }

    /** @return array<string, mixed> */
    private function validated(array $values, array $existing = []): array
    {
        $name = Validator::required((string) ($values['name'] ?? ''), 'Le nom de l’interlocuteur est obligatoire.');
        $role = Validator::required((string) ($values['role'] ?? ''), 'Le rôle est obligatoire.');
        $email = trim((string) ($values['email'] ?? ''));
        if ($email !== '') {
            $email = Validator::email($email, 'Saisissez un e-mail valide, ou laissez le champ vide.');
        }
        $status = trim((string) ($values['status'] ?? ($existing['status'] ?? 'Actif')));
        if (!in_array($status, self::STATUSES, true)) {
            throw HttpException::unprocessable('Statut contact invalide.');
        }
        return [
            'name' => $name,
            'role' => $role,
            'email' => $email,
            'phone' => trim((string) ($values['phone'] ?? '')),
            'status' => $status,
        ];
    }

    /** @return array<string, mixed> */
    private function companyClient(AuthContext $auth, string $clientId): array
    {
        $clientId = trim($clientId);
        if ($clientId === '') {
            throw HttpException::unprocessable('Choisissez une entreprise déjà créée.');
        }
        $stmt = $this->pdo->prepare(
            'SELECT id, name, client_type FROM clients WHERE id = :id AND company_id = :company_id LIMIT 1',
        );
        $stmt->execute(['id' => $clientId, 'company_id' => $auth->companyId]);
        $row = $stmt->fetch();
        if (!$row) {
            throw HttpException::notFound('Entreprise introuvable.');
        }
        if ((string) $row['client_type'] === 'Particulier') {
            throw HttpException::unprocessable('Les contacts multiples concernent uniquement les entreprises.');
        }
        return $row;
    }

    /** @return array<string, mixed> */
    private function one(AuthContext $auth, string $id): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT c.*, cl.name AS company_name
             FROM client_contacts c
             INNER JOIN clients cl ON cl.id = c.client_id
             WHERE c.id = :id AND c.company_id = :company_id
             LIMIT 1',
        );
        $stmt->execute(['id' => $id, 'company_id' => $auth->companyId]);
        $row = $stmt->fetch();
        if (!$row) {
            throw HttpException::notFound('Contact introuvable.');
        }
        return RecordMapper::clientContact($row);
    }

    /** @return array<string, mixed> */
    private function mustExist(AuthContext $auth, string $id): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT * FROM client_contacts WHERE id = :id AND company_id = :company_id LIMIT 1',
        );
        $stmt->execute(['id' => $id, 'company_id' => $auth->companyId]);
        $row = $stmt->fetch();
        if (!$row) {
            throw HttpException::notFound('Contact introuvable.');
        }
        return $row;
    }
}
