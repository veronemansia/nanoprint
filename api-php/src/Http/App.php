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
use NanoPrint\Services\CompanyService;
use NanoPrint\Services\DocumentService;
use NanoPrint\Services\LookupService;
use NanoPrint\Services\MaterialService;
use NanoPrint\Services\RoleService;
use NanoPrint\Services\SettingsService;
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
        );
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
        }, true, $cfg, 'read');

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
    }
}
