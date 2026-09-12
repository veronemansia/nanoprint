<?php

declare(strict_types=1);

namespace NanoPrint\Services;

use NanoPrint\Auth\AuthContext;
use NanoPrint\Support\RecordMapper;
use PDO;

final class AuditService
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    /** @return list<array<string, mixed>> */
    public function list(AuthContext $auth): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT a.*, u.name AS author_name
             FROM audit_logs a
             LEFT JOIN users u ON u.id = a.user_id
             WHERE a.company_id = :id
             ORDER BY a.created_at DESC
             LIMIT 200',
        );
        $stmt->execute(['id' => $auth->companyId]);
        return array_map(RecordMapper::audit(...), $stmt->fetchAll());
    }
}
