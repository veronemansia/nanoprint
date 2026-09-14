<?php

declare(strict_types=1);

namespace NanoPrint\Services;

use NanoPrint\Auth\AuthContext;
use NanoPrint\Http\HttpException;
use NanoPrint\Support\AuditLogger;
use NanoPrint\Support\FileLogger;
use NanoPrint\Support\Modules;
use NanoPrint\Support\Uuid;
use NanoPrint\Support\Validator;
use PDO;

final class CompanyService
{
    public function __construct(
        private readonly PDO $pdo,
        private readonly AuditLogger $audit,
    ) {
    }

    /** @return array{companyId:string,userId:string} */
    public function create(string $name, string $email, string $password = '123456', ?AuthContext $actor = null, string $ip = ''): array
    {
        $name = Validator::required($name, 'Le nom de l’entreprise est obligatoire.');
        $email = Validator::email($email);
        if (strlen($password) < 6) {
            throw HttpException::unprocessable('Le mot de passe doit contenir au moins 6 caractères.');
        }

        $exists = $this->pdo->prepare('SELECT id FROM companies WHERE email = :email LIMIT 1');
        $exists->execute(['email' => $email]);
        if ($exists->fetch()) {
            throw HttpException::conflict('Une entreprise utilise déjà cet e-mail.');
        }

        $companyId = Uuid::v4();
        $this->pdo->beginTransaction();
        try {
            $this->pdo->prepare(
                'INSERT INTO companies (id, name, email, status) VALUES (:id, :name, :email, :status)',
            )->execute(['id' => $companyId, 'name' => $name, 'email' => $email, 'status' => 'Actif']);

            $roleIds = $this->insertDefaultRoles($companyId);
            $userId = Uuid::v4();
            $this->pdo->prepare(
                'INSERT INTO users (id, company_id, role_id, name, reference, email, phone, address, password_hash, status, is_company_owner)
                 VALUES (:id, :company_id, :role_id, :name, :reference, :email, :phone, :address, :password_hash, :status, 1)',
            )->execute([
                'id' => $userId,
                'company_id' => $companyId,
                'role_id' => $roleIds['Administrateur'],
                'name' => $name,
                'reference' => 'USR-001',
                'email' => $email,
                'phone' => '',
                'address' => '',
                'password_hash' => password_hash($password, PASSWORD_DEFAULT),
                'status' => 'Actif',
            ]);

            $this->insertDefaultSettings($companyId, $name, $email);
            $this->insertDefaultLookups($companyId);
            $this->pdo->commit();
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            FileLogger::error('company.create_failed', $e->getMessage());
            throw $e;
        }

        $auth = $actor ?? new AuthContext($userId, $companyId, $roleIds['Administrateur'], 'Administrateur', $name, $email, 'Actif', true, []);
        $this->audit->record($auth, 'company.created', 'utilisateurs', 'roles-permissions', 'company', $companyId, $name, $ip);
        return ['companyId' => $companyId, 'userId' => $userId];
    }

    /** @return array<string, string> */
    private function insertDefaultRoles(string $companyId): array
    {
        $ids = [];
        foreach (array_keys(Modules::DEFAULT_ROLES) as $roleName) {
            $id = $roleName === 'Administrateur' ? 'role-admin' : (
                $roleName === 'Commercial' ? 'role-commercial' : (
                    $roleName === 'Opérateur' ? 'role-operateur' : 'role-comptable'
                )
            );
            // Keep stable seed ids only for first company; others get UUIDs if collision.
            $check = $this->pdo->prepare('SELECT id FROM roles WHERE id = :id');
            $check->execute(['id' => $id]);
            if ($check->fetch()) {
                $id = Uuid::v4();
            }
            $this->pdo->prepare(
                'INSERT INTO roles (id, company_id, name) VALUES (:id, :company_id, :name)',
            )->execute(['id' => $id, 'company_id' => $companyId, 'name' => $roleName]);
            $ids[$roleName] = $id;
            $this->insertRolePermissions($id, $roleName);
        }
        return $ids;
    }

    private function insertRolePermissions(string $roleId, string $roleName): void
    {
        $spec = Modules::DEFAULT_ROLES[$roleName] ?? [];
        $stmt = $this->pdo->prepare(
            'INSERT INTO role_permissions (role_id, module_id, can_create, can_read, can_update, can_delete)
             VALUES (:role_id, :module_id, :c, :r, :u, :d)',
        );
        foreach (Modules::IDS as $module) {
            $full = $spec === 'full';
            $list = is_array($spec) ? $spec : [];
            $readOnly = in_array($module . '-read', $list, true);
            $granted = $full || in_array($module, $list, true);
            $stmt->execute([
                'role_id' => $roleId,
                'module_id' => $module,
                'c' => $granted && !$readOnly ? 1 : 0,
                'r' => ($granted || $readOnly) ? 1 : 0,
                'u' => $granted && !$readOnly ? 1 : 0,
                'd' => $full ? 1 : 0,
            ]);
        }
    }

