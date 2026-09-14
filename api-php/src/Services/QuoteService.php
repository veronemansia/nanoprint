<?php

declare(strict_types=1);

namespace NanoPrint\Services;

use NanoPrint\Auth\AuthContext;
use NanoPrint\Http\HttpException;
use NanoPrint\Support\AuditLogger;
use NanoPrint\Support\QuotePricing;
use NanoPrint\Support\RecordMapper;
use NanoPrint\Support\Uuid;
use NanoPrint\Support\Validator;
use PDO;

final class QuoteService
{
    public const KIND_CHIFRAGE = 'chiffrage';
    public const KIND_DEVIS = 'devis';

    private const KINDS = [self::KIND_CHIFRAGE, self::KIND_DEVIS];
    private const STATUSES = [
        self::KIND_CHIFRAGE => ['Calculé', 'Brouillon', 'Converti'],
        self::KIND_DEVIS => ['Brouillon', 'Envoyé', 'Accepté', 'Refusé'],
    ];

    public function __construct(
        private readonly PDO $pdo,
        private readonly AuditLogger $audit,
        private readonly CatalogueService $catalogue,
        private readonly OrderService $orders,
        private readonly StockService $stock,
        private readonly QuotePricing $pricing = new QuotePricing(),
    ) {
    }

    /** @return list<array<string, mixed>> */
    public function list(AuthContext $auth, string $kind): array
    {
        $kind = $this->kind($kind);
        $stmt = $this->pdo->prepare(
            'SELECT q.*, c.name AS client_name
             FROM quotes q
             INNER JOIN clients c ON c.id = q.client_id
             WHERE q.company_id = :company_id AND q.kind = :kind
             ORDER BY q.updated_at DESC',
        );
        $stmt->execute(['company_id' => $auth->companyId, 'kind' => $kind]);
        return array_map(RecordMapper::quote(...), $stmt->fetchAll());
    }

    public function create(AuthContext $auth, array $values, string $ip): array
    {
        $kind = $this->kind((string) ($values['kind'] ?? self::KIND_CHIFRAGE));
        $parsed = $this->validated($auth, $values, $kind);
        $id = trim((string) ($values['id'] ?? '')) ?: Uuid::v4();
        $reference = trim((string) ($values['reference'] ?? '')) ?: $this->nextReference($auth->companyId, $kind);
        $this->insertRow($auth->companyId, $id, $reference, $kind, $parsed);
        $feature = $kind === self::KIND_DEVIS ? 'devis-multi' : 'calculateur';
        $this->audit->record($auth, 'quote.create', 'devis-commandes', $feature, 'quote', $id, $reference . ' · ' . $parsed['name'], $ip);
        return $this->one($auth, $id);
    }

    public function update(AuthContext $auth, string $id, array $values, string $ip): array
    {
        $row = $this->mustExist($auth, $id);
        $kind = (string) $row['kind'];
        $parsed = $this->validated($auth, $values, $kind, $row);
        $this->pdo->prepare(
            'UPDATE quotes SET
                name = :name, status = :status, client_id = :client_id, apply_discount = :apply_discount,
                quantity = :quantity, amount = :amount, option_a = :option_a, option_b = :option_b,
                option_c = :option_c, payload = :payload
             WHERE id = :id AND company_id = :company_id',
        )->execute([
            ...$parsed,
            'id' => $id,
            'company_id' => $auth->companyId,
        ]);
        $feature = $kind === self::KIND_DEVIS ? 'devis-multi' : 'calculateur';
        $this->audit->record($auth, 'quote.update', 'devis-commandes', $feature, 'quote', $id, $parsed['name'], $ip);
        return $this->one($auth, $id);
    }

    public function delete(AuthContext $auth, string $id, string $ip): void
    {
        $row = $this->mustExist($auth, $id);
        $this->pdo->prepare('DELETE FROM quotes WHERE id = :id AND company_id = :company_id')
            ->execute(['id' => $id, 'company_id' => $auth->companyId]);
        $feature = $row['kind'] === self::KIND_DEVIS ? 'devis-multi' : 'calculateur';
        $this->audit->record(
            $auth,
            'quote.delete',
            'devis-commandes',
            $feature,
            'quote',
            $id,
            (string) $row['reference'] . ' · ' . (string) $row['name'],
            $ip,
        );
    }

