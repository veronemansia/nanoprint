<?php

declare(strict_types=1);

namespace NanoPrint\Services;

use NanoPrint\Auth\AuthContext;
use NanoPrint\Http\HttpException;
use NanoPrint\Support\AuditLogger;
use NanoPrint\Support\RecordMapper;
use NanoPrint\Support\Uuid;
use PDO;

final class OrderFileService
{
    public const MAX_BYTES = 83886080;

    private const EXTENSIONS = ['pdf', 'ai', 'indd', 'psd', 'tif', 'tiff', 'jpg', 'jpeg', 'png', 'zip', 'eps'];

    private const MIMES = [
        'pdf' => 'application/pdf',
        'ai' => 'application/postscript',
        'eps' => 'application/postscript',
        'indd' => 'application/octet-stream',
        'psd' => 'image/vnd.adobe.photoshop',
        'tif' => 'image/tiff',
        'tiff' => 'image/tiff',
        'jpg' => 'image/jpeg',
        'jpeg' => 'image/jpeg',
        'png' => 'image/png',
        'zip' => 'application/zip',
    ];

    public function __construct(
        private readonly PDO $pdo,
        private readonly AuditLogger $audit,
        private readonly OrderService $orders,
    ) {
    }

    public static function diskPath(string $companyId, string $fileId): string
    {
        $company = preg_replace('/[^a-zA-Z0-9-]/', '', $companyId) ?: 'company';
        $id = preg_replace('/[^a-zA-Z0-9-]/', '', $fileId) ?: 'file';
        return dirname(__DIR__, 2) . '/storage/client-files/' . $company . '/' . $id;
    }

