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

final class BackupService
{
    private const STATUSES = ['Réussie', 'Planifiée', 'Échec'];

    public function __construct(
        private readonly PDO $pdo,
        private readonly AuditLogger $audit,
    ) {
    }

    /** @return list<array<string, mixed>> */
    public function list(AuthContext $auth): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT * FROM data_backups WHERE company_id = :id ORDER BY updated_at DESC, name',
        );
        $stmt->execute(['id' => $auth->companyId]);
        return array_map(RecordMapper::backup(...), $stmt->fetchAll());
    }

    public function create(AuthContext $auth, array $values, string $ip): array
    {
        $name = Validator::required((string) ($values['name'] ?? ''), 'Le nom est obligatoire.');
        $frequency = trim((string) ($values['frequency'] ?? 'Manuelle')) ?: 'Manuelle';
        $status = $this->status((string) ($values['status'] ?? 'Réussie'));
        $id = Uuid::v4();
        $reference = $this->nextReference($auth->companyId);

        $dump = $this->writeDump($auth->companyId, $reference);
        $size = $dump['size'] !== '' ? $dump['size'] : trim((string) ($values['size'] ?? ''));
        $location = $dump['location'] !== '' ? $dump['location'] : trim((string) ($values['location'] ?? 'Stockage local NanoPrint'));
        if ($dump['ok']) {
            $status = 'Réussie';
        } elseif ($dump['attempted']) {
            $status = 'Échec';
        }

        $this->pdo->prepare(
            'INSERT INTO data_backups (id, company_id, reference, name, frequency, size, location, status, last_run)
             VALUES (:id, :company_id, :reference, :name, :frequency, :size, :location, :status, NOW())',
        )->execute([
            'id' => $id,
            'company_id' => $auth->companyId,
            'reference' => $reference,
            'name' => $name,
            'frequency' => $frequency,
            'size' => $size,
            'location' => $location,
            'status' => $status,
        ]);
        $this->audit->record($auth, 'backup.create', 'utilisateurs', 'sauvegardes', 'backup', $id, $reference, $ip);
        return $this->one($auth, $id);
    }

    public function delete(AuthContext $auth, string $id, string $ip): void
    {
        $row = $this->mustExist($auth, $id);
        $this->pdo->prepare('DELETE FROM data_backups WHERE id = :id AND company_id = :company_id')
            ->execute(['id' => $id, 'company_id' => $auth->companyId]);
        $file = $this->dumpPath($auth->companyId, (string) $row['reference']);
        if (is_file($file)) {
            unlink($file);
        }
        $this->audit->record($auth, 'backup.delete', 'utilisateurs', 'sauvegardes', 'backup', $id, (string) $row['reference'], $ip);
    }

    private function one(AuthContext $auth, string $id): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT * FROM data_backups WHERE id = :id AND company_id = :company_id LIMIT 1',
        );
        $stmt->execute(['id' => $id, 'company_id' => $auth->companyId]);
        $row = $stmt->fetch();
        if (!$row) {
            throw HttpException::notFound('Sauvegarde introuvable.');
        }
        return RecordMapper::backup($row);
    }

    /** @return array<string, mixed> */
    private function mustExist(AuthContext $auth, string $id): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT * FROM data_backups WHERE id = :id AND company_id = :company_id LIMIT 1',
        );
        $stmt->execute(['id' => $id, 'company_id' => $auth->companyId]);
        $row = $stmt->fetch();
        if (!$row) {
            throw HttpException::notFound('Sauvegarde introuvable.');
        }
        return $row;
    }

    private function status(string $status): string
    {
        $status = trim($status);
        if (!in_array($status, self::STATUSES, true)) {
            return 'Réussie';
        }
        return $status;
    }

    private function nextReference(string $companyId): string
    {
        $stmt = $this->pdo->prepare(
            'SELECT reference FROM data_backups WHERE company_id = :id AND reference LIKE :prefix',
        );
        $stmt->execute(['id' => $companyId, 'prefix' => 'SAV-%']);
        $max = 0;
        foreach ($stmt->fetchAll() as $row) {
            if (preg_match('/^SAV-(\d+)$/', (string) $row['reference'], $m)) {
                $max = max($max, (int) $m[1]);
            }
        }
        return 'SAV-' . str_pad((string) ($max + 1), 3, '0', STR_PAD_LEFT);
    }

    /** @return array{ok:bool,attempted:bool,size:string,location:string} */
    private function writeDump(string $companyId, string $reference): array
    {
        $path = $this->dumpPath($companyId, $reference);
        $dir = dirname($path);
        if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
            return ['ok' => false, 'attempted' => true, 'size' => '', 'location' => ''];
        }

        try {
            $tables = $this->pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_NUM);
            $handle = fopen($path, 'wb');
            if ($handle === false) {
                return ['ok' => false, 'attempted' => true, 'size' => '', 'location' => ''];
            }
            fwrite($handle, "-- NanoPrint dump\nSET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS=0;\n\n");
            foreach ($tables as $tableRow) {
                $table = (string) $tableRow[0];
                if (!preg_match('/^[A-Za-z0-9_]+$/', $table)) {
                    continue;
                }
                $create = $this->pdo->query('SHOW CREATE TABLE `' . $table . '`')->fetch();
                fwrite($handle, 'DROP TABLE IF EXISTS `' . $table . "`;\n");
                fwrite($handle, (string) ($create['Create Table'] ?? '') . ";\n\n");
                $rows = $this->pdo->query('SELECT * FROM `' . $table . '`')->fetchAll();
                foreach ($rows as $row) {
                    $cols = array_map(static fn($col) => '`' . str_replace('`', '', (string) $col) . '`', array_keys($row));
                    $vals = [];
                    foreach ($row as $value) {
                        $vals[] = $value === null ? 'NULL' : $this->pdo->quote((string) $value);
                    }
                    fwrite($handle, 'INSERT INTO `' . $table . '` (' . implode(', ', $cols) . ') VALUES (' . implode(', ', $vals) . ");\n");
                }
                fwrite($handle, "\n");
            }
            fwrite($handle, "SET FOREIGN_KEY_CHECKS=1;\n");
            fclose($handle);
        } catch (\Throwable) {
            return ['ok' => false, 'attempted' => true, 'size' => '', 'location' => ''];
        }

        $bytes = is_file($path) ? filesize($path) : 0;
        return [
            'ok' => is_file($path) && $bytes !== false,
            'attempted' => true,
            'size' => $this->formatSize((int) $bytes),
            'location' => 'api-php/storage/backups/' . $companyId . '/' . $reference . '.sql',
        ];
    }

    private function dumpPath(string $companyId, string $reference): string
    {
        $safeCompany = preg_replace('/[^A-Za-z0-9_-]/', '', $companyId) ?: 'company';
        $safeRef = preg_replace('/[^A-Za-z0-9_-]/', '', $reference) ?: 'backup';
        return dirname(__DIR__, 2) . '/storage/backups/' . $safeCompany . '/' . $safeRef . '.sql';
    }

    private function formatSize(int $bytes): string
    {
        if ($bytes <= 0) {
            return '0 Ko';
        }
        if ($bytes < 1024 * 1024) {
            return number_format($bytes / 1024, 1, ',', ' ') . ' Ko';
        }
        return number_format($bytes / (1024 * 1024), 1, ',', ' ') . ' Mo';
    }
}