    /**
     * @return array{
     *   quote: array<string, mixed>,
     *   order: array<string, mixed>,
     *   materials: list<array<string, mixed>>,
     *   movements: list<array<string, mixed>>,
     *   consumed: int
     * }
     */
    public function convert(AuthContext $auth, string $id, string $ip): array
    {
        $this->pdo->beginTransaction();
        try {
            $row = $this->lockQuote($auth, $id);
            if ($row['kind'] !== self::KIND_CHIFRAGE) {
                throw HttpException::unprocessable('Seuls les chiffrages du calculateur peuvent être convertis.');
            }
            if ($row['status'] === 'Converti' || $this->orders->findByQuote($auth, $id)) {
                throw HttpException::unprocessable('Ce devis a déjà été converti en commande.');
            }
            if ($row['status'] !== 'Calculé') {
                throw HttpException::unprocessable('Seuls les chiffrages au statut Calculé peuvent être convertis.');
            }
            $priced = $this->price($auth, $row['payload'], (string) $row['client_id'], true);
            $order = $this->orders->insertFromQuote($auth, $row, $priced, $ip);
            $this->pdo->prepare(
                'UPDATE quotes SET status = :status, order_id = :order_id, order_ref = :order_ref
                 WHERE id = :id AND company_id = :company_id',
            )->execute([
                'status' => 'Converti',
                'order_id' => $order['id'],
                'order_ref' => $order['reference'],
                'id' => $id,
                'company_id' => $auth->companyId,
            ]);
            $consumed = $this->stock->consumeForOrder(
                $auth,
                $priced['payload'],
                (string) $order['id'],
                (string) $order['reference'],
                $ip,
            );
            $this->audit->record(
                $auth,
                'quote.convert',
                'devis-commandes',
                'conversion',
                'quote',
                $id,
                (string) $row['reference'] . ' → ' . (string) $order['reference'],
                $ip,
            );
            $this->pdo->commit();
            return [
                'quote' => $this->one($auth, $id),
                'order' => $order,
                'materials' => $consumed['materials'],
                'movements' => $consumed['movements'],
                'consumed' => $consumed['consumed'],
            ];
        } catch (\Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $e;
        }
    }

    public function nextReference(string $companyId, string $kind): string
    {
        $prefix = $kind === self::KIND_DEVIS ? 'DEV-' : 'CHF-';
        $stmt = $this->pdo->prepare(
            'SELECT reference FROM quotes WHERE company_id = :id AND reference LIKE :prefix',
        );
        $stmt->execute(['id' => $companyId, 'prefix' => $prefix . '%']);
        $max = 0;
        foreach ($stmt->fetchAll() as $row) {
            if (preg_match('/^(?:CHF|DEV)-(\d+)$/', (string) $row['reference'], $m)) {
                $max = max($max, (int) $m[1]);
            }
        }
        return $prefix . str_pad((string) ($max + 1), 3, '0', STR_PAD_LEFT);
    }

