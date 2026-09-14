<?php

declare(strict_types=1);

namespace NanoPrint\Services;

use NanoPrint\Auth\AuthContext;
use NanoPrint\Http\HttpException;
use NanoPrint\Support\Dates;
use NanoPrint\Support\Modules;
use PDO;

final class ReportService
{
    private const EXPORT_KINDS = [
        'activity', 'receivables', 'pipeline', 'sales-clients', 'sales-products',
        'stock', 'purchases', 'audit', 'production',
    ];

    public function __construct(private readonly PDO $pdo)
    {
    }

    /**
     * @return array<string, mixed>
     */
    public function bundle(AuthContext $auth, string $from = '', string $to = ''): array
    {
        [$from, $to] = $this->period($from, $to);
        $cid = $auth->companyId;
        $kpis = $this->kpis($cid, $from, $to);
        return [
            'period' => ['from' => $from, 'to' => $to],
            'kpis' => $kpis,
            'series' => $this->monthlySeries($cid),
            'activity' => $this->recentActivity($cid),
            'pipeline' => $this->pipeline($cid),
            'overdue' => $this->dueOrders($cid, true, 12),
            'dueSoon' => $this->dueOrders($cid, false, 12),
            'receivables' => $this->receivables($cid),
            'sales' => $this->sales($cid, $from, $to),
            'stock' => $this->stock($cid, $from, $to),
            'purchases' => $this->purchases($cid, $from, $to),
            'production' => $this->production($cid, $from, $to, $kpis['occupation']),
        ];
    }

    /**
     * @return array{filename: string, csv: string}
     */
    public function exportCsv(AuthContext $auth, string $kind, string $from = '', string $to = ''): array
    {
        $kind = trim($kind);
        if (!in_array($kind, self::EXPORT_KINDS, true)) {
            throw HttpException::unprocessable('Type d’export inconnu.');
        }
        $needsReporting = !in_array($kind, ['activity', 'audit'], true);
        if ($needsReporting && !$auth->can('reporting', 'read')) {
            throw HttpException::forbidden();
        }
        if ($kind === 'audit' && !$auth->can('utilisateurs', 'read') && !$auth->can('reporting', 'read')) {
            throw HttpException::forbidden();
        }
        [$from, $to] = $this->period($from, $to);
        if ($kind === 'audit') {
            return $this->auditCsv($auth, $from, $to);
        }
        $bundle = $this->bundle($auth, $from, $to);
        $stamp = $from . '_' . $to;
        return match ($kind) {
            'activity' => $this->csvFile(
                'activite-' . $stamp . '.csv',
                ['Type', 'Référence', 'Client', 'Statut', 'Échéance', 'Montant'],
                array_merge(
                    array_map(static fn(array $row) => ['Retard', $row['reference'], $row['client'], $row['status'], $row['dueDate'], $row['amount']], $bundle['overdue']),
                    array_map(static fn(array $row) => ['Cette semaine', $row['reference'], $row['client'], $row['status'], $row['dueDate'], $row['amount']], $bundle['dueSoon']),
                ),
            ),
            'receivables' => $this->csvFile(
                'encours-clients-' . $stamp . '.csv',
                ['Client', 'Commande', 'Statut', 'Échéance', 'Total', 'Encaissé', 'Reste', 'Ancienneté'],
                array_map(static fn(array $row) => [
                    $row['client'], $row['reference'], $row['status'], $row['dueDate'],
                    $row['total'], $row['paid'], $row['remaining'], $row['aging'],
                ], $bundle['receivables']['rows']),
            ),
            'pipeline' => $this->csvFile(
                'carnet-commandes-' . $stamp . '.csv',
                ['Statut', 'Commandes', 'Montant', 'Quantité'],
                array_map(static fn(array $row) => [$row['status'], $row['count'], $row['amount'], $row['quantity']], $bundle['pipeline']['byStatus']),
            ),
            'sales-clients' => $this->csvFile(
                'ca-clients-' . $stamp . '.csv',
                ['Client', 'Commandes', 'CA', 'Coût matières estimé', 'Marge estimée'],
                array_map(static fn(array $row) => [$row['name'], $row['orders'], $row['amount'], $row['materialCost'], $row['margin']], $bundle['sales']['clients']),
            ),
            'sales-products' => $this->csvFile(
                'ca-produits-' . $stamp . '.csv',
                ['Produit', 'Famille', 'Commandes', 'Quantité', 'CA réparti', 'Coût matières estimé', 'Marge estimée'],
                array_map(static fn(array $row) => [$row['name'], $row['family'], $row['orders'], $row['quantity'], $row['amount'], $row['materialCost'], $row['margin']], $bundle['sales']['products']),
            ),
            'stock' => $this->csvFile(
                'stocks-' . $stamp . '.csv',
                ['Matière', 'Référence', 'Statut', 'Stock', 'Seuil', 'Valeur', 'Sorties période'],
                array_map(static fn(array $row) => [$row['name'], $row['reference'], $row['status'], $row['quantity'], $row['alertQty'], $row['value'], $row['consumed']], $bundle['stock']['materials']),
            ),
            'purchases' => $this->csvFile(
                'achats-' . $stamp . '.csv',
                ['Fournisseur', 'Bons', 'Montant', 'Dernier BL'],
                array_map(static fn(array $row) => [$row['name'], $row['count'], $row['amount'], $row['lastDate']], $bundle['purchases']['suppliers']),
            ),
            'production' => $this->csvFile(
                'production-' . $stamp . '.csv',
                ['Statut', 'Commandes', 'Volume', 'Montant'],
                array_map(static fn(array $row) => [$row['status'], $row['count'], $row['quantity'], $row['amount']], $bundle['production']['byStatus']),
            ),
            default => $this->auditCsv($auth, $from, $to),
        };
    }

