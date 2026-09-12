<?php

declare(strict_types=1);

namespace NanoPrint\Services;

use NanoPrint\Auth\AuthContext;

final class BootstrapService
{
    public function __construct(
        private readonly SettingsService $settings,
        private readonly MaterialService $materials,
        private readonly CatalogueService $catalogue,
        private readonly WorkstationService $workstations,
        private readonly DocumentService $documents,
        private readonly LookupService $lookups,
        private readonly UserService $users,
        private readonly RoleService $roles,
        private readonly AuditService $audits,
        private readonly BackupService $backups,
    ) {
    }

    public function load(AuthContext $auth): array
    {
        $settings = $this->settings->get($auth);
        return [
            'user' => $auth->toUser(),
            'settings' => $settings,
            'accessRoles' => $this->roles->list($auth),
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
                'roles-permissions' => $this->users->list($auth),
                'audit-trail' => $this->audits->list($auth),
                'sauvegardes' => $this->backups->list($auth),
            ],
        ];
    }
}
