<?php

declare(strict_types=1);

namespace NanoPrint\Install;

use NanoPrint\Support\Uuid;
use PDO;

final class SeedQuotes
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    public function seedForCompany(string $companyId): void
    {
        $count = $this->pdo->prepare('SELECT COUNT(*) FROM quotes WHERE company_id = :id');
        $count->execute(['id' => $companyId]);
        if ((int) $count->fetchColumn() > 0) {
            return;
        }

        $clients = $this->clientsByName($companyId);
        $products = $this->products($companyId);
        if (!$clients || !$products) {
            return;
        }

        $payload = static function (string $clientId, bool $discount, array $lines): string {
            return json_encode(['clientId' => $clientId, 'applyDiscount' => $discount, 'lines' => $lines], JSON_UNESCAPED_UNICODE);
        };
        $line = static function (string $id, string $productId, string $printId, string $paperId, array $extras, int $qty): array {
            return ['id' => $id, 'productId' => $productId, 'printId' => $printId, 'paperId' => $paperId, 'extraIds' => $extras, 'quantity' => $qty];
        };

        $baobab = $clients['Baobab Distribution'] ?? null;
        $studio = $clients['Studio Kër'] ?? null;
        $horizon = $clients['Horizon Santé'] ?? null;
        $aissatou = $clients['Aïssatou Ndiaye'] ?? null;
        $mamadou = $clients['Mamadou Ba'] ?? null;
        $teranga = $clients['Teranga Finance'] ?? null;
        $flyers = $products['Flyers'] ?? ($products['cat-2'] ?? null);
        $cartes = $products['Cartes de visite'] ?? ($products['cat-1'] ?? null);
        $affiches = $products['Affiches'] ?? ($products['cat-3'] ?? null);
        $catalogues = $products['Catalogues'] ?? ($products['cat-5'] ?? null);

        $quotes = [];
        if ($baobab && $flyers) {
            $quotes[] = ['cal-1', 'chiffrage', 'CHF-441', 'Flyers A5 10 000 ex. — Baobab Distribution', 'Calculé', $baobab, 10000, 412000, '', '', '', $payload($baobab, true, [$line('ql-1', $flyers, 'opt-1', 'opt-0', ['opt-0'], 10000)]), null, ''];
        }
        if ($aissatou && $cartes) {
            $quotes[] = ['cal-2', 'chiffrage', 'CHF-442', 'Cartes 350 g 500 ex. — Aïssatou Ndiaye', 'Calculé', $aissatou, 500, 68000, '', '', '', $payload($aissatou, false, [$line('ql-2', $cartes, 'opt-1', 'opt-0', ['opt-0'], 500)]), null, ''];
        }
        if ($baobab && $catalogues) {
            $quotes[] = ['cal-3', 'chiffrage', 'CHF-438', 'Catalogue 48 p. 5 000 ex. — Baobab Distribution', 'Converti', $baobab, 5000, 3260000, '', '', '', $payload($baobab, true, [$line('ql-3', $catalogues, 'opt-1', 'opt-0', ['opt-0'], 5000)]), 'cmd-1', 'CMD-260903'];
        }
        if ($horizon && $affiches) {
            $quotes[] = ['cal-4', 'chiffrage', 'CHF-430', 'Affiches A3 200 ex. — Horizon Santé', 'Brouillon', $horizon, 200, 94000, '', '', '', $payload($horizon, false, [$line('ql-4', $affiches, 'opt-0', 'opt-0', [], 200)]), null, ''];
        }
        if ($baobab && $catalogues) {
            $quotes[] = ['dev-2', 'devis', 'DEV-260171', 'Catalogues — 3 options — Baobab Distribution', 'Accepté', $baobab, 16000, 3260000, '3 000 ex. 32 p.', '5 000 ex. 48 p.', '8 000 ex. 64 p.', $payload($baobab, true, [
                $line('d2a', $catalogues, 'opt-0', 'opt-0', ['opt-0'], 3000),
                $line('d2b', $catalogues, 'opt-1', 'opt-0', ['opt-0'], 5000),
                $line('d2c', $catalogues, 'opt-2', 'opt-0', ['opt-1'], 8000),
            ]), null, ''];
        }
        if ($horizon && $flyers) {
            $quotes[] = ['dev-3', 'devis', 'DEV-260168', 'Flyers — 3 options — Horizon Santé', 'Accepté', $horizon, 30000, 1460000, '5 000 ex. offset', '10 000 ex. couché', '15 000 ex. pelliculé', $payload($horizon, false, [
                $line('d3a', $flyers, 'opt-0', 'opt-2', [], 5000),
                $line('d3b', $flyers, 'opt-1', 'opt-0', [], 10000),
                $line('d3c', $flyers, 'opt-1', 'opt-1', ['opt-1'], 15000),
            ]), null, ''];
        }
        if ($aissatou && $cartes) {
            $quotes[] = ['dev-6', 'devis', 'DEV-260180', 'Cartes de visite — 2 options — Aïssatou Ndiaye', 'Accepté', $aissatou, 700, 68000, '200 ex. 350 g', '500 ex. soft touch', '', $payload($aissatou, false, [
                $line('d6a', $cartes, 'opt-1', 'opt-0', [], 200),
                $line('d6b', $cartes, 'opt-1', 'opt-0', ['opt-0'], 500),
            ]), null, ''];
        }

        $qstmt = $this->pdo->prepare(
            'INSERT INTO quotes (
                id, company_id, kind, reference, name, status, client_id, apply_discount,
                quantity, amount, option_a, option_b, option_c, payload, order_id, order_ref
             ) VALUES (
                :id, :company_id, :kind, :reference, :name, :status, :client_id, :apply_discount,
                :quantity, :amount, :option_a, :option_b, :option_c, :payload, :order_id, :order_ref
             )',
        );
        foreach ($quotes as $item) {
            $decoded = json_decode((string) $item[11], true);
            $qstmt->execute([
                'id' => $this->id($item[0]),
                'company_id' => $companyId,
                'kind' => $item[1],
                'reference' => $item[2],
                'name' => $item[3],
                'status' => $item[4],
                'client_id' => $item[5],
                'apply_discount' => !empty($decoded['applyDiscount']) ? 1 : 0,
                'quantity' => $item[6],
                'amount' => $item[7],
                'option_a' => $item[8],
                'option_b' => $item[9],
                'option_c' => $item[10],
                'payload' => $item[11],
                'order_id' => null,
                'order_ref' => $item[13],
            ]);
        }

        $emptyPayload = static function (string $clientId): string {
            return json_encode(['clientId' => $clientId, 'applyDiscount' => false, 'lines' => []], JSON_UNESCAPED_UNICODE);
        };
        $cal3Payload = null;
        foreach ($quotes as $item) {
            if ($item[0] === 'cal-3') {
                $cal3Payload = $item[11];
            }
        }

        $orders = [];
        if ($baobab) {
            $orders[] = ['cmd-1', 'CMD-260903', 'Catalogue rentrée 48 pages', 'En production', $baobab, 'cal-3', 'CHF-438', 5500, 3478000, '2026-09-08', $cal3Payload ?: $emptyPayload($baobab)];
            $orders[] = ['cmd-5', 'CMD-260851', 'Flyers réseau Baobab', 'Expédiée', $baobab, null, '', 20000, 980000, '2026-08-28', $emptyPayload($baobab)];
        }
        if ($horizon) {
            $orders[] = ['cmd-2', 'CMD-260899', 'Dépliants campagne prévention', 'En finition', $horizon, null, '', 10000, 1460000, '2026-09-05', $emptyPayload($horizon)];
        }
        if ($studio) {
            $orders[] = ['cmd-3', 'CMD-260887', 'Coffrets invitation VIP', 'En attente', $studio, null, '', 250, 875000, '2026-09-12', $emptyPayload($studio)];
        }
        if ($teranga) {
            $orders[] = ['cmd-4', 'CMD-260886', 'Rapport annuel 2025', 'En finition', $teranga, null, '', 800, 2140000, '2026-09-04', $emptyPayload($teranga)];
        }
        if ($aissatou) {
            $orders[] = ['cmd-6', 'CMD-260910', 'Cartes de visite 200 ex.', 'Expédiée', $aissatou, null, '', 200, 68000, '2026-09-02', $emptyPayload($aissatou)];
            $orders[] = ['cmd-8', 'CMD-260820', 'Cartes de correspondance 100 ex.', 'Expédiée', $aissatou, null, '', 100, 42000, '2026-08-20', $emptyPayload($aissatou)];
            $orders[] = ['cmd-9', 'CMD-260711', 'Flyers A5 300 ex.', 'Expédiée', $aissatou, null, '', 300, 35000, '2026-07-11', $emptyPayload($aissatou)];
            $orders[] = ['cmd-10', 'CMD-260602', 'Invitations 80 ex.', 'Expédiée', $aissatou, null, '', 80, 28000, '2026-06-02', $emptyPayload($aissatou)];
            $orders[] = ['cmd-11', 'CMD-260418', 'Tampons encreurs 2 ex.', 'Expédiée', $aissatou, null, '', 2, 18000, '2026-04-18', $emptyPayload($aissatou)];
        }
        if ($mamadou) {
            $orders[] = ['cmd-7', 'CMD-260905', 'Faire-part mariage 120 ex.', 'En attente', $mamadou, null, '', 120, 142000, '2026-09-18', $emptyPayload($mamadou)];
        }

        $history = json_encode([[
            'id' => 'hist-1',
            'at' => '01 sept. 2026',
            'avenantId' => 'ave-1',
            'avenantRef' => 'AV-903-01',
            'reason' => 'Couverture rupture magasin Thiès, même BAT.',
            'previous' => ['quantity' => 5000, 'amount' => 3260000, 'dueDate' => '2026-09-08', 'name' => 'Catalogue rentrée 48 pages', 'quotePayload' => ''],
            'next' => ['quantity' => 5500, 'amount' => 3478000, 'dueDate' => '2026-09-08', 'name' => 'Catalogue rentrée 48 pages', 'quotePayload' => ''],
        ]], JSON_UNESCAPED_UNICODE);

        $ostmt = $this->pdo->prepare(
            'INSERT INTO orders (
                id, company_id, reference, name, status, client_id, quote_id, quote_ref,
                quantity, amount, due_date, payload, history_json
             ) VALUES (
                :id, :company_id, :reference, :name, :status, :client_id, :quote_id, :quote_ref,
                :quantity, :amount, :due_date, :payload, :history_json
             )',
        );
        $orderIds = [];
        foreach ($orders as $item) {
            $id = $this->id($item[0]);
            $orderIds[$item[0]] = $id;
            $quoteId = null;
            if ($item[5] && $this->idExists('quotes', $this->id((string) $item[5]))) {
                $quoteId = $this->id((string) $item[5]);
            }
            $ostmt->execute([
                'id' => $id,
                'company_id' => $companyId,
                'reference' => $item[1],
                'name' => $item[2],
                'status' => $item[3],
                'client_id' => $item[4],
                'quote_id' => $quoteId,
                'quote_ref' => $item[6],
                'quantity' => $item[7],
                'amount' => $item[8],
                'due_date' => $item[9],
                'payload' => $item[10],
                'history_json' => $item[0] === 'cmd-1' ? $history : '[]',
            ]);
        }

        if (isset($orderIds['cmd-1']) && $this->idExists('quotes', $this->id('cal-3'))) {
            $this->pdo->prepare(
                'UPDATE quotes SET order_id = :order_id, order_ref = :order_ref WHERE id = :id',
            )->execute([
                'order_id' => $orderIds['cmd-1'],
                'order_ref' => 'CMD-260903',
                'id' => $this->id('cal-3'),
            ]);
        }

        if (isset($orderIds['cmd-1'])) {
            $this->pdo->prepare(
                'INSERT INTO order_amendments (
                    id, company_id, order_id, reference, name, status, reason, delta,
                    previous_amount, new_amount, quantity
                 ) VALUES (
                    :id, :company_id, :order_id, :reference, :name, :status, :reason, :delta,
                    :previous_amount, :new_amount, :quantity
                 )',
            )->execute([
                'id' => $this->id('ave-1'),
                'company_id' => $companyId,
                'order_id' => $orderIds['cmd-1'],
                'reference' => 'AV-903-01',
                'name' => '+500 ex. catalogue rentrée',
                'status' => 'Validé',
                'reason' => 'Couverture rupture magasin Thiès, même BAT.',
                'delta' => 218000,
                'previous_amount' => 3260000,
                'new_amount' => 3478000,
                'quantity' => 5500,
            ]);
        }
    }

    /** @return array<string, string> */
    private function clientsByName(string $companyId): array
    {
        $stmt = $this->pdo->prepare('SELECT id, name FROM clients WHERE company_id = :id');
        $stmt->execute(['id' => $companyId]);
        $map = [];
        foreach ($stmt->fetchAll() as $row) {
            $map[(string) $row['name']] = (string) $row['id'];
        }
        return $map;
    }

    /** @return array<string, string> */
    private function products(string $companyId): array
    {
        $stmt = $this->pdo->prepare('SELECT id, name FROM catalogue_products WHERE company_id = :id');
        $stmt->execute(['id' => $companyId]);
        $map = [];
        foreach ($stmt->fetchAll() as $row) {
            $id = (string) $row['id'];
            $name = (string) $row['name'];
            $map[$id] = $id;
            $family = explode(' · ', $name)[0] ?? $name;
            $map[$family] = $id;
        }
        return $map;
    }

    private function id(string $preferred): string
    {
        return $this->idAvailable($preferred) ? $preferred : Uuid::v4();
    }

    private function idAvailable(string $id): bool
    {
        foreach (['quotes', 'orders', 'order_amendments'] as $table) {
            $stmt = $this->pdo->prepare("SELECT 1 FROM {$table} WHERE id = :id LIMIT 1");
            $stmt->execute(['id' => $id]);
            if ($stmt->fetchColumn()) {
                return false;
            }
        }
        return true;
    }

    private function idExists(string $table, string $id): bool
    {
        $stmt = $this->pdo->prepare("SELECT 1 FROM {$table} WHERE id = :id LIMIT 1");
        $stmt->execute(['id' => $id]);
        return (bool) $stmt->fetchColumn();
    }
}