    /** @return list<array<string, mixed>> */
    public function list(AuthContext $auth): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT f.*, o.reference AS order_ref, c.name AS client_name
             FROM order_files f
             INNER JOIN orders o ON o.id = f.order_id
             INNER JOIN clients c ON c.id = o.client_id
             WHERE f.company_id = :company_id
             ORDER BY f.updated_at DESC',
        );
        $stmt->execute(['company_id' => $auth->companyId]);
        return array_map(RecordMapper::orderFile(...), $stmt->fetchAll());
    }

    /**
     * @param list<array{name: string, tmpName: string, size: int, error: int}> $uploads
     * @return list<array<string, mixed>>
     */
    public function upload(AuthContext $auth, string $orderId, array $uploads, string $ip): array
    {
        $order = $this->orders->mustExist($auth, $orderId);
        $accepted = $this->accepted($uploads);
        $saved = [];
        foreach ($accepted as $upload) {
            $saved[] = $this->store($auth, $order, $upload, $ip, false);
        }
        return $saved;
    }

    /**
     * @param array{name: string, tmpName: string, size: int, error: int} $upload
     * @return array<string, mixed>
     */
    public function replace(AuthContext $auth, string $fileId, array $upload, string $ip): array
    {
        $row = $this->mustExist($auth, $fileId);
        $order = $this->orders->mustExist($auth, (string) $row['order_id']);
        $accepted = $this->accepted([$upload]);
        return $this->store($auth, $order, $accepted[0], $ip, true, $row);
    }

    public function delete(AuthContext $auth, string $fileId, string $ip): void
    {
        $row = $this->mustExist($auth, $fileId);
        $path = self::diskPath($auth->companyId, $fileId);
        $this->pdo->prepare(
            'DELETE FROM order_files WHERE id = :id AND company_id = :company_id',
        )->execute(['id' => $fileId, 'company_id' => $auth->companyId]);
        if (is_file($path)) {
            unlink($path);
        }
        $this->audit->record(
            $auth,
            'file.delete',
            'prepress',
            'fichiers-clients',
            'order-file',
            $fileId,
            (string) $row['reference'] . ' · ' . (string) $row['name'],
            $ip,
        );
    }

    /** @return array{__file: string, __name: string, __mime: string} */
    public function download(AuthContext $auth, string $fileId): array
    {
        $row = $this->mustExist($auth, $fileId);
        if (!(int) ($row['stored'] ?? 0)) {
            throw HttpException::notFound('Ce fichier de démonstration n’est pas stocké ici. Déposez une version corrigée pour le conserver.');
        }
        $path = self::diskPath($auth->companyId, $fileId);
        if (!is_file($path)) {
            throw HttpException::notFound('Le contenu du fichier est introuvable. Déposez-le à nouveau.');
        }
        $ext = strtolower((string) pathinfo((string) $row['name'], PATHINFO_EXTENSION));
        return [
            '__file' => $path,
            '__name' => (string) $row['name'],
            '__mime' => self::MIMES[$ext] ?? 'application/octet-stream',
        ];
    }

    /**
     * @param array<string, mixed> $order
     * @param array{name: string, tmpName: string, size: int, error: int} $upload
     * @param array<string, mixed>|null $existing
     * @return array<string, mixed>
     */
    private function store(
        AuthContext $auth,
        array $order,
        array $upload,
        string $ip,
        bool $forceReplace,
        ?array $existing = null,
    ): array {
        $name = $this->safeName($upload['name']);
        if (!$forceReplace) {
            $existing = $this->findByName($auth->companyId, (string) $order['id'], $name);
        }
        $id = $existing ? (string) $existing['id'] : Uuid::v4();
        $dir = dirname(self::diskPath($auth->companyId, $id));
        if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
            throw HttpException::unprocessable('Impossible d’enregistrer le fichier.');
        }
        $path = self::diskPath($auth->companyId, $id);
        if (!is_uploaded_file($upload['tmpName']) || !move_uploaded_file($upload['tmpName'], $path)) {
            if (!@copy($upload['tmpName'], $path)) {
                throw HttpException::unprocessable('Impossible d’enregistrer le fichier.');
            }
            @unlink($upload['tmpName']);
        }
        $format = $this->formatFromName($name);
        $version = $existing ? ((int) ($existing['version'] ?? 1)) + 1 : 1;
        $status = $existing ? 'Versionné' : 'Reçu';
        $reference = $existing ? (string) $existing['reference'] : $this->nextReference($auth->companyId, (string) $order['reference']);
        if ($existing) {
            $this->pdo->prepare(
                'UPDATE order_files
                 SET name = :name, status = :status, format = :format, version = :version, size_bytes = :size_bytes, `stored` = 1
                 WHERE id = :id AND company_id = :company_id',
            )->execute([
                'name' => $name,
                'status' => $status,
                'format' => $format,
                'version' => $version,
                'size_bytes' => $upload['size'],
                'id' => $id,
                'company_id' => $auth->companyId,
            ]);
            $action = 'file.replace';
        } else {
            $this->pdo->prepare(
                'INSERT INTO order_files (
                    id, company_id, order_id, reference, name, status, format, version, size_bytes, `stored`
                 ) VALUES (
                    :id, :company_id, :order_id, :reference, :name, :status, :format, :version, :size_bytes, 1
                 )',
            )->execute([
                'id' => $id,
                'company_id' => $auth->companyId,
                'order_id' => $order['id'],
                'reference' => $reference,
                'name' => $name,
                'status' => $status,
                'format' => $format,
                'version' => $version,
                'size_bytes' => $upload['size'],
            ]);
            $action = 'file.upload';
        }
        $this->audit->record(
            $auth,
            $action,
            'prepress',
            'fichiers-clients',
            'order-file',
            $id,
            $reference . ' · ' . $name,
            $ip,
        );
        return $this->one($auth, $id);
    }

    /**
     * @param list<array{name: string, tmpName: string, size: int, error: int}> $uploads
     * @return list<array{name: string, tmpName: string, size: int, error: int}>
     */
    private function accepted(array $uploads): array
    {
        $out = [];
        foreach ($uploads as $upload) {
            $name = $this->safeName($upload['name']);
            $error = (int) $upload['error'];
            if ($error === UPLOAD_ERR_INI_SIZE || $error === UPLOAD_ERR_FORM_SIZE) {
                throw HttpException::unprocessable(($name !== '' ? $name . ' ' : '') . 'dépasse 80 Mo.');
            }
            if ($error !== UPLOAD_ERR_OK || $upload['tmpName'] === '' || !is_file($upload['tmpName'])) {
                continue;
            }
            if ($name === '') {
                continue;
            }
            $size = (int) $upload['size'];
            if ($size > self::MAX_BYTES) {
                throw HttpException::unprocessable($name . ' dépasse 80 Mo.');
            }
            $ext = strtolower((string) pathinfo($name, PATHINFO_EXTENSION));
            if (!in_array($ext, self::EXTENSIONS, true)) {
                throw HttpException::unprocessable('Format non accepté : ' . $name);
            }
            $out[] = ['name' => $name, 'tmpName' => $upload['tmpName'], 'size' => $size, 'error' => UPLOAD_ERR_OK];
        }
        if (!$out) {
            throw HttpException::unprocessable('Choisissez au moins un fichier.');
        }
        return $out;
    }

    private function safeName(string $name): string
    {
        $name = basename(str_replace('\\', '/', $name));
        $name = trim($name);
        return mb_substr($name, 0, 190);
    }

    private function formatFromName(string $name): string
    {
        $ext = strtolower((string) pathinfo($name, PATHINFO_EXTENSION));
        return match ($ext) {
            'pdf' => 'PDF',
            'ai' => 'AI',
            'indd' => 'INDD',
            'psd' => 'PSD',
            'tif', 'tiff' => 'TIFF',
            'jpg', 'jpeg' => 'JPEG',
            'png' => 'PNG',
            'zip' => 'ZIP',
            'eps' => 'EPS',
            default => $ext !== '' ? strtoupper($ext) : 'Fichier',
        };
    }

    private function nextReference(string $companyId, string $orderRef): string
    {
        $stamp = preg_replace('/^CMD-/i', '', $orderRef) ?: substr((string) round(microtime(true) * 1000), -6);
        $prefix = 'FIC-' . $stamp . '-';
        $stmt = $this->pdo->prepare(
            'SELECT reference FROM order_files WHERE company_id = :company_id AND reference LIKE :prefix',
        );
        $stmt->execute(['company_id' => $companyId, 'prefix' => $prefix . '%']);
        $taken = [];
        foreach ($stmt->fetchAll() as $row) {
            $taken[strtoupper((string) $row['reference'])] = true;
        }
        for ($index = 1; $index < 100; $index++) {
            $reference = $prefix . str_pad((string) $index, 2, '0', STR_PAD_LEFT);
            if (!isset($taken[strtoupper($reference)])) {
                return $reference;
            }
        }
        return 'FIC-' . substr((string) round(microtime(true) * 1000), -8);
    }

    /** @return array<string, mixed>|null */
    private function findByName(string $companyId, string $orderId, string $name): ?array
    {
        $stmt = $this->pdo->prepare(
            'SELECT * FROM order_files
             WHERE company_id = :company_id AND order_id = :order_id AND LOWER(name) = LOWER(:name)
             LIMIT 1',
        );
        $stmt->execute(['company_id' => $companyId, 'order_id' => $orderId, 'name' => $name]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    /** @return array<string, mixed> */
    private function one(AuthContext $auth, string $id): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT f.*, o.reference AS order_ref, c.name AS client_name
             FROM order_files f
             INNER JOIN orders o ON o.id = f.order_id
             INNER JOIN clients c ON c.id = o.client_id
             WHERE f.id = :id AND f.company_id = :company_id
             LIMIT 1',
        );
        $stmt->execute(['id' => $id, 'company_id' => $auth->companyId]);
        $row = $stmt->fetch();
        if (!$row) {
            throw HttpException::notFound('Fichier introuvable.');
        }
        return RecordMapper::orderFile($row);
    }

    /** @return array<string, mixed> */
    private function mustExist(AuthContext $auth, string $id): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT * FROM order_files WHERE id = :id AND company_id = :company_id LIMIT 1',
        );
        $stmt->execute(['id' => $id, 'company_id' => $auth->companyId]);
        $row = $stmt->fetch();
        if (!$row) {
            throw HttpException::notFound('Fichier introuvable.');
        }
        return $row;
    }
}
