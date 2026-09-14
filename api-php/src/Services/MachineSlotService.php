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

final class MachineSlotService
{
    private const DAY_START = 8 * 60;
    private const DAY_END = 18 * 60;

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
            'SELECT s.*, w.name AS machine_name, o.reference AS order_ref
             FROM machine_slots s
             INNER JOIN workstations w ON w.id = s.workstation_id
             INNER JOIN orders o ON o.id = s.order_id
             WHERE s.company_id = :company_id
             ORDER BY s.day, s.start_time, s.reference',
        );
        $stmt->execute(['company_id' => $auth->companyId]);
        return array_map(RecordMapper::machineSlot(...), $stmt->fetchAll());
    }

    /** @param array<string, mixed> $values */
    public function create(AuthContext $auth, array $values, string $ip): array
    {
        $parsed = $this->validated($auth, $values);
        $id = Uuid::v4();
        $reference = $this->uniqueReference($auth->companyId, (string) ($values['reference'] ?? ''), $parsed['day']);
        $this->assertNoOverlap($auth->companyId, $parsed['workstation_id'], $parsed['day'], $parsed['start_time'], $parsed['end_time']);
        $this->pdo->prepare(
            'INSERT INTO machine_slots (
                id, company_id, workstation_id, order_id, reference, name, status, day, start_time, end_time
             ) VALUES (
                :id, :company_id, :workstation_id, :order_id, :reference, :name, :status, :day, :start_time, :end_time
             )',
        )->execute([
            'id' => $id,
            'company_id' => $auth->companyId,
            ...$parsed,
            'reference' => $reference,
        ]);
        $this->audit->record(
            $auth,
            'slot.create',
            'planification',
            'planning-machines',
            'machine-slot',
            $id,
            $reference . ' · ' . $parsed['name'],
            $ip,
        );
        return $this->one($auth, $id);
    }

    /** @param array<string, mixed> $values */
    public function update(AuthContext $auth, string $id, array $values, string $ip): array
    {
        $row = $this->mustExist($auth, $id);
        $parsed = $this->validated($auth, $values, $row);
        $this->assertNoOverlap(
            $auth->companyId,
            $parsed['workstation_id'],
            $parsed['day'],
            $parsed['start_time'],
            $parsed['end_time'],
            $id,
        );
        $this->pdo->prepare(
            'UPDATE machine_slots
             SET workstation_id = :workstation_id, order_id = :order_id, name = :name, status = :status,
                 day = :day, start_time = :start_time, end_time = :end_time
             WHERE id = :id AND company_id = :company_id',
        )->execute([
            ...$parsed,
            'id' => $id,
            'company_id' => $auth->companyId,
        ]);
        $this->audit->record(
            $auth,
            'slot.update',
            'planification',
            'planning-machines',
            'machine-slot',
            $id,
            (string) $row['reference'] . ' · ' . $parsed['name'],
            $ip,
        );
        return $this->one($auth, $id);
    }

    public function delete(AuthContext $auth, string $id, string $ip): void
    {
        $row = $this->mustExist($auth, $id);
        $this->pdo->prepare(
            'DELETE FROM machine_slots WHERE id = :id AND company_id = :company_id',
        )->execute(['id' => $id, 'company_id' => $auth->companyId]);
        $this->audit->record(
            $auth,
            'slot.delete',
            'planification',
            'planning-machines',
            'machine-slot',
            $id,
            (string) $row['reference'] . ' · ' . (string) $row['name'],
            $ip,
        );
    }

    /**
     * @param array<string, mixed> $values
     * @param array<string, mixed>|null $existing
     * @return array{workstation_id: string, order_id: string, name: string, status: string, day: string, start_time: string, end_time: string}
     */
    private function validated(AuthContext $auth, array $values, ?array $existing = null): array
    {
        $machineId = Validator::required(
            (string) ($values['machineId'] ?? $existing['workstation_id'] ?? ''),
            'Choisissez une machine et une commande.',
        );
        $orderId = Validator::required(
            (string) ($values['orderId'] ?? $existing['order_id'] ?? ''),
            'Choisissez une machine et une commande.',
        );
        $day = $this->day((string) ($values['day'] ?? $values['startDate'] ?? $existing['day'] ?? ''));
        $start = $this->clock((string) ($values['startTime'] ?? $existing['start_time'] ?? ''));
        $end = $this->clock((string) ($values['endTime'] ?? $existing['end_time'] ?? ''));
        $startMin = $this->minutes($start);
        $endMin = $this->minutes($end);
        if ($endMin <= $startMin) {
            throw HttpException::unprocessable('L’heure de fin doit être après l’heure de début.');
        }
        if ($startMin < self::DAY_START || $endMin > self::DAY_END) {
            throw HttpException::unprocessable('Les créneaux se placent entre 8h et 18h.');
        }
        $machine = $this->workstation($auth, $machineId);
        $status = (string) ($machine['status'] ?? '');
        if ($status === 'Hors service') {
            throw HttpException::unprocessable('Cette machine est hors service.');
        }
        if ($status === 'Maintenance') {
            throw HttpException::unprocessable('Cette machine est en maintenance.');
        }
        $order = $this->orders->mustExist($auth, $orderId);
        if ((string) ($order['status'] ?? '') === 'Expédiée') {
            throw HttpException::unprocessable('Cette commande est déjà expédiée.');
        }
        $name = trim((string) ($values['name'] ?? ''));
        if ($name === '') {
            $name = (string) $order['reference'] . ' — ' . (string) $machine['name'];
        }
        return [
            'workstation_id' => (string) $machine['id'],
            'order_id' => (string) $order['id'],
            'name' => mb_substr($name, 0, 190),
            'status' => 'Planifié',
            'day' => $day,
            'start_time' => $start,
            'end_time' => $end,
        ];
    }

    private function assertNoOverlap(
        string $companyId,
        string $workstationId,
        string $day,
        string $start,
        string $end,
        string $ignoreId = '',
    ): void {
        $sql = 'SELECT s.*, o.reference AS order_ref
                FROM machine_slots s
                INNER JOIN orders o ON o.id = s.order_id
                WHERE s.company_id = :company_id AND s.workstation_id = :workstation_id AND s.day = :day
                  AND s.start_time < :end_time AND s.end_time > :start_time';
        $params = [
            'company_id' => $companyId,
            'workstation_id' => $workstationId,
            'day' => $day,
            'start_time' => $start,
            'end_time' => $end,
        ];
        if ($ignoreId !== '') {
            $sql .= ' AND s.id <> :ignore_id';
            $params['ignore_id'] = $ignoreId;
        }
        $sql .= ' LIMIT 1';
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        $clash = $stmt->fetch();
        if ($clash) {
            $order = (string) ($clash['order_ref'] ?? '');
            $range = $this->formatRange((string) $clash['start_time'], (string) $clash['end_time']);
            throw HttpException::unprocessable('Ce créneau chevauche ' . $order . ' (' . $range . ').');
        }
    }

    /** @return array<string, mixed> */
    private function workstation(AuthContext $auth, string $id): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT * FROM workstations WHERE id = :id AND company_id = :company_id LIMIT 1',
        );
        $stmt->execute(['id' => $id, 'company_id' => $auth->companyId]);
        $row = $stmt->fetch();
        if (!$row) {
            throw HttpException::unprocessable('Choisissez une machine et une commande.');
        }
        return $row;
    }

    private function day(string $value): string
    {
        $value = substr(trim($value), 0, 10);
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $value)) {
            throw HttpException::unprocessable('Jour invalide.');
        }
        return $value;
    }

    private function clock(string $value): string
    {
        $value = trim($value);
        if (preg_match('/^(\d{2}):(\d{2})(?::\d{2})?$/', $value, $m)) {
            $hours = (int) $m[1];
            $minutes = (int) $m[2];
            if ($hours <= 23 && $minutes <= 59 && $minutes % 30 === 0) {
                return sprintf('%02d:%02d:00', $hours, $minutes);
            }
        }
        throw HttpException::unprocessable('Horaire invalide.');
    }

    private function minutes(string $time): int
    {
        [$hours, $minutes] = array_map('intval', explode(':', $time));
        return $hours * 60 + $minutes;
    }

    private function formatRange(string $start, string $end): string
    {
        return $this->formatHour($start) . ' → ' . $this->formatHour($end);
    }

    private function formatHour(string $time): string
    {
        $hours = substr($time, 0, 2);
        $minutes = substr($time, 3, 2);
        if ($minutes === '' || $minutes === '00') {
            return $hours . 'h';
        }
        return $hours . 'h' . $minutes;
    }

    private function uniqueReference(string $companyId, string $requested, string $day): string
    {
        $requested = strtoupper(trim($requested));
        if ($requested !== '' && $this->referenceFree($companyId, $requested)) {
            return mb_substr($requested, 0, 32);
        }
        $stamp = substr(str_replace('-', '', $day), 4, 4) ?: date('md');
        $prefix = 'PLN-' . $stamp . '-';
        $letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        for ($i = 0; $i < strlen($letters); $i++) {
            $reference = $prefix . $letters[$i];
            if ($this->referenceFree($companyId, $reference)) {
                return $reference;
            }
        }
        return 'PLN-' . substr((string) round(microtime(true) * 1000), -8);
    }

    private function referenceFree(string $companyId, string $reference): bool
    {
        $stmt = $this->pdo->prepare(
            'SELECT 1 FROM machine_slots WHERE company_id = :company_id AND reference = :reference LIMIT 1',
        );
        $stmt->execute(['company_id' => $companyId, 'reference' => $reference]);
        return !$stmt->fetchColumn();
    }

    /** @return array<string, mixed> */
    private function one(AuthContext $auth, string $id): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT s.*, w.name AS machine_name, o.reference AS order_ref
             FROM machine_slots s
             INNER JOIN workstations w ON w.id = s.workstation_id
             INNER JOIN orders o ON o.id = s.order_id
             WHERE s.id = :id AND s.company_id = :company_id
             LIMIT 1',
        );
        $stmt->execute(['id' => $id, 'company_id' => $auth->companyId]);
        $row = $stmt->fetch();
        if (!$row) {
            throw HttpException::notFound('Créneau introuvable.');
        }
        return RecordMapper::machineSlot($row);
    }

    /** @return array<string, mixed> */
    private function mustExist(AuthContext $auth, string $id): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT * FROM machine_slots WHERE id = :id AND company_id = :company_id LIMIT 1',
        );
        $stmt->execute(['id' => $id, 'company_id' => $auth->companyId]);
        $row = $stmt->fetch();
        if (!$row) {
            throw HttpException::notFound('Créneau introuvable.');
        }
        return $row;
    }
}
