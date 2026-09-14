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

final class SupplyService
{
    public const DELETE_WINDOW_SECONDS = 48 * 60 * 60;

    public function __construct(
        private readonly PDO $pdo,
        private readonly AuditLogger $audit,
        private readonly MaterialService $materials,
    ) {
    }

    /** @return list<array<string, mixed>> */
    public function list(AuthContext $auth): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT s.*, p.name AS supplier_name
             FROM supplies s
             INNER JOIN suppliers p ON p.id = s.supplier_id
             WHERE s.company_id = :id
             ORDER BY s.issued_at DESC, s.created_at DESC',
        );
        $stmt->execute(['id' => $auth->companyId]);
        $rows = $stmt->fetchAll();
        if (!$rows) {
            return [];
        }
        $lines = $this->linesFor($auth->companyId, array_column($rows, 'id'));
        $out = [];
        foreach ($rows as $row) {
            $out[] = RecordMapper::supply($row, $lines[$row['id']] ?? []);
        }
        return $out;
    }

    /**
     * @return array{supply: array<string, mixed>, materials: list<array<string, mixed>>}
     */
    public function create(AuthContext $auth, array $values, string $ip): array
    {
        $supplierId = Validator::required((string) ($values['supplierId'] ?? ''), 'Choisissez un fournisseur.');
        $rawLines = $values['lines'] ?? [];
        if (is_string($rawLines)) {
            $decoded = json_decode($rawLines, true);
            $rawLines = is_array($decoded) ? $decoded : [];
        }
        if (!is_array($rawLines) || !$rawLines) {
            throw HttpException::unprocessable('Ajoutez au moins une matière au panier.');
        }

        $this->pdo->beginTransaction();
        try {
            $supplier = $this->lockSupplier($auth, $supplierId);
            $grouped = $this->normalizeLines($rawLines);
            $materialIds = array_keys($grouped);
            sort($materialIds);
            $locked = $this->lockMaterials($auth, $materialIds);

            $archived = [];
            $qtyApproTotal = 0.0;
            $subtotal = 0;
            $sort = 0;
            foreach ($grouped as $materialId => $qtyAppro) {
                $material = $locked[$materialId] ?? null;
                if (!$material) {
                    throw HttpException::unprocessable('Une matière du panier n’existe plus dans le catalogue.');
                }
                $qtyInit = max(0, (float) $material['quantity']);
                $qtySolde = $qtyInit + $qtyAppro;
                $unitPrice = max(0, (float) $material['buy_price']);
                $sellPrice = max(0, (float) $material['sell_price']);
                $archived[] = [
                    'id' => Uuid::v4(),
                    'material_id' => $materialId,
                    'label' => (string) $material['name'],
                    'unit' => (string) ($material['unit_name'] ?? ''),
                    'qty_init' => $qtyInit,
                    'qty_appro' => $qtyAppro,
                    'qty_solde' => $qtySolde,
                    'unit_price' => $unitPrice,
                    'sell_price' => $sellPrice,
                    'sort_order' => $sort++,
                    'alert_qty' => (float) $material['alert_qty'],
                ];
                $qtyApproTotal += $qtyAppro;
                $subtotal += (int) round($qtyAppro * $unitPrice);
            }

            $amount = $this->taxedTotal($auth, $subtotal);
            $id = Uuid::v4();
            $issuedAt = date('Y-m-d');
            $reference = $this->nextReference($auth->companyId, $issuedAt);
            $this->pdo->prepare(
                'INSERT INTO supplies (id, company_id, supplier_id, reference, name, status, quantity, amount, issued_at)
                 VALUES (:id, :company_id, :supplier_id, :reference, :name, :status, :quantity, :amount, :issued_at)',
            )->execute([
                'id' => $id,
                'company_id' => $auth->companyId,
                'supplier_id' => $supplierId,
                'reference' => $reference,
                'name' => (string) $supplier['name'],
                'status' => 'Validé',
                'quantity' => $qtyApproTotal,
                'amount' => $amount,
                'issued_at' => $issuedAt,
            ]);

            $insertLine = $this->pdo->prepare(
                'INSERT INTO supply_lines
                    (id, company_id, supply_id, material_id, label, unit, qty_init, qty_appro, qty_solde, unit_price, sell_price, sort_order)
                 VALUES
                    (:id, :company_id, :supply_id, :material_id, :label, :unit, :qty_init, :qty_appro, :qty_solde, :unit_price, :sell_price, :sort_order)',
            );
            $updateStock = $this->pdo->prepare(
                'UPDATE materials SET quantity = :quantity, status = :status
                 WHERE id = :id AND company_id = :company_id',
            );
            foreach ($archived as $line) {
                $insertLine->execute([
                    'id' => $line['id'],
                    'company_id' => $auth->companyId,
                    'supply_id' => $id,
                    'material_id' => $line['material_id'],
                    'label' => $line['label'],
                    'unit' => $line['unit'],
                    'qty_init' => $line['qty_init'],
                    'qty_appro' => $line['qty_appro'],
                    'qty_solde' => $line['qty_solde'],
                    'unit_price' => $line['unit_price'],
                    'sell_price' => $line['sell_price'],
                    'sort_order' => $line['sort_order'],
                ]);
                $updateStock->execute([
                    'quantity' => $line['qty_solde'],
                    'status' => RecordMapper::stockStatus((float) $line['qty_solde'], (float) $line['alert_qty']),
                    'id' => $line['material_id'],
                    'company_id' => $auth->companyId,
                ]);
            }

            $this->pdo->commit();
        } catch (\Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $e;
        }

        $this->audit->record($auth, 'supply.create', 'achats', 'approvisionnement', 'supply', $id, $reference, $ip);
        return [
            'supply' => $this->one($auth, $id),
            'materials' => $this->materials->list($auth),
        ];
    }

    /**
     * @return array{ok: bool, materials: list<array<string, mixed>>}
     */
    public function delete(AuthContext $auth, string $id, string $ip): array
    {
        $this->pdo->beginTransaction();
        try {
            $row = $this->lockSupply($auth, $id);
            $created = strtotime((string) $row['created_at']) ?: 0;
            if ($created <= 0 || (time() - $created) >= self::DELETE_WINDOW_SECONDS) {
                throw HttpException::unprocessable('Un approvisionnement ne peut être supprimé que dans les 48 heures.');
            }
            $linesStmt = $this->pdo->prepare(
                'SELECT * FROM supply_lines WHERE supply_id = :id AND company_id = :company_id ORDER BY material_id',
            );
            $linesStmt->execute(['id' => $id, 'company_id' => $auth->companyId]);
            $lines = $linesStmt->fetchAll();
            $materialIds = array_values(array_unique(array_map(static fn($line) => (string) $line['material_id'], $lines)));
            sort($materialIds);
            $locked = $this->lockMaterials($auth, $materialIds);
            $updateStock = $this->pdo->prepare(
                'UPDATE materials SET quantity = :quantity, status = :status
                 WHERE id = :id AND company_id = :company_id',
            );
            foreach ($lines as $line) {
                $material = $locked[(string) $line['material_id']] ?? null;
                if (!$material) {
                    continue;
                }
                $nextQty = max(0, (float) $material['quantity'] - (float) $line['qty_appro']);
                $updateStock->execute([
                    'quantity' => $nextQty,
                    'status' => RecordMapper::stockStatus($nextQty, (float) $material['alert_qty']),
                    'id' => $material['id'],
                    'company_id' => $auth->companyId,
                ]);
                $locked[(string) $line['material_id']]['quantity'] = $nextQty;
            }
            $this->pdo->prepare('DELETE FROM supplies WHERE id = :id AND company_id = :company_id')
                ->execute(['id' => $id, 'company_id' => $auth->companyId]);
            $this->pdo->commit();
        } catch (\Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $e;
        }
        $this->audit->record($auth, 'supply.delete', 'achats', 'historique-approvisionnement', 'supply', $id, (string) $row['reference'], $ip);
        return [
            'ok' => true,
            'materials' => $this->materials->list($auth),
        ];
    }

    private function one(AuthContext $auth, string $id): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT s.*, p.name AS supplier_name
             FROM supplies s
             INNER JOIN suppliers p ON p.id = s.supplier_id
             WHERE s.id = :id AND s.company_id = :company_id
             LIMIT 1',
        );
        $stmt->execute(['id' => $id, 'company_id' => $auth->companyId]);
        $row = $stmt->fetch();
        if (!$row) {
            throw HttpException::notFound('Approvisionnement introuvable.');
        }
        $lines = $this->linesFor($auth->companyId, [$id]);
        return RecordMapper::supply($row, $lines[$id] ?? []);
    }

    /**
     * @param list<string> $supplyIds
     * @return array<string, list<array<string, mixed>>>
     */
    private function linesFor(string $companyId, array $supplyIds): array
    {
        if (!$supplyIds) {
            return [];
        }
        $placeholders = implode(',', array_fill(0, count($supplyIds), '?'));
        $stmt = $this->pdo->prepare(
            "SELECT * FROM supply_lines WHERE company_id = ? AND supply_id IN ($placeholders) ORDER BY sort_order, label",
        );
        $stmt->execute([$companyId, ...$supplyIds]);
        $grouped = [];
        foreach ($stmt->fetchAll() as $line) {
            $grouped[$line['supply_id']][] = $line;
        }
        return $grouped;
    }

    /** @return array<string, mixed> */
    private function lockSupplier(AuthContext $auth, string $id): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT * FROM suppliers WHERE id = :id AND company_id = :company_id LIMIT 1 FOR UPDATE',
        );
        $stmt->execute(['id' => $id, 'company_id' => $auth->companyId]);
        $row = $stmt->fetch();
        if (!$row) {
            throw HttpException::notFound('Fournisseur introuvable.');
        }
        return $row;
    }

    /** @return array<string, mixed> */
    private function lockSupply(AuthContext $auth, string $id): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT * FROM supplies WHERE id = :id AND company_id = :company_id LIMIT 1 FOR UPDATE',
        );
        $stmt->execute(['id' => $id, 'company_id' => $auth->companyId]);
        $row = $stmt->fetch();
        if (!$row) {
            throw HttpException::notFound('Approvisionnement introuvable.');
        }
        return $row;
    }

    /** @return array<string, mixed> */
    private function lockMaterial(AuthContext $auth, string $id): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT m.*, u.name AS unit_name
             FROM materials m
             INNER JOIN material_units u ON u.id = m.unit_id
             WHERE m.id = :id AND m.company_id = :company_id
             LIMIT 1 FOR UPDATE',
        );
        $stmt->execute(['id' => $id, 'company_id' => $auth->companyId]);
        $row = $stmt->fetch();
        if (!$row) {
            throw HttpException::unprocessable('Une matière du panier n’existe plus dans le catalogue.');
        }
        return $row;
    }

    /**
     * @param list<string> $ids
     * @return array<string, array<string, mixed>>
     */
    private function lockMaterials(AuthContext $auth, array $ids): array
    {
        $out = [];
        foreach ($ids as $id) {
            $out[$id] = $this->lockMaterial($auth, $id);
        }
        return $out;
    }

    /**
     * @param list<mixed> $rawLines
     * @return array<string, float>
     */
    private function normalizeLines(array $rawLines): array
    {
        $grouped = [];
        foreach ($rawLines as $item) {
            if (!is_array($item)) {
                continue;
            }
            $materialId = trim((string) ($item['materialId'] ?? ''));
            $qty = (float) ($item['qtyAppro'] ?? $item['quantity'] ?? 0);
            $qty = max(0, round($qty, 3));
            if ($materialId === '' || $qty < 1) {
                continue;
            }
            $grouped[$materialId] = ($grouped[$materialId] ?? 0) + $qty;
        }
        if (!$grouped) {
            throw HttpException::unprocessable('Chaque ligne doit avoir une quantité d’au moins 1.');
        }
        return $grouped;
    }

    private function taxedTotal(AuthContext $auth, int $subtotal): int
    {
        $stmt = $this->pdo->prepare(
            'SELECT rate FROM taxes WHERE company_id = :id AND active = 1',
        );
        $stmt->execute(['id' => $auth->companyId]);
        $total = $subtotal;
        foreach ($stmt->fetchAll() as $tax) {
            $total += (int) round($subtotal * ((float) $tax['rate'] / 100));
        }
        return $total;
    }

    private function nextReference(string $companyId, string $issuedAt): string
    {
        $stamp = date('ymd', strtotime($issuedAt) ?: time());
        $prefix = 'APP-' . $stamp;
        $stmt = $this->pdo->prepare(
            'SELECT reference FROM supplies WHERE company_id = :company_id AND reference LIKE :prefix',
        );
        $stmt->execute(['company_id' => $companyId, 'prefix' => $prefix . '%']);
        $taken = [];
        foreach ($stmt->fetchAll() as $row) {
            $taken[strtoupper((string) $row['reference'])] = true;
        }
        for ($index = 1; $index < 100; $index++) {
            $reference = $prefix . str_pad((string) $index, 2, '0', STR_PAD_LEFT);
            if (!isset($taken[$reference])) {
                return $reference;
            }
        }
        return 'APP-' . substr((string) round(microtime(true) * 1000), -8);
    }
}
