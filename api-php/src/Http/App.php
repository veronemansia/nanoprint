<?php

declare(strict_types=1);

namespace NanoPrint\Http;

use NanoPrint\Auth\AuthContext;
use NanoPrint\Auth\AuthService;
use NanoPrint\Auth\SessionService;
use NanoPrint\Config\Database;
use NanoPrint\Services\AuditService;
use NanoPrint\Services\BackupService;
use NanoPrint\Services\BootstrapService;
use NanoPrint\Services\CatalogueService;
use NanoPrint\Services\ClientContactService;
use NanoPrint\Services\ClientService;
use NanoPrint\Services\CompanyService;
use NanoPrint\Services\DepositService;
use NanoPrint\Services\DocumentService;
use NanoPrint\Services\InvoiceService;
use NanoPrint\Services\LookupService;
use NanoPrint\Services\MachineSlotService;
use NanoPrint\Services\MaterialService;
use NanoPrint\Services\OrderFileService;
use NanoPrint\Services\OrderService;
use NanoPrint\Services\QuoteService;
use NanoPrint\Services\AmendmentService;
use NanoPrint\Services\ReportService;
use NanoPrint\Services\RoleService;
use NanoPrint\Services\SettingsService;
use NanoPrint\Services\StockAlertService;
use NanoPrint\Services\StockService;
use NanoPrint\Services\InventoryService;
use NanoPrint\Services\SupplierService;
use NanoPrint\Services\SupplyService;
use NanoPrint\Services\TaxService;
use NanoPrint\Services\UserService;
use NanoPrint\Services\WorkstationService;
use NanoPrint\Support\AuditLogger;
use PDO;

final class App
{
    private PDO $pdo;
    private Router $router;
    private AuthService $auth;
    private CompanyService $companies;
    private SettingsService $settings;
    private TaxService $taxes;
    private LookupService $lookups;
    private MaterialService $materials;
    private WorkstationService $workstations;
    private CatalogueService $catalogue;
    private DocumentService $documents;
    private UserService $users;
    private RoleService $roles;
    private AuditService $audits;
    private BackupService $backups;
    private ClientService $clients;
    private ClientContactService $contacts;
    private QuoteService $quotes;
    private OrderService $orders;
    private AmendmentService $amendments;
    private InvoiceService $invoices;
    private DepositService $deposits;
    private OrderFileService $files;
    private MachineSlotService $slots;
    private SupplierService $suppliers;
    private SupplyService $supplies;
    private StockService $stock;
    private StockAlertService $alerts;
    private InventoryService $inventories;
    private ReportService $reports;
    private BootstrapService $bootstrap;

