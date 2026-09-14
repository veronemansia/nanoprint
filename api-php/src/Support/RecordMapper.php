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
            'label' => self::currencyLabel($row['label'] ?? ''),
            'symbol' => self::currencySymbol($row['symbol'] ?? ''),
            'decimals' => (int) $row['decimals'],
            'isDefault' => (bool) $row['is_default'],
        ];
    }

    public static function currencyLabel(mixed $value): string
    {
        $label = trim((string) $value);
        $label = (string) preg_replace('/\bfrancs?\s*CFA\b/iu', 'Franc', $label);
        $label = (string) preg_replace('/\bF\s*CFA\b/iu', '', $label);
        $label = (string) preg_replace('/\bCFA\b/iu', '', $label);
        return trim((string) preg_replace('/\s+/u', ' ', $label));
    }

    public static function currencySymbol(mixed $value): string
    {
        $symbol = trim((string) $value);
        $symbol = (string) preg_replace('/\bF\s*CFA\b/iu', '', $symbol);
        $symbol = (string) preg_replace('/\bCFA\b/iu', '', $symbol);
        return trim((string) preg_replace('/\s+/u', ' ', $symbol));
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
        $stamp = Dates::stamp($created ?: null);
        $detail = trim((string) ($row['detail'] ?? ''));
        return [
            'id' => $row['id'],
            'name' => self::auditActionLabel($action),
            'reference' => 'AUD-' . strtoupper(substr($id, 0, 8)),
            'status' => self::auditStatus($action),
            'updatedAt' => $stamp,
            'author' => (string) ($row['author_name'] ?? '') !== '' ? (string) $row['author_name'] : 'Système',
            'module' => Modules::LABELS[$moduleId] ?? ($moduleId !== '' ? $moduleId : 'Système'),
            'occurredAt' => $stamp,
            'detail' => $detail !== '' ? $detail : self::auditActionLabel($action),
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
            'auth.login_failed' => 'Connexion refusée',
            'auth.login_blocked' => 'Connexion bloquée',
            'user.create' => 'Utilisateur créé',
            'user.update' => 'Utilisateur modifié',
            'user.delete' => 'Utilisateur supprimé',
            'role.create' => 'Rôle créé',
            'role.update' => 'Rôle modifié',
            'role.delete' => 'Rôle supprimé',
            'backup.create' => 'Sauvegarde lancée',
            'backup.delete' => 'Sauvegarde supprimée',
            'company.created' => 'Entreprise créée',
            'settings.update' => 'Paramètres généraux modifiés',
            'settings.reset' => 'Paramètres généraux restaurés',
            'tax.create' => 'Taxe créée',
            'tax.update' => 'Taxe modifiée',
            'tax.delete' => 'Taxe supprimée',
            'tax.reset' => 'Taxes restaurées',
            'material.create' => 'Matière créée',
            'material.update' => 'Matière modifiée',
            'material.delete' => 'Matière supprimée',
            'workstation.create' => 'Poste créé',
            'workstation.update' => 'Poste modifié',
            'workstation.delete' => 'Poste supprimé',
            'catalogue.create' => 'Produit catalogue créé',
            'catalogue.update' => 'Produit catalogue modifié',
            'catalogue.delete' => 'Produit catalogue supprimé',
            'tarif.update' => 'Grille tarifaire modifiée',
            'document.create' => 'Modèle de document créé',
            'document.update' => 'Modèle de document modifié',
            'document.delete' => 'Modèle de document supprimé',
            'workshops.create' => 'Atelier créé',
            'workshops.rename' => 'Atelier renommé',
            'workshops.delete' => 'Atelier supprimé',
            'material-types.create' => 'Type de matière créé',
            'material-types.rename' => 'Type de matière renommé',
            'material-types.delete' => 'Type de matière supprimé',
            'material-units.create' => 'Unité de matière créée',
            'material-units.rename' => 'Unité de matière renommée',
            'material-units.delete' => 'Unité de matière supprimée',
            'catalogue-families.create' => 'Famille catalogue créée',
            'catalogue-families.rename' => 'Famille catalogue renommée',
            'catalogue-families.delete' => 'Famille catalogue supprimée',
            'client.create' => 'Client créé',
            'client.update' => 'Client modifié',
            'client.delete' => 'Client supprimé',
            'client.assign_sector' => 'Clients affectés à un secteur',
            'client-sectors.create' => 'Secteur client créé',
            'client-sectors.rename' => 'Secteur client renommé',
            'client-sectors.delete' => 'Secteur client supprimé',
            'contact.create' => 'Contact créé',
            'contact.update' => 'Contact modifié',
            'contact.delete' => 'Contact supprimé',
            'quote.create' => 'Devis créé',
            'quote.update' => 'Devis modifié',
            'quote.delete' => 'Devis supprimé',
            'quote.convert' => 'Devis converti en commande',
            'order.create' => 'Commande créée',
            'order.update_status' => 'Statut de commande modifié',
            'order.delete' => 'Commande supprimée',
            'order.amend' => 'Avenant de commande',
            default => $action !== '' ? $action : 'Action',
        };
    }

    private static function auditStatus(string $action): string
    {
        $action = strtolower($action);
        if (str_contains($action, 'delete') || str_contains($action, 'fail') || str_contains($action, 'suspend') || str_contains($action, 'blocked')) {
            return 'Critique';
        }
        if (str_contains($action, 'create') || str_contains($action, 'update') || str_contains($action, 'save') || str_contains($action, 'reset') || str_contains($action, 'rename') || str_contains($action, 'assign') || str_contains($action, 'convert') || str_contains($action, 'amend')) {
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

    /** @param array<string, mixed> $row */
    public static function client(array $row): array
    {
        return [
            'id' => $row['id'],
            'name' => $row['name'],
            'reference' => $row['reference'],
            'status' => $row['status'],
            'updatedAt' => Dates::display($row['updated_at'] ?? null),
            'clientType' => (string) ($row['client_type'] ?? 'Entreprise'),
            'sector' => (string) ($row['sector'] ?? ''),
            'legalName' => (string) ($row['legal_name'] ?? ''),
            'legalForm' => (string) ($row['legal_form'] ?? ''),
            'ninea' => (string) ($row['ninea'] ?? ''),
            'rccm' => (string) ($row['rccm'] ?? ''),
            'contact' => (string) ($row['contact'] ?? ''),
            'email' => (string) ($row['email'] ?? ''),
            'phone' => (string) ($row['phone'] ?? ''),
            'website' => (string) ($row['website'] ?? ''),
            'address' => (string) ($row['address'] ?? ''),
            'city' => (string) ($row['city'] ?? ''),
            'country' => (string) ($row['country'] ?? ''),
            'discount' => (float) ($row['discount'] ?? 0),
            'notes' => (string) ($row['notes'] ?? ''),
        ];
    }

    /** @param array<string, mixed> $row */
    public static function clientContact(array $row): array
    {
        return [
            'id' => $row['id'],
            'name' => $row['name'],
            'reference' => $row['reference'],
            'status' => $row['status'],
            'updatedAt' => Dates::display($row['updated_at'] ?? null),
            'companyId' => $row['client_id'],
            'company' => (string) ($row['company_name'] ?? ''),
            'role' => (string) ($row['role'] ?? ''),
            'email' => (string) ($row['email'] ?? ''),
            'phone' => (string) ($row['phone'] ?? ''),
        ];
    }

    /** @param array<string, mixed> $row */
    public static function quote(array $row): array
    {
        $payload = $row['payload'] ?? '{}';
        if (is_array($payload)) {
            $payload = json_encode($payload, JSON_UNESCAPED_UNICODE);
        }
        $record = [
            'id' => $row['id'],
            'name' => $row['name'],
            'reference' => $row['reference'],
            'status' => $row['status'],
            'updatedAt' => Dates::display($row['updated_at'] ?? null),
            'client' => (string) ($row['client_name'] ?? ''),
            'clientId' => $row['client_id'],
            'quantity' => (float) ($row['quantity'] ?? 0),
            'amount' => (float) ($row['amount'] ?? 0),
            'quotePayload' => (string) $payload,
        ];
        if (($row['kind'] ?? '') === 'devis') {
            $record['optionA'] = (string) ($row['option_a'] ?? '');
            $record['optionB'] = (string) ($row['option_b'] ?? '');
            $record['optionC'] = (string) ($row['option_c'] ?? '');
        }
        $orderId = (string) ($row['order_id'] ?? '');
        $orderRef = (string) ($row['order_ref'] ?? '');
        if ($orderId !== '') {
            $record['orderId'] = $orderId;
        }
        if ($orderRef !== '') {
            $record['orderRef'] = $orderRef;
        }
        return $record;
    }

    /** @param array<string, mixed> $row */
    public static function order(array $row): array
    {
        $payload = $row['payload'] ?? '{}';
        if (is_array($payload)) {
            $payload = json_encode($payload, JSON_UNESCAPED_UNICODE);
        }
        $history = $row['history_json'] ?? '[]';
        if (is_array($history)) {
            $history = json_encode($history, JSON_UNESCAPED_UNICODE);
        }
        $due = (string) ($row['due_date'] ?? '');
        return [
            'id' => $row['id'],
            'name' => $row['name'],
            'reference' => $row['reference'],
            'status' => $row['status'],
            'updatedAt' => Dates::display($row['updated_at'] ?? null),
            'client' => (string) ($row['client_name'] ?? ''),
            'clientId' => $row['client_id'],
            'quantity' => (float) ($row['quantity'] ?? 0),
            'amount' => (float) ($row['amount'] ?? 0),
            'dueDate' => $due !== '' ? substr($due, 0, 10) : '',
            'quoteId' => (string) ($row['quote_id'] ?? ''),
            'quoteRef' => (string) ($row['quote_ref'] ?? ''),
            'quotePayload' => (string) $payload,
            'orderHistory' => (string) ($history ?: '[]'),
        ];
    }

    /** @param array<string, mixed> $row */
    public static function amendment(array $row): array
    {
        return [
            'id' => $row['id'],
            'name' => $row['name'],
            'reference' => $row['reference'],
            'status' => $row['status'],
            'updatedAt' => Dates::display($row['updated_at'] ?? null),
            'order' => (string) ($row['order_ref'] ?? ''),
            'orderId' => $row['order_id'],
            'reason' => (string) ($row['reason'] ?? ''),
            'delta' => (float) ($row['delta'] ?? 0),
            'newAmount' => (float) ($row['new_amount'] ?? 0),
            'previousAmount' => (float) ($row['previous_amount'] ?? 0),
            'quantity' => (float) ($row['quantity'] ?? 0),
        ];
    }

    /** @param array<string, mixed> $row */
    public static function invoice(array $row): array
    {
        $issued = (string) ($row['issued_at'] ?? '');
        return [
            'id' => $row['id'],
            'name' => $row['name'],
            'reference' => $row['reference'],
            'status' => $row['status'],
            'updatedAt' => Dates::display($row['updated_at'] ?? null),
            'order' => (string) ($row['order_ref'] ?? ''),
            'orderId' => $row['order_id'],
            'client' => (string) ($row['client_name'] ?? ''),
            'clientId' => (string) ($row['client_id'] ?? ''),
            'amount' => (float) ($row['amount'] ?? 0),
            'issuedAt' => $issued !== '' ? substr($issued, 0, 10) : '',
            'settlement' => (string) ($row['settlement'] ?? ''),
            'remaining' => (float) ($row['remaining'] ?? 0),
        ];
    }

    /** @param array<string, mixed> $row */
    public static function deposit(array $row): array
    {
        $payments = $row['payments'] ?? '[]';
        if (is_array($payments)) {
            $payments = json_encode($payments, JSON_UNESCAPED_UNICODE);
        }
        $asked = isset($row['order_amount']) ? (float) $row['order_amount'] : (float) ($row['asked'] ?? 0);
        $received = (float) ($row['received'] ?? 0);
        if (is_string($payments) && $payments !== '') {
            $parsed = json_decode($payments, true);
            if (is_array($parsed)) {
                $received = 0;
                foreach ($parsed as $item) {
                    if (is_array($item)) {
                        $received += max(0, (float) ($item['amount'] ?? 0));
                    }
                }
            }
        }
        $asked = max(0, round($asked));
        $received = min($asked, max(0, round($received)));
        $remaining = max(0, $asked - $received);
        $status = $received <= 0 ? 'Ouvert' : ($remaining <= 0 ? 'Soldé' : 'Partiel');
        return [
            'id' => $row['id'],
            'name' => (string) ($row['client_name'] ?? $row['name'] ?? ''),
            'reference' => $row['reference'],
            'status' => $status,
            'updatedAt' => Dates::display($row['updated_at'] ?? null),
            'order' => (string) ($row['order_ref'] ?? ''),
            'orderId' => $row['order_id'],
            'clientId' => (string) ($row['client_id'] ?? ''),
            'asked' => $asked,
            'received' => $received,
            'remaining' => $remaining,
            'payments' => (string) ($payments ?: '[]'),
        ];
    }

    /** @param array<string, mixed> $row */
    public static function orderFile(array $row): array
    {
        return [
            'id' => $row['id'],
            'name' => $row['name'],
            'reference' => $row['reference'],
            'status' => $row['status'],
            'updatedAt' => Dates::display($row['updated_at'] ?? null),
            'order' => (string) ($row['order_ref'] ?? ''),
            'orderId' => $row['order_id'],
            'client' => (string) ($row['client_name'] ?? ''),
            'format' => (string) ($row['format'] ?? 'Fichier'),
            'version' => (int) ($row['version'] ?? 1),
            'sizeBytes' => (int) ($row['size_bytes'] ?? 0),
            'stored' => (int) ($row['stored'] ?? 0),
        ];
    }

    /** @param array<string, mixed> $row */
    public static function machineSlot(array $row): array
    {
        $day = substr((string) ($row['day'] ?? ''), 0, 10);
        $start = substr((string) ($row['start_time'] ?? '08:00:00'), 0, 5);
        $end = substr((string) ($row['end_time'] ?? '18:00:00'), 0, 5);
        return [
            'id' => $row['id'],
            'name' => $row['name'],
            'reference' => $row['reference'],
            'status' => (string) ($row['status'] ?? 'Planifié'),
            'updatedAt' => Dates::display($row['updated_at'] ?? null),
            'machine' => (string) ($row['machine_name'] ?? ''),
            'machineId' => $row['workstation_id'],
            'order' => (string) ($row['order_ref'] ?? ''),
            'orderId' => $row['order_id'],
            'day' => $day,
            'startTime' => $start,
            'endTime' => $end,
            'startDate' => $day,
            'endDate' => $day,
        ];
    }

    /** @param array<string, mixed> $row */
    public static function supplier(array $row): array
    {
        return [
            'id' => $row['id'],
            'name' => $row['name'],
            'reference' => $row['reference'],
            'status' => (string) ($row['status'] ?? 'Actif'),
            'updatedAt' => Dates::display($row['updated_at'] ?? null),
            'phone' => (string) ($row['phone'] ?? ''),
            'address' => (string) ($row['address'] ?? ''),
            'email' => (string) ($row['email'] ?? ''),
        ];
    }

    /**
     * @param array<string, mixed> $row
     * @param list<array<string, mixed>> $lines
     */
    public static function supply(array $row, array $lines = []): array
    {
        $mapped = [];
        $qtyInit = 0.0;
        $qtyAppro = 0.0;
        foreach ($lines as $line) {
            $init = (float) ($line['qty_init'] ?? 0);
            $appro = (float) ($line['qty_appro'] ?? 0);
            $solde = (float) ($line['qty_solde'] ?? ($init + $appro));
            $qtyInit += $init;
            $qtyAppro += $appro;
            $mapped[] = [
                'id' => $line['id'],
                'materialId' => $line['material_id'],
                'label' => (string) ($line['label'] ?? ''),
                'unit' => (string) ($line['unit'] ?? ''),
                'quantity' => $appro,
                'qtyInit' => $init,
                'qtyAppro' => $appro,
                'qtySolde' => $solde,
                'unitPrice' => (float) ($line['unit_price'] ?? 0),
                'sellPrice' => (float) ($line['sell_price'] ?? 0),
            ];
        }
        return [
            'id' => $row['id'],
            'name' => $row['name'],
            'reference' => $row['reference'],
            'status' => (string) ($row['status'] ?? 'Validé'),
            'updatedAt' => Dates::display($row['updated_at'] ?? null),
            'supplier' => (string) ($row['supplier_name'] ?? $row['name'] ?? ''),
            'supplierId' => $row['supplier_id'],
            'quantity' => (float) ($row['quantity'] ?? $qtyAppro),
            'qtyInit' => $qtyInit,
            'qtyAppro' => (float) ($row['quantity'] ?? $qtyAppro),
            'amount' => (float) ($row['amount'] ?? 0),
            'issuedAt' => substr((string) ($row['issued_at'] ?? ''), 0, 10),
            'createdAt' => (string) ($row['created_at'] ?? ''),
            'lines' => json_encode($mapped, JSON_UNESCAPED_UNICODE),
        ];
    }

    /** @param array<string, mixed> $row */
    public static function stockMovement(array $row): array
    {
        $init = (float) ($row['qty_init'] ?? 0);
        $out = (float) ($row['qty_out'] ?? 0);
        $solde = (float) ($row['qty_solde'] ?? max(0, $init - $out));
        return [
            'id' => $row['id'],
            'name' => (string) ($row['article_name'] ?? ''),
            'reference' => (string) ($row['article_reference'] ?? ''),
            'status' => (string) ($row['reason'] ?? ''),
            'updatedAt' => Dates::display($row['created_at'] ?? null),
            'articleKind' => (string) ($row['article_kind'] ?? ''),
            'articleId' => (string) ($row['article_id'] ?? ''),
            'reason' => (string) ($row['reason'] ?? ''),
            'note' => (string) ($row['note'] ?? ''),
            'qtyInit' => $init,
            'qtyOut' => $out,
            'qtySolde' => $solde,
            'quantity' => $out,
        ];
    }

    public static function alertStatus(float $current, float $minimum, string $stored = 'OK'): string
    {
        if ($stored === 'Commande lancée') {
            return 'Commande lancée';
        }
        if ($current <= $minimum) {
            return 'Alerte';
        }
        return 'OK';
    }

    /** @param array<string, mixed> $row */
    public static function stockAlert(array $row): array
    {
        $minimum = (float) ($row['minimum'] ?? 0);
        $current = (float) ($row['current_qty'] ?? $row['current'] ?? 0);
        $status = self::alertStatus($current, $minimum, (string) ($row['status'] ?? 'OK'));
        return [
            'id' => $row['id'],
            'name' => (string) ($row['name'] ?? ''),
            'reference' => (string) ($row['reference'] ?? ''),
            'status' => $status,
            'updatedAt' => Dates::display($row['updated_at'] ?? null),
            'minimum' => $minimum,
            'current' => $current,
            'supplier' => (string) ($row['supplier'] ?? ''),
            'articleKind' => (string) ($row['article_kind'] ?? ''),
            'articleId' => (string) ($row['article_id'] ?? ''),
            'qtyInit' => $current,
            'qtySolde' => $current,
        ];
    }

    /** @param array<string, mixed> $row */
    public static function inventoryLine(array $row): array
    {
        $system = (float) ($row['system_qty'] ?? 0);
        $physical = (float) ($row['physical_qty'] ?? 0);
        $gap = (float) ($row['gap'] ?? ($physical - $system));
        $init = (float) ($row['qty_init'] ?? $system);
        $solde = (float) ($row['qty_solde'] ?? $physical);
        return [
            'id' => $row['id'],
            'name' => (string) ($row['name'] ?? ''),
            'reference' => (string) ($row['reference'] ?? ''),
            'status' => (string) ($row['status'] ?? 'En cours'),
            'updatedAt' => Dates::display($row['updated_at'] ?? null),
            'systemQty' => $system,
            'physicalQty' => $physical,
            'gap' => $gap,
            'reason' => (string) ($row['reason'] ?? ''),
            'qtyInit' => $init,
            'qtySolde' => $solde,
            'articleKind' => (string) ($row['article_kind'] ?? ''),
            'articleId' => (string) ($row['article_id'] ?? ''),
        ];
    }
}
