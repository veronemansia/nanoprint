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

final class InventoryService
{
    public function __construct(
        private readonly PDO $pdo,
        private readonly AuditLogger $audit,
        private readonly StockService $stock,
        private readonly MaterialService $materials,
        private readonly CatalogueService $catalogue,
    ) {
    }

    /** @return list<array<string, mixed>> */
    public function list(AuthContext $auth): array
    {
        $this->syncOpenLines($auth);
        $stmt = $this->pdo->prepare(
            'SELECT * FROM inventory_lines WHERE company_id = :id ORDER BY updated_at DESC, name',
        );
        $stmt->execute(['id' => $auth->companyId]);
        return array_map(RecordMapper::inventoryLine(...), $stmt->fetchAll());
    }

    /**
     * @return array{inventory: array<string, mixed>, materials: list<array<string, mixed>>, catalogue: list<array<string, mixed>>}
     */
    public function update(AuthContext $auth, string $id, array $values, string $ip): array
    {
        $physical = (int) round(Validator::nonNegative($values['physicalQty'] ?? 0, 'Saisissez un stock physique valide.'));
        $reason = trim((string) ($values['reason'] ?? ''));
        $wanted = trim((string) ($values['status'] ?? 'En cours')) ?: 'En cours';
        if (!in_array($wanted, ['Écart', 'Régularisé', 'En cours'], true)) {
            throw HttpException::unprocessable('Statut d’inventaire invalide.');
        }

        $this->pdo->beginTransaction();
        try {
            $row = $this->lockRow($auth, $id);
            if ((string) $row['status'] === 'Régularisé') {
                throw HttpException::unprocessable('Cette ligne d’inventaire est déjà régularisée.');
            }
            $article = $this->stock->lockArticle($auth, (string) $row['article_kind'], (string) $row['article_id']);
            $system = max(0, round($article['quantity']));
            $formSystem = isset($values['systemQty'])
                ? (int) round(Validator::nonNegative($values['systemQty'], 'Saisissez un stock système valide.'))
                : $system;
            $gap = $physical - $formSystem;
            $status = $wanted;
            if ($status !== 'Régularisé') {
                $status = $gap === 0 ? 'En cours' : 'Écart';
            }
            $qtyInit = $system;
            $qtySolde = $status === 'Régularisé' ? $physical : $physical;

            if ($status === 'Régularisé') {
                $this->stock->applyQuantity($auth, $article['kind'], $article['id'], $physical, (float) $article['alert_qty']);
                $qtySolde = $physical;
            }

            $this->pdo->prepare(
                'UPDATE inventory_lines
                 SET name = :name, status = :status, system_qty = :system_qty, physical_qty = :physical_qty,
                     gap = :gap, reason = :reason, qty_init = :qty_init, qty_solde = :qty_solde
                 WHERE id = :id AND company_id = :company_id',
            )->execute([
                'name' => $article['name'],
                'status' => $status,
                'system_qty' => $formSystem,
                'physical_qty' => $physical,
                'gap' => $gap,
                'reason' => $reason,
                'qty_init' => $qtyInit,
                'qty_solde' => $qtySolde,
                'id' => $id,
                'company_id' => $auth->companyId,
            ]);
            $this->pdo->commit();
        } catch (\Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $e;
        }

        $mapped = $this->one($auth, $id);
        $this->audit->record($auth, 'inventory.update', 'stocks', 'inventaire', 'inventory_line', $id, (string) $mapped['reference'], $ip);
        return [
            'inventory' => $mapped,
            'inventories' => $this->list($auth),
            'materials' => $this->materials->list($auth),
            'catalogue' => $this->catalogue->list($auth),
        ];
    }

    public function delete(AuthContext $auth, string $id, string $ip): void
    {
        $row = $this->row($auth, $id);
        $this->pdo->prepare('DELETE FROM inventory_lines WHERE id = :id AND company_id = :company_id')
            ->execute(['id' => $id, 'company_id' => $auth->companyId]);
        $this->audit->record($auth, 'inventory.delete', 'stocks', 'inventaire', 'inventory_line', $id, (string) $row['name'], $ip);
    }