    /** @param array<string, mixed> $parsed */
    private function insertRow(string $companyId, string $id, string $reference, string $kind, array $parsed): void
    {
        $this->pdo->prepare(
            'INSERT INTO quotes (
                id, company_id, kind, reference, name, status, client_id, apply_discount,
                quantity, amount, option_a, option_b, option_c, payload
             ) VALUES (
                :id, :company_id, :kind, :reference, :name, :status, :client_id, :apply_discount,
                :quantity, :amount, :option_a, :option_b, :option_c, :payload
             )',
        )->execute([
            'id' => $id,
            'company_id' => $companyId,
            'kind' => $kind,
            'reference' => $reference,
            ...$parsed,
        ]);
    }

    /**
     * @param array<string, mixed> $values
     * @param array<string, mixed> $existing
     * @return array<string, mixed>
     */
    private function validated(AuthContext $auth, array $values, string $kind, array $existing = []): array
    {
        $name = Validator::required((string) ($values['name'] ?? ''), 'L’intitulé est obligatoire.');
        $clientId = trim((string) ($values['clientId'] ?? ($existing['client_id'] ?? '')));
        if ($clientId === '') {
            throw HttpException::unprocessable('Sélectionnez ou créez un client pour continuer.');
        }
        $this->mustClient($auth, $clientId);
        $rawPayload = $values['quotePayload'] ?? $values['payload'] ?? ($existing['payload'] ?? '');
        $priced = $this->price($auth, $rawPayload, $clientId, true);
        $defaultStatus = $kind === self::KIND_DEVIS ? 'Brouillon' : 'Calculé';
        $status = $this->status($kind, (string) ($values['status'] ?? ($existing['status'] ?? $defaultStatus)));
        if (($existing['status'] ?? '') === 'Converti') {
            $status = 'Converti';
        }
        return [
            'name' => $name,
            'status' => $status,
            'client_id' => $clientId,
            'apply_discount' => $priced['applyDiscount'] ? 1 : 0,
            'quantity' => $priced['quantity'],
            'amount' => $priced['amount'],
            'option_a' => trim((string) ($values['optionA'] ?? ($existing['option_a'] ?? ''))),
            'option_b' => trim((string) ($values['optionB'] ?? ($existing['option_b'] ?? ''))),
            'option_c' => trim((string) ($values['optionC'] ?? ($existing['option_c'] ?? ''))),
            'payload' => $priced['json'],
        ];
    }

    /** @return array{ready: bool, error: string, quantity: float, amount: float, applyDiscount: bool, clientId: string, payload: array, json: string} */
    private function price(AuthContext $auth, mixed $raw, string $clientId, bool $strict): array
    {
        if (!is_array($raw) && !is_string($raw)) {
            $raw = '';
        }
        $client = $this->mustClient($auth, $clientId);
        $catalogue = $this->catalogue->list($auth);
        $priced = $this->pricing->evaluate($raw, $catalogue, (float) ($client['discount'] ?? 0), $strict);
        if (!$priced['ready']) {
            throw HttpException::unprocessable($priced['error'] ?: 'Le chiffrage est incomplet : vérifiez le produit, les options et la quantité.');
        }
        return $priced;
    }

    private function status(string $kind, string $status): string
    {
        $status = trim($status);
        if (!in_array($status, self::STATUSES[$kind], true)) {
            throw HttpException::unprocessable('Statut de devis invalide.');
        }
        return $status;
    }

    private function kind(string $kind): string
    {
        $kind = trim($kind);
        if (!in_array($kind, self::KINDS, true)) {
            throw HttpException::unprocessable('Type de devis invalide.');
        }
        return $kind;
    }

    /** @return array<string, mixed> */
    private function mustClient(AuthContext $auth, string $id): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT * FROM clients WHERE id = :id AND company_id = :company_id LIMIT 1',
        );
        $stmt->execute(['id' => $id, 'company_id' => $auth->companyId]);
        $row = $stmt->fetch();
        if (!$row) {
            throw HttpException::unprocessable('Client introuvable sur ce devis.');
        }
        return $row;
    }

    /** @return array<string, mixed> */
    private function one(AuthContext $auth, string $id): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT q.*, c.name AS client_name
             FROM quotes q
             INNER JOIN clients c ON c.id = q.client_id
             WHERE q.id = :id AND q.company_id = :company_id LIMIT 1',
        );
        $stmt->execute(['id' => $id, 'company_id' => $auth->companyId]);
        $row = $stmt->fetch();
        if (!$row) {
            throw HttpException::notFound('Devis introuvable.');
        }
        return RecordMapper::quote($row);
    }

    /** @return array<string, mixed> */
    private function mustExist(AuthContext $auth, string $id): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT * FROM quotes WHERE id = :id AND company_id = :company_id LIMIT 1',
        );
        $stmt->execute(['id' => $id, 'company_id' => $auth->companyId]);
        $row = $stmt->fetch();
        if (!$row) {
            throw HttpException::notFound('Devis introuvable.');
        }
        return $row;
    }

    /** @return array<string, mixed> */
    private function lockQuote(AuthContext $auth, string $id): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT * FROM quotes WHERE id = :id AND company_id = :company_id LIMIT 1 FOR UPDATE',
        );
        $stmt->execute(['id' => $id, 'company_id' => $auth->companyId]);
        $row = $stmt->fetch();
        if (!$row) {
            throw HttpException::notFound('Devis introuvable.');
        }
        return $row;
    }
}
