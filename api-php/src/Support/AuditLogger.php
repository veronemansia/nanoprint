<?php

declare(strict_types=1);

namespace NanoPrint\Support;

use NanoPrint\Auth\AuthContext;
use PDO;

final class AuditLogger
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    public function record(
        AuthContext $auth,
        string $action,
        string $module = '',
        string $feature = '',
        string $entityType = '',
        string $entityId = '',
        string $detail = '',
        string $ip = '',
    ): void {
        $stmt = $this->pdo->prepare(
            'INSERT INTO audit_logs (id, company_id, user_id, module_id, feature_id, action, entity_type, entity_id, detail, ip)
             VALUES (:id, :company_id, :user_id, :module_id, :feature_id, :action, :entity_type, :entity_id, :detail, :ip)',
        );
        $stmt->execute([
            'id' => Uuid::v4(),
            'company_id' => $auth->companyId,
            'user_id' => $auth->userId,
            'module_id' => $module,
            'feature_id' => $feature,
            'action' => $action,
            'entity_type' => $entityType,
            'entity_id' => $entityId,
            'detail' => $detail,
            'ip' => $ip,
        ]);
        FileLogger::info($action, $detail, [
            'user' => $auth->email,
            'company' => $auth->companyId,
            'module' => $module,
            'feature' => $feature,
            'entity' => $entityType . ':' . $entityId,
        ]);
    }
}
