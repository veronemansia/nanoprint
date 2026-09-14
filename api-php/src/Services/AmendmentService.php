<?php

declare(strict_types=1);

namespace NanoPrint\Services;

use NanoPrint\Auth\AuthContext;
use NanoPrint\Http\HttpException;
use NanoPrint\Support\AuditLogger;
use NanoPrint\Support\Dates;
use NanoPrint\Support\QuotePricing;
use NanoPrint\Support\RecordMapper;
use NanoPrint\Support\Uuid;
use NanoPrint\Support\Validator;
use PDO;

final class AmendmentService
{
    public function __construct(
        private readonly PDO $pdo,
        private readonly AuditLogger $audit,
        private readonly CatalogueService $catalogue,
        private readonly OrderService $orders,
        private readonly QuotePricing $pricing = new QuotePricing(),
    ) {
    }

    /** @return list<array<string, mixed>> */
    public function list(AuthContext $auth): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT a.*, o.reference AS order_ref
             FROM order_amendments a
             INNER JOIN orders o ON o.id = a.order_id
             WHERE a.company_id = :company_id
             ORDER BY a.updated_at DESC',
        );
        $stmt->execute(['company_id' => $auth->companyId]);
        return array_map(RecordMapper::amendment(...), $stmt->fetchAll());
    }

    /** @return array{order: array<string, mixed>, avenant: array<string, mixed>} */
    public function apply(AuthContext $auth, string $orderId, array $input, string $ip): array
    {
        $reason = Validator::required(mb_substr(trim((string) ($input['reason'] ?? '')), 0, 400), 'Le motif est obligatoire.');
        $this->pdo->beginTransaction();
        try {
            $order = $this->orders->mustExist($auth, $orderId);
            if ((string) $order['status'] === 'Expédiée') {
                throw HttpException::unprocessable('Cette commande est déjà expédiée. Un avenant n’est possible que tant qu’elle n’est pas terminée.');
            }
            $dueDate = $this->dueDate((string) ($input['dueDate'] ?? ''), (string) $order['due_date']);
            $rawPayload = $input['payload'] ?? $input['quotePayload'] ?? $order['payload'];
            $client = $this->client($auth, (string) $order['client_id']);
            $catalogue = $this->catalogue->list($auth);
            $parsed = $this->pricing->parsePayload($rawPayload);
            $parsed['clientId'] = (string) $order['client_id'];
            $priced = $this->pricing->evaluate($parsed, $catalogue, (float) ($client['discount'] ?? 0), true);
            if (!$priced['ready']) {
                throw HttpException::unprocessable($priced['error'] ?: 'Complétez le produit, les options et la quantité.');
            }
            $previousPayload = (string) $order['payload'];
            $unchanged = $dueDate === (string) $order['due_date']
                && $this->pricing->canonical($previousPayload) === $this->pricing->canonical($priced['json']);
            if ($unchanged) {
                throw HttpException::unprocessable('Aucun changement à enregistrer.');
            }
            $id = Uuid::v4();
            $reference = $this->orders->nextAvenantReference($auth->companyId, (string) $order['reference']);
            $previous = [
                'quantity' => (float) $order['quantity'],
                'amount' => (float) $order['amount'],
                'dueDate' => (string) $order['due_date'],
                'name' => (string) $order['name'],
                'quotePayload' => $previousPayload,
            ];
            $next = [
                'quantity' => $priced['quantity'],
                'amount' => $priced['amount'],
                'dueDate' => $dueDate,
                'name' => (string) $order['name'],
                'quotePayload' => $priced['json'],
            ];
            $delta = $priced['amount'] - (float) $order['amount'];
            $this->pdo->prepare(
                'INSERT INTO order_amendments (
                    id, company_id, order_id, reference, name, status, reason, delta,
                    previous_amount, new_amount, quantity, previous_snapshot, next_snapshot
                 ) VALUES (
                    :id, :company_id, :order_id, :reference, :name, :status, :reason, :delta,
                    :previous_amount, :new_amount, :quantity, :previous_snapshot, :next_snapshot
                 )',
            )->execute([
                'id' => $id,
                'company_id' => $auth->companyId,
                'order_id' => $orderId,
                'reference' => $reference,
                'name' => mb_substr($reason, 0, 80),
                'status' => 'Validé',
                'reason' => $reason,
                'delta' => $delta,
                'previous_amount' => $order['amount'],
                'new_amount' => $priced['amount'],
                'quantity' => $priced['quantity'],
                'previous_snapshot' => json_encode($previous, JSON_UNESCAPED_UNICODE),
                'next_snapshot' => json_encode($next, JSON_UNESCAPED_UNICODE),
            ]);
            $history = $this->history((string) ($order['history_json'] ?? '[]'));
            $history[] = [
                'id' => Uuid::v4(),
                'at' => Dates::display(date('Y-m-d H:i:s')),
                'avenantId' => $id,
                'avenantRef' => $reference,
                'reason' => $reason,
                'previous' => $previous,
                'next' => $next,
            ];
            $this->pdo->prepare(
                'UPDATE orders SET quantity = :quantity, amount = :amount, due_date = :due_date,
                    payload = :payload, history_json = :history_json
                 WHERE id = :id AND company_id = :company_id',
            )->execute([
                'quantity' => $priced['quantity'],
                'amount' => $priced['amount'],
                'due_date' => $dueDate,
                'payload' => $priced['json'],
                'history_json' => json_encode($history, JSON_UNESCAPED_UNICODE),
                'id' => $orderId,
                'company_id' => $auth->companyId,
            ]);
            $this->audit->record(
                $auth,
                'order.amend',
                'devis-commandes',
                'avenants',
                'amendment',
                $id,
                $reference . ' · ' . (string) $order['reference'],
                $ip,
            );
            $this->pdo->commit();
            return [
                'order' => $this->orders->one($auth, $orderId),
                'avenant' => $this->one($auth, $id),
            ];
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }

    /** @return array<string, mixed> */
    private function one(AuthContext $auth, string $id): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT a.*, o.reference AS order_ref
             FROM order_amendments a
             INNER JOIN orders o ON o.id = a.order_id
             WHERE a.id = :id AND a.company_id = :company_id LIMIT 1',
        );
        $stmt->execute(['id' => $id, 'company_id' => $auth->companyId]);
        $row = $stmt->fetch();
        if (!$row) {
            throw HttpException::notFound('Avenant introuvable.');
        }
        return RecordMapper::amendment($row);
    }

    /** @return array<string, mixed> */
    private function client(AuthContext $auth, string $id): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT * FROM clients WHERE id = :id AND company_id = :company_id LIMIT 1',
        );
        $stmt->execute(['id' => $id, 'company_id' => $auth->companyId]);
        $row = $stmt->fetch();
        if (!$row) {
            throw HttpException::unprocessable('Client introuvable sur cette commande.');
        }
        return $row;
    }

    private function dueDate(string $value, string $fallback): string
    {
        $value = trim($value);
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $value)) {
            return $value;
        }
        return $fallback;
    }

    /** @return list<array<string, mixed>> */
    private function history(string $raw): array
    {
        $decoded = json_decode($raw, true);
        return is_array($decoded) ? $decoded : [];
    }
}
