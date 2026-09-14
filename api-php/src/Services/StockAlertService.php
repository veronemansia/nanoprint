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

final class StockAlertService
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
        $this->refreshCurrents($auth);
        $stmt = $this->pdo->prepare(
            'SELECT * FROM stock_alerts WHERE company_id = :id ORDER BY updated_at DESC, name',
        );
        $stmt->execute(['id' => $auth->companyId]);
        return array_map(RecordMapper::stockAlert(...), $stmt->fetchAll());
    }

    /**
     * @return array{alert: array<string, mixed>, materials: list<array<string, mixed>>, catalogue: list<array<string, mixed>>}
     */
    public function create(AuthContext $auth, array $values, string $ip): array
    {
        return $this->upsert($auth, null, $values, $ip);
    }

    /**
     * @return array{alert: array<string, mixed>, materials: list<array<string, mixed>>, catalogue: list<array<string, mixed>>}
     */
    public function update(AuthContext $auth, string $id, array $values, string $ip): array
    {
        return $this->upsert($auth, $id, $values, $ip);
    }

    public function delete(AuthContext $auth, string $id, string $ip): void
    {
        $row = $this->row($auth, $id);
        $this->pdo->prepare('DELETE FROM stock_alerts WHERE id = :id AND company_id = :company_id')
            ->execute(['id' => $id, 'company_id' => $auth->companyId]);
        $this->audit->record($auth, 'stock_alert.delete', 'stocks', 'seuils-alerte', 'stock_alert', $id, (string) $row['name'], $ip);
    }

    /**
     * @return array{alert: array<string, mixed>, materials: list<array<string, mixed>>, catalogue: list<array<string, mixed>>}
     */
    private function upsert(AuthContext $auth, ?string $id, array $values, string $ip): array
    {
        $name = Validator::required((string) ($values['name'] ?? ''), 'L’article est obligatoire.');
        $minimum = (int) round(Validator::nonNegative($values['minimum'] ?? 0, 'Saisissez un stock minimum valide.'));
        $supplier = Validator::required((string) ($values['supplier'] ?? ''), 'Le fournisseur à relancer est obligatoire.');
        $wanted = trim((string) ($values['status'] ?? ''));
        if (!in_array($wanted, ['OK', 'Alerte', 'Commande lancée', ''], true)) {
            throw HttpException::unprocessable('Statut de seuil invalide.');
        }

        $this->pdo->beginTransaction();
        try {
            $existing = $id ? $this->row($auth, $id) : null;
            $article = $this->stock->findArticleByName($auth, $name);
            if (!$article && $existing) {
                $article = [
                    'kind' => (string) $existing['article_kind'],
                    'id' => (string) $existing['article_id'],
                    'name' => (string) $existing['name'],
                    'reference' => (string) $existing['reference'],
                    'quantity' => (float) $existing['current_qty'],
                    'alert_qty' => (float) $existing['minimum'],
                    'unit' => 'u',
                ];
                $locked = $this->stock->lockArticle($auth, $article['kind'], $article['id']);
                $article['quantity'] = $locked['quantity'];
                $article['name'] = $locked['name'];
                $article['reference'] = $locked['reference'];
                $article['alert_qty'] = $locked['alert_qty'];
            } elseif ($article) {
                $locked = $this->stock->lockArticle($auth, $article['kind'], $article['id']);
                $article['quantity'] = $locked['quantity'];
                $article['name'] = $locked['name'];
                $article['reference'] = $locked['reference'];
            } else {
                throw HttpException::unprocessable('Article introuvable dans le stock. Utilisez le nom ou la référence exacte d’une matière ou d’un produit fini.');
            }

            $current = max(0, round($article['quantity']));
            $status = $wanted === 'Commande lancée'
                ? 'Commande lancée'
                : RecordMapper::alertStatus($current, $minimum, 'OK');

            $duplicate = $this->byArticle($auth, $article['kind'], $article['id']);
            if ($duplicate && (!$existing || (string) $duplicate['id'] !== (string) $existing['id'])) {
                $existing = $duplicate;
            }

            $this->stock->applyAlertQty($auth, $article['kind'], $article['id'], $minimum, $current);

            if ($existing) {
                $alertId = (string) $existing['id'];
                $this->pdo->prepare(
                    'UPDATE stock_alerts
                     SET name = :name, status = :status, minimum = :minimum, current_qty = :current_qty, supplier = :supplier,
                         article_kind = :article_kind, article_id = :article_id
                     WHERE id = :id AND company_id = :company_id',
                )->execute([
                    'name' => $article['name'],
                    'status' => $status,
                    'minimum' => $minimum,
                    'current_qty' => $current,
                    'supplier' => $supplier,
                    'article_kind' => $article['kind'],
                    'article_id' => $article['id'],
                    'id' => $alertId,
                    'company_id' => $auth->companyId,
                ]);
                $action = 'stock_alert.update';
            } else {
                $alertId = Uuid::v4();
                $reference = $this->nextReference($auth->companyId);
                $this->pdo->prepare(
                    'INSERT INTO stock_alerts
                        (id, company_id, article_kind, article_id, name, reference, status, minimum, current_qty, supplier)
                     VALUES
                        (:id, :company_id, :article_kind, :article_id, :name, :reference, :status, :minimum, :current_qty, :supplier)',
                )->execute([
                    'id' => $alertId,
                    'company_id' => $auth->companyId,
                    'article_kind' => $article['kind'],
                    'article_id' => $article['id'],
                    'name' => $article['name'],
                    'reference' => $reference,
                    'status' => $status,
                    'minimum' => $minimum,
                    'current_qty' => $current,
                    'supplier' => $supplier,
                ]);
                $action = 'stock_alert.create';
            }

            $this->pdo->commit();
        } catch (\Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $e;
        }

        $mapped = $this->one($auth, $alertId);
        $this->audit->record($auth, $action, 'stocks', 'seuils-alerte', 'stock_alert', $alertId, (string) $mapped['reference'], $ip);
        return [
            'alert' => $mapped,
            'materials' => $this->materials->list($auth),
            'catalogue' => $this->catalogue->list($auth),
        ];
    }

    private function refreshCurrents(AuthContext $auth): void
    {
        $articles = [];
        foreach ($this->stock->listStockArticles($auth) as $article) {
            $articles[$article['kind'] . ':' . $article['id']] = $article;
        }
        $stmt = $this->pdo->prepare('SELECT * FROM stock_alerts WHERE company_id = :id');
        $stmt->execute(['id' => $auth->companyId]);
        $update = $this->pdo->prepare(
            'UPDATE stock_alerts SET current_qty = :current_qty, status = :status, name = :name
             WHERE id = :id AND company_id = :company_id',
        );
        foreach ($stmt->fetchAll() as $row) {
            $key = (string) $row['article_kind'] . ':' . (string) $row['article_id'];
            $article = $articles[$key] ?? null;
            if (!$article) {
                continue;
            }
            $current = max(0, round($article['quantity']));
            $minimum = (float) $row['minimum'];
            $status = RecordMapper::alertStatus($current, $minimum, (string) $row['status']);
            $update->execute([
                'current_qty' => $current,
                'status' => $status,
                'name' => $article['name'],
                'id' => $row['id'],
                'company_id' => $auth->companyId,
            ]);
        }
    }

    private function one(AuthContext $auth, string $id): array
    {
        return RecordMapper::stockAlert($this->row($auth, $id));
    }

    private function row(AuthContext $auth, string $id): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT * FROM stock_alerts WHERE id = :id AND company_id = :company_id LIMIT 1',
        );
        $stmt->execute(['id' => $id, 'company_id' => $auth->companyId]);
        $row = $stmt->fetch();
        if (!$row) {
            throw HttpException::notFound('Seuil introuvable.');
        }
        return $row;
    }

    private function byArticle(AuthContext $auth, string $kind, string $articleId): ?array
    {
        $stmt = $this->pdo->prepare(
            'SELECT * FROM stock_alerts
             WHERE company_id = :company_id AND article_kind = :kind AND article_id = :article_id
             LIMIT 1',
        );
        $stmt->execute(['company_id' => $auth->companyId, 'kind' => $kind, 'article_id' => $articleId]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    private function nextReference(string $companyId): string
    {
        $stmt = $this->pdo->prepare('SELECT reference FROM stock_alerts WHERE company_id = :id AND reference LIKE :prefix');
        $stmt->execute(['id' => $companyId, 'prefix' => 'SEU-%']);
        $max = 0;
        foreach ($stmt->fetchAll() as $row) {
            if (preg_match('/^SEU-(\d+)$/i', (string) $row['reference'], $match)) {
                $max = max($max, (int) $match[1]);
            }
        }
        return 'SEU-' . str_pad((string) ($max + 1), 3, '0', STR_PAD_LEFT);
    }
}
