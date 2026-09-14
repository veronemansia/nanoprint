<?php

declare(strict_types=1);

namespace NanoPrint\Services;

use NanoPrint\Auth\AuthContext;
use NanoPrint\Http\HttpException;
use NanoPrint\Support\AuditLogger;
use NanoPrint\Support\RecordMapper;
use NanoPrint\Support\Uuid;
use PDO;

final class InvoiceService
{
    public function __construct(
        private readonly PDO $pdo,
        private readonly AuditLogger $audit,
        private readonly OrderService $orders,
    ) {
    }

    /** @return list<array<string, mixed>> */
    public function list(AuthContext $auth): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT i.*, o.reference AS order_ref, o.client_id AS client_id, c.name AS client_name
             FROM invoices i
             INNER JOIN orders o ON o.id = i.order_id
             INNER JOIN clients c ON c.id = o.client_id
             WHERE i.company_id = :company_id
             ORDER BY i.issued_at DESC, i.updated_at DESC',
        );
        $stmt->execute(['company_id' => $auth->companyId]);
        return array_map(RecordMapper::invoice(...), $stmt->fetchAll());
    }

    /** @return list<array<string, mixed>> */
    public function listForClient(AuthContext $auth, string $clientId): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT i.*, o.reference AS order_ref, o.client_id AS client_id, c.name AS client_name
             FROM invoices i
             INNER JOIN orders o ON o.id = i.order_id
             INNER JOIN clients c ON c.id = o.client_id
             WHERE i.company_id = :company_id AND o.client_id = :client_id
             ORDER BY i.issued_at DESC, i.updated_at DESC',
        );
        $stmt->execute(['company_id' => $auth->companyId, 'client_id' => $clientId]);
        return array_map(RecordMapper::invoice(...), $stmt->fetchAll());
    }

    /**
     * @param array<string, mixed> $input
     * @return array<string, mixed>
     */
    public function issue(AuthContext $auth, string $orderId, array $input, string $ip): array
    {
        $settlement = trim((string) ($input['settlement'] ?? 'solde'));
        if (!in_array($settlement, ['solde', 'acompte'], true)) {
            throw HttpException::unprocessable('Choisissez Solde ou Acompte.');
        }
        $this->pdo->beginTransaction();
        try {
            $order = $this->lockOrder($auth, $orderId);
            $progress = $this->progress($auth->companyId, $orderId, (float) $order['amount']);
            if ($progress['hasSolde'] || $progress['remaining'] <= 0) {
                throw HttpException::unprocessable('Cette commande est déjà soldée.');
            }
            $billed = $progress['remaining'];
            if ($settlement === 'acompte') {
                $billed = $this->acompteAmount($input['amount'] ?? 0, $progress['remaining']);
            }
            $remaining = max(0, $progress['remaining'] - $billed);
            $clientName = $this->clientName($auth, (string) $order['client_id']);
            $id = Uuid::v4();
            $issuedAt = date('Y-m-d');
            $reference = $this->nextReference($auth->companyId, $issuedAt);
            $name = mb_substr(trim($clientName . ' — ' . (string) $order['name']), 0, 190);
            $status = $remaining <= 0 ? 'Soldée' : 'Acompte';
            $this->pdo->prepare(
                'INSERT INTO invoices (
                    id, company_id, order_id, reference, name, status, settlement, amount, remaining, issued_at
                 ) VALUES (
                    :id, :company_id, :order_id, :reference, :name, :status, :settlement, :amount, :remaining, :issued_at
                 )',
            )->execute([
                'id' => $id,
                'company_id' => $auth->companyId,
                'order_id' => $orderId,
                'reference' => $reference,
                'name' => $name,
                'status' => $status,
                'settlement' => $settlement,
                'amount' => $billed,
                'remaining' => $remaining,
                'issued_at' => $issuedAt,
            ]);
            $this->audit->record(
                $auth,
                'invoice.issue',
                'facturation',
                'factures',
                'invoice',
                $id,
                $reference . ' · ' . $name,
                $ip,
            );
            $this->pdo->commit();
            return $this->one($auth, $id);
        } catch (\Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $e;
        }
    }

    /** @return array<string, mixed> */
    private function one(AuthContext $auth, string $id): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT i.*, o.reference AS order_ref, o.client_id AS client_id, c.name AS client_name
             FROM invoices i
             INNER JOIN orders o ON o.id = i.order_id
             INNER JOIN clients c ON c.id = o.client_id
             WHERE i.id = :id AND i.company_id = :company_id
             LIMIT 1',
        );
        $stmt->execute(['id' => $id, 'company_id' => $auth->companyId]);
        $row = $stmt->fetch();
        if (!$row) {
            throw HttpException::notFound('Facture introuvable.');
        }
        return RecordMapper::invoice($row);
    }

    /** @return array{total: int, billed: int, remaining: int, hasSolde: bool} */
    private function progress(string $companyId, string $orderId, float $orderAmount): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT settlement, amount FROM invoices WHERE company_id = :company_id AND order_id = :order_id FOR UPDATE',
        );
        $stmt->execute(['company_id' => $companyId, 'order_id' => $orderId]);
        $total = $this->cfa($orderAmount);
        $billed = 0;
        $hasSolde = false;
        foreach ($stmt->fetchAll() as $row) {
            $billed += $this->cfa($row['amount'] ?? 0);
            if ((string) ($row['settlement'] ?? '') === 'solde') {
                $hasSolde = true;
            }
        }
        $billed = min($total, $billed);
        return [
            'total' => $total,
            'billed' => $billed,
            'remaining' => max(0, $total - $billed),
            'hasSolde' => $hasSolde,
        ];
    }

    private function acompteAmount(mixed $raw, int $remaining): int
    {
        $amount = $this->cfa($raw);
        if ($amount <= 0) {
            throw HttpException::unprocessable('Le montant de l’acompte doit être supérieur à zéro.');
        }
        if ($remaining <= 0) {
            throw HttpException::unprocessable('Cette commande est déjà entièrement facturée.');
        }
        if ($amount >= $remaining) {
            throw HttpException::unprocessable('L’acompte doit être inférieur au total restant. Pour le reste, choisissez Solde.');
        }
        return $amount;
    }

    private function nextReference(string $companyId, string $issuedAt): string
    {
        $stamp = date('ymd', strtotime($issuedAt) ?: time());
        $prefix = 'FAC-' . $stamp;
        $stmt = $this->pdo->prepare(
            'SELECT reference FROM invoices WHERE company_id = :company_id AND reference LIKE :prefix',
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
        return 'FAC-' . substr((string) round(microtime(true) * 1000), -8);
    }

    /** @return array<string, mixed> */
    private function lockOrder(AuthContext $auth, string $orderId): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT * FROM orders WHERE id = :id AND company_id = :company_id LIMIT 1 FOR UPDATE',
        );
        $stmt->execute(['id' => $orderId, 'company_id' => $auth->companyId]);
        $row = $stmt->fetch();
        if (!$row) {
            throw HttpException::notFound('Commande introuvable.');
        }
        return $row;
    }

    private function clientName(AuthContext $auth, string $clientId): string
    {
        $stmt = $this->pdo->prepare(
            'SELECT name FROM clients WHERE id = :id AND company_id = :company_id LIMIT 1',
        );
        $stmt->execute(['id' => $clientId, 'company_id' => $auth->companyId]);
        $name = $stmt->fetchColumn();
        return $name ? (string) $name : 'Client';
    }

    private function cfa(mixed $value): int
    {
        if (is_string($value)) {
            $value = str_replace([' ', ','], ['', '.'], $value);
        }
        return (int) round((float) $value);
    }
}
