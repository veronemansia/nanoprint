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
        $this->insert(
            $auth->companyId,
            $auth->userId,
            $action,
            $module,
            $feature,
            $entityType,
            $entityId,
            $detail,
            $ip,
            $auth->email,
        );
    }

    public function recordForCompany(
        string $companyId,
        ?string $userId,
        string $action,
        string $module = '',
        string $feature = '',
        string $entityType = '',
        string $entityId = '',
        string $detail = '',
        string $ip = '',
        string $email = '',
    ): void {
        if ($companyId === '') {
            return;
        }
        $this->insert($companyId, $userId, $action, $module, $feature, $entityType, $entityId, $detail, $ip, $email);
    }

    private function insert(
        string $companyId,
        ?string $userId,
        string $action,
        string $module,
        string $feature,
        string $entityType,
        string $entityId,
        string $detail,
        string $ip,
        string $email,
    ): void {
        $stmt = $this->pdo->prepare(
            'INSERT INTO audit_logs (id, company_id, user_id, module_id, feature_id, action, entity_type, entity_id, detail, ip)
             VALUES (:id, :company_id, :user_id, :module_id, :feature_id, :action, :entity_type, :entity_id, :detail, :ip)',
        );
        $stmt->execute([
            'id' => Uuid::v4(),
            'company_id' => $companyId,
            'user_id' => $userId,
            'module_id' => $module,
            'feature_id' => $feature,
            'action' => $action,
            'entity_type' => $entityType,
            'entity_id' => $entityId,
            'detail' => $detail,
            'ip' => $ip,
        ]);
        FileLogger::info($action, $detail, [
            'user' => $email !== '' ? $email : ($userId ?? ''),
            'company' => $companyId,
            'module' => $module,
            'feature' => $feature,
            'entity' => $entityType . ':' . $entityId,
        ]);
    }
}