    private function syncOpenLines(AuthContext $auth): void
    {
        $articles = $this->stock->listStockArticles($auth);
        $open = $this->pdo->prepare(
            'SELECT * FROM inventory_lines
             WHERE company_id = :company_id AND article_kind = :kind AND article_id = :article_id AND status <> :done
             ORDER BY created_at DESC
             LIMIT 1',
        );
        $update = $this->pdo->prepare(
            'UPDATE inventory_lines
             SET name = :name, system_qty = :system_qty, gap = :gap, status = :status, qty_init = :qty_init, qty_solde = :qty_solde
             WHERE id = :id AND company_id = :company_id',
        );
        $insert = $this->pdo->prepare(
            'INSERT INTO inventory_lines
                (id, company_id, article_kind, article_id, name, reference, status, system_qty, physical_qty, gap, reason, qty_init, qty_solde)
             VALUES
                (:id, :company_id, :article_kind, :article_id, :name, :reference, :status, :system_qty, :physical_qty, :gap, :reason, :qty_init, :qty_solde)',
        );

        foreach ($articles as $article) {
            $open->execute([
                'company_id' => $auth->companyId,
                'kind' => $article['kind'],
                'article_id' => $article['id'],
                'done' => 'Régularisé',
            ]);
            $row = $open->fetch();
            $system = max(0, round($article['quantity']));
            if ($row) {
                $physical = (float) $row['physical_qty'];
                $gap = $physical - $system;
                $status = $gap === 0 ? 'En cours' : 'Écart';
                $update->execute([
                    'name' => $article['name'],
                    'system_qty' => $system,
                    'gap' => $gap,
                    'status' => $status,
                    'qty_init' => $system,
                    'qty_solde' => $physical,
                    'id' => $row['id'],
                    'company_id' => $auth->companyId,
                ]);
                continue;
            }
            $insert->execute([
                'id' => Uuid::v4(),
                'company_id' => $auth->companyId,
                'article_kind' => $article['kind'],
                'article_id' => $article['id'],
                'name' => $article['name'],
                'reference' => $this->nextReference($auth->companyId),
                'status' => 'En cours',
                'system_qty' => $system,
                'physical_qty' => $system,
                'gap' => 0,
                'reason' => '',
                'qty_init' => $system,
                'qty_solde' => $system,
            ]);
        }
    }

    private function one(AuthContext $auth, string $id): array
    {
        return RecordMapper::inventoryLine($this->row($auth, $id));
    }

    private function row(AuthContext $auth, string $id): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT * FROM inventory_lines WHERE id = :id AND company_id = :company_id LIMIT 1',
        );
        $stmt->execute(['id' => $id, 'company_id' => $auth->companyId]);
        $row = $stmt->fetch();
        if (!$row) {
            throw HttpException::notFound('Ligne d’inventaire introuvable.');
        }
        return $row;
    }

    private function lockRow(AuthContext $auth, string $id): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT * FROM inventory_lines WHERE id = :id AND company_id = :company_id LIMIT 1 FOR UPDATE',
        );
        $stmt->execute(['id' => $id, 'company_id' => $auth->companyId]);
        $row = $stmt->fetch();
        if (!$row) {
            throw HttpException::notFound('Ligne d’inventaire introuvable.');
        }
        return $row;
    }

    private function nextReference(string $companyId): string
    {
        $stmt = $this->pdo->prepare('SELECT reference FROM inventory_lines WHERE company_id = :id AND reference LIKE :prefix');
        $stmt->execute(['id' => $companyId, 'prefix' => 'INV-%']);
        $max = 0;
        foreach ($stmt->fetchAll() as $row) {
            if (preg_match('/^INV-(\d+)$/i', (string) $row['reference'], $match)) {
                $max = max($max, (int) $match[1]);
            }
        }
        return 'INV-' . str_pad((string) ($max + 1), 3, '0', STR_PAD_LEFT);
    }
}