    /** @return array<string, mixed> */
    private function kpis(string $companyId, string $from, string $to): array
    {
        $monthFrom = (new \DateTimeImmutable('first day of this month'))->format('Y-m-d');
        $today = (new \DateTimeImmutable('today'))->format('Y-m-d');
        $prevFrom = (new \DateTimeImmutable('first day of last month'))->format('Y-m-d');
        $prevTo = (new \DateTimeImmutable('last day of last month'))->format('Y-m-d');

        $billedMonth = $this->sumInvoices($companyId, $monthFrom, $today);
        $billedPrev = $this->sumInvoices($companyId, $prevFrom, $prevTo);
        $orderedMonth = $this->sumOrders($companyId, $monthFrom, $today);
        $billedPeriod = $this->sumInvoices($companyId, $from, $to);
        $orderedPeriod = $this->sumOrders($companyId, $from, $to);

        $active = $this->scalar(
            'SELECT COUNT(*) AS c, COALESCE(SUM(amount), 0) AS a, COALESCE(SUM(quantity), 0) AS q
             FROM orders WHERE company_id = :id AND status <> :done',
            ['id' => $companyId, 'done' => 'Expédiée'],
        );
        $byStatus = $this->pipeline($companyId)['byStatus'];
        $inProd = 0;
        $inFin = 0;
        foreach ($byStatus as $row) {
            if ($row['status'] === 'En production') {
                $inProd = (int) $row['count'];
            }
            if ($row['status'] === 'En finition') {
                $inFin = (int) $row['count'];
            }
        }
        $overdue = $this->scalarInt(
            'SELECT COUNT(*) FROM orders WHERE company_id = :id AND status <> :done AND due_date < :today',
            ['id' => $companyId, 'done' => 'Expédiée', 'today' => $today],
        );
        $dueWeek = $this->scalarInt(
            'SELECT COUNT(*) FROM orders WHERE company_id = :id AND status <> :done AND due_date BETWEEN :today AND :week',
            ['id' => $companyId, 'done' => 'Expédiée', 'today' => $today, 'week' => (new \DateTimeImmutable('+6 days'))->format('Y-m-d')],
        );
        $stockAlerts = $this->scalarInt(
            'SELECT COUNT(*) FROM materials WHERE company_id = :id AND quantity <= alert_qty',
            ['id' => $companyId],
        );
        $openReceivables = $this->scalarInt(
            'SELECT COUNT(*) FROM order_deposits WHERE company_id = :id AND remaining > 0',
            ['id' => $companyId],
        );
        $occupation = $this->occupation($companyId);
        $attention = $overdue + $stockAlerts + $openReceivables;
        $revenue = $billedMonth > 0 ? $billedMonth : $orderedMonth;

        return [
            'revenueMonth' => $revenue,
            'billedMonth' => $billedMonth,
            'orderedMonth' => $orderedMonth,
            'billedPeriod' => $billedPeriod,
            'orderedPeriod' => $orderedPeriod,
            'revenueTrend' => $this->trend($revenue, $billedPrev > 0 ? $billedPrev : $this->sumOrders($companyId, $prevFrom, $prevTo)),
            'activeOrders' => (int) ($active['c'] ?? 0),
            'activeAmount' => round((float) ($active['a'] ?? 0)),
            'inProduction' => $inProd,
            'inFinishing' => $inFin,
            'overdue' => $overdue,
            'dueWeek' => $dueWeek,
            'stockAlerts' => $stockAlerts,
            'openReceivables' => $openReceivables,
            'attention' => $attention,
            'occupation' => $occupation,
            'otd' => $this->otd($companyId, $from, $to),
        ];
    }

