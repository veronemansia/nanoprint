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

final class UserService
{
    private const STATUSES = ['Actif', 'Invité', 'Suspendu'];

    public function __construct(
        private readonly PDO $pdo,
        private readonly AuditLogger $audit,
    ) {
    }

    /** @return list<array<string, mixed>> */
    public function list(AuthContext $auth): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT u.*, r.name AS role_name
             FROM users u
             INNER JOIN roles r ON r.id = u.role_id
             WHERE u.company_id = :id
             ORDER BY u.updated_at DESC, u.name',
        );
        $stmt->execute(['id' => $auth->companyId]);
        return array_map(RecordMapper::user(...), $stmt->fetchAll());
    }

    public function create(AuthContext $auth, array $values, string $ip): array
    {
        $name = Validator::required((string) ($values['name'] ?? ''), 'Le nom complet est obligatoire.');
        $phone = Validator::required((string) ($values['phone'] ?? ''), 'Le téléphone est obligatoire.');
        $address = Validator::required((string) ($values['address'] ?? ''), 'L’adresse est obligatoire.');
        $status = $this->status((string) ($values['status'] ?? 'Actif'));
        $roleId = $this->roleId($auth, (string) ($values['roleId'] ?? ''));
        $email = $this->optionalEmail((string) ($values['email'] ?? ''));
        $password = (string) ($values['password'] ?? '');
        if (strlen($password) < 4) {
            throw HttpException::unprocessable('Saisissez un mot de passe ou générez-en un.');
        }
        $this->assertUniqueEmail($auth, $email, null);

        $id = trim((string) ($values['id'] ?? '')) ?: Uuid::v4();
        $reference = trim((string) ($values['reference'] ?? '')) ?: $this->nextReference($auth->companyId);
        $this->pdo->prepare(
            'INSERT INTO users (id, company_id, role_id, name, reference, email, phone, address, password_hash, status, is_company_owner)
             VALUES (:id, :company_id, :role_id, :name, :reference, :email, :phone, :address, :password_hash, :status, 0)',
        )->execute([
            'id' => $id,
            'company_id' => $auth->companyId,
            'role_id' => $roleId,
            'name' => $name,
            'reference' => $reference,
            'email' => $email,
            'phone' => $phone,
            'address' => $address,
            'password_hash' => password_hash($password, PASSWORD_DEFAULT),
            'status' => $status,
        ]);
        $this->audit->record($auth, 'user.create', 'utilisateurs', 'roles-permissions', 'user', $id, $reference . ' · ' . $name, $ip);
        return $this->one($auth, $id);
    }

    public function update(AuthContext $auth, string $id, array $values, string $ip): array
    {
        $row = $this->mustExist($auth, $id);
        $name = Validator::required((string) ($values['name'] ?? ''), 'Le nom complet est obligatoire.');
        $phone = Validator::required((string) ($values['phone'] ?? ''), 'Le téléphone est obligatoire.');
        $address = Validator::required((string) ($values['address'] ?? ''), 'L’adresse est obligatoire.');
        $status = $this->status((string) ($values['status'] ?? $row['status']));
        $roleId = $this->roleId($auth, (string) ($values['roleId'] ?? $row['role_id']));
        $email = $this->optionalEmail((string) ($values['email'] ?? ''));
        $this->assertUniqueEmail($auth, $email, $id);

        if ((int) $row['is_company_owner'] === 1) {
            $adminId = $this->adminRoleId($auth);
            if ($roleId !== $adminId) {
                throw HttpException::forbidden('Le propriétaire de l’entreprise doit rester Administrateur.');
            }
            if ($status === 'Suspendu') {
                throw HttpException::forbidden('Le propriétaire de l’entreprise ne peut pas être suspendu.');
            }
        }
        if ($id === $auth->userId && $status === 'Suspendu') {
            throw HttpException::forbidden('Vous ne pouvez pas suspendre votre propre compte.');
        }

        $this->pdo->prepare(
            'UPDATE users SET role_id = :role_id, name = :name, email = :email, phone = :phone, address = :address, status = :status
             WHERE id = :id AND company_id = :company_id',
        )->execute([
            'role_id' => $roleId,
            'name' => $name,
            'email' => $email,
            'phone' => $phone,
            'address' => $address,
            'status' => $status,
            'id' => $id,
            'company_id' => $auth->companyId,
        ]);

        $password = (string) ($values['password'] ?? '');
        if ($password !== '') {
            if (strlen($password) < 4) {
                throw HttpException::unprocessable('Le mot de passe est trop court.');
            }
            $this->pdo->prepare('UPDATE users SET password_hash = :hash WHERE id = :id AND company_id = :company_id')
                ->execute([
                    'hash' => password_hash($password, PASSWORD_DEFAULT),
                    'id' => $id,
                    'company_id' => $auth->companyId,
                ]);
        }

        $this->audit->record($auth, 'user.update', 'utilisateurs', 'roles-permissions', 'user', $id, $name, $ip);
        return $this->one($auth, $id);
    }

    public function delete(AuthContext $auth, string $id, string $ip): void
    {
        $row = $this->mustExist($auth, $id);
        if ($id === $auth->userId) {
            throw HttpException::forbidden('Vous ne pouvez pas supprimer votre propre compte.');
        }
        if ((int) $row['is_company_owner'] === 1) {
            throw HttpException::forbidden('Le propriétaire de l’entreprise ne peut pas être supprimé.');
        }
        if ($this->isLastAdmin($auth, $id)) {
            throw HttpException::forbidden('Impossible de supprimer le dernier administrateur.');
        }
        $this->pdo->prepare('DELETE FROM users WHERE id = :id AND company_id = :company_id')
            ->execute(['id' => $id, 'company_id' => $auth->companyId]);
        $this->audit->record($auth, 'user.delete', 'utilisateurs', 'roles-permissions', 'user', $id, trim((string) $row['reference'] . ' · ' . (string) $row['name']), $ip);
    }

    public function nextReference(string $companyId): string
    {
        $stmt = $this->pdo->prepare(
            'SELECT reference FROM users WHERE company_id = :id AND reference LIKE :prefix',
        );
        $stmt->execute(['id' => $companyId, 'prefix' => 'USR-%']);
        $max = 0;
        foreach ($stmt->fetchAll() as $row) {
            if (preg_match('/^USR-(\d+)$/', (string) $row['reference'], $m)) {
                $max = max($max, (int) $m[1]);
            }
        }
        return 'USR-' . str_pad((string) ($max + 1), 3, '0', STR_PAD_LEFT);
    }

    private function one(AuthContext $auth, string $id): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT u.*, r.name AS role_name
             FROM users u
             INNER JOIN roles r ON r.id = u.role_id
             WHERE u.id = :id AND u.company_id = :company_id
             LIMIT 1',
        );
        $stmt->execute(['id' => $id, 'company_id' => $auth->companyId]);
        $row = $stmt->fetch();
        if (!$row) {
            throw HttpException::notFound('Utilisateur introuvable.');
        }
        return RecordMapper::user($row);
    }

    /** @return array<string, mixed> */
    private function mustExist(AuthContext $auth, string $id): array
    {
        $stmt = $this->pdo->prepare('SELECT * FROM users WHERE id = :id AND company_id = :company_id LIMIT 1');
        $stmt->execute(['id' => $id, 'company_id' => $auth->companyId]);
        $row = $stmt->fetch();
        if (!$row) {
            throw HttpException::notFound('Utilisateur introuvable.');
        }
        return $row;
    }

    private function status(string $status): string
    {
        $status = trim($status);
        if (!in_array($status, self::STATUSES, true)) {
            throw HttpException::unprocessable('Statut utilisateur invalide.');
        }
        return $status;
    }

    private function optionalEmail(string $email): ?string
    {
        $email = trim($email);
        if ($email === '') {
            return null;
        }
        return Validator::email($email);
    }

    private function assertUniqueEmail(AuthContext $auth, ?string $email, ?string $ignoreId): void
    {
        if ($email === null) {
            return;
        }
        $sql = 'SELECT id FROM users WHERE company_id = :company_id AND email = :email';
        $params = ['company_id' => $auth->companyId, 'email' => $email];
        if ($ignoreId) {
            $sql .= ' AND id <> :id';
            $params['id'] = $ignoreId;
        }
        $stmt = $this->pdo->prepare($sql . ' LIMIT 1');
        $stmt->execute($params);
        if ($stmt->fetch()) {
            throw HttpException::conflict('Un utilisateur utilise déjà cet e-mail.');
        }
    }

    private function roleId(AuthContext $auth, string $roleId): string
    {
        $roleId = trim($roleId);
        if ($roleId === '') {
            throw HttpException::unprocessable('Créez d’abord un rôle, puis affectez-le à l’utilisateur.');
        }
        $stmt = $this->pdo->prepare(
            'SELECT id FROM roles WHERE id = :id AND company_id = :company_id LIMIT 1',
        );
        $stmt->execute(['id' => $roleId, 'company_id' => $auth->companyId]);
        $id = $stmt->fetchColumn();
        if (!$id) {
            throw HttpException::unprocessable('Rôle introuvable.');
        }
        return (string) $id;
    }

    private function adminRoleId(AuthContext $auth): string
    {
        $stmt = $this->pdo->prepare(
            "SELECT id FROM roles WHERE company_id = :id AND name = 'Administrateur' LIMIT 1",
        );
        $stmt->execute(['id' => $auth->companyId]);
        return (string) $stmt->fetchColumn();
    }

    private function isLastAdmin(AuthContext $auth, string $userId): bool
    {
        $adminId = $this->adminRoleId($auth);
        if ($adminId === '') {
            return false;
        }
        $stmt = $this->pdo->prepare(
            'SELECT role_id FROM users WHERE id = :id AND company_id = :company_id LIMIT 1',
        );
        $stmt->execute(['id' => $userId, 'company_id' => $auth->companyId]);
        if ((string) $stmt->fetchColumn() !== $adminId) {
            return false;
        }
        $count = $this->pdo->prepare(
            'SELECT COUNT(*) FROM users WHERE company_id = :company_id AND role_id = :role_id',
        );
        $count->execute(['company_id' => $auth->companyId, 'role_id' => $adminId]);
        return (int) $count->fetchColumn() <= 1;
    }
}
