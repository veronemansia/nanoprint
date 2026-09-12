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
}
