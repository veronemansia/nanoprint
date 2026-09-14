<?php

declare(strict_types=1);

namespace NanoPrint\Services;

use NanoPrint\Auth\AuthContext;
use NanoPrint\Http\HttpException;
use NanoPrint\Support\AuditLogger;
use NanoPrint\Support\Dates;
use NanoPrint\Support\RecordMapper;
use NanoPrint\Support\Uuid;
use PDO;

final class DepositService
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
            'SELECT d.*, o.reference AS order_ref, o.amount AS order_amount, o.client_id AS client_id, c.name AS client_name
             FROM order_deposits d
             INNER JOIN orders o ON o.id = d.order_id
             INNER JOIN clients c ON c.id = o.client_id
             WHERE d.company_id = :company_id
             ORDER BY d.updated_at DESC',
        );
        $stmt->execute(['company_id' => $auth->companyId]);
        return array_map(RecordMapper::deposit(...), $stmt->fetchAll());
    }

    /** @return list<array<string, mixed>> */
    public function listForClient(AuthContext $auth, string $clientId): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT d.*, o.reference AS order_ref, o.amount AS order_amount, o.client_id AS client_id, c.name AS client_name
             FROM order_deposits d
             INNER JOIN orders o ON o.id = d.order_id
             INNER JOIN clients c ON c.id = o.client_id
             WHERE d.company_id = :company_id AND o.client_id = :client_id
             ORDER BY d.updated_at DESC',
        );
        $stmt->execute(['company_id' => $auth->companyId, 'client_id' => $clientId]);
        return array_map(RecordMapper::deposit(...), $stmt->fetchAll());
    }

    /**
     * @return array{deposit: array<string, mixed>, payment: array{id: string, at: string, amount: int, receiptRef: string}}
     */
    public function recordPayment(AuthContext $auth, string $orderId, mixed $amount, string $ip): array
    {
        $this->pdo->beginTransaction();
        try {
            $order = $this->lockOrder($auth, $orderId);
            $row = $this->lockForOrder($auth->companyId, $orderId);
            $asked = $this->cfa($order['amount']);
            $payments = $this->payments(is_array($row) ? ($row['payments'] ?? '[]') : '[]');
            $paid = 0;
            foreach ($payments as $item) {
                $paid += $this->cfa($item['amount'] ?? 0);
            }
            $remaining = max(0, $asked - min($asked, $paid));
            $take = $this->paymentAmount($amount, $remaining);
            $payment = [
                'id' => Uuid::v4(),
                'at' => Dates::display(date('Y-m-d H:i:s')),
                'amount' => $take,
                'receiptRef' => $this->nextReceipt((string) $order['reference'], $payments),
            ];
            $payments[] = $payment;
            $paid += $take;
            $remaining = max(0, $asked - min($asked, $paid));
            $status = $paid <= 0 ? 'Ouvert' : ($remaining <= 0 ? 'Soldé' : 'Partiel');
            $clientName = $this->clientName($auth, (string) $order['client_id']);
            if ($row) {
                $id = (string) $row['id'];
                $this->pdo->prepare(
                    'UPDATE order_deposits
                     SET name = :name, status = :status, asked = :asked, received = :received, remaining = :remaining, payments = :payments
                     WHERE id = :id AND company_id = :company_id',
                )->execute([
                    'name' => $clientName,
                    'status' => $status,
                    'asked' => $asked,
                    'received' => $paid,
                    'remaining' => $remaining,
                    'payments' => json_encode($payments, JSON_UNESCAPED_UNICODE),
                    'id' => $id,
                    'company_id' => $auth->companyId,
                ]);
            } else {
                $id = Uuid::v4();
                $this->pdo->prepare(
                    'INSERT INTO order_deposits (
                        id, company_id, order_id, reference, name, status, asked, received, remaining, payments
                     ) VALUES (
                        :id, :company_id, :order_id, :reference, :name, :status, :asked, :received, :remaining, :payments
                     )',
                )->execute([
                    'id' => $id,
                    'company_id' => $auth->companyId,
                    'order_id' => $orderId,
                    'reference' => $this->nextDepositReference((string) $order['reference']),
                    'name' => $clientName,
                    'status' => $status,
                    'asked' => $asked,
                    'received' => $paid,
                    'remaining' => $remaining,
                    'payments' => json_encode($payments, JSON_UNESCAPED_UNICODE),
                ]);
            }
            $this->audit->record(
                $auth,
                'deposit.pay',
                'facturation',
                'acomptes',
                'deposit',
                $id,
                $payment['receiptRef'] . ' · ' . $take,
                $ip,
            );
            $this->pdo->commit();
            return [
                'deposit' => $this->one($auth, $id),
                'payment' => $payment,
            ];
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
            'SELECT d.*, o.reference AS order_ref, o.amount AS order_amount, o.client_id AS client_id, c.name AS client_name
             FROM order_deposits d
             INNER JOIN orders o ON o.id = d.order_id
             INNER JOIN clients c ON c.id = o.client_id
             WHERE d.id = :id AND d.company_id = :company_id
             LIMIT 1',
        );
        $stmt->execute(['id' => $id, 'company_id' => $auth->companyId]);
        $row = $stmt->fetch();
        if (!$row) {
            throw HttpException::notFound('Acompte introuvable.');
        }
        return RecordMapper::deposit($row);
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

    /** @return array<string, mixed>|null */
    private function lockForOrder(string $companyId, string $orderId): ?array
    {
        $stmt = $this->pdo->prepare(
            'SELECT * FROM order_deposits WHERE company_id = :company_id AND order_id = :order_id LIMIT 1 FOR UPDATE',
        );
        $stmt->execute(['company_id' => $companyId, 'order_id' => $orderId]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    /**
     * @param list<array{id?: mixed, at?: mixed, amount?: mixed, receiptRef?: mixed}> $payments
     */
    private function nextReceipt(string $orderRef, array $payments): string
    {
        $stamp = preg_replace('/^CMD-/i', '', $orderRef) ?: substr((string) round(microtime(true) * 1000), -6);
        $prefix = 'REC-' . $stamp . '-';
        $taken = [];
        foreach ($payments as $item) {
            $taken[strtoupper((string) ($item['receiptRef'] ?? ''))] = true;
        }
        for ($index = 1; $index < 100; $index++) {
            $reference = $prefix . str_pad((string) $index, 2, '0', STR_PAD_LEFT);
            if (!isset($taken[strtoupper($reference)])) {
                return $reference;
            }
        }
        return 'REC-' . substr((string) round(microtime(true) * 1000), -8);
    }

    private function nextDepositReference(string $orderRef): string
    {
        $stamp = preg_replace('/^CMD-/i', '', $orderRef) ?: substr((string) round(microtime(true) * 1000), -6);
        return 'ACO-' . $stamp;
    }

    /** @return list<array{id: string, at: string, amount: int, receiptRef: string}> */
    private function payments(mixed $raw): array
    {
        if (is_array($raw)) {
            $parsed = $raw;
        } else {
            $parsed = json_decode((string) $raw, true);
        }
        if (!is_array($parsed)) {
            return [];
        }
        $out = [];
        foreach ($parsed as $item) {
            if (!is_array($item)) {
                continue;
            }
            $out[] = [
                'id' => (string) ($item['id'] ?? Uuid::v4()),
                'at' => (string) ($item['at'] ?? ''),
                'amount' => $this->cfa($item['amount'] ?? 0),
                'receiptRef' => (string) ($item['receiptRef'] ?? ''),
            ];
        }
        return $out;
    }

    private function paymentAmount(mixed $raw, int $remaining): int
    {
        $amount = $this->cfa($raw);
        if ($amount <= 0) {
            throw HttpException::unprocessable('Indiquez un montant à encaisser.');
        }
        if ($remaining <= 0) {
            throw HttpException::unprocessable('Cette commande est déjà soldée.');
        }
        if ($amount > $remaining) {
            throw HttpException::unprocessable('Le montant dépasse le reste à payer.');
        }
        return $amount;
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
