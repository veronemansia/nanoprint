<?php

declare(strict_types=1);

namespace NanoPrint\Services;

use NanoPrint\Auth\AuthContext;
use NanoPrint\Http\HttpException;
use NanoPrint\Support\AuditLogger;
use NanoPrint\Support\RecordMapper;
use NanoPrint\Support\Uuid;
use PDO;

final class OrderService
{
    public const STATUSES = ['En attente', 'En production', 'En finition', 'Expédiée'];

    public function __construct(
        private readonly PDO $pdo,
        private readonly AuditLogger $audit,
    ) {
    }

    /** @return list<array<string, mixed>> */
    public function list(AuthContext $auth): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT o.*, c.name AS client_name
             FROM orders o
             INNER JOIN clients c ON c.id = o.client_id
             WHERE o.company_id = :company_id
             ORDER BY o.updated_at DESC',
        );
        $stmt->execute(['company_id' => $auth->companyId]);
        return array_map(RecordMapper::order(...), $stmt->fetchAll());
    }

    public function updateStatus(AuthContext $auth, string $id, array $values, string $ip): array
    {
        $row = $this->mustExist($auth, $id);
        $status = $this->status((string) ($values['status'] ?? $row['status']));
        $this->pdo->prepare(
            'UPDATE orders SET status = :status WHERE id = :id AND company_id = :company_id',
        )->execute(['status' => $status, 'id' => $id, 'company_id' => $auth->companyId]);
        $this->audit->record(
            $auth,
            'order.update_status',
            'devis-commandes',
            'statuts-commandes',
            'order',
            $id,
            (string) $row['reference'] . ' · ' . $status,
            $ip,
        );
        return $this->one($auth, $id);
    }

    public function delete(AuthContext $auth, string $id, string $ip): void
    {
        $row = $this->mustExist($auth, $id);
        $linked = $this->pdo->prepare(
            'SELECT 1 FROM invoices WHERE company_id = :company_id AND order_id = :id
             UNION ALL
             SELECT 1 FROM order_deposits WHERE company_id = :company_id2 AND order_id = :id2
             LIMIT 1',
        );
        $linked->execute([
            'company_id' => $auth->companyId,
            'id' => $id,
            'company_id2' => $auth->companyId,
            'id2' => $id,
        ]);
        if ($linked->fetchColumn()) {
            throw HttpException::conflict('Impossible de supprimer cette commande : des factures ou acomptes y sont rattachés.');
        }
        $fileStmt = $this->pdo->prepare(
            'SELECT id FROM order_files WHERE company_id = :company_id AND order_id = :id',
        );
        $fileStmt->execute(['company_id' => $auth->companyId, 'id' => $id]);
        $fileIds = $fileStmt->fetchAll(PDO::FETCH_COLUMN) ?: [];
        $this->pdo->prepare(
            'UPDATE quotes SET order_id = NULL, order_ref = :empty WHERE order_id = :id AND company_id = :company_id',
        )->execute(['empty' => '', 'id' => $id, 'company_id' => $auth->companyId]);
        $this->pdo->prepare('DELETE FROM orders WHERE id = :id AND company_id = :company_id')
            ->execute(['id' => $id, 'company_id' => $auth->companyId]);
        foreach ($fileIds as $fileId) {
            $path = OrderFileService::diskPath($auth->companyId, (string) $fileId);
            if (is_file($path)) {
                unlink($path);
            }
        }
        $this->audit->record(
            $auth,
            'order.delete',
            'devis-commandes',
            'statuts-commandes',
            'order',
            $id,
            (string) $row['reference'] . ' · ' . (string) $row['name'],
            $ip,
        );
    }

    /**
     * @param array<string, mixed> $quote
     * @param array{quantity: float, amount: float, json: string} $priced
     * @return array<string, mixed>
     */
    public function insertFromQuote(AuthContext $auth, array $quote, array $priced, string $ip): array
    {
        $id = Uuid::v4();
        $reference = $this->nextReference($auth->companyId);
        $due = (new \DateTimeImmutable('+7 days'))->format('Y-m-d');
        $this->pdo->prepare(
            'INSERT INTO orders (
                id, company_id, reference, name, status, client_id, quote_id, quote_ref,
                quantity, amount, due_date, payload, history_json
             ) VALUES (
                :id, :company_id, :reference, :name, :status, :client_id, :quote_id, :quote_ref,
                :quantity, :amount, :due_date, :payload, :history_json
             )',
        )->execute([
            'id' => $id,
            'company_id' => $auth->companyId,
            'reference' => $reference,
            'name' => (string) ($quote['name'] ?: ('Commande ' . $quote['reference'])),
            'status' => 'En attente',
            'client_id' => $quote['client_id'],
            'quote_id' => $quote['id'],
            'quote_ref' => $quote['reference'],
            'quantity' => $priced['quantity'],
            'amount' => $priced['amount'],
            'due_date' => $due,
            'payload' => $priced['json'],
            'history_json' => '[]',
        ]);
        $this->audit->record(
            $auth,
            'order.create',
            'devis-commandes',
            'conversion',
            'order',
            $id,
            $reference . ' · ' . (string) $quote['reference'],
            $ip,
        );
        return $this->one($auth, $id);
    }

    public function nextReference(string $companyId, ?\DateTimeInterface $at = null): string
    {
        $at = $at ?? new \DateTimeImmutable();
        $stamp = $at->format('ymd');
        $prefix = 'CMD-' . $stamp;
        $stmt = $this->pdo->prepare(
            'SELECT reference FROM orders WHERE company_id = :id AND reference LIKE :prefix',
        );
        $stmt->execute(['id' => $companyId, 'prefix' => $prefix . '%']);
        $taken = [];
        foreach ($stmt->fetchAll() as $row) {
            $taken[strtoupper((string) $row['reference'])] = true;
        }
        for ($i = 1; $i < 100; $i++) {
            $reference = $prefix . str_pad((string) $i, 2, '0', STR_PAD_LEFT);
            if (!isset($taken[strtoupper($reference)])) {
                return $reference;
            }
        }
        return 'CMD-' . substr((string) (int) (microtime(true) * 1000), -8);
    }

    public function nextAvenantReference(string $companyId, string $orderReference): string
    {
        $stamp = preg_replace('/^CMD-/i', '', $orderReference) ?: substr((string) time(), -6);
        $prefix = 'AV-' . $stamp . '-';
        $stmt = $this->pdo->prepare(
            'SELECT reference FROM order_amendments WHERE company_id = :id AND reference LIKE :prefix',
        );
        $stmt->execute(['id' => $companyId, 'prefix' => $prefix . '%']);
        $taken = [];
        foreach ($stmt->fetchAll() as $row) {
            $taken[strtoupper((string) $row['reference'])] = true;
        }
        for ($i = 1; $i < 100; $i++) {
            $reference = $prefix . str_pad((string) $i, 2, '0', STR_PAD_LEFT);
            if (!isset($taken[strtoupper($reference)])) {
                return $reference;
            }
        }
        return 'AV-' . substr((string) time(), -8);
    }

    /** @return array<string, mixed>|null */
    public function findByQuote(AuthContext $auth, string $quoteId): ?array
    {
        $stmt = $this->pdo->prepare(
            'SELECT * FROM orders WHERE company_id = :company_id AND quote_id = :quote_id LIMIT 1',
        );
        $stmt->execute(['company_id' => $auth->companyId, 'quote_id' => $quoteId]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    /** @return array<string, mixed> */
    public function one(AuthContext $auth, string $id): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT o.*, c.name AS client_name
             FROM orders o
             INNER JOIN clients c ON c.id = o.client_id
             WHERE o.id = :id AND o.company_id = :company_id LIMIT 1',
        );
        $stmt->execute(['id' => $id, 'company_id' => $auth->companyId]);
        $row = $stmt->fetch();
        if (!$row) {
            throw HttpException::notFound('Commande introuvable.');
        }
        return RecordMapper::order($row);
    }

    /** @return array<string, mixed> */
    public function mustExist(AuthContext $auth, string $id): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT * FROM orders WHERE id = :id AND company_id = :company_id LIMIT 1',
        );
        $stmt->execute(['id' => $id, 'company_id' => $auth->companyId]);
        $row = $stmt->fetch();
        if (!$row) {
            throw HttpException::notFound('Commande introuvable.');
        }
        return $row;
    }

    private function status(string $status): string
    {
        $status = trim($status);
        if (!in_array($status, self::STATUSES, true)) {
            throw HttpException::unprocessable('Statut de commande invalide.');
        }
        return $status;
    }
}
