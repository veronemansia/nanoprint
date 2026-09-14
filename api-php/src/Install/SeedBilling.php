<?php

declare(strict_types=1);

namespace NanoPrint\Install;

use NanoPrint\Support\Uuid;
use PDO;

final class SeedBilling
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    public function seedForCompany(string $companyId): void
    {
        $count = $this->pdo->prepare('SELECT COUNT(*) FROM invoices WHERE company_id = :id');
        $count->execute(['id' => $companyId]);
        if ((int) $count->fetchColumn() > 0) {
            return;
        }
        $depositCount = $this->pdo->prepare('SELECT COUNT(*) FROM order_deposits WHERE company_id = :id');
        $depositCount->execute(['id' => $companyId]);
        if ((int) $depositCount->fetchColumn() > 0) {
            return;
        }

        $orders = $this->ordersByRef($companyId);
        if (!$orders) {
            return;
        }

        $invoices = [
            ['fac-1', 'FAC-260901', 'Baobab Distribution — Catalogue rentrée 48 pages', 'Soldée', 'solde', 3478000, 0, '2026-09-01', 'CMD-260903'],
            ['fac-4', 'FAC-260872', 'Horizon Santé — Dépliants campagne prévention', 'Soldée', 'solde', 1460000, 0, '2026-09-01', 'CMD-260899'],
            ['fac-6', 'FAC-260887', 'Studio Kër — Coffrets invitation VIP', 'Acompte', 'acompte', 350000, 525000, '2026-09-03', 'CMD-260887'],
            ['fac-7', 'FAC-260910', 'Aïssatou Ndiaye — Cartes de visite 200 ex.', 'Soldée', 'solde', 68000, 0, '2026-09-02', 'CMD-260910'],
        ];
        $istmt = $this->pdo->prepare(
            'INSERT INTO invoices (
                id, company_id, order_id, reference, name, status, settlement, amount, remaining, issued_at
             ) VALUES (
                :id, :company_id, :order_id, :reference, :name, :status, :settlement, :amount, :remaining, :issued_at
             )',
        );
        foreach ($invoices as $item) {
            $order = $orders[$item[8]] ?? null;
            if (!$order) {
                continue;
            }
            $istmt->execute([
                'id' => $this->id($item[0]),
                'company_id' => $companyId,
                'order_id' => $order['id'],
                'reference' => $item[1],
                'name' => $item[2],
                'status' => $item[3],
                'settlement' => $item[4],
                'amount' => $item[5],
                'remaining' => $item[6],
                'issued_at' => $item[7],
            ]);
        }

        $deposits = [
            ['aco-1', 'ACO-903', 'CMD-260903', 'Partiel', 3478000, 1304000, 2174000, [['id' => 'pay-1', 'at' => '01 sept. 2026', 'amount' => 1304000, 'receiptRef' => 'REC-260903-01']]],
            ['aco-2', 'ACO-887', 'CMD-260887', 'Ouvert', 875000, 0, 875000, []],
            ['aco-3', 'ACO-899', 'CMD-260899', 'Soldé', 1460000, 1460000, 0, [['id' => 'pay-2', 'at' => '01 sept. 2026', 'amount' => 1460000, 'receiptRef' => 'REC-260899-01']]],
            ['aco-5', 'ACO-910', 'CMD-260910', 'Soldé', 68000, 68000, 0, [['id' => 'pay-3', 'at' => '02 sept. 2026', 'amount' => 68000, 'receiptRef' => 'REC-260910-01']]],
        ];
        $dstmt = $this->pdo->prepare(
            'INSERT INTO order_deposits (
                id, company_id, order_id, reference, name, status, asked, received, remaining, payments
             ) VALUES (
                :id, :company_id, :order_id, :reference, :name, :status, :asked, :received, :remaining, :payments
             )',
        );
        foreach ($deposits as $item) {
            $order = $orders[$item[2]] ?? null;
            if (!$order) {
                continue;
            }
            $dstmt->execute([
                'id' => $this->id($item[0]),
                'company_id' => $companyId,
                'order_id' => $order['id'],
                'reference' => $item[1],
                'name' => $order['client_name'],
                'status' => $item[3],
                'asked' => $item[4],
                'received' => $item[5],
                'remaining' => $item[6],
                'payments' => json_encode($item[7], JSON_UNESCAPED_UNICODE),
            ]);
        }
    }

    /** @return array<string, array{id: string, client_name: string}> */
    private function ordersByRef(string $companyId): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT o.id, o.reference, c.name AS client_name
             FROM orders o
             INNER JOIN clients c ON c.id = o.client_id
             WHERE o.company_id = :id',
        );
        $stmt->execute(['id' => $companyId]);
        $map = [];
        foreach ($stmt->fetchAll() as $row) {
            $map[(string) $row['reference']] = [
                'id' => (string) $row['id'],
                'client_name' => (string) $row['client_name'],
            ];
        }
        return $map;
    }

    private function id(string $preferred): string
    {
        return $this->idAvailable($preferred) ? $preferred : Uuid::v4();
    }

    private function idAvailable(string $id): bool
    {
        foreach (['invoices', 'order_deposits'] as $table) {
            $stmt = $this->pdo->prepare("SELECT 1 FROM {$table} WHERE id = :id LIMIT 1");
            $stmt->execute(['id' => $id]);
            if ($stmt->fetchColumn()) {
                return false;
            }
        }
        return true;
    }
}
