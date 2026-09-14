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

final class StockService
{
    public const KIND_MATERIAL = 'material';
    public const KIND_PRODUCT = 'product';

    public const WRITEOFF_REASONS = ['Cassé', 'Perte', 'Calage', 'Périmé', 'Autre'];
    public const CONSUME_REASON = 'Commande';

    public function __construct(
        private readonly PDO $pdo,
        private readonly AuditLogger $audit,
        private readonly MaterialService $materials,
        private readonly CatalogueService $catalogue,
    ) {
    }

    public static function fromClientKind(string $kind): string
    {
        $kind = trim($kind);
        if ($kind === 'finis' || $kind === self::KIND_PRODUCT) {
            return self::KIND_PRODUCT;
        }
        if ($kind === 'matieres' || $kind === self::KIND_MATERIAL) {
            return self::KIND_MATERIAL;
        }
        throw HttpException::unprocessable('Indiquez s’il s’agit d’un produit fini ou d’une matière.');
    }

    /**
     * @return array{kind:string,id:string,name:string,reference:string,quantity:float,alert_qty:float,unit:string,product_kind?:string}
     */
    public function lockArticle(AuthContext $auth, string $kind, string $id): array
    {
        if ($kind === self::KIND_MATERIAL) {
            $stmt = $this->pdo->prepare(
                'SELECT m.*, t.name AS type_name, u.name AS unit_name
                 FROM materials m
                 INNER JOIN material_types t ON t.id = m.type_id
                 INNER JOIN material_units u ON u.id = m.unit_id
                 WHERE m.id = :id AND m.company_id = :company_id
                 LIMIT 1
                 FOR UPDATE',
            );
            $stmt->execute(['id' => $id, 'company_id' => $auth->companyId]);
            $row = $stmt->fetch();
            if (!$row) {
                throw HttpException::notFound('Matière introuvable.');
            }
            return [
                'kind' => self::KIND_MATERIAL,
                'id' => (string) $row['id'],
                'name' => (string) $row['name'],
                'reference' => (string) $row['reference'],
                'quantity' => (float) $row['quantity'],
                'alert_qty' => (float) $row['alert_qty'],
                'unit' => (string) ($row['unit_name'] ?? 'u'),
            ];
        }

        $stmt = $this->pdo->prepare(
            'SELECT p.*, f.name AS family_name
             FROM catalogue_products p
             INNER JOIN catalogue_families f ON f.id = p.family_id
             WHERE p.id = :id AND p.company_id = :company_id
             LIMIT 1
             FOR UPDATE',
        );
        $stmt->execute(['id' => $id, 'company_id' => $auth->companyId]);
        $row = $stmt->fetch();
        if (!$row) {
            throw HttpException::notFound('Produit introuvable.');
        }
        if ((string) ($row['product_kind'] ?? 'Produit') === 'Prestation') {
            throw HttpException::unprocessable('Une prestation n’a pas de stock à retirer.');
        }
        return [
            'kind' => self::KIND_PRODUCT,
            'id' => (string) $row['id'],
            'name' => (string) $row['name'],
            'reference' => (string) $row['reference'],
            'quantity' => (float) ($row['quantity'] ?? 0),
            'alert_qty' => (float) ($row['alert_qty'] ?? 0),
            'unit' => (string) ($row['unit'] ?? 'ex.'),
            'product_kind' => (string) ($row['product_kind'] ?? 'Produit'),
        ];
    }

    public function applyQuantity(AuthContext $auth, string $kind, string $id, float $quantity, float $alertQty): void
    {
        $quantity = max(0, round($quantity));
        if ($kind === self::KIND_MATERIAL) {
            $this->pdo->prepare(
                'UPDATE materials SET quantity = :quantity, status = :status
                 WHERE id = :id AND company_id = :company_id',
            )->execute([
                'quantity' => $quantity,
                'status' => RecordMapper::stockStatus($quantity, $alertQty),
                'id' => $id,
                'company_id' => $auth->companyId,
            ]);
            return;
        }
        $this->pdo->prepare(
            'UPDATE catalogue_products SET quantity = :quantity, alert_qty = :alert_qty
             WHERE id = :id AND company_id = :company_id',
        )->execute([
            'quantity' => $quantity,
            'alert_qty' => max(0, $alertQty),
            'id' => $id,
            'company_id' => $auth->companyId,
        ]);
    }

