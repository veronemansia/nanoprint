<?php

declare(strict_types=1);

namespace NanoPrint\Support;

use NanoPrint\Http\HttpException;

final class QuotePricing
{
    /**
     * @param array<string, mixed>|string $raw
     * @param list<array<string, mixed>> $catalogue
     * @return array{
     *   ready: bool,
     *   error: string,
     *   quantity: float,
     *   amount: float,
     *   applyDiscount: bool,
     *   clientId: string,
     *   payload: array{clientId: string, applyDiscount: bool, lines: list<array<string, mixed>>},
     *   json: string
     * }
     */
    public function evaluate(array|string $raw, array $catalogue, float $discountPercent, bool $strict = true): array
    {
        $parsed = $this->parsePayload($raw);
        $clientId = $parsed['clientId'];
        $apply = $parsed['applyDiscount'];
        $resolved = [];
        $cleanLines = [];
        foreach ($parsed['lines'] as $line) {
            $row = $this->resolveLine($line, $catalogue);
            if ($row['error'] !== '') {
                if ($strict) {
                    return $this->empty($row['error'], $clientId, $apply);
                }
                continue;
            }
            $resolved[] = $row;
            $cleanLines[] = $row['line'];
        }
        if (!$cleanLines) {
            return $this->empty('Ajoutez au moins un produit du catalogue.', $clientId, $apply);
        }
        $grosses = array_map(static fn(array $row) => (float) $row['total'], $resolved);
        $totals = $this->totals($grosses, $discountPercent, $apply);
        $quantity = 0.0;
        foreach ($cleanLines as $line) {
            $quantity += (float) $line['quantity'];
        }
        $payload = [
            'clientId' => $clientId,
            'applyDiscount' => $apply,
            'lines' => $cleanLines,
        ];
        return [
            'ready' => true,
            'error' => '',
            'quantity' => $quantity,
            'amount' => $totals['total'],
            'applyDiscount' => $apply,
            'clientId' => $clientId,
            'payload' => $payload,
            'json' => json_encode($payload, JSON_UNESCAPED_UNICODE),
        ];
    }

    /**
     * @param array<string, mixed>|string $raw
     * @return array{clientId: string, applyDiscount: bool, lines: list<array<string, mixed>>}
     */
    public function parsePayload(array|string $raw): array
    {
        if (is_string($raw)) {
            $raw = trim($raw);
            if ($raw === '') {
                throw HttpException::unprocessable('Le chiffrage est incomplet : vérifiez le produit, les options et la quantité.');
            }
            $decoded = json_decode($raw, true);
            if (!is_array($decoded)) {
                throw HttpException::unprocessable('Payload de devis invalide.');
            }
            $raw = $decoded;
        }
        $linesIn = $raw['lines'] ?? [];
        if (!is_array($linesIn) || !$linesIn) {
            throw HttpException::unprocessable('Ajoutez au moins un produit du catalogue.');
        }
        $lines = [];
        foreach ($linesIn as $line) {
            if (!is_array($line)) {
                continue;
            }
            $extra = $line['extraIds'] ?? [];
            $lines[] = [
                'id' => trim((string) ($line['id'] ?? '')) ?: Uuid::v4(),
                'productId' => trim((string) ($line['productId'] ?? '')),
                'printId' => trim((string) ($line['printId'] ?? '')),
                'paperId' => trim((string) ($line['paperId'] ?? '')),
                'extraIds' => is_array($extra) ? array_values(array_map(static fn($id) => (string) $id, $extra)) : [],
                'quantity' => max(0, (int) round((float) ($line['quantity'] ?? 0))),
            ];
        }
        if (!$lines) {
            throw HttpException::unprocessable('Ajoutez au moins un produit du catalogue.');
        }
        return [
            'clientId' => trim((string) ($raw['clientId'] ?? '')),
            'applyDiscount' => (bool) ($raw['applyDiscount'] ?? false),
            'lines' => $lines,
        ];
    }