    private function insertDefaultSettings(string $companyId, string $name, string $email): void
    {
        $this->pdo->prepare(
            'INSERT INTO company_settings
                (company_id, trade_name, legal_name, legal_form, ninea, rccm, address, city, country, phone, email, website, iban, bank, logo, work_days, opening_hours, paper_unit)
             VALUES
                (:company_id, :trade_name, :legal_name, :legal_form, :ninea, :rccm, :address, :city, :country, :phone, :email, :website, :iban, :bank, :logo, :work_days, :opening_hours, :paper_unit)',
        )->execute([
            'company_id' => $companyId,
            'trade_name' => $name,
            'legal_name' => $name . ' SARL',
            'legal_form' => 'SARL',
            'ninea' => '',
            'rccm' => '',
            'address' => '',
            'city' => '',
            'country' => 'Sénégal',
            'phone' => '',
            'email' => $email,
            'website' => '',
            'iban' => '',
            'bank' => '',
            'logo' => '',
            'work_days' => 'Lundi – samedi',
            'opening_hours' => '07h30 – 18h30',
            'paper_unit' => 'Rame (500 feuilles) et feuille',
        ]);

        $currencies = [
            ['cur-xof', 'Franc', '', 0, 1],
            ['cur-eur', 'Euro', '€', 2, 0],
            ['cur-usd', 'Dollar US', '$', 2, 0],
        ];
        $cstmt = $this->pdo->prepare(
            'INSERT INTO currencies (id, company_id, label, symbol, decimals, is_default, sort_order) VALUES (:id, :company_id, :label, :symbol, :decimals, :is_default, :sort_order)',
        );
        foreach ($currencies as $index => $item) {
            $id = $item[0];
            $exists = $this->pdo->prepare('SELECT id FROM currencies WHERE id = :id');
            $exists->execute(['id' => $id]);
            if ($exists->fetch()) {
                $id = Uuid::v4();
            }
            $cstmt->execute([
                'id' => $id,
                'company_id' => $companyId,
                'label' => $item[1],
                'symbol' => $item[2],
                'decimals' => $item[3],
                'is_default' => $item[4],
                'sort_order' => $index,
            ]);
        }

        $taxes = [
            ['tax-tva', 'TVA', 18, 1, 'TVA', 'Taxe sur la valeur ajoutée'],
            ['tax-para', 'Taxe parafiscale', 1, 0, 'TPF', 'Contribution parafiscale'],
        ];
        $tstmt = $this->pdo->prepare(
            'INSERT INTO taxes (id, company_id, label, rate, active, code, note) VALUES (:id, :company_id, :label, :rate, :active, :code, :note)',
        );
        foreach ($taxes as $item) {
            $id = $item[0];
            $exists = $this->pdo->prepare('SELECT id FROM taxes WHERE id = :id');
            $exists->execute(['id' => $id]);
            if ($exists->fetch()) {
                $id = Uuid::v4();
            }
            $tstmt->execute([
                'id' => $id,
                'company_id' => $companyId,
                'label' => $item[1],
                'rate' => $item[2],
                'active' => $item[3],
                'code' => $item[4],
                'note' => $item[5],
            ]);
        }
    }

    private function insertDefaultLookups(string $companyId): void
    {
        $this->insertNamed($companyId, 'workshops', ['Impression', 'Finition', 'Façonnage', 'Expédition']);
        $this->insertNamed($companyId, 'material_types', ['Papier', 'Encre', 'Plaque', 'Vernis', 'Blanchet', 'Film']);
        $this->insertNamed($companyId, 'material_units', ['rame', 'feuille', 'kg', 'fût 5 kg', 'litre', 'bidon 20 L', 'plaque', 'jeu', 'mètre', 'rouleau']);
        $this->insertNamed($companyId, 'client_sectors', [
            'Entreprises', 'Particuliers', 'Écoles', 'Restaurants', 'Hôtels',
            'Associations', 'Agences de communication', 'Administrations',
        ]);
        $this->insertNamed($companyId, 'catalogue_families', [
            'Cartes de visite', 'Flyers', 'Affiches', 'Brochures', 'Catalogues', 'Invitations', 'Calendriers',
            'T-shirts imprimés', 'Bâches', 'Stickers', 'Enveloppes', 'Papier à en-tête', 'Reliures',
            'Plastification', 'Photocopies', 'Kakemonos', 'Chemises à rabat', 'Carnets', 'Menus',
            'Packaging', 'Conception graphique',
        ]);
    }

    /** @param list<string> $names */
    private function insertNamed(string $companyId, string $table, array $names): void
    {
        $stmt = $this->pdo->prepare("INSERT INTO {$table} (id, company_id, name, sort_order) VALUES (:id, :company_id, :name, :sort_order)");
        foreach ($names as $index => $name) {
            $stmt->execute([
                'id' => Uuid::v4(),
                'company_id' => $companyId,
                'name' => $name,
                'sort_order' => $index,
            ]);
        }
    }
}