    public function applyAlertQty(AuthContext $auth, string $kind, string $id, float $alertQty, float $quantity): void
    {
        $alertQty = max(0, round($alertQty));
        if ($kind === self::KIND_MATERIAL) {
            $this->pdo->prepare(
                'UPDATE materials SET alert_qty = :alert_qty, status = :status
                 WHERE id = :id AND company_id = :company_id',
            )->execute([
                'alert_qty' => $alertQty,
                'status' => RecordMapper::stockStatus($quantity, $alertQty),
                'id' => $id,
                'company_id' => $auth->companyId,
            ]);
            return;
        }
        $this->pdo->prepare(
            'UPDATE catalogue_products SET alert_qty = :alert_qty
             WHERE id = :id AND company_id = :company_id',
        )->execute([
            'alert_qty' => $alertQty,
            'id' => $id,
            'company_id' => $auth->companyId,
        ]);
    }

    /**
     * @return list<array{kind:string,id:string,name:string,reference:string,quantity:float,alert_qty:float,unit:string}>
     */
    public function listStockArticles(AuthContext $auth): array
    {
        $out = [];
        $materials = $this->pdo->prepare(
            'SELECT m.id, m.name, m.reference, m.quantity, m.alert_qty, u.name AS unit_name
             FROM materials m
             INNER JOIN material_units u ON u.id = m.unit_id
             WHERE m.company_id = :id
             ORDER BY m.name',
        );
        $materials->execute(['id' => $auth->companyId]);
        foreach ($materials->fetchAll() as $row) {
            $out[] = [
                'kind' => self::KIND_MATERIAL,
                'id' => (string) $row['id'],
                'name' => (string) $row['name'],
                'reference' => (string) $row['reference'],
                'quantity' => (float) $row['quantity'],
                'alert_qty' => (float) $row['alert_qty'],
                'unit' => (string) ($row['unit_name'] ?? 'u'),
            ];
        }
        $products = $this->pdo->prepare(
            'SELECT id, name, reference, quantity, alert_qty, unit, product_kind
             FROM catalogue_products
             WHERE company_id = :id AND product_kind <> :prestation
             ORDER BY name',
        );
        $products->execute(['id' => $auth->companyId, 'prestation' => 'Prestation']);
        foreach ($products->fetchAll() as $row) {
            $out[] = [
                'kind' => self::KIND_PRODUCT,
                'id' => (string) $row['id'],
                'name' => (string) $row['name'],
                'reference' => (string) $row['reference'],
                'quantity' => (float) ($row['quantity'] ?? 0),
                'alert_qty' => (float) ($row['alert_qty'] ?? 0),
                'unit' => (string) ($row['unit'] ?? 'ex.'),
            ];
        }
        return $out;
    }

    /**
     * @return array{kind:string,id:string,name:string,reference:string,quantity:float,alert_qty:float,unit:string}|null
     */
    public function findArticleByName(AuthContext $auth, string $name): ?array
    {
        $needle = mb_strtolower(trim($name));
        if ($needle === '') {
            return null;
        }
        foreach ($this->listStockArticles($auth) as $article) {
            if (mb_strtolower($article['name']) === $needle || mb_strtolower($article['reference']) === $needle) {
                return $article;
            }
        }
        return null;
    }

    public function articleInUse(AuthContext $auth, string $kind, string $id): bool
    {
        foreach (['stock_movements', 'stock_alerts', 'inventory_lines'] as $table) {
            $stmt = $this->pdo->prepare(
                "SELECT 1 FROM {$table} WHERE company_id = :company_id AND article_kind = :kind AND article_id = :id LIMIT 1",
            );
            $stmt->execute(['company_id' => $auth->companyId, 'kind' => $kind, 'id' => $id]);
            if ($stmt->fetchColumn()) {
                return true;
            }
        }
        return false;
    }