    /** @return list<array{month:string,revenue:float,margin:float,ordered:float}> */
    private function monthlySeries(string $companyId): array
    {
        $start = (new \DateTimeImmutable('first day of this month'))->modify('-11 months')->format('Y-m-01');
        $invoices = $this->pdo->prepare(
            "SELECT DATE_FORMAT(issued_at, '%Y-%m') AS ym, COALESCE(SUM(amount), 0) AS total
             FROM invoices WHERE company_id = :id AND issued_at >= :start
             GROUP BY ym",
        );
        $invoices->execute(['id' => $companyId, 'start' => $start]);
        $billed = [];
        foreach ($invoices->fetchAll() as $row) {
            $billed[(string) $row['ym']] = (float) $row['total'];
        }
        $orders = $this->pdo->prepare(
            "SELECT DATE_FORMAT(created_at, '%Y-%m') AS ym, COALESCE(SUM(amount), 0) AS total
             FROM orders WHERE company_id = :id AND created_at >= :start
             GROUP BY ym",
        );
        $orders->execute(['id' => $companyId, 'start' => $start]);
        $ordered = [];
        foreach ($orders->fetchAll() as $row) {
            $ordered[(string) $row['ym']] = (float) $row['total'];
        }
        $out = [];
        $cursor = new \DateTimeImmutable($start);
        $end = new \DateTimeImmutable('first day of this month');
        $months = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
        while ($cursor <= $end) {
            $ym = $cursor->format('Y-m');
            $rev = $billed[$ym] ?? 0.0;
            $ord = $ordered[$ym] ?? 0.0;
            $out[] = [
                'month' => $months[(int) $cursor->format('n') - 1],
                'key' => $ym,
                'revenue' => round($rev > 0 ? $rev : $ord),
                'ordered' => round($ord),
                'margin' => 0,
            ];
            $cursor = $cursor->modify('+1 month');
        }
        return $out;
    }

