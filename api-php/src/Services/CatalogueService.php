<?php

declare(strict_types=1);

namespace NanoPrint\Services;

use NanoPrint\Auth\AuthContext;
use NanoPrint\Http\HttpException;
use NanoPrint\Support\AuditLogger;
use NanoPrint\Support\RecordMapper;
use NanoPrint\Support\Uuid;
use NanoPrint\Support\Validator;
use PDO;

final class CatalogueService
{
    public function __construct(
        private readonly PDO $pdo,
        private readonly AuditLogger $audit,
        private readonly LookupService $lookups,
    ) {
    }

    /** @return list<array<string, mixed>> */
    public function list(AuthContext $auth): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT p.*, f.name AS family_name
             FROM catalogue_products p
             INNER JOIN catalogue_families f ON f.id = p.family_id
             WHERE p.company_id = :id
             ORDER BY p.updated_at DESC, p.name',
        );
        $stmt->execute(['id' => $auth->companyId]);
        $rows = $stmt->fetchAll();
        $ids = array_column($rows, 'id');
        $children = $this->loadChildren($ids);
        $out = [];
        foreach ($rows as $row) {
            $id = (string) $row['id'];
            $out[] = RecordMapper::catalogueProduct(
                $row,
                $children['composition'][$id] ?? [],
                $children['printSides'][$id] ?? [],
                $children['paperTypes'][$id] ?? [],
                $children['extraOptions'][$id] ?? [],
                $children['priceGrid'][$id] ?? [],
            );
        }
        return $out;
    }

    public function create(AuthContext $auth, array $values, string $ip): array
    {
        $family = Validator::required((string) ($values['family'] ?? ''), 'La famille est obligatoire.');
        $designation = Validator::required((string) ($values['designation'] ?? ''), 'La désignation est obligatoire.');
        $base = Validator::money($values['basePrice'] ?? null, 'Saisissez un prix de base valide.');
        $min = Validator::nonNegative($values['minQuantity'] ?? 1, 'Saisissez une quantité minimum valide.');
        $kind = ((string) ($values['productKind'] ?? 'Produit')) === 'Prestation' ? 'Prestation' : 'Produit';
        $name = trim((string) ($values['name'] ?? ''));
        if ($name === '') {
            $name = $family . ' · ' . $designation;
        }
        $status = (string) ($values['status'] ?? 'Actif') ?: 'Actif';
        $this->lookups->add($auth, 'catalogue-families', $family, $ip);

        if ($kind === 'Produit') {
            $sides = $this->decodeOptions($values['printSides'] ?? '[]');
            $papers = $this->decodeOptions($values['paperTypes'] ?? '[]');
            if (!$sides || !$papers) {
                throw HttpException::unprocessable('Un produit doit avoir au moins un côté imprimé et un type de papier.');
            }
        } else {
            $values['printSides'] = '[]';
            $values['paperTypes'] = '[]';
            $values['extraOptions'] = '[]';
        }

        $priceGrid = $this->decodeTiers($values['priceGrid'] ?? '');
        if (!$priceGrid) {
            $priceGrid = [['quantity' => $min, 'amount' => $base]];
        }

        $id = (string) ($values['id'] ?? Uuid::v4());
        $reference = (string) ($values['reference'] ?? RecordMapper::nextReference('CAT'));
        $this->pdo->prepare(
            'INSERT INTO catalogue_products (id, company_id, family_id, name, reference, status, product_kind, designation, base_price, min_quantity)
             VALUES (:id, :company_id, :family_id, :name, :reference, :status, :product_kind, :designation, :base_price, :min_quantity)',
        )->execute([
            'id' => $id,
            'company_id' => $auth->companyId,
            'family_id' => $this->familyId($auth, $family),
            'name' => $name,
            'reference' => $reference,
            'status' => $status,
            'product_kind' => $kind,
            'designation' => $designation,
            'base_price' => $base,
            'min_quantity' => $min,
        ]);
        $this->replaceChildren($id, $values, $priceGrid);
        $this->audit->record($auth, 'catalogue.create', 'configuration', 'catalogue', 'product', $id, $reference, $ip);
        return $this->one($auth, $id);
    }

    public function update(AuthContext $auth, string $id, array $values, string $ip): array
    {
        $this->mustExist($auth, $id);
        $current = $this->one($auth, $id);
        $merged = [...$current, ...$values];
        $family = Validator::required((string) ($merged['family'] ?? ''), 'La famille est obligatoire.');
        $designation = Validator::required((string) ($merged['designation'] ?? ''), 'La désignation est obligatoire.');
        $base = Validator::money($merged['basePrice'] ?? null, 'Saisissez un prix de base valide.');
        $min = Validator::nonNegative($merged['minQuantity'] ?? 1, 'Saisissez une quantité minimum valide.');
        $kind = ((string) ($merged['productKind'] ?? 'Produit')) === 'Prestation' ? 'Prestation' : 'Produit';
        $name = trim((string) ($merged['name'] ?? '')) ?: ($family . ' · ' . $designation);
        $status = (string) ($merged['status'] ?? 'Actif') ?: 'Actif';
        $this->lookups->add($auth, 'catalogue-families', $family, $ip);

        $priceGrid = $this->decodeTiers($merged['priceGrid'] ?? '');
        if (!$priceGrid) {
            $priceGrid = [['quantity' => $min, 'amount' => $base]];
        }

        $this->pdo->prepare(
            'UPDATE catalogue_products SET family_id = :family_id, name = :name, status = :status, product_kind = :product_kind,
                designation = :designation, base_price = :base_price, min_quantity = :min_quantity
             WHERE id = :id AND company_id = :company_id',
        )->execute([
            'family_id' => $this->familyId($auth, $family),
            'name' => $name,
            'status' => $status,
            'product_kind' => $kind,
            'designation' => $designation,
            'base_price' => $base,
            'min_quantity' => $min,
            'id' => $id,
            'company_id' => $auth->companyId,
        ]);
        $this->replaceChildren($id, $merged, $priceGrid);
        $isTarif = isset($values['priceGrid']) && count($values) <= 2;
        $this->audit->record(
            $auth,
            $isTarif ? 'tarif.update' : 'catalogue.update',
            'configuration',
            $isTarif ? 'tarifs' : 'catalogue',
            'product',
            $id,
            $name,
            $ip,
        );
        return $this->one($auth, $id);
    }

    public function delete(AuthContext $auth, string $id, string $ip): void
    {
        $row = $this->one($auth, $id);
        foreach (['stock_movements', 'stock_alerts', 'inventory_lines'] as $table) {
            $check = $this->pdo->prepare(
                "SELECT 1 FROM {$table} WHERE company_id = :company_id AND article_kind = 'product' AND article_id = :id LIMIT 1",
            );
            $check->execute(['company_id' => $auth->companyId, 'id' => $id]);
            if ($check->fetchColumn()) {
                throw HttpException::conflict('Impossible de supprimer ce produit : des mouvements ou un inventaire y sont rattachés.');
            }
        }
        $this->pdo->prepare('DELETE FROM catalogue_products WHERE id = :id AND company_id = :company_id')
            ->execute(['id' => $id, 'company_id' => $auth->companyId]);
        $this->audit->record($auth, 'catalogue.delete', 'configuration', 'catalogue', 'product', $id, (string) $row['name'], $ip);
    }

    private function one(AuthContext $auth, string $id): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT p.*, f.name AS family_name
             FROM catalogue_products p
             INNER JOIN catalogue_families f ON f.id = p.family_id
             WHERE p.id = :id AND p.company_id = :company_id
             LIMIT 1',
        );
        $stmt->execute(['id' => $id, 'company_id' => $auth->companyId]);
        $row = $stmt->fetch();
        if (!$row) {
            throw HttpException::notFound('Produit introuvable.');
        }
        $children = $this->loadChildren([$id]);
        return RecordMapper::catalogueProduct(
            $row,
            $children['composition'][$id] ?? [],
            $children['printSides'][$id] ?? [],
            $children['paperTypes'][$id] ?? [],
            $children['extraOptions'][$id] ?? [],
            $children['priceGrid'][$id] ?? [],
        );
    }

    private function mustExist(AuthContext $auth, string $id): void
    {
        $stmt = $this->pdo->prepare('SELECT id FROM catalogue_products WHERE id = :id AND company_id = :company_id LIMIT 1');
        $stmt->execute(['id' => $id, 'company_id' => $auth->companyId]);
        if (!$stmt->fetch()) {
            throw HttpException::notFound('Produit introuvable.');
        }
    }

    private function familyId(AuthContext $auth, string $name): string
    {
        $stmt = $this->pdo->prepare('SELECT id FROM catalogue_families WHERE company_id = :company_id AND name = :name LIMIT 1');
        $stmt->execute(['company_id' => $auth->companyId, 'name' => $name]);
        $id = $stmt->fetchColumn();
        if (!$id) {
            throw HttpException::unprocessable('Famille introuvable.');
        }
        return (string) $id;
    }

    /** @param list<string> $ids */
    private function loadChildren(array $ids): array
    {
        $empty = ['composition' => [], 'printSides' => [], 'paperTypes' => [], 'extraOptions' => [], 'priceGrid' => []];
        if (!$ids) {
            return $empty;
        }
        $placeholders = implode(',', array_fill(0, count($ids), '?'));

        $mats = $this->pdo->prepare("SELECT * FROM product_materials WHERE product_id IN ($placeholders) ORDER BY sort_order");
        $mats->execute($ids);
        foreach ($mats->fetchAll() as $row) {
            $empty['composition'][$row['product_id']][] = [
                'materialId' => (string) ($row['material_id'] ?? ''),
                'label' => $row['label'],
                'quantity' => (float) $row['quantity'],
                'unit' => $row['unit'],
            ];
        }

        $opts = $this->pdo->prepare("SELECT * FROM product_options WHERE product_id IN ($placeholders) ORDER BY sort_order");
        $opts->execute($ids);
        foreach ($opts->fetchAll() as $row) {
            $empty[$row['kind']][$row['product_id']][] = [
                'label' => $row['label'],
                'price' => (float) $row['price'],
            ];
        }

        $tiers = $this->pdo->prepare("SELECT * FROM price_tiers WHERE product_id IN ($placeholders) ORDER BY quantity");
        $tiers->execute($ids);
        foreach ($tiers->fetchAll() as $row) {
            $empty['priceGrid'][$row['product_id']][] = [
                'quantity' => (float) $row['quantity'],
                'amount' => (float) $row['amount'],
            ];
        }
        return $empty;
    }

    /** @param list<array{quantity:float,amount:float}> $priceGrid */
    private function replaceChildren(string $productId, array $values, array $priceGrid): void
    {
        $this->pdo->prepare('DELETE FROM product_materials WHERE product_id = :id')->execute(['id' => $productId]);
        $this->pdo->prepare('DELETE FROM product_options WHERE product_id = :id')->execute(['id' => $productId]);
        $this->pdo->prepare('DELETE FROM price_tiers WHERE product_id = :id')->execute(['id' => $productId]);

        $mstmt = $this->pdo->prepare(
            'INSERT INTO product_materials (id, product_id, material_id, label, quantity, unit, sort_order)
             VALUES (:id, :product_id, :material_id, :label, :quantity, :unit, :sort_order)',
        );
        foreach ($this->decodeComposition($values['composition'] ?? '[]') as $index => $item) {
            $mstmt->execute([
                'id' => Uuid::v4(),
                'product_id' => $productId,
                'material_id' => $item['materialId'] ?: null,
                'label' => $item['label'],
                'quantity' => $item['quantity'],
                'unit' => $item['unit'],
                'sort_order' => $index,
            ]);
        }

        $ostmt = $this->pdo->prepare(
            'INSERT INTO product_options (id, product_id, kind, label, price, sort_order)
             VALUES (:id, :product_id, :kind, :label, :price, :sort_order)',
        );
        foreach (['printSides', 'paperTypes', 'extraOptions'] as $kind) {
            foreach ($this->decodeOptions($values[$kind] ?? '[]') as $index => $item) {
                $ostmt->execute([
                    'id' => Uuid::v4(),
                    'product_id' => $productId,
                    'kind' => $kind,
                    'label' => $item['label'],
                    'price' => $item['price'],
                    'sort_order' => $index,
                ]);
            }
        }

        $tstmt = $this->pdo->prepare(
            'INSERT INTO price_tiers (id, product_id, quantity, amount, sort_order) VALUES (:id, :product_id, :quantity, :amount, :sort_order)',
        );
        foreach ($priceGrid as $index => $tier) {
            $tstmt->execute([
                'id' => Uuid::v4(),
                'product_id' => $productId,
                'quantity' => $tier['quantity'],
                'amount' => $tier['amount'],
                'sort_order' => $index,
            ]);
        }
    }

    /** @return list<array{label:string,price:float}> */
    private function decodeOptions(mixed $raw): array
    {
        $items = is_array($raw) ? $raw : json_decode((string) $raw, true);
        if (!is_array($items)) {
            return [];
        }
        $out = [];
        foreach ($items as $item) {
            $label = trim((string) ($item['label'] ?? ''));
            if ($label === '') {
                continue;
            }
            $out[] = ['label' => $label, 'price' => (float) ($item['price'] ?? 0)];
        }
        return $out;
    }

    /** @return list<array{materialId:string,label:string,quantity:float,unit:string}> */
    private function decodeComposition(mixed $raw): array
    {
        $items = is_array($raw) ? $raw : json_decode((string) $raw, true);
        if (!is_array($items)) {
            return [];
        }
        $out = [];
        foreach ($items as $item) {
            $label = trim((string) ($item['label'] ?? ''));
            $qty = (float) ($item['quantity'] ?? 0);
            if ($label === '' || $qty <= 0) {
                continue;
            }
            $out[] = [
                'materialId' => trim((string) ($item['materialId'] ?? '')),
                'label' => $label,
                'quantity' => $qty,
                'unit' => trim((string) ($item['unit'] ?? 'u')) ?: 'u',
            ];
        }
        return $out;
    }

    /** @return list<array{quantity:float,amount:float}> */
    private function decodeTiers(mixed $raw): array
    {
        $items = is_array($raw) ? $raw : json_decode((string) $raw, true);
        if (!is_array($items)) {
            return [];
        }
        $out = [];
        foreach ($items as $item) {
            $qty = (float) ($item['quantity'] ?? 0);
            if ($qty <= 0) {
                continue;
            }
            $out[] = ['quantity' => $qty, 'amount' => (float) ($item['amount'] ?? 0)];
        }
        usort($out, static fn($a, $b) => $a['quantity'] <=> $b['quantity']);
        return $out;
    }
}