    public function __construct()
    {
        $this->pdo = Database::connect();
        $audit = new AuditLogger($this->pdo);
        $sessions = new SessionService($this->pdo);
        $this->auth = new AuthService($this->pdo, $sessions, $audit);
        $this->companies = new CompanyService($this->pdo, $audit);
        $this->settings = new SettingsService($this->pdo, $audit);
        $this->taxes = new TaxService($this->pdo, $audit);
        $this->lookups = new LookupService($this->pdo, $audit);
        $this->materials = new MaterialService($this->pdo, $audit, $this->lookups);
        $this->workstations = new WorkstationService($this->pdo, $audit, $this->lookups);
        $this->catalogue = new CatalogueService($this->pdo, $audit, $this->lookups);
        $this->documents = new DocumentService($this->pdo, $audit);
        $this->users = new UserService($this->pdo, $audit);
        $this->roles = new RoleService($this->pdo, $audit);
        $this->audits = new AuditService($this->pdo);
        $this->backups = new BackupService($this->pdo, $audit);
        $this->clients = new ClientService($this->pdo, $audit);
        $this->contacts = new ClientContactService($this->pdo, $audit);
        $orders = new OrderService($this->pdo, $audit);
        $stock = new StockService($this->pdo, $audit, $this->materials, $this->catalogue);
        $quotes = new QuoteService($this->pdo, $audit, $this->catalogue, $orders, $stock);
        $amendments = new AmendmentService($this->pdo, $audit, $this->catalogue, $orders);
        $invoices = new InvoiceService($this->pdo, $audit, $orders);
        $deposits = new DepositService($this->pdo, $audit, $orders);
        $files = new OrderFileService($this->pdo, $audit, $orders);
        $slots = new MachineSlotService($this->pdo, $audit, $orders);
        $suppliers = new SupplierService($this->pdo, $audit);
        $supplies = new SupplyService($this->pdo, $audit, $this->materials);
        $alerts = new StockAlertService($this->pdo, $audit, $stock, $this->materials, $this->catalogue);
        $inventories = new InventoryService($this->pdo, $audit, $stock, $this->materials, $this->catalogue);
        $this->bootstrap = new BootstrapService(
            $this->settings,
            $this->materials,
            $this->catalogue,
            $this->workstations,
            $this->documents,
            $this->lookups,
            $this->users,
            $this->roles,
            $this->audits,
            $this->backups,
            $this->clients,
            $this->contacts,
            $quotes,
            $orders,
            $amendments,
            $invoices,
            $deposits,
            $files,
            $slots,
            $suppliers,
            $supplies,
            $stock,
            $alerts,
            $inventories,
        );
        $this->quotes = $quotes;
        $this->orders = $orders;
        $this->amendments = $amendments;
        $this->invoices = $invoices;
        $this->deposits = $deposits;
        $this->files = $files;
        $this->slots = $slots;
        $this->suppliers = $suppliers;
        $this->supplies = $supplies;
        $this->stock = $stock;
        $this->alerts = $alerts;
        $this->inventories = $inventories;
        $this->reports = new ReportService($this->pdo);
        $this->router = new Router();
        $this->routes();
    }

    public function run(): void
    {
        try {
            $request = Request::fromGlobals();
            $match = $this->router->match($request);
            $request->params = $match['params'];
            $auth = null;
            if ($match['auth']) {
                $auth = $this->auth->contextFromToken($request->bearer());
                if ($match['module'] && $match['action'] && !$auth->can($match['module'], $match['action'])) {
                    throw HttpException::forbidden();
                }
            }
            $result = ($match['handler'])($request, $auth);
            if (is_array($result) && isset($result['__file'])) {
                FileResponse::send(
                    (string) $result['__file'],
                    (string) ($result['__name'] ?? 'fichier'),
                    (string) ($result['__mime'] ?? 'application/octet-stream'),
                );
            }
            if ($result === null) {
                JsonResponse::ok(null);
            }
            $status = is_array($result) && isset($result['__status']) ? (int) $result['__status'] : 200;
            if (is_array($result)) {
                unset($result['__status']);
            }
            JsonResponse::ok($result, $status);
        } catch (\Throwable $e) {
            ExceptionHandler::handle($e);
        }
    }

