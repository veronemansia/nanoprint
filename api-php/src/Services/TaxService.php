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

final class TaxService
{
    public function __construct(
        private readonly PDO $pdo,
        private readonly AuditLogger $audit,
    ) {
    }

    /** @return list<array<string, mixed>> */
    public function list(AuthContext $auth): array
    {
        $stmt = $this->pdo->prepare('SELECT * FROM taxes WHERE company_id = :id ORDER BY label');
        $stmt->execute(['id' => $auth->companyId]);
        return array_map(RecordMapper::tax(...), $stmt->fetchAll());
    }

    public function save(AuthContext $auth, array $payload, string $ip): array
    {
        $id = trim((string) ($payload['id'] ?? ''));
        $label = Validator::required((string) ($payload['label'] ?? ''), 'Le libellé est obligatoire.');
        $rate = Validator::nonNegative($payload['rate'] ?? 0, 'Saisissez un pourcentage valide.');
        $active = array_key_exists('active', $payload) ? (bool) $payload['active'] : true;
        $code = trim((string) ($payload['code'] ?? ''));
        $note = trim((string) ($payload['note'] ?? ''));

        if ($id === '') {
            $id = Uuid::v4();
            $this->pdo->prepare(
                'INSERT INTO taxes (id, company_id, label, rate, active, code, note) VALUES (:id, :company_id, :label, :rate, :active, :code, :note)',
            )->execute([
                'id' => $id,
                'company_id' => $auth->companyId,
                'label' => $label,
                'rate' => $rate,
                'active' => $active ? 1 : 0,
                'code' => $code,
                'note' => $note,
            ]);
            $this->audit->record($auth, 'tax.create', 'configuration', 'taxes', 'tax', $id, $label, $ip);
        } else {
            $this->mustExist($auth, $id);
            $this->pdo->prepare(
                'UPDATE taxes SET label = :label, rate = :rate, active = :active, code = :code, note = :note
                 WHERE id = :id AND company_id = :company_id',
            )->execute([
                'label' => $label,
                'rate' => $rate,
                'active' => $active ? 1 : 0,
                'code' => $code,
                'note' => $note,
                'id' => $id,
                'company_id' => $auth->companyId,
            ]);
            $this->audit->record($auth, 'tax.update', 'configuration', 'taxes', 'tax', $id, $label, $ip);
        }

        return $this->one($auth, $id);
    }

    public function delete(AuthContext $auth, string $id, string $ip): void
    {
        $row = $this->one($auth, $id);
        $this->pdo->prepare('DELETE FROM taxes WHERE id = :id AND company_id = :company_id')
            ->execute(['id' => $id, 'company_id' => $auth->companyId]);
        $this->audit->record($auth, 'tax.delete', 'configuration', 'taxes', 'tax', $id, (string) $row['label'], $ip);
    }

    public function reset(AuthContext $auth, string $ip): array
    {
        $this->pdo->prepare('DELETE FROM taxes WHERE company_id = :id')->execute(['id' => $auth->companyId]);
        $stmt = $this->pdo->prepare(
            'INSERT INTO taxes (id, company_id, label, rate, active, code, note) VALUES (:id, :company_id, :label, :rate, :active, :code, :note)',
        );
        foreach ([
            [Uuid::v4(), 'TVA', 18, 1, 'TVA', 'Taxe sur la valeur ajoutée'],
            [Uuid::v4(), 'Taxe parafiscale', 1, 0, 'TPF', 'Contribution parafiscale'],
        ] as $item) {
            $stmt->execute([
                'id' => $item[0],
                'company_id' => $auth->companyId,
                'label' => $item[1],
                'rate' => $item[2],
                'active' => $item[3],
                'code' => $item[4],
                'note' => $item[5],
            ]);
        }
        $this->audit->record($auth, 'tax.reset', 'configuration', 'taxes', 'tax', '', 'Taxes restaurées', $ip);
        return $this->list($auth);
    }

    private function one(AuthContext $auth, string $id): array
    {
        $stmt = $this->pdo->prepare('SELECT * FROM taxes WHERE id = :id AND company_id = :company_id LIMIT 1');
        $stmt->execute(['id' => $id, 'company_id' => $auth->companyId]);
        $row = $stmt->fetch();
        if (!$row) {
            throw HttpException::notFound('Taxe introuvable.');
        }
        return RecordMapper::tax($row);
    }

    private function mustExist(AuthContext $auth, string $id): void
    {
        $stmt = $this->pdo->prepare('SELECT id FROM taxes WHERE id = :id AND company_id = :company_id LIMIT 1');
        $stmt->execute(['id' => $id, 'company_id' => $auth->companyId]);
        if (!$stmt->fetch()) {
            throw HttpException::notFound('Taxe introuvable.');
        }
    }
}