    public function canonical(array|string $raw): string
    {
        $parsed = $this->parsePayload($raw);
        $lines = array_map(static function (array $line): array {
            $extras = $line['extraIds'];
            sort($extras);
            return [
                'productId' => $line['productId'],
                'printId' => $line['printId'],
                'paperId' => $line['paperId'],
                'extraIds' => $extras,
                'quantity' => $line['quantity'],
            ];
        }, $parsed['lines']);
        return json_encode([
            'clientId' => $parsed['clientId'],
            'applyDiscount' => $parsed['applyDiscount'],
            'lines' => $lines,
        ], JSON_UNESCAPED_UNICODE);
    }

    /**
     * @param array<string, mixed> $line
     * @param list<array<string, mixed>> $catalogue
     * @return array{error: string, total: float, line: array<string, mixed>, product?: array<string, mixed>}
     */
    private function resolveLine(array $line, array $catalogue): array
    {
        $product = null;
        foreach ($catalogue as $item) {
            if ((string) $item['id'] === $line['productId']) {
                $product = $item;
                break;
            }
        }
        if (!$product || ($product['status'] ?? '') === 'Archivé') {
            return ['error' => 'Produit introuvable ou archivé.', 'total' => 0.0, 'line' => $line];
        }
        $prints = $this->options($product['printSides'] ?? '[]');
        $papers = $this->options($product['paperTypes'] ?? '[]');
        $extrasAll = $this->options($product['extraOptions'] ?? '[]');
        $print = $this->optionById($prints, $line['printId']);
        $paper = $this->optionById($papers, $line['paperId']);
        $allowed = [];
        foreach ($extrasAll as $opt) {
            $allowed[$opt['id']] = $opt;
        }
        $extras = [];
        foreach ($line['extraIds'] as $id) {
            if (isset($allowed[$id])) {
                $extras[] = $allowed[$id];
            }
        }
        $qty = (int) $line['quantity'];
        $minQuantity = max(1, (float) ($product['minQuantity'] ?? 1));
        $tiers = $this->tiers($product['priceGrid'] ?? '[]');
        $firstTier = $tiers[0]['quantity'] ?? 0;
        $requiredMin = max($minQuantity, $firstTier);
        if (!$qty) {
            return ['error' => 'Indiquez la quantité commandée.', 'total' => 0.0, 'line' => $line];
        }
        if ($qty < $requiredMin) {
            return ['error' => 'Quantité trop basse par rapport au minimum du produit.', 'total' => 0.0, 'line' => $line];
        }
        if ($prints && !$print) {
            return ['error' => 'Choisissez le nombre de côtés imprimés.', 'total' => 0.0, 'line' => $line];
        }
        if ($papers && !$paper) {
            return ['error' => 'Choisissez le type de papier.', 'total' => 0.0, 'line' => $line];
        }
        $matched = $this->matchTier($qty, $tiers);
        if ($tiers && !$matched) {
            return ['error' => 'Aucun palier de la grille ne correspond à cette quantité.', 'total' => 0.0, 'line' => $line];
        }
        $total = $this->lineTotal($product, $qty, $requiredMin, $minQuantity, $matched, $print, $paper, $extras, (bool) $tiers);
        $clean = $line;
        $clean['extraIds'] = array_map(static fn(array $opt) => $opt['id'], $extras);
        return ['error' => '', 'total' => $total, 'line' => $clean, 'product' => $product];
    }

