<?php

declare(strict_types=1);

namespace NanoPrint\Services;

use NanoPrint\Auth\AuthContext;
use NanoPrint\Http\HttpException;
use NanoPrint\Support\AuditLogger;
use NanoPrint\Support\Modules;
use NanoPrint\Support\Uuid;
use NanoPrint\Support\Validator;
use PDO;

final class RoleService
{
    public function __construct(
        private readonly PDO $pdo,
        private readonly AuditLogger $audit,
    ) {
    }

    /** @return list<array{id:string,name:string,permissions:array}> */
    public function list(AuthContext $auth): array
    {
        $stmt = $this->pdo->prepare('SELECT id, name FROM roles WHERE company_id = :id ORDER BY name');
        $stmt->execute(['id' => $auth->companyId]);
        $roles = [];
        $perm = $this->pdo->prepare(
            'SELECT module_id, can_create, can_read, can_update, can_delete FROM role_permissions WHERE role_id = :id',
        );
        foreach ($stmt->fetchAll() as $role) {
            $perm->execute(['id' => $role['id']]);
            $permissions = [];
            foreach ($perm->fetchAll() as $row) {
                $permissions[(string) $row['module_id']] = [
                    'create' => (bool) $row['can_create'],
                    'read' => (bool) $row['can_read'],
                    'update' => (bool) $row['can_update'],
                    'delete' => (bool) $row['can_delete'],
                ];
            }
            $roles[] = [
                'id' => $role['id'],
                'name' => $role['name'],
                'permissions' => $permissions,
            ];
        }
        return $roles;
    }

    public function save(AuthContext $auth, array $values, string $ip): array
    {
        $name = Validator::required((string) ($values['name'] ?? ''), 'Le libellé du rôle est obligatoire.');
        $id = trim((string) ($values['id'] ?? '')) ?: Uuid::v4();
        $existing = $this->find($auth, $id);
        $this->assertUniqueName($auth, $name, $existing ? $id : null);

        if ($existing) {
            $this->pdo->prepare(
                'UPDATE roles SET name = :name WHERE id = :id AND company_id = :company_id',
            )->execute(['name' => $name, 'id' => $id, 'company_id' => $auth->companyId]);
            $action = 'role.update';
        } else {
            $this->pdo->prepare(
                'INSERT INTO roles (id, company_id, name) VALUES (:id, :company_id, :name)',
            )->execute(['id' => $id, 'company_id' => $auth->companyId, 'name' => $name]);
            $action = 'role.create';
        }

        $this->replacePermissions($id, is_array($values['permissions'] ?? null) ? $values['permissions'] : []);
        $this->audit->record($auth, $action, 'utilisateurs', 'roles-permissions', 'role', $id, $name, $ip);
        return $this->one($auth, $id);
    }

    /** @return array{accessRoles:list<array>,fallback:array{id:string,name:string}} */
    public function delete(AuthContext $auth, string $id, string $ip): array
    {
        $role = $this->find($auth, $id);
        if (!$role) {
            throw HttpException::notFound('Rôle introuvable.');
        }

        $remaining = $this->pdo->prepare(
            'SELECT id, name FROM roles WHERE company_id = :company_id AND id <> :id ORDER BY name',
        );
        $remaining->execute(['company_id' => $auth->companyId, 'id' => $id]);
        $others = $remaining->fetchAll();
        if (!$others) {
            throw HttpException::forbidden('Impossible de supprimer le dernier rôle.');
        }

        $owner = $this->pdo->prepare(
            'SELECT id FROM users WHERE company_id = :company_id AND role_id = :role_id AND is_company_owner = 1 LIMIT 1',
        );
        $owner->execute(['company_id' => $auth->companyId, 'role_id' => $id]);
        if ($owner->fetch()) {
            throw HttpException::forbidden('Ce rôle est affecté au propriétaire de l’entreprise.');
        }

        $fallback = $others[0];
        $this->pdo->prepare(
            'UPDATE users SET role_id = :fallback WHERE company_id = :company_id AND role_id = :role_id',
        )->execute([
            'fallback' => $fallback['id'],
            'company_id' => $auth->companyId,
            'role_id' => $id,
        ]);
        $this->pdo->prepare('DELETE FROM roles WHERE id = :id AND company_id = :company_id')
            ->execute(['id' => $id, 'company_id' => $auth->companyId]);
        $this->audit->record($auth, 'role.delete', 'utilisateurs', 'roles-permissions', 'role', $id, (string) $role['name'], $ip);

        return [
            'accessRoles' => $this->list($auth),
            'fallback' => ['id' => (string) $fallback['id'], 'name' => (string) $fallback['name']],
        ];
    }

    /** @return array{id:string,name:string,permissions:array} */
    private function one(AuthContext $auth, string $id): array
    {
        foreach ($this->list($auth) as $role) {
            if ($role['id'] === $id) {
                return $role;
            }
        }
        throw HttpException::notFound('Rôle introuvable.');
    }

    /** @return array<string, mixed>|null */
    private function find(AuthContext $auth, string $id): ?array
    {
        $stmt = $this->pdo->prepare(
            'SELECT id, name FROM roles WHERE id = :id AND company_id = :company_id LIMIT 1',
        );
        $stmt->execute(['id' => $id, 'company_id' => $auth->companyId]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    private function assertUniqueName(AuthContext $auth, string $name, ?string $ignoreId): void
    {
        $sql = 'SELECT id FROM roles WHERE company_id = :company_id AND name = :name';
        $params = ['company_id' => $auth->companyId, 'name' => $name];
        if ($ignoreId) {
            $sql .= ' AND id <> :id';
            $params['id'] = $ignoreId;
        }
        $stmt = $this->pdo->prepare($sql . ' LIMIT 1');
        $stmt->execute($params);
        if ($stmt->fetch()) {
            throw HttpException::conflict('Un rôle porte déjà ce libellé.');
        }
    }

    /** @param array<string, mixed> $permissions */
    private function replacePermissions(string $roleId, array $permissions): void
    {
        $this->pdo->prepare('DELETE FROM role_permissions WHERE role_id = :id')->execute(['id' => $roleId]);
        $stmt = $this->pdo->prepare(
            'INSERT INTO role_permissions (role_id, module_id, can_create, can_read, can_update, can_delete)
             VALUES (:role_id, :module_id, :c, :r, :u, :d)',
        );
        foreach (Modules::IDS as $module) {
            $row = is_array($permissions[$module] ?? null) ? $permissions[$module] : [];
            $stmt->execute([
                'role_id' => $roleId,
                'module_id' => $module,
                'c' => !empty($row['create']) ? 1 : 0,
                'r' => !empty($row['read']) ? 1 : 0,
                'u' => !empty($row['update']) ? 1 : 0,
                'd' => !empty($row['delete']) ? 1 : 0,
            ]);
        }
    }
}