    /** @return list<array<string, mixed>> */
    public function listMovements(AuthContext $auth): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT * FROM stock_movements WHERE company_id = :id ORDER BY created_at DESC, id DESC LIMIT 80',
        );
        $stmt->execute(['id' => $auth->companyId]);
        return array_map(RecordMapper::stockMovement(...), $stmt->fetchAll());
    }

    /**
     * @return array{
     *   movement: array<string, mixed>,
     *   materials: list<array<string, mixed>>,
     *   catalogue: list<array<string, mixed>>,
     *   movements: list<array<string, mixed>>
     * }
     */
    public function withdraw(AuthContext $auth, array $values, string $ip): array
    {
        $kind = self::fromClientKind((string) ($values['kind'] ?? ''));
        $id = Validator::required((string) ($values['id'] ?? ''), 'Article introuvable.');
        $quantity = (int) round(Validator::nonNegative($values['quantity'] ?? 0, 'Indiquez une quantité d’au moins 1.'));
        if ($quantity < 1) {
            throw HttpException::unprocessable('Indiquez une quantité d’au moins 1.');
        }
        $reason = Validator::required((string) ($values['reason'] ?? ''), 'Choisissez un motif.');
        if (!in_array($reason, self::WRITEOFF_REASONS, true)) {
            throw HttpException::unprocessable('Choisissez un motif.');
        }
        $note = trim((string) ($values['note'] ?? ''));
        if (mb_strlen($note) > 255) {
            throw HttpException::unprocessable('La précision ne peut pas dépasser 255 caractères.');
        }

        $this->pdo->beginTransaction();
        try {
            $article = $this->lockArticle($auth, $kind, $id);
            $qtyInit = max(0, round($article['quantity']));
            if ($qtyInit < 1) {
                throw HttpException::unprocessable('Aucun stock à retirer.');
            }
            if ($quantity > $qtyInit) {
                throw HttpException::unprocessable('La quantité ne peut pas dépasser le stock (' . (int) $qtyInit . ').');
            }
            $qtySolde = $qtyInit - $quantity;
            $movementId = $this->insertMovement($auth, $article, $reason, $note, $qtyInit, $quantity, $qtySolde);
            $this->applyQuantity($auth, $kind, $article['id'], $qtySolde, (float) $article['alert_qty']);
            $this->pdo->commit();
        } catch (\Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $e;
        }

        $this->audit->record($auth, 'stock.withdraw', 'stocks', 'stock-papier', 'stock_movement', $movementId, $article['reference'] . ' −' . $quantity, $ip);
        return [
            'movement' => $this->oneMovement($auth, $movementId),
            'materials' => $this->materials->list($auth),
            'catalogue' => $this->catalogue->list($auth),
            'movements' => $this->listMovements($auth),
        ];
    }

    /**
     * Deducts BOM materials for a quote conversion. Must run inside an existing PDO transaction.
     *
     * @param array{lines?: list<array<string, mixed>>} $payload
     * @return array{materials: list<array<string, mixed>>, movements: list<array<string, mixed>>, consumed: int}
     */
    public function consumeForOrder(AuthContext $auth, array $payload, string $orderId, string $orderRef, string $ip): array
    {
        $needs = $this->materialNeedsFromPayload($auth, $payload);
        if (!$needs) {
            return [
                'materials' => $this->materials->list($auth),
                'movements' => $this->listMovements($auth),
                'consumed' => 0,
            ];
        }

        $materialIds = array_keys($needs);
        sort($materialIds);

        $locked = [];
        $shortages = [];
        foreach ($materialIds as $materialId) {
            try {
                $article = $this->lockArticle($auth, self::KIND_MATERIAL, $materialId);
            } catch (HttpException $e) {
                if ($e->status === 404) {
                    $label = $needs[$materialId]['label'] ?: $materialId;
                    throw HttpException::unprocessable('Une matière de la nomenclature n’existe plus (' . $label . ').');
                }
                throw $e;
            }
            $qtyInit = max(0, round($article['quantity']));
            $qtyOut = (int) $needs[$materialId]['qty'];
            if ($qtyOut > $qtyInit) {
                $shortages[] = $article['name'] . ' (besoin ' . $qtyOut . ', dispo ' . (int) $qtyInit . ')';
            }
            $locked[$materialId] = ['article' => $article, 'qtyInit' => $qtyInit, 'qtyOut' => $qtyOut];
        }
        if ($shortages) {
            throw HttpException::unprocessable('Stock insuffisant : ' . implode('. ', $shortages) . '.');
        }

        $note = trim('Commande ' . $orderRef);
        if (mb_strlen($note) > 255) {
            $note = mb_substr($note, 0, 255);
        }
        $count = 0;
        foreach ($materialIds as $materialId) {
            $row = $locked[$materialId];
            $article = $row['article'];
            $qtyInit = $row['qtyInit'];
            $qtyOut = $row['qtyOut'];
            $qtySolde = $qtyInit - $qtyOut;
            $this->insertMovement($auth, $article, self::CONSUME_REASON, $note, $qtyInit, $qtyOut, $qtySolde);
            $this->applyQuantity($auth, self::KIND_MATERIAL, $article['id'], $qtySolde, (float) $article['alert_qty']);
            $count++;
        }

        $this->audit->record(
            $auth,
            'stock.consume',
            'devis-commandes',
            'conversion',
            'order',
            $orderId,
            $orderRef . ' · ' . $count . ' matières',
            $ip,
        );

        return [
            'materials' => $this->materials->list($auth),
            'movements' => $this->listMovements($auth),
            'consumed' => $count,
        ];
    }

    /**
     * @param array{lines?: list<array<string, mixed>>} $payload
     * @return array<string, array{qty: int, label: string}>
     */
    private function materialNeedsFromPayload(AuthContext $auth, array $payload): array
    {
        $lines = $payload['lines'] ?? [];
        if (!is_array($lines) || !$lines) {
            return [];
        }

        $productIds = [];
        foreach ($lines as $line) {
            if (!is_array($line)) {
                continue;
            }
            $productId = trim((string) ($line['productId'] ?? ''));
            if ($productId !== '') {
                $productIds[] = $productId;
            }
        }
        $productIds = array_values(array_unique($productIds));
        if (!$productIds) {
            return [];
        }

        $placeholders = implode(',', array_fill(0, count($productIds), '?'));
        $kinds = $this->pdo->prepare(
            "SELECT id, product_kind FROM catalogue_products WHERE company_id = ? AND id IN ($placeholders)",
        );
        $kinds->execute([$auth->companyId, ...$productIds]);
        $eligible = [];
        foreach ($kinds->fetchAll() as $row) {
            if ((string) ($row['product_kind'] ?? 'Produit') === 'Prestation') {
                continue;
            }
            $eligible[(string) $row['id']] = true;
        }
        if (!$eligible) {
            return [];
        }

        $eligibleIds = array_keys($eligible);
        $bomPlaceholders = implode(',', array_fill(0, count($eligibleIds), '?'));
        $bom = $this->pdo->prepare(
            "SELECT pm.product_id, pm.material_id, pm.label, pm.quantity
             FROM product_materials pm
             INNER JOIN catalogue_products p ON p.id = pm.product_id
             WHERE p.company_id = ? AND pm.product_id IN ($bomPlaceholders)",
        );
        $bom->execute([$auth->companyId, ...$eligibleIds]);
        $byProduct = [];
        foreach ($bom->fetchAll() as $row) {
            $byProduct[(string) $row['product_id']][] = $row;
        }

        $needs = [];
        foreach ($lines as $line) {
            if (!is_array($line)) {
                continue;
            }
            $productId = trim((string) ($line['productId'] ?? ''));
            if ($productId === '' || !isset($eligible[$productId])) {
                continue;
            }
            $lineQty = max(0, (int) round((float) ($line['quantity'] ?? 0)));
            if ($lineQty < 1) {
                continue;
            }
            foreach ($byProduct[$productId] ?? [] as $row) {
                $materialId = trim((string) ($row['material_id'] ?? ''));
                if ($materialId === '') {
                    continue;
                }
                $add = (float) ($row['quantity'] ?? 0) * $lineQty;
                if ($add <= 0) {
                    continue;
                }
                $label = trim((string) ($row['label'] ?? ''));
                if (!isset($needs[$materialId])) {
                    $needs[$materialId] = ['qty' => 0.0, 'label' => $label !== '' ? $label : $materialId];
                }
                $needs[$materialId]['qty'] += $add;
                if ($label !== '') {
                    $needs[$materialId]['label'] = $label;
                }
            }
        }

        $rounded = [];
        foreach ($needs as $materialId => $row) {
            $qty = (int) round((float) $row['qty']);
            if ($qty < 1) {
                continue;
            }
            $rounded[$materialId] = [
                'qty' => $qty,
                'label' => (string) ($row['label'] ?? $materialId),
            ];
        }
        return $rounded;
    }

    /**
     * @param array{kind:string,id:string,name:string,reference:string} $article
     */
    private function insertMovement(
        AuthContext $auth,
        array $article,
        string $reason,
        string $note,
        float $qtyInit,
        float $qtyOut,
        float $qtySolde,
    ): string {
        $id = Uuid::v4();
        $this->pdo->prepare(
            'INSERT INTO stock_movements
                (id, company_id, article_kind, article_id, article_name, article_reference, reason, note, qty_init, qty_out, qty_solde)
             VALUES
                (:id, :company_id, :article_kind, :article_id, :article_name, :article_reference, :reason, :note, :qty_init, :qty_out, :qty_solde)',
        )->execute([
            'id' => $id,
            'company_id' => $auth->companyId,
            'article_kind' => $article['kind'],
            'article_id' => $article['id'],
            'article_name' => $article['name'],
            'article_reference' => $article['reference'],
            'reason' => $reason,
            'note' => $note,
            'qty_init' => $qtyInit,
            'qty_out' => $qtyOut,
            'qty_solde' => $qtySolde,
        ]);
        return $id;
    }

    private function oneMovement(AuthContext $auth, string $id): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT * FROM stock_movements WHERE id = :id AND company_id = :company_id LIMIT 1',
        );
        $stmt->execute(['id' => $id, 'company_id' => $auth->companyId]);
        $row = $stmt->fetch();
        if (!$row) {
            throw HttpException::notFound('Mouvement introuvable.');
        }
        return RecordMapper::stockMovement($row);
    }
}