    /** @return list<array{id:string,title:string,detail:string,tone:string,at:string}> */
    private function recentActivity(string $companyId): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT a.action, a.detail, a.module_id, a.created_at, u.name AS author_name
             FROM audit_logs a
             LEFT JOIN users u ON u.id = a.user_id
             WHERE a.company_id = :id
             ORDER BY a.created_at DESC
             LIMIT 12',
        );
        $stmt->execute(['id' => $companyId]);
        $out = [];
        foreach ($stmt->fetchAll() as $row) {
            $action = (string) $row['action'];
            $tone = str_contains($action, 'delete') ? 'magenta' : (str_contains($action, 'create') || str_contains($action, 'convert') ? 'cyan' : 'green');
            $out[] = [
                'id' => 'act-' . (count($out) + 1),
                'title' => (string) ($row['author_name'] ?: 'Système'),
                'detail' => trim((string) ($row['detail'] ?: $action)),
                'tone' => $tone,
                'at' => Dates::stamp($row['created_at'] ?? null),
                'module' => Modules::LABELS[(string) ($row['module_id'] ?? '')] ?? '',
            ];
        }
        return $out;
    }

    /** @return array{byStatus: list<array{status:string,count:int,amount:float,quantity:float}>, total: int, amount: float} */
    private function pipeline(string $companyId): array
    {
        $statuses = ['En attente', 'En production', 'En finition', 'Expédiée'];
        $stmt = $this->pdo->prepare(
            'SELECT status, COUNT(*) AS c, COALESCE(SUM(amount), 0) AS a, COALESCE(SUM(quantity), 0) AS q
             FROM orders WHERE company_id = :id GROUP BY status',
        );
        $stmt->execute(['id' => $companyId]);
        $map = [];
        foreach ($stmt->fetchAll() as $row) {
            $map[(string) $row['status']] = $row;
        }
        $byStatus = [];
        $total = 0;
        $amount = 0.0;
        foreach ($statuses as $status) {
            $row = $map[$status] ?? ['c' => 0, 'a' => 0, 'q' => 0];
            $count = (int) $row['c'];
            $sum = round((float) $row['a']);
            $byStatus[] = [
                'status' => $status,
                'count' => $count,
                'amount' => $sum,
                'quantity' => round((float) $row['q']),
            ];
            $total += $count;
            $amount += $sum;
        }
        return ['byStatus' => $byStatus, 'total' => $total, 'amount' => $amount];
    }

    /** @return list<array<string, mixed>> */
    private function dueOrders(string $companyId, bool $overdue, int $limit): array
    {
        $limit = max(1, min(50, $limit));
        $today = (new \DateTimeImmutable('today'))->format('Y-m-d');
        $week = (new \DateTimeImmutable('+6 days'))->format('Y-m-d');
        $sql = 'SELECT o.reference, o.name, o.status, o.due_date, o.amount, c.name AS client_name
                FROM orders o
                INNER JOIN clients c ON c.id = o.client_id
                WHERE o.company_id = :id AND o.status <> :done AND ';
        $sql .= $overdue ? 'o.due_date < :today' : 'o.due_date BETWEEN :today AND :week';
        $sql .= ' ORDER BY o.due_date ASC LIMIT ' . $limit;
        $params = ['id' => $companyId, 'done' => 'Expédiée', 'today' => $today];
        if (!$overdue) {
            $params['week'] = $week;
        }
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        $out = [];
        foreach ($stmt->fetchAll() as $row) {
            $out[] = [
                'reference' => (string) $row['reference'],
                'name' => (string) $row['name'],
                'client' => (string) $row['client_name'],
                'status' => (string) $row['status'],
                'dueDate' => (string) $row['due_date'],
                'amount' => round((float) $row['amount']),
            ];
        }
        return $out;
    }

    /** @return array{rows: list<array<string, mixed>>, total: float, paid: float, remaining: float} */
    private function receivables(string $companyId): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT o.reference, o.status, o.due_date, o.amount, c.name AS client_name,
                    COALESCE(d.received, 0) AS paid,
                    COALESCE(d.remaining, o.amount - COALESCE(d.received, 0)) AS remaining
             FROM orders o
             INNER JOIN clients c ON c.id = o.client_id
             LEFT JOIN order_deposits d ON d.order_id = o.id AND d.company_id = o.company_id
             WHERE o.company_id = :id AND o.status <> :done
             ORDER BY o.due_date ASC',
        );
        $stmt->execute(['id' => $companyId, 'done' => 'Expédiée']);
        $today = new \DateTimeImmutable('today');
        $rows = [];
        $total = 0.0;
        $paidSum = 0.0;
        $remainSum = 0.0;
        foreach ($stmt->fetchAll() as $row) {
            $amount = round((float) $row['amount']);
            $paid = round((float) $row['paid']);
            $remaining = max(0, round((float) $row['remaining']));
            if ($remaining < 1) {
                continue;
            }
            $due = (string) $row['due_date'];
            $days = 0;
            try {
                $dueDate = new \DateTimeImmutable($due);
                if ($dueDate < $today) {
                    $days = (int) $dueDate->diff($today)->days;
                }
            } catch (\Exception) {
                $days = 0;
            }
            $aging = $days <= 30 ? '0-30' : ($days <= 60 ? '31-60' : '61+');
            $rows[] = [
                'client' => (string) $row['client_name'],
                'reference' => (string) $row['reference'],
                'status' => (string) $row['status'],
                'dueDate' => $due,
                'total' => $amount,
                'paid' => $paid,
                'remaining' => $remaining,
                'aging' => $aging,
                'daysLate' => $days,
            ];
            $total += $amount;
            $paidSum += $paid;
            $remainSum += $remaining;
        }
        usort($rows, static fn(array $a, array $b) => $b['remaining'] <=> $a['remaining']);
        return [
            'rows' => array_slice($rows, 0, 80),
            'total' => $total,
            'paid' => $paidSum,
            'remaining' => $remainSum,
        ];
    }

    /** @return array{clients: list<array<string, mixed>>, products: list<array<string, mixed>>, months: list<array<string, mixed>>} */
    private function sales(string $companyId, string $from, string $to): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT o.id, o.amount, o.quantity, o.payload, o.created_at, c.name AS client_name
             FROM orders o
             INNER JOIN clients c ON c.id = o.client_id
             WHERE o.company_id = :id AND DATE(o.created_at) BETWEEN :from AND :to',
        );
        $stmt->execute(['id' => $companyId, 'from' => $from, 'to' => $to]);
        $orders = $stmt->fetchAll();
        $bom = $this->bomMap($companyId);
        $buy = $this->buyPrices($companyId);
        $productsMeta = $this->productMeta($companyId);

        $clients = [];
        $products = [];
        $months = [];
        foreach ($orders as $row) {
            $amount = (float) $row['amount'];
            $client = (string) $row['client_name'];
            $ym = substr((string) $row['created_at'], 0, 7);
            $payload = $row['payload'] ?? '{}';
            if (is_array($payload)) {
                $decoded = $payload;
            } else {
                $decoded = json_decode((string) $payload, true);
            }
            $lines = is_array($decoded['lines'] ?? null) ? $decoded['lines'] : [];
            $lineQty = [];
            $qtyTotal = 0.0;
            foreach ($lines as $line) {
                if (!is_array($line)) {
                    continue;
                }
                $pid = trim((string) ($line['productId'] ?? ''));
                $qty = max(0, (float) ($line['quantity'] ?? 0));
                if ($pid === '' || $qty < 1) {
                    continue;
                }
                $lineQty[$pid] = ($lineQty[$pid] ?? 0) + $qty;
                $qtyTotal += $qty;
            }
            $orderCost = 0.0;
            foreach ($lineQty as $pid => $qty) {
                foreach ($bom[$pid] ?? [] as $part) {
                    $orderCost += $part['qty'] * $qty * ($buy[$part['materialId']] ?? 0);
                }
            }
            $orderCost = round($orderCost);
            $clients[$client] = $this->accum($clients[$client] ?? null, $amount, $orderCost);
            $months[$ym] = $this->accum($months[$ym] ?? null, $amount, $orderCost);
            if (!$lineQty) {
                continue;
            }
            foreach ($lineQty as $pid => $qty) {
                $share = $qtyTotal > 0 ? $amount * ($qty / $qtyTotal) : 0;
                $costShare = 0.0;
                foreach ($bom[$pid] ?? [] as $part) {
                    $costShare += $part['qty'] * $qty * ($buy[$part['materialId']] ?? 0);
                }
                $meta = $productsMeta[$pid] ?? ['name' => 'Produit inconnu', 'family' => '—'];
                $key = $pid;
                $prev = $products[$key] ?? ['name' => $meta['name'], 'family' => $meta['family'], 'orders' => 0, 'quantity' => 0, 'amount' => 0, 'materialCost' => 0, 'margin' => 0];
                $prev['orders']++;
                $prev['quantity'] += $qty;
                $prev['amount'] += $share;
                $prev['materialCost'] += $costShare;
                $products[$key] = $prev;
            }
        }

        $mapList = static function (array $items, bool $named): array {
            $out = [];
            foreach ($items as $name => $row) {
                $row['amount'] = round((float) $row['amount']);
                $row['materialCost'] = round((float) $row['materialCost']);
                $row['margin'] = $row['amount'] - $row['materialCost'];
                if ($named) {
                    $row['name'] = (string) $name;
                }
                $out[] = $row;
            }
            usort($out, static fn(array $a, array $b) => $b['amount'] <=> $a['amount']);
            return array_slice($out, 0, 40);
        };

        $monthList = [];
        ksort($months);
        foreach ($months as $ym => $row) {
            $monthList[] = [
                'key' => $ym,
                'name' => $ym,
                'orders' => $row['orders'],
                'amount' => round($row['amount']),
                'materialCost' => round($row['materialCost']),
                'margin' => round($row['amount'] - $row['materialCost']),
            ];
        }
        $productList = [];
        foreach ($products as $row) {
            $row['amount'] = round((float) $row['amount']);
            $row['materialCost'] = round((float) $row['materialCost']);
            $row['quantity'] = round((float) $row['quantity']);
            $row['margin'] = $row['amount'] - $row['materialCost'];
            $productList[] = $row;
        }
        usort($productList, static fn(array $a, array $b) => $b['amount'] <=> $a['amount']);

        return [
            'clients' => $mapList($clients, true),
            'products' => array_slice($productList, 0, 40),
            'months' => $monthList,
        ];
    }

    /** @return array{materials: list<array<string, mixed>>, alerts: int, value: float, consumed: float} */
    private function stock(string $companyId, string $from, string $to): array
    {
        $consumedStmt = $this->pdo->prepare(
            "SELECT article_id, COALESCE(SUM(qty_out), 0) AS out_qty
             FROM stock_movements
             WHERE company_id = :id AND article_kind = 'material' AND DATE(created_at) BETWEEN :from AND :to
             GROUP BY article_id",
        );
        $consumedStmt->execute(['id' => $companyId, 'from' => $from, 'to' => $to]);
        $consumedMap = [];
        $consumedTotal = 0.0;
        foreach ($consumedStmt->fetchAll() as $row) {
            $qty = (float) $row['out_qty'];
            $consumedMap[(string) $row['article_id']] = $qty;
            $consumedTotal += $qty;
        }
        $stmt = $this->pdo->prepare(
            'SELECT id, name, reference, quantity, alert_qty, buy_price, status
             FROM materials WHERE company_id = :id ORDER BY name',
        );
        $stmt->execute(['id' => $companyId]);
        $materials = [];
        $value = 0.0;
        $alerts = 0;
        foreach ($stmt->fetchAll() as $row) {
            $qty = (float) $row['quantity'];
            $alert = (float) $row['alert_qty'];
            $buy = (float) $row['buy_price'];
            $val = round(max(0, $qty) * max(0, $buy));
            $value += $val;
            if ($qty <= $alert) {
                $alerts++;
            }
            $materials[] = [
                'id' => (string) $row['id'],
                'name' => (string) $row['name'],
                'reference' => (string) $row['reference'],
                'status' => (string) $row['status'],
                'quantity' => round($qty),
                'alertQty' => round($alert),
                'value' => $val,
                'consumed' => round($consumedMap[(string) $row['id']] ?? 0),
            ];
        }
        usort($materials, static function (array $a, array $b) {
            $aAlert = $a['quantity'] <= $a['alertQty'] ? 0 : 1;
            $bAlert = $b['quantity'] <= $b['alertQty'] ? 0 : 1;
            return $aAlert <=> $bAlert ?: $b['consumed'] <=> $a['consumed'];
        });
        return [
            'materials' => array_slice($materials, 0, 80),
            'alerts' => $alerts,
            'value' => $value,
            'consumed' => round($consumedTotal),
        ];
    }

    /** @return array{suppliers: list<array<string, mixed>>, total: float, count: int} */
    private function purchases(string $companyId, string $from, string $to): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT p.name, COUNT(*) AS c, COALESCE(SUM(s.amount), 0) AS a, MAX(s.issued_at) AS last_date
             FROM supplies s
             INNER JOIN suppliers p ON p.id = s.supplier_id
             WHERE s.company_id = :id AND s.issued_at BETWEEN :from AND :to
             GROUP BY p.id, p.name
             ORDER BY a DESC',
        );
        $stmt->execute(['id' => $companyId, 'from' => $from, 'to' => $to]);
        $suppliers = [];
        $total = 0.0;
        $count = 0;
        foreach ($stmt->fetchAll() as $row) {
            $amount = round((float) $row['a']);
            $n = (int) $row['c'];
            $suppliers[] = [
                'name' => (string) $row['name'],
                'count' => $n,
                'amount' => $amount,
                'lastDate' => (string) $row['last_date'],
            ];
            $total += $amount;
            $count += $n;
        }
        return ['suppliers' => $suppliers, 'total' => $total, 'count' => $count];
    }

    /** @return array<string, mixed> */
    private function production(string $companyId, string $from, string $to, int $occupation): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT status, COUNT(*) AS c, COALESCE(SUM(quantity), 0) AS q, COALESCE(SUM(amount), 0) AS a
             FROM orders WHERE company_id = :id AND DATE(created_at) BETWEEN :from AND :to
             GROUP BY status',
        );
        $stmt->execute(['id' => $companyId, 'from' => $from, 'to' => $to]);
        $byStatus = [];
        $volume = 0.0;
        $count = 0;
        foreach ($stmt->fetchAll() as $row) {
            $qty = round((float) $row['q']);
            $byStatus[] = [
                'status' => (string) $row['status'],
                'count' => (int) $row['c'],
                'quantity' => $qty,
                'amount' => round((float) $row['a']),
            ];
            $volume += $qty;
            $count += (int) $row['c'];
        }
        return [
            'volume' => $volume,
            'orders' => $count,
            'otd' => $this->otd($companyId, $from, $to),
            'occupation' => $occupation,
            'waste' => null,
            'byStatus' => $byStatus,
        ];
    }

    private function otd(string $companyId, string $from, string $to): int
    {
        $stmt = $this->pdo->prepare(
            'SELECT COUNT(*) AS c,
                    SUM(CASE WHEN DATE(updated_at) <= due_date THEN 1 ELSE 0 END) AS ontime
             FROM orders
             WHERE company_id = :id AND status = :done AND DATE(updated_at) BETWEEN :from AND :to',
        );
        $stmt->execute(['id' => $companyId, 'done' => 'Expédiée', 'from' => $from, 'to' => $to]);
        $row = $stmt->fetch() ?: ['c' => 0, 'ontime' => 0];
        $total = (int) $row['c'];
        if ($total < 1) {
            return 0;
        }
        return (int) round(((int) $row['ontime'] / $total) * 100);
    }

    private function occupation(string $companyId): int
    {
        $from = (new \DateTimeImmutable('today'))->format('Y-m-d');
        $to = (new \DateTimeImmutable('+6 days'))->format('Y-m-d');
        $machines = $this->scalarInt(
            "SELECT COUNT(*) FROM workstations WHERE company_id = :id AND status = 'Actif'",
            ['id' => $companyId],
        );
        if ($machines < 1) {
            $machines = $this->scalarInt('SELECT COUNT(*) FROM workstations WHERE company_id = :id', ['id' => $companyId]);
        }
        if ($machines < 1) {
            return 0;
        }
        $stmt = $this->pdo->prepare(
            'SELECT start_time, end_time FROM machine_slots
             WHERE company_id = :id AND day BETWEEN :from AND :to AND status <> :free',
        );
        $stmt->execute(['id' => $companyId, 'from' => $from, 'to' => $to, 'free' => 'Libre']);
        $minutes = 0;
        foreach ($stmt->fetchAll() as $row) {
            $start = strtotime('1970-01-01 ' . $row['start_time']);
            $end = strtotime('1970-01-01 ' . $row['end_time']);
            if ($start !== false && $end !== false && $end > $start) {
                $minutes += (int) (($end - $start) / 60);
            }
        }
        $available = $machines * 8 * 7 * 60;
        if ($available < 1) {
            return 0;
        }
        return (int) min(100, round(($minutes / $available) * 100));
    }

    /** @return array<string, list<array{materialId:string,qty:float}>> */
    private function bomMap(string $companyId): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT pm.product_id, pm.material_id, pm.quantity
             FROM product_materials pm
             INNER JOIN catalogue_products p ON p.id = pm.product_id
             WHERE p.company_id = :id AND pm.material_id IS NOT NULL AND pm.material_id <> ""',
        );
        $stmt->execute(['id' => $companyId]);
        $map = [];
        foreach ($stmt->fetchAll() as $row) {
            $map[(string) $row['product_id']][] = [
                'materialId' => (string) $row['material_id'],
                'qty' => (float) $row['quantity'],
            ];
        }
        return $map;
    }

    /** @return array<string, float> */
    private function buyPrices(string $companyId): array
    {
        $stmt = $this->pdo->prepare('SELECT id, buy_price FROM materials WHERE company_id = :id');
        $stmt->execute(['id' => $companyId]);
        $out = [];
        foreach ($stmt->fetchAll() as $row) {
            $out[(string) $row['id']] = (float) $row['buy_price'];
        }
        return $out;
    }

    /** @return array<string, array{name:string,family:string}> */
    private function productMeta(string $companyId): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT p.id, p.name, f.name AS family_name
             FROM catalogue_products p
             INNER JOIN catalogue_families f ON f.id = p.family_id
             WHERE p.company_id = :id',
        );
        $stmt->execute(['id' => $companyId]);
        $out = [];
        foreach ($stmt->fetchAll() as $row) {
            $out[(string) $row['id']] = [
                'name' => (string) $row['name'],
                'family' => (string) $row['family_name'],
            ];
        }
        return $out;
    }

    /** @param array{orders:int,amount:float,materialCost:float}|null $prev */
    private function accum(?array $prev, float $amount, float $cost): array
    {
        $row = $prev ?? ['orders' => 0, 'amount' => 0.0, 'materialCost' => 0.0];
        $row['orders']++;
        $row['amount'] += $amount;
        $row['materialCost'] += $cost;
        return $row;
    }

    private function sumInvoices(string $companyId, string $from, string $to): float
    {
        return (float) $this->scalar(
            'SELECT COALESCE(SUM(amount), 0) AS a FROM invoices WHERE company_id = :id AND issued_at BETWEEN :from AND :to',
            ['id' => $companyId, 'from' => $from, 'to' => $to],
        )['a'] ?? 0;
    }

    private function sumOrders(string $companyId, string $from, string $to): float
    {
        return (float) $this->scalar(
            'SELECT COALESCE(SUM(amount), 0) AS a FROM orders WHERE company_id = :id AND DATE(created_at) BETWEEN :from AND :to',
            ['id' => $companyId, 'from' => $from, 'to' => $to],
        )['a'] ?? 0;
    }

    private function trend(float $current, float $previous): int
    {
        if ($previous <= 0) {
            return $current > 0 ? 100 : 0;
        }
        return (int) round((($current - $previous) / $previous) * 100);
    }

    /** @return array{0:string,1:string} */
    private function period(string $from, string $to): array
    {
        $today = new \DateTimeImmutable('today');
        $toDate = $this->parseDate($to) ?? $today;
        $fromDate = $this->parseDate($from) ?? $toDate->modify('first day of this month');
        if ($fromDate > $toDate) {
            throw HttpException::unprocessable('La date de début doit précéder la date de fin.');
        }
        if ((int) $fromDate->diff($toDate)->days > 366) {
            throw HttpException::unprocessable('La période ne peut pas dépasser 12 mois.');
        }
        return [$fromDate->format('Y-m-d'), $toDate->format('Y-m-d')];
    }

    private function parseDate(string $value): ?\DateTimeImmutable
    {
        $value = trim($value);
        if ($value === '' || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $value)) {
            return null;
        }
        $date = \DateTimeImmutable::createFromFormat('!Y-m-d', $value);
        if (!$date instanceof \DateTimeImmutable || $date->format('Y-m-d') !== $value) {
            return null;
        }
        return $date;
    }

    /** @param array<string, scalar> $params */
    private function scalar(string $sql, array $params): array
    {
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        $row = $stmt->fetch();
        return is_array($row) ? $row : [];
    }

    /** @param array<string, scalar> $params */
    private function scalarInt(string $sql, array $params): int
    {
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        return (int) $stmt->fetchColumn();
    }

    /**
     * @param list<string> $headers
     * @param list<list<mixed>> $rows
     * @return array{filename: string, csv: string}
     */
    private function csvFile(string $filename, array $headers, array $rows): array
    {
        $lines = [$this->csvLine($headers)];
        foreach ($rows as $row) {
            $lines[] = $this->csvLine($row);
        }
        return ['filename' => $filename, 'csv' => "\xEF\xBB\xBF" . implode("\r\n", $lines) . "\r\n"];
    }

    /** @param list<mixed> $fields */
    private function csvLine(array $fields): string
    {
        $out = [];
        foreach ($fields as $field) {
            $value = (string) $field;
            if ($value !== '' && preg_match('/^[=+\-@\t\r]/', $value) === 1) {
                $value = "'" . $value;
            }
            if (str_contains($value, '"') || str_contains($value, ';') || str_contains($value, "\n") || str_contains($value, "\r")) {
                $value = '"' . str_replace('"', '""', $value) . '"';
            }
            $out[] = $value;
        }
        return implode(';', $out);
    }

    /** @return array{filename: string, csv: string} */
    private function auditCsv(AuthContext $auth, string $from, string $to): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT a.created_at, a.action, a.module_id, a.feature_id, a.detail, u.name AS author_name
             FROM audit_logs a
             LEFT JOIN users u ON u.id = a.user_id
             WHERE a.company_id = :id AND DATE(a.created_at) BETWEEN :from AND :to
             ORDER BY a.created_at DESC
             LIMIT 5000',
        );
        $stmt->execute(['id' => $auth->companyId, 'from' => $from, 'to' => $to]);
        $rows = [];
        foreach ($stmt->fetchAll() as $row) {
            $rows[] = [
                Dates::stamp($row['created_at'] ?? null),
                (string) ($row['author_name'] ?: 'Système'),
                Modules::LABELS[(string) ($row['module_id'] ?? '')] ?? (string) ($row['module_id'] ?? ''),
                (string) ($row['feature_id'] ?? ''),
                (string) ($row['action'] ?? ''),
                (string) ($row['detail'] ?? ''),
            ];
        }
        return $this->csvFile('audit-' . $from . '_' . $to . '.csv', ['Date', 'Auteur', 'Module', 'Fonction', 'Action', 'Détail'], $rows);
    }
}
