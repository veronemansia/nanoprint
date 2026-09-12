<?php

declare(strict_types=1);

namespace NanoPrint\Support;

final class RecordMapper
{
    public static function stockStatus(float $quantity, float $alertQty): string
    {
        if ($quantity <= 0) {
            return 'Rupture';
        }
        if ($quantity <= $alertQty) {
            return 'Stock bas';
        }
        return 'Disponible';
    }

    /** @param array<string, mixed> $row */
    public static function material(array $row): array
    {
        $qty = (float) $row['quantity'];
        $buy = (float) $row['buy_price'];
        $alert = (float) $row['alert_qty'];
        return [
            'id' => $row['id'],
            'name' => $row['name'],
            'reference' => $row['reference'],
            'status' => self::stockStatus($qty, $alert),
            'updatedAt' => Dates::display($row['updated_at'] ?? null),
            'type' => $row['type_name'] ?? '',
            'unit' => $row['unit_name'] ?? '',
            'buyPrice' => $buy,
            'sellPrice' => (float) $row['sell_price'],
            'quantity' => $qty,
            'alertQty' => $alert,
            'value' => (int) round(max(0, $qty) * max(0, $buy)),
        ];
    }

    /** @param array<string, mixed> $row */
    public static function workstation(array $row): array
    {
        return [
            'id' => $row['id'],
            'name' => $row['name'],
            'reference' => $row['reference'],
            'status' => $row['status'],
            'updatedAt' => Dates::display($row['updated_at'] ?? null),
            'workshop' => $row['workshop_name'] ?? '',
            'cadence' => $row['cadence'],
            'hourlyCost' => (float) $row['hourly_cost'],
            'capacity' => (float) $row['capacity'],
        ];
    }

    /** @param array<string, mixed> $row */
    public static function catalogueProduct(
        array $row,
        array $composition,
        array $printSides,
        array $paperTypes,
        array $extraOptions,
        array $priceGrid,
    ): array {
        return [
            'id' => $row['id'],
            'name' => $row['name'],
            'reference' => $row['reference'],
            'status' => $row['status'],
            'updatedAt' => Dates::display($row['updated_at'] ?? null),
            'productKind' => $row['product_kind'],
            'family' => $row['family_name'] ?? '',
            'designation' => $row['designation'],
            'basePrice' => (float) $row['base_price'],
            'minQuantity' => (float) $row['min_quantity'],
            'quantity' => (float) ($row['quantity'] ?? 0),
            'unit' => $row['unit'] ?? 'u',
            'alertQty' => (float) ($row['alert_qty'] ?? 0),
            'composition' => json_encode($composition, JSON_UNESCAPED_UNICODE),
            'printSides' => json_encode($printSides, JSON_UNESCAPED_UNICODE),
            'paperTypes' => json_encode($paperTypes, JSON_UNESCAPED_UNICODE),
            'extraOptions' => json_encode($extraOptions, JSON_UNESCAPED_UNICODE),
            'priceGrid' => json_encode($priceGrid, JSON_UNESCAPED_UNICODE),
        ];
    }

    /** @param array<string, mixed> $row */
    public static function document(array $row): array
    {
        return [
            'id' => $row['id'],
            'name' => $row['name'],
            'reference' => $row['reference'],
            'status' => $row['status'],
            'updatedAt' => Dates::display($row['updated_at'] ?? null),
            'layout' => (string) ($row['layout_json'] ?? '[]'),
            'html' => (string) ($row['html'] ?? ''),
        ];
    }

    /** @param array<string, mixed> $row */
    public static function tax(array $row): array
    {
        return [
            'id' => $row['id'],
            'label' => $row['label'],
            'rate' => (float) $row['rate'],
            'active' => (bool) $row['active'],
            'code' => (string) $row['code'],
            'note' => (string) $row['note'],
        ];
    }

    /** @param array<string, mixed> $row */
    public static function currency(array $row): array
    {
        return [
            'id' => $row['id'],
            'label' => $row['label'],
            'symbol' => $row['symbol'],
            'decimals' => (int) $row['decimals'],
            'isDefault' => (bool) $row['is_default'],
        ];
    }

    public static function nextReference(string $prefix): string
    {
        return $prefix . '-' . substr((string) time(), -5);
    }

    /** @param array<string, mixed> $row */
    public static function audit(array $row): array
    {
        $action = (string) ($row['action'] ?? '');
        $moduleId = (string) ($row['module_id'] ?? '');
        $created = (string) ($row['created_at'] ?? '');
        $id = str_replace('-', '', (string) ($row['id'] ?? ''));
        return [
            'id' => $row['id'],
            'name' => self::auditActionLabel($action),
            'reference' => 'AUD-' . strtoupper(substr($id, 0, 8)),
            'status' => self::auditStatus($action),
            'updatedAt' => Dates::display($created ?: null),
            'author' => (string) ($row['author_name'] ?? 'Système'),
            'module' => Modules::LABELS[$moduleId] ?? ($moduleId !== '' ? $moduleId : 'Système'),
            'occurredAt' => $created !== '' ? substr($created, 0, 10) : '',
            'detail' => (string) ($row['detail'] ?? ''),
        ];
    }

    /** @param array<string, mixed> $row */
    public static function backup(array $row): array
    {
        $lastRun = $row['last_run'] ?? null;
        return [
            'id' => $row['id'],
            'name' => $row['name'],
            'reference' => $row['reference'],
            'status' => $row['status'],
            'updatedAt' => Dates::display($row['updated_at'] ?? null),
            'frequency' => (string) ($row['frequency'] ?? ''),
            'size' => (string) ($row['size'] ?? ''),
            'location' => (string) ($row['location'] ?? ''),
            'lastRun' => $lastRun ? substr((string) $lastRun, 0, 10) : '',
        ];
    }

    private static function auditActionLabel(string $action): string
    {
        return match ($action) {
            'auth.login' => 'Connexion',
            'auth.logout' => 'Déconnexion',
            'user.create' => 'Utilisateur créé',
            'user.update' => 'Utilisateur modifié',
            'user.delete' => 'Utilisateur supprimé',
            'role.create' => 'Rôle créé',
            'role.update' => 'Rôle modifié',
            'role.delete' => 'Rôle supprimé',
            'backup.create' => 'Sauvegarde lancée',
            'backup.delete' => 'Sauvegarde supprimée',
            'company.created' => 'Entreprise créée',
            default => $action !== '' ? $action : 'Action',
        };
    }

    private static function auditStatus(string $action): string
    {
        $action = strtolower($action);
        if (str_contains($action, 'delete') || str_contains($action, 'fail') || str_contains($action, 'suspend')) {
            return 'Critique';
        }
        if (str_contains($action, 'create') || str_contains($action, 'update') || str_contains($action, 'save') || str_contains($action, 'reset')) {
            return 'Modification';
        }
        return 'Info';
    }

    /** @param array<string, mixed> $row */
    public static function user(array $row): array
    {
        $lastLogin = $row['last_login_at'] ?? null;
        return [
            'id' => $row['id'],
            'name' => $row['name'],
            'reference' => $row['reference'],
            'status' => $row['status'],
            'updatedAt' => Dates::display($row['updated_at'] ?? null),
            'email' => (string) ($row['email'] ?? ''),
            'phone' => (string) ($row['phone'] ?? ''),
            'address' => (string) ($row['address'] ?? ''),
            'role' => (string) ($row['role_name'] ?? ''),
            'roleId' => $row['role_id'],
            'password' => '1',
            'lastLogin' => $lastLogin ? substr((string) $lastLogin, 0, 10) : '',
        ];
    }
}
