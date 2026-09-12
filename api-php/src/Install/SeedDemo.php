<?php

declare(strict_types=1);

namespace NanoPrint\Install;

use NanoPrint\Auth\AuthContext;
use NanoPrint\Services\CatalogueService;
use NanoPrint\Services\CompanyService;
use NanoPrint\Services\DocumentService;
use NanoPrint\Services\LookupService;
use NanoPrint\Services\MaterialService;
use NanoPrint\Services\SettingsService;
use NanoPrint\Services\WorkstationService;
use NanoPrint\Support\AuditLogger;
use PDO;

final class SeedDemo
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    public function run(): void
    {
        $count = (int) $this->pdo->query('SELECT COUNT(*) FROM companies')->fetchColumn();
        if ($count > 0) {
            echo "Seed ignoré : des entreprises existent déjà.\n";
            return;
        }

        $audit = new AuditLogger($this->pdo);
        $companies = new CompanyService($this->pdo, $audit);
        $created = $companies->create('NanoPrint', 'contact@nanoprint.sn', '123456');
        $companyId = $created['companyId'];
        $auth = $this->auth($created['userId'], $companyId);

        $lookups = new LookupService($this->pdo, $audit);
        $settings = new SettingsService($this->pdo, $audit);
        $materials = new MaterialService($this->pdo, $audit, $lookups);
        $workstations = new WorkstationService($this->pdo, $audit, $lookups);
        $catalogue = new CatalogueService($this->pdo, $audit, $lookups);
        $documents = new DocumentService($this->pdo, $audit);

        $settings->update($auth, [
            'tradeName' => 'NanoPrint',
            'legalName' => 'NanoPrint SARL',
            'legalForm' => 'SARL',
            'ninea' => '0065432 2A2',
            'rccm' => 'SN-DKR-2018-B-1234',
            'address' => 'Zone industrielle Hann Bel-Air',
            'city' => 'Dakar',
            'country' => 'Sénégal',
            'phone' => '+221 33 800 00 00',
            'email' => 'contact@nanoprint.sn',
            'website' => 'https://www.nanoprint.sn',
            'iban' => 'SN08 SN010 01001 0123456789 12',
            'bank' => 'CBAO groupe Attijariwafa',
            'workDays' => 'Lundi – samedi',
            'openingHours' => '07h30 – 18h30',
            'paperUnit' => 'Rame (500 feuilles) et feuille',
        ], '127.0.0.1');

        $this->seedUsers($companyId);
        $this->seedMaterials($auth, $materials);
        $this->seedWorkstations($auth, $workstations);
        $this->seedCatalogue($auth, $catalogue);
        $this->seedDocuments($auth, $documents);

        echo "Seed NanoPrint terminé. Comptes : contact@nanoprint.sn / 123456 et awa.diop@nanoprint.demo / demo2026\n";
    }

    private function auth(string $userId, string $companyId): AuthContext
    {
        $roleId = (string) $this->pdo->query("SELECT id FROM roles WHERE company_id = " . $this->pdo->quote($companyId) . " AND name = 'Administrateur' LIMIT 1")->fetchColumn();
        return new AuthContext($userId, $companyId, $roleId, 'Administrateur', 'NanoPrint', 'contact@nanoprint.sn', 'Actif', true, []);
    }

    private function seedUsers(string $companyId): void
    {
        $roles = [];
        $stmt = $this->pdo->prepare('SELECT id, name FROM roles WHERE company_id = :id');
        $stmt->execute(['id' => $companyId]);
        foreach ($stmt->fetchAll() as $row) {
            $roles[$row['name']] = $row['id'];
        }
        $hash = password_hash('demo2026', PASSWORD_DEFAULT);
        $users = [
            ['usr-1', 'USR-001', 'Awa Diop', 'awa.diop@nanoprint.demo', '+221 77 100 00 01', 'Cité Keur Gorgui, Dakar', 'Administrateur'],
            ['usr-2', 'USR-002', 'Moussa Konaté', 'moussa.konate@nanoprint.sn', '+221 77 100 00 02', 'Mermoz, Dakar', 'Commercial'],
            ['usr-3', 'USR-003', 'Fatou Bamba', 'fatou.bamba@nanoprint.sn', '+221 76 200 00 03', 'Sacré-Cœur, Dakar', 'Comptable'],
            ['usr-4', 'USR-004', 'Ibrahima Diallo', 'ibrahima.diallo@nanoprint.sn', '+221 78 300 00 04', 'Guédiawaye', 'Opérateur'],
        ];
        $insert = $this->pdo->prepare(
            'INSERT INTO users (id, company_id, role_id, name, email, phone, address, password_hash, status, is_company_owner)
             VALUES (:id, :company_id, :role_id, :name, :email, :phone, :address, :password_hash, :status, 0)',
        );
        foreach ($users as $user) {
            $insert->execute([
                'id' => $user[0],
                'company_id' => $companyId,
                'role_id' => $roles[$user[6]],
                'name' => $user[2],
                'email' => $user[3],
                'phone' => $user[4],
                'address' => $user[5],
                'password_hash' => $hash,
                'status' => 'Actif',
            ]);
        }
    }

    private function seedMaterials(AuthContext $auth, MaterialService $materials): void
    {
        $rows = [
            ['mat-1', 'MAT-CB135', 'Couché brillant 135 g — 70×100', 'Papier', 'rame', 15400, 18500, 20],
            ['mat-2', 'MAT-CM170', 'Couché mat 170 g — 65×92', 'Papier', 'rame', 19000, 22800, 20],
            ['mat-3', 'MAT-OF90', 'Offset 90 g — 65×92', 'Papier', 'rame', 9000, 11200, 15],
            ['mat-4', 'MAT-RE120', 'Recyclé 120 g — 70×100', 'Papier', 'rame', 11800, 14500, 10],
            ['mat-5', 'MAT-CB150', 'Couché 150 g numérique SRA3', 'Papier', 'rame', 7000, 8900, 12],
            ['mat-6', 'MAT-MAG', 'Encre Process Magenta 5 kg', 'Encre', 'fût 5 kg', 28500, 34200, 5],
            ['mat-7', 'MAT-CYA', 'Encre Process Cyan 5 kg', 'Encre', 'fût 5 kg', 28500, 34200, 8],
            ['mat-8', 'MAT-PLQ', 'Plaques offset 745×605', 'Plaque', 'plaque', 4800, 6200, 80],
            ['mat-9', 'MAT-VER', 'Vernis acrylique 20 L', 'Vernis', 'bidon 20 L', 93000, 118000, 3],
            ['mat-10', 'MAT-BLA', 'Blanchet Heidelberg XL 75', 'Blanchet', 'jeu', 185000, 240000, 2],
            ['mat-11', 'MAT-FILM', 'Film pelliculage mat 76 cm', 'Film', 'rouleau', 52500, 68000, 4],
        ];
        foreach ($rows as $row) {
            $materials->create($auth, [
                'id' => $row[0],
                'name' => $row[2],
                'type' => $row[3],
                'unit' => $row[4],
                'buyPrice' => $row[5],
                'sellPrice' => $row[6],
                'alertQty' => $row[7],
                'reference' => $row[1],
            ], '127.0.0.1');
        }
        $this->pdo->prepare('UPDATE materials SET quantity = 120 WHERE id = :id')->execute(['id' => 'mat-1']);
        $this->pdo->prepare('UPDATE materials SET quantity = 40 WHERE id = :id')->execute(['id' => 'mat-3']);
        $this->pdo->prepare('UPDATE materials SET quantity = 12 WHERE id = :id')->execute(['id' => 'mat-6']);
        $this->pdo->prepare('UPDATE materials SET quantity = 24 WHERE id = :id')->execute(['id' => 'mat-7']);
        $this->pdo->prepare('UPDATE materials SET quantity = 8 WHERE id = :id')->execute(['id' => 'mat-11']);
    }

    private function seedWorkstations(AuthContext $auth, WorkstationService $workstations): void
    {
        $rows = [
            ['Heidelberg Speedmaster XL 75', 'Impression', '15 000 feuilles/h', 185000, 105000, 'Actif', 'POS-01'],
            ['Konica Minolta AccurioPress C12000', 'Impression', '120 pages/min', 72000, 48000, 'Actif', 'POS-02'],
            ['Massicot Polar N 115', 'Façonnage', '45 cycles/min', 28000, 18000, 'Maintenance', 'POS-03'],
            ['Pelliculeuse Komfi Sagitta 76', 'Finition', '35 m/min', 34000, 14000, 'Actif', 'POS-04'],
            ['Quai expédition n°2', 'Expédition', '12 palettes/h', 12000, 80, 'Hors service', 'POS-05'],
        ];
        foreach ($rows as $row) {
            $workstations->create($auth, [
                'name' => $row[0],
                'workshop' => $row[1],
                'cadence' => $row[2],
                'hourlyCost' => $row[3],
                'capacity' => $row[4],
                'status' => $row[5],
                'reference' => $row[6],
            ], '127.0.0.1');
        }
    }

    private function seedCatalogue(AuthContext $auth, CatalogueService $catalogue): void
    {
        $priced = static fn(array $items) => json_encode(array_map(static fn($i) => ['label' => $i[0], 'price' => $i[1]], $items), JSON_UNESCAPED_UNICODE);
        $grid = static fn(array $items) => json_encode(array_map(static fn($i) => ['quantity' => $i[0], 'amount' => $i[1]], $items), JSON_UNESCAPED_UNICODE);
        $comp = static fn(array $items) => json_encode(array_map(static fn($i) => ['materialId' => $i[0], 'label' => $i[1], 'quantity' => $i[2], 'unit' => $i[3]], $items), JSON_UNESCAPED_UNICODE);

        $products = [
            ['cat-1', 'CAT-001', 'Cartes de visite', '85×55 mm · 350 g · Quadri R/V', 250, 18000, [[250, 18000], [500, 28000], [1000, 42000]], [['Recto seul', 18000], ['Recto-verso', 28000]], [['Couché mat 350 g', 0], ['Couché brillant 350 g', 1500], ['Carton letterpress 400 g', 12000]], [['Pelliculage soft touch', 8000], ['Coins arrondis', 3500], ['Dorure à chaud', 15000]], [['mat-1', 'Couché brillant 135 g — 70×100', 2, 'rame'], ['mat-6', 'Encre Process Magenta 5 kg', 1, 'fût 5 kg'], ['mat-11', 'Film pelliculage mat 76 cm', 1, 'rouleau']], 'Produit', 'Actif'],
            ['cat-2', 'CAT-002', 'Flyers', 'A5 · 135 g · Quadri R/V', 500, 42000, [[500, 42000], [2000, 95000], [5000, 185000]], [['Recto 4+0', 42000], ['Recto-verso 4+4', 58000]], [['Couché brillant 135 g', 0], ['Couché mat 170 g', 8000], ['Offset 90 g', -6000]], [['Vernis acrylique recto', 9000], ['Pelliculage mat', 14000]], [], 'Produit', 'Actif'],
            ['cat-3', 'CAT-003', 'Affiches', 'A3 · 170 g · Quadri R', 50, 24000, [[50, 24000], [100, 38000], [200, 62000]], [['Recto seul', 24000]], [['Couché brillant 170 g', 0], ['Couché mat 200 g', 4500], ['Photo 250 g', 9000]], [['Œillets 4 coins', 2500], ['Lamination anti-UV', 6000]], [], 'Produit', 'Actif'],
            ['cat-4', 'CAT-004', 'Brochures', 'A4 · 150 g · Quadri R/V', 200, 185000, [[200, 185000], [500, 320000], [1000, 540000]], [['8 pages 4+4', 185000], ['12 pages 4+4', 248000], ['16 pages 4+4', 312000]], [['Couché mat 150 g', 0], ['Couché brillant 170 g', 18000], ['Recyclé 120 g', 12000]], [['2 agrafes', 0], ['Pelliculage couverture', 28000], ['Rainage', 8000]], [], 'Produit', 'Actif'],
            ['cat-5', 'CAT-005', 'Catalogues', 'A4 · 150 g · Quadri R/V', 300, 980000, [[300, 980000], [1000, 2100000], [5000, 2850000]], [['32 pages 4+4', 980000], ['48 pages 4+4', 1380000], ['64 pages 4+4', 1760000]], [['Intérieur couché 150 g / couv. 250 g', 0], ['Intérieur 170 g / couv. 300 g', 120000]], [['Dos carré collé', 0], ['Pelliculage mat couverture', 85000], ['Signet satin', 45000]], [], 'Produit', 'Actif'],
            ['cat-17', 'CAT-017', 'Conception graphique', 'Mise en page et création visuelle', 1, 35000, [[1, 35000], [3, 90000], [5, 140000]], [], [], [], [], 'Prestation', 'Actif'],
        ];

        foreach ($products as $row) {
            $created = $catalogue->create($auth, [
                'id' => $row[0],
                'reference' => $row[1],
                'family' => $row[2],
                'designation' => $row[3],
                'minQuantity' => $row[4],
                'basePrice' => $row[5],
                'priceGrid' => $grid($row[6]),
                'printSides' => $priced($row[7]),
                'paperTypes' => $priced($row[8]),
                'extraOptions' => $priced($row[9]),
                'composition' => $comp($row[10]),
                'productKind' => $row[11],
                'status' => $row[12],
                'name' => $row[2] . ' · ' . $row[3],
            ], '127.0.0.1');
            if ($created['id'] !== $row[0]) {
                $this->pdo->prepare('UPDATE catalogue_products SET id = :next WHERE id = :old')
                    ->execute(['next' => $row[0], 'old' => $created['id']]);
            }
        }
    }

    private function seedDocuments(AuthContext $auth, DocumentService $documents): void
    {
        $block = static function (string $type, array $patch = []): array {
            $presets = [
                'logo' => ['x' => 6, 'y' => 5, 'w' => 14, 'h' => 9, 'content' => 'Logo'],
                'title' => ['x' => 22, 'y' => 5, 'w' => 72, 'h' => 8, 'content' => 'Document', 'fontSize' => 26],
                'text' => ['x' => 6, 'y' => 18, 'w' => 88, 'h' => 10, 'content' => 'Texte', 'fontSize' => 13],
                'table' => ['x' => 6, 'y' => 36, 'w' => 88, 'h' => 22, 'fontSize' => 12, 'rows' => [['Désignation', 'Qté', 'PU', 'Montant'], ['Ligne 1', '1', '0', '0']]],
                'line' => ['x' => 6, 'y' => 16, 'w' => 88, 'h' => 2, 'color' => '#08a6c9'],
            ];
            return array_merge([
                'id' => bin2hex(random_bytes(8)),
                'type' => $type,
                'x' => 6, 'y' => 8, 'w' => 40, 'h' => 8,
                'content' => '', 'src' => '', 'align' => 'left', 'fontSize' => 13, 'color' => '#181a18', 'rows' => [],
            ], $presets[$type] ?? [], $patch);
        };

        $templates = [
            ['mod-1', 'MOD-DV-01', 'Devis entreprise NanoPrint', 'Publié', [$block('logo'), $block('title', ['content' => 'DEVIS']), $block('text', ['y' => 16, 'content' => "Client : {{client}}\nRéférence : {{ref}} · Date : {{date}}"]), $block('table'), $block('text', ['y' => 74, 'content' => 'Total : {{amount}}'])]],
            ['mod-2', 'MOD-BC-02', 'Bon de commande atelier', 'Publié', [$block('title', ['content' => 'BON DE COMMANDE']), $block('table')]],
            ['mod-3', 'MOD-FA-03', 'Facture TTC Sénégal', 'Publié', [$block('title', ['content' => 'FACTURE']), $block('table')]],
            ['mod-4', 'MOD-BL-04', 'Bon de livraison tournée Dakar', 'Brouillon', [$block('title', ['content' => 'BON DE LIVRAISON']), $block('table')]],
            ['mod-5', 'MOD-DV-05', 'Devis pack agence 2025', 'Archivé', [$block('title', ['content' => 'DEVIS']), $block('table')]],
            ['mod-6', 'MOD-DV-TEST', 'Devis test', 'Publié', [$block('title', ['content' => 'DEVIS TEST']), $block('text', ['content' => 'Client : {{client}}']), $block('table')]],
        ];

        foreach ($templates as $row) {
            $layout = json_encode($row[4], JSON_UNESCAPED_UNICODE);
            $html = '<div class="np-a4"><h1>' . htmlspecialchars($row[2], ENT_QUOTES) . '</h1></div>';
            $documents->create($auth, [
                'name' => $row[2],
                'reference' => $row[1],
                'status' => $row[3],
                'layout' => $layout,
                'html' => $html,
            ], '127.0.0.1');
        }
    }
}
