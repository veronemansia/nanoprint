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
        private readonly ClientService $clients,
        private readonly ClientContactService $contacts,
        private readonly QuoteService $quotes,
        private readonly OrderService $orders,
        private readonly AmendmentService $amendments,
        private readonly InvoiceService $invoices,
        private readonly DepositService $deposits,
        private readonly OrderFileService $files,
        private readonly MachineSlotService $slots,
        private readonly SupplierService $suppliers,
        private readonly SupplyService $supplies,
        private readonly StockService $stock,
        private readonly StockAlertService $alerts,
        private readonly InventoryService $inventories,
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
            'clientSectors' => $this->clients->sectors($auth),
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
                'fiches-clients' => $this->clients->list($auth),
                'contacts-multiples' => $this->contacts->list($auth),
                'calculateur' => $this->quotes->list($auth, QuoteService::KIND_CHIFRAGE),
                'devis-multi' => $this->quotes->list($auth, QuoteService::KIND_DEVIS),
                'statuts-commandes' => $this->orders->list($auth),
                'avenants' => $this->amendments->list($auth),
                'factures' => $this->invoices->list($auth),
                'acomptes' => $this->deposits->list($auth),
                'fichiers-clients' => $this->files->list($auth),
                'planning-machines' => $this->slots->list($auth),
                'fournisseurs' => $this->suppliers->list($auth),
                'approvisionnement' => $this->supplies->list($auth),
                'seuils-alerte' => $this->alerts->list($auth),
                'inventaire' => $this->inventories->list($auth),
                'stock-mouvements' => $this->stock->listMovements($auth),
            ],
        ];
    }
}
