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

final class DocumentService
{
    public function __construct(
        private readonly PDO $pdo,
        private readonly AuditLogger $audit,
    ) {
    }

    /** @return list<array<string, mixed>> */
    public function list(AuthContext $auth): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT * FROM document_templates WHERE company_id = :id ORDER BY updated_at DESC, name',
        );
        $stmt->execute(['id' => $auth->companyId]);
        return array_map(RecordMapper::document(...), $stmt->fetchAll());
    }

    public function create(AuthContext $auth, array $values, string $ip): array
    {
        $name = Validator::required((string) ($values['name'] ?? ''), 'Le libellé est obligatoire.');
        $status = (string) ($values['status'] ?? 'Brouillon') ?: 'Brouillon';
        $layout = (string) ($values['layout'] ?? '[]');
        $html = (string) ($values['html'] ?? '');
        $id = Uuid::v4();
        $reference = (string) ($values['reference'] ?? RecordMapper::nextReference('MOD'));
        $this->pdo->prepare(
            'INSERT INTO document_templates (id, company_id, name, reference, status, layout_json, html)
             VALUES (:id, :company_id, :name, :reference, :status, :layout_json, :html)',
        )->execute([
            'id' => $id,
            'company_id' => $auth->companyId,
            'name' => $name,
            'reference' => $reference,
            'status' => $status,
            'layout_json' => $layout,
            'html' => $html,
        ]);
        $this->audit->record($auth, 'document.create', 'configuration', 'modeles-documents', 'document', $id, $reference, $ip);
        return $this->one($auth, $id);
    }

    public function update(AuthContext $auth, string $id, array $values, string $ip): array
    {
        $current = $this->one($auth, $id);
        $name = Validator::required((string) ($values['name'] ?? $current['name']), 'Le libellé est obligatoire.');
        $status = (string) ($values['status'] ?? $current['status']) ?: 'Brouillon';
        $layout = array_key_exists('layout', $values) ? (string) $values['layout'] : (string) $current['layout'];
        $html = array_key_exists('html', $values) ? (string) $values['html'] : (string) $current['html'];
        $this->pdo->prepare(
            'UPDATE document_templates SET name = :name, status = :status, layout_json = :layout_json, html = :html
             WHERE id = :id AND company_id = :company_id',
        )->execute([
            'name' => $name,
            'status' => $status,
            'layout_json' => $layout,
            'html' => $html,
            'id' => $id,
            'company_id' => $auth->companyId,
        ]);
        $this->audit->record($auth, 'document.update', 'configuration', 'modeles-documents', 'document', $id, $name, $ip);
        return $this->one($auth, $id);
    }

    public function delete(AuthContext $auth, string $id, string $ip): void
    {
        $this->one($auth, $id);
        $this->pdo->prepare('DELETE FROM document_templates WHERE id = :id AND company_id = :company_id')
            ->execute(['id' => $id, 'company_id' => $auth->companyId]);
        $this->audit->record($auth, 'document.delete', 'configuration', 'modeles-documents', 'document', $id, '', $ip);
    }

    private function one(AuthContext $auth, string $id): array
    {
        $stmt = $this->pdo->prepare('SELECT * FROM document_templates WHERE id = :id AND company_id = :company_id LIMIT 1');
        $stmt->execute(['id' => $id, 'company_id' => $auth->companyId]);
        $row = $stmt->fetch();
        if (!$row) {
            throw HttpException::notFound('Modèle introuvable.');
        }
        return RecordMapper::document($row);
    }
}