    /**
     * @param list<array{id:string,label:string,price:float}> $prints
     * @param array{id:string,label:string,price:float}|null $print
     * @param array{id:string,label:string,price:float}|null $paper
     * @param list<array{id:string,label:string,price:float}> $extras
     * @param array{quantity:float,amount:float}|null $matched
     */
    private function lineTotal(
        array $product,
        int $qty,
        float $requiredMin,
        float $minQuantity,
        ?array $matched,
        ?array $print,
        ?array $paper,
        array $extras,
        bool $hasGrid,
    ): float {
        $base = (float) ($product['basePrice'] ?? 0);
        $scale = $qty / $requiredMin;
        $job = 0.0;
        if ($matched && $matched['quantity'] > 0) {
            $unit = $matched['amount'] / $matched['quantity'];
            $job = $unit * $qty;
        } else {
            $job = (($print && !$hasGrid) ? $print['price'] : $base) * $scale;
        }
        $printRatio = ($print && $base > 0) ? $print['price'] / $base : 1;
        if ($matched && $print && $base > 0) {
            $job *= $printRatio;
        }
        $paperAmount = (int) round(($paper['price'] ?? 0) * $scale);
        $extrasAmount = 0;
        foreach ($extras as $extra) {
            $extrasAmount += (int) round($extra['price'] * $scale);
        }
        return (int) round($job) + $paperAmount + $extrasAmount;
    }

    /**
     * @param list<float> $grosses
     * @return array{subtotal: float, discountAmount: float, total: float}
     */
    private function totals(array $grosses, float $discountPercent, bool $applyDiscount): array
    {
        $subtotal = array_sum($grosses);
        $rebate = $applyDiscount ? min(100, max(0, $discountPercent)) : 0;
        $discountAmount = (int) round($subtotal * ($rebate / 100));
        $total = max(0, $subtotal - $discountAmount);
        return ['subtotal' => $subtotal, 'discountAmount' => $discountAmount, 'total' => $total];
    }

    /** @return list<array{id: string, label: string, price: float}> */
    private function options(mixed $raw): array
    {
        $items = $this->decode($raw);
        $out = [];
        foreach ($items as $index => $item) {
            if (!is_array($item)) {
                continue;
            }
            $label = trim((string) ($item['label'] ?? ''));
            if ($label === '') {
                continue;
            }
            $out[] = [
                'id' => trim((string) ($item['id'] ?? '')) ?: ('opt-' . $index),
                'label' => $label,
                'price' => (float) ($item['price'] ?? 0),
            ];
        }
        return $out;
    }

    /** @param list<array{id:string,label:string,price:float}> $options */
    private function optionById(array $options, string $id): ?array
    {
        if ($id === '') {
            return null;
        }
        foreach ($options as $opt) {
            if ($opt['id'] === $id) {
                return $opt;
            }
        }
        return null;
    }

    /** @return list<array{quantity: float, amount: float}> */
    private function tiers(mixed $raw): array
    {
        $items = $this->decode($raw);
        $out = [];
        foreach ($items as $item) {
            if (!is_array($item)) {
                continue;
            }
            $qty = (float) ($item['quantity'] ?? 0);
            if ($qty <= 0) {
                continue;
            }
            $out[] = ['quantity' => $qty, 'amount' => (float) ($item['amount'] ?? 0)];
        }
        usort($out, static fn($a, $b) => $a['quantity'] <=> $b['quantity']);
        return $out;
    }

    /** @param list<array{quantity: float, amount: float}> $tiers */
    private function matchTier(int $qty, array $tiers): ?array
    {
        $matched = null;
        foreach ($tiers as $tier) {
            if ($qty >= $tier['quantity']) {
                $matched = $tier;
            }
        }
        return $matched;
    }

    /** @return list<mixed> */
    private function decode(mixed $raw): array
    {
        if (is_array($raw)) {
            return $raw;
        }
        if (!is_string($raw) || trim($raw) === '') {
            return [];
        }
        $decoded = json_decode($raw, true);
        return is_array($decoded) ? $decoded : [];
    }

    /** @return array{ready: bool, error: string, quantity: float, amount: float, applyDiscount: bool, clientId: string, payload: array, json: string} */
    private function empty(string $error, string $clientId, bool $apply): array
    {
        $payload = ['clientId' => $clientId, 'applyDiscount' => $apply, 'lines' => []];
        return [
            'ready' => false,
            'error' => $error,
            'quantity' => 0,
            'amount' => 0,
            'applyDiscount' => $apply,
            'clientId' => $clientId,
            'payload' => $payload,
            'json' => json_encode($payload, JSON_UNESCAPED_UNICODE),
        ];
    }
}
