<?php

declare(strict_types=1);

namespace NanoPrint\Services;

use NanoPrint\Auth\AuthContext;
use PDO;

final class BootstrapService
{
    public function __construct(
        private readonly PDO $pdo,
        private readonly SettingsService $settings,
        private readonly MaterialService $materials,
        private readonly CatalogueService $catalogue,
        private readonly WorkstationService $workstations,
        private readonly DocumentService $documents,
        private readonly LookupService $lookups,
    ) {
    }

    public function load(AuthContext $auth): array
    {
        $settings = $this->settings->get($auth);
        return [
            'user' => $auth->toUser(),
            'settings' => $settings,
            'accessRoles' => $this->roles($auth),
            'catalogueFamilies' => $this->lookups->names($auth, 'catalogue-families'),
            'workshops' => $this->lookups->names($auth, 'workshops'),
            'materialTypes' => $this->lookups->names($auth, 'material-types'),
            'materialUnits' => $this->lookups->names($auth, 'material-units'),
            'records' => [
                'matieres' => $this->materials->list($auth),
                'catalogue' => $this->catalogue->list($auth),
                'tarifs' => [],
                'postes' => $this->workstations->list($auth),
                'modeles-documents' => $this->documents->list($auth),
                'parametres-generaux' => [],
            ],
        ];
    }

    /** @return list<array{id:string,name:string,permissions:array}> */
    private function roles(AuthContext $auth): array
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
}