    private function routes(): void
    {
        $r = $this->router;
        $cfg = 'configuration';

        $r->add('POST', '/auth/login', function (Request $req): array {
            return $this->auth->login($req->string('email'), (string) ($req->body['password'] ?? ''), $req->ip, $req->userAgent);
        }, false);

        $r->add('POST', '/auth/logout', function (Request $req): array {
            $this->auth->logout($req->bearer(), $req->ip);
            return ['ok' => true];
        }, false);

        $r->add('GET', '/auth/me', function (Request $req, AuthContext $auth): array {
            return $auth->toUser();
        }, true);

        $r->add('GET', '/bootstrap', function (Request $req, AuthContext $auth): array {
            return $this->bootstrap->load($auth);
        }, true);

        $usr = 'utilisateurs';
        $r->add('GET', '/users', fn(Request $req, AuthContext $auth) => $this->users->list($auth), true, $usr, 'read');
        $r->add('POST', '/users', function (Request $req, AuthContext $auth): array {
            return [...$this->users->create($auth, $req->body, $req->ip), '__status' => 201];
        }, true, $usr, 'create');
        $r->add('PATCH', '/users/{id}', function (Request $req, AuthContext $auth): array {
            return $this->users->update($auth, $req->string('id'), $req->body, $req->ip);
        }, true, $usr, 'update');
        $r->add('DELETE', '/users/{id}', function (Request $req, AuthContext $auth): array {
            $this->users->delete($auth, $req->string('id'), $req->ip);
            return ['ok' => true];
        }, true, $usr, 'delete');

        $r->add('GET', '/roles', fn(Request $req, AuthContext $auth) => $this->roles->list($auth), true, $usr, 'read');
        $r->add('PUT', '/roles/{id}', function (Request $req, AuthContext $auth): array {
            return $this->roles->save($auth, [...$req->body, 'id' => $req->string('id')], $req->ip);
        }, true, $usr, 'update');
        $r->add('DELETE', '/roles/{id}', function (Request $req, AuthContext $auth): array {
            return $this->roles->delete($auth, $req->string('id'), $req->ip);
        }, true, $usr, 'delete');

        $r->add('GET', '/audit-logs', fn(Request $req, AuthContext $auth) => $this->audits->list($auth), true, $usr, 'read');

        $r->add('GET', '/backups', fn(Request $req, AuthContext $auth) => $this->backups->list($auth), true, $usr, 'read');
        $r->add('POST', '/backups', function (Request $req, AuthContext $auth): array {
            return [...$this->backups->create($auth, $req->body, $req->ip), '__status' => 201];
        }, true, $usr, 'create');
        $r->add('DELETE', '/backups/{id}', function (Request $req, AuthContext $auth): array {
            $this->backups->delete($auth, $req->string('id'), $req->ip);
            return ['ok' => true];
        }, true, $usr, 'delete');

        $r->add('POST', '/companies', function (Request $req, AuthContext $auth): array {
            $created = $this->companies->create(
                $req->string('name'),
                $req->string('email'),
                (string) ($req->body['password'] ?? '123456'),
                $auth,
                $req->ip,
            );
            return [...$created, '__status' => 201];
        }, true, 'utilisateurs', 'create');

        $r->add('GET', '/settings', fn(Request $req, AuthContext $auth) => $this->settings->get($auth), true, $cfg, 'read');
        $r->add('PUT', '/settings', function (Request $req, AuthContext $auth): array {
            return $this->settings->update($auth, $req->body, $req->ip);
        }, true, $cfg, 'update');
        $r->add('POST', '/settings/reset', function (Request $req, AuthContext $auth): array {
            return $this->settings->resetIdentity($auth, $req->ip);
        }, true, $cfg, 'update');

        $r->add('GET', '/taxes', fn(Request $req, AuthContext $auth) => $this->taxes->list($auth), true, $cfg, 'read');
        $r->add('POST', '/taxes', function (Request $req, AuthContext $auth): array {
            return [...$this->taxes->save($auth, $req->body, $req->ip), '__status' => 201];
        }, true, $cfg, 'create');
        $r->add('PATCH', '/taxes/{id}', function (Request $req, AuthContext $auth): array {
            return $this->taxes->save($auth, [...$req->body, 'id' => $req->string('id')], $req->ip);
        }, true, $cfg, 'update');
        $r->add('DELETE', '/taxes/{id}', function (Request $req, AuthContext $auth): array {
            $this->taxes->delete($auth, $req->string('id'), $req->ip);
            return ['ok' => true];
        }, true, $cfg, 'delete');
        $r->add('POST', '/taxes/reset', fn(Request $req, AuthContext $auth) => $this->taxes->reset($auth, $req->ip), true, $cfg, 'update');

        foreach (['workshops', 'material-types', 'material-units', 'catalogue-families'] as $kind) {
            $r->add('GET', '/' . $kind, fn(Request $req, AuthContext $auth) => $this->lookups->names($auth, $kind), true, $cfg, 'read');
            $r->add('POST', '/' . $kind, function (Request $req, AuthContext $auth) use ($kind): array {
                return ['name' => $this->lookups->add($auth, $kind, $req->string('name'), $req->ip)];
            }, true, $cfg, 'create');
            $r->add('PATCH', '/' . $kind, function (Request $req, AuthContext $auth) use ($kind): array {
                return ['name' => $this->lookups->rename($auth, $kind, $req->string('from'), $req->string('to'), $req->ip)];
            }, true, $cfg, 'update');
            $r->add('DELETE', '/' . $kind, function (Request $req, AuthContext $auth) use ($kind): array {
                return ['name' => $this->lookups->delete($auth, $kind, $req->string('name'), $req->ip)];
            }, true, $cfg, 'delete');
        }

        $r->add('GET', '/materials', fn(Request $req, AuthContext $auth) => $this->materials->list($auth), true, $cfg, 'read');
        $r->add('POST', '/materials', function (Request $req, AuthContext $auth): array {
            return [...$this->materials->create($auth, $req->body, $req->ip), '__status' => 201];
        }, true, $cfg, 'create');
        $r->add('PATCH', '/materials/{id}', function (Request $req, AuthContext $auth): array {
            return $this->materials->update($auth, $req->string('id'), $req->body, $req->ip);
        }, true, $cfg, 'update');
        $r->add('DELETE', '/materials/{id}', function (Request $req, AuthContext $auth): array {
            $this->materials->delete($auth, $req->string('id'), $req->ip);
            return ['ok' => true];
        }, true, $cfg, 'delete');

        $r->add('GET', '/workstations', fn(Request $req, AuthContext $auth) => $this->workstations->list($auth), true, $cfg, 'read');
        $r->add('POST', '/workstations', function (Request $req, AuthContext $auth): array {
            return [...$this->workstations->create($auth, $req->body, $req->ip), '__status' => 201];
        }, true, $cfg, 'create');
        $r->add('PATCH', '/workstations/{id}', function (Request $req, AuthContext $auth): array {
            return $this->workstations->update($auth, $req->string('id'), $req->body, $req->ip);
        }, true, $cfg, 'update');
        $r->add('DELETE', '/workstations/{id}', function (Request $req, AuthContext $auth): array {
            $this->workstations->delete($auth, $req->string('id'), $req->ip);
            return ['ok' => true];
        }, true, $cfg, 'delete');

        $r->add('GET', '/catalogue-products', fn(Request $req, AuthContext $auth) => $this->catalogue->list($auth), true, $cfg, 'read');
        $r->add('POST', '/catalogue-products', function (Request $req, AuthContext $auth): array {
            return [...$this->catalogue->create($auth, $req->body, $req->ip), '__status' => 201];
        }, true, $cfg, 'create');
        $r->add('PATCH', '/catalogue-products/{id}', function (Request $req, AuthContext $auth): array {
            return $this->catalogue->update($auth, $req->string('id'), $req->body, $req->ip);
        }, true, $cfg, 'update');
        $r->add('DELETE', '/catalogue-products/{id}', function (Request $req, AuthContext $auth): array {
            $this->catalogue->delete($auth, $req->string('id'), $req->ip);
            return ['ok' => true];
        }, true, $cfg, 'delete');

        $r->add('GET', '/document-templates', fn(Request $req, AuthContext $auth) => $this->documents->list($auth), true, $cfg, 'read');
        $r->add('POST', '/document-templates', function (Request $req, AuthContext $auth): array {
            return [...$this->documents->create($auth, $req->body, $req->ip), '__status' => 201];
        }, true, $cfg, 'create');
        $r->add('PATCH', '/document-templates/{id}', function (Request $req, AuthContext $auth): array {
            return $this->documents->update($auth, $req->string('id'), $req->body, $req->ip);
        }, true, $cfg, 'update');
        $r->add('DELETE', '/document-templates/{id}', function (Request $req, AuthContext $auth): array {
            $this->documents->delete($auth, $req->string('id'), $req->ip);
            return ['ok' => true];
        }, true, $cfg, 'delete');

        $crm = 'clients';
        $r->add('GET', '/clients', fn(Request $req, AuthContext $auth) => $this->clients->list($auth), true, $crm, 'read');
        $r->add('POST', '/clients', function (Request $req, AuthContext $auth): array {
            return [...$this->clients->create($auth, $req->body, $req->ip), '__status' => 201];
        }, true, $crm, 'create');
        $r->add('PATCH', '/clients/{id}', function (Request $req, AuthContext $auth): array {
            return $this->clients->update($auth, $req->string('id'), $req->body, $req->ip);
        }, true, $crm, 'update');
        $r->add('DELETE', '/clients/{id}', function (Request $req, AuthContext $auth): array {
            $this->clients->delete($auth, $req->string('id'), $req->ip);
            return ['ok' => true];
        }, true, $crm, 'delete');
        $r->add('GET', '/clients/{id}/history', function (Request $req, AuthContext $auth): array {
            return $this->clients->history($auth, $req->string('id'));
        }, true, $crm, 'read');
        $r->add('POST', '/clients/assign-sector', function (Request $req, AuthContext $auth): array {
            $ids = is_array($req->body['ids'] ?? null) ? $req->body['ids'] : [];
            return $this->clients->assignSector($auth, $ids, (string) ($req->body['sector'] ?? ''), $req->ip);
        }, true, $crm, 'update');

        $r->add('GET', '/client-sectors', fn(Request $req, AuthContext $auth) => $this->clients->sectors($auth), true, $crm, 'read');
        $r->add('POST', '/client-sectors', function (Request $req, AuthContext $auth): array {
            return ['name' => $this->clients->addSector($auth, $req->string('name'), $req->ip)];
        }, true, $crm, 'create');
        $r->add('PATCH', '/client-sectors', function (Request $req, AuthContext $auth): array {
            return ['name' => $this->clients->renameSector($auth, $req->string('from'), $req->string('to'), $req->ip)];
        }, true, $crm, 'update');
        $r->add('DELETE', '/client-sectors', function (Request $req, AuthContext $auth): array {
            return ['name' => $this->clients->deleteSector($auth, $req->string('name'), $req->ip)];
        }, true, $crm, 'delete');

        $r->add('GET', '/client-contacts', fn(Request $req, AuthContext $auth) => $this->contacts->list($auth), true, $crm, 'read');
        $r->add('POST', '/client-contacts', function (Request $req, AuthContext $auth): array {
            return [...$this->contacts->create($auth, $req->body, $req->ip), '__status' => 201];
        }, true, $crm, 'create');
        $r->add('PATCH', '/client-contacts/{id}', function (Request $req, AuthContext $auth): array {
            return $this->contacts->update($auth, $req->string('id'), $req->body, $req->ip);
        }, true, $crm, 'update');
        $r->add('DELETE', '/client-contacts/{id}', function (Request $req, AuthContext $auth): array {
            $this->contacts->delete($auth, $req->string('id'), $req->ip);
            return ['ok' => true];
        }, true, $crm, 'delete');

        $dc = 'devis-commandes';
        $r->add('GET', '/quotes', function (Request $req, AuthContext $auth): array {
            return $this->quotes->list($auth, $req->string('kind', QuoteService::KIND_CHIFRAGE));
        }, true, $dc, 'read');
        $r->add('POST', '/quotes', function (Request $req, AuthContext $auth): array {
            return [...$this->quotes->create($auth, $req->body, $req->ip), '__status' => 201];
        }, true, $dc, 'create');
        $r->add('PATCH', '/quotes/{id}', function (Request $req, AuthContext $auth): array {
            return $this->quotes->update($auth, $req->string('id'), $req->body, $req->ip);
        }, true, $dc, 'update');
        $r->add('DELETE', '/quotes/{id}', function (Request $req, AuthContext $auth): array {
            $this->quotes->delete($auth, $req->string('id'), $req->ip);
            return ['ok' => true];
        }, true, $dc, 'delete');
        $r->add('POST', '/quotes/{id}/convert', function (Request $req, AuthContext $auth): array {
            return $this->quotes->convert($auth, $req->string('id'), $req->ip);
        }, true, $dc, 'create');

        $r->add('GET', '/orders', fn(Request $req, AuthContext $auth) => $this->orders->list($auth), true, $dc, 'read');
        $r->add('PATCH', '/orders/{id}', function (Request $req, AuthContext $auth): array {
            return $this->orders->updateStatus($auth, $req->string('id'), $req->body, $req->ip);
        }, true, $dc, 'update');
        $r->add('DELETE', '/orders/{id}', function (Request $req, AuthContext $auth): array {
            $this->orders->delete($auth, $req->string('id'), $req->ip);
            return ['ok' => true];
        }, true, $dc, 'delete');
        $r->add('GET', '/order-amendments', fn(Request $req, AuthContext $auth) => $this->amendments->list($auth), true, $dc, 'read');
        $r->add('POST', '/orders/{id}/amendments', function (Request $req, AuthContext $auth): array {
            return [...$this->amendments->apply($auth, $req->string('id'), $req->body, $req->ip), '__status' => 201];
        }, true, $dc, 'create');

        $bill = 'facturation';
        $r->add('GET', '/invoices', fn(Request $req, AuthContext $auth) => $this->invoices->list($auth), true, $bill, 'read');
        $r->add('POST', '/orders/{id}/invoices', function (Request $req, AuthContext $auth): array {
            return [...$this->invoices->issue($auth, $req->string('id'), $req->body, $req->ip), '__status' => 201];
        }, true, $bill, 'create');
        $r->add('GET', '/deposits', fn(Request $req, AuthContext $auth) => $this->deposits->list($auth), true, $bill, 'read');
        $r->add('POST', '/orders/{id}/deposit-payments', function (Request $req, AuthContext $auth): array {
            return [...$this->deposits->recordPayment($auth, $req->string('id'), $req->body['amount'] ?? 0, $req->ip), '__status' => 201];
        }, true, $bill, 'create');

        $pp = 'prepress';
        $r->add('GET', '/order-files', fn(Request $req, AuthContext $auth) => $this->files->list($auth), true, $pp, 'read');
        $r->add('POST', '/orders/{id}/files', function (Request $req, AuthContext $auth): array {
            return ['files' => $this->files->upload($auth, $req->string('id'), $req->files, $req->ip), '__status' => 201];
        }, true, $pp, 'create');
        $r->add('POST', '/order-files/{id}/replace', function (Request $req, AuthContext $auth): array {
            $upload = $req->files[0] ?? null;
            if (!$upload) {
                throw HttpException::unprocessable('Choisissez au moins un fichier.');
            }
            return $this->files->replace($auth, $req->string('id'), $upload, $req->ip);
        }, true, $pp, 'update');
        $r->add('DELETE', '/order-files/{id}', function (Request $req, AuthContext $auth): array {
            $this->files->delete($auth, $req->string('id'), $req->ip);
            return ['ok' => true];
        }, true, $pp, 'delete');
        $r->add('GET', '/order-files/{id}/download', function (Request $req, AuthContext $auth): array {
            return $this->files->download($auth, $req->string('id'));
        }, true, $pp, 'read');

        $plan = 'planification';
        $r->add('GET', '/machine-slots', fn(Request $req, AuthContext $auth) => $this->slots->list($auth), true, $plan, 'read');
        $r->add('POST', '/machine-slots', function (Request $req, AuthContext $auth): array {
            return [...$this->slots->create($auth, $req->body, $req->ip), '__status' => 201];
        }, true, $plan, 'create');
        $r->add('PATCH', '/machine-slots/{id}', function (Request $req, AuthContext $auth): array {
            return $this->slots->update($auth, $req->string('id'), $req->body, $req->ip);
        }, true, $plan, 'update');
        $r->add('DELETE', '/machine-slots/{id}', function (Request $req, AuthContext $auth): array {
            $this->slots->delete($auth, $req->string('id'), $req->ip);
            return ['ok' => true];
        }, true, $plan, 'delete');

        $buy = 'achats';
        $r->add('GET', '/suppliers', fn(Request $req, AuthContext $auth) => $this->suppliers->list($auth), true, $buy, 'read');
        $r->add('POST', '/suppliers', function (Request $req, AuthContext $auth): array {
            return [...$this->suppliers->create($auth, $req->body, $req->ip), '__status' => 201];
        }, true, $buy, 'create');
        $r->add('PATCH', '/suppliers/{id}', function (Request $req, AuthContext $auth): array {
            return $this->suppliers->update($auth, $req->string('id'), $req->body, $req->ip);
        }, true, $buy, 'update');
        $r->add('DELETE', '/suppliers/{id}', function (Request $req, AuthContext $auth): array {
            $this->suppliers->delete($auth, $req->string('id'), $req->ip);
            return ['ok' => true];
        }, true, $buy, 'delete');

        $r->add('GET', '/supplies', fn(Request $req, AuthContext $auth) => $this->supplies->list($auth), true, $buy, 'read');
        $r->add('POST', '/supplies', function (Request $req, AuthContext $auth): array {
            return [...$this->supplies->create($auth, $req->body, $req->ip), '__status' => 201];
        }, true, $buy, 'create');
        $r->add('DELETE', '/supplies/{id}', function (Request $req, AuthContext $auth): array {
            return $this->supplies->delete($auth, $req->string('id'), $req->ip);
        }, true, $buy, 'delete');

        $stk = 'stocks';
        $r->add('GET', '/stock-movements', fn(Request $req, AuthContext $auth) => $this->stock->listMovements($auth), true, $stk, 'read');
        $r->add('POST', '/stock-withdrawals', function (Request $req, AuthContext $auth): array {
            return [...$this->stock->withdraw($auth, $req->body, $req->ip), '__status' => 201];
        }, true, $stk, 'update');

        $r->add('GET', '/stock-alerts', fn(Request $req, AuthContext $auth) => $this->alerts->list($auth), true, $stk, 'read');
        $r->add('POST', '/stock-alerts', function (Request $req, AuthContext $auth): array {
            return [...$this->alerts->create($auth, $req->body, $req->ip), '__status' => 201];
        }, true, $stk, 'create');
        $r->add('PATCH', '/stock-alerts/{id}', function (Request $req, AuthContext $auth): array {
            return $this->alerts->update($auth, $req->string('id'), $req->body, $req->ip);
        }, true, $stk, 'update');
        $r->add('DELETE', '/stock-alerts/{id}', function (Request $req, AuthContext $auth): array {
            $this->alerts->delete($auth, $req->string('id'), $req->ip);
            return ['ok' => true];
        }, true, $stk, 'delete');

        $r->add('GET', '/inventories', fn(Request $req, AuthContext $auth) => $this->inventories->list($auth), true, $stk, 'read');
        $r->add('PATCH', '/inventories/{id}', function (Request $req, AuthContext $auth): array {
            return $this->inventories->update($auth, $req->string('id'), $req->body, $req->ip);
        }, true, $stk, 'update');
        $r->add('DELETE', '/inventories/{id}', function (Request $req, AuthContext $auth): array {
            $this->inventories->delete($auth, $req->string('id'), $req->ip);
            return ['ok' => true];
        }, true, $stk, 'delete');

        $r->add('GET', '/reports', function (Request $req, AuthContext $auth): array {
            return $this->reports->bundle($auth, $req->string('from'), $req->string('to'));
        }, true);
        $r->add('GET', '/reports/export', function (Request $req, AuthContext $auth): array {
            return $this->reports->exportCsv($auth, $req->string('kind'), $req->string('from'), $req->string('to'));
        }, true);
    }
}
