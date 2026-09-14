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

final class MaterialService
{
    public function __construct(
        private readonly PDO $pdo,
        private readonly AuditLogger $audit,
        private readonly LookupService $lookups,
    ) {
    }

    /** @return list<array<string, mixed>> */
    public function list(AuthContext $auth): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT m.*, t.name AS type_name, u.name AS unit_name
             FROM materials m
             INNER JOIN material_types t ON t.id = m.type_id
             INNER JOIN material_units u ON u.id = m.unit_id
             WHERE m.company_id = :id
             ORDER BY m.updated_at DESC, m.name',
        );
        $stmt->execute(['id' => $auth->companyId]);
        return array_map(RecordMapper::material(...), $stmt->fetchAll());
    }

    public function create(AuthContext $auth, array $values, string $ip): array
    {
        $name = Validator::required((string) ($values['name'] ?? ''), 'Le libellé est obligatoire.');
        $type = Validator::required((string) ($values['type'] ?? ''), 'Choisissez ou créez un type de matière.');
        $unit = Validator::required((string) ($values['unit'] ?? ''), 'Choisissez ou créez une unité.');
        $buy = Validator::money($values['buyPrice'] ?? null, 'Saisissez un prix d’achat valide.');
        $sell = Validator::money($values['sellPrice'] ?? null, 'Saisissez un prix de vente valide.');
        $alert = Validator::nonNegative($values['alertQty'] ?? 0, 'La quantité d’alerte ne peut pas être négative.');

        $this->lookups->add($auth, 'material-types', $type, $ip);
        $this->lookups->add($auth, 'material-units', $unit, $ip);
        $typeId = $this->lookupId($auth, 'material_types', $type);
        $unitId = $this->lookupId($auth, 'material_units', $unit);

        $id = trim((string) ($values['id'] ?? '')) ?: Uuid::v4();
        $reference = (string) ($values['reference'] ?? RecordMapper::nextReference('MAT'));
        $this->pdo->prepare(
            'INSERT INTO materials (id, company_id, type_id, unit_id, name, reference, status, buy_price, sell_price, quantity, alert_qty)
             VALUES (:id, :company_id, :type_id, :unit_id, :name, :reference, :status, :buy_price, :sell_price, 0, :alert_qty)',
        )->execute([
            'id' => $id,
            'company_id' => $auth->companyId,
            'type_id' => $typeId,
            'unit_id' => $unitId,
            'name' => $name,
            'reference' => $reference,
            'status' => RecordMapper::stockStatus(0, $alert),
            'buy_price' => $buy,
            'sell_price' => $sell,
            'alert_qty' => $alert,
        ]);
        $this->audit->record($auth, 'material.create', 'configuration', 'matieres', 'material', $id, $reference, $ip);
        return $this->one($auth, $id);
    }

    public function update(AuthContext $auth, string $id, array $values, string $ip): array
    {
        $this->mustExist($auth, $id);
        $name = Validator::required((string) ($values['name'] ?? ''), 'Le libellé est obligatoire.');
        $type = Validator::required((string) ($values['type'] ?? ''), 'Choisissez ou créez un type de matière.');
        $unit = Validator::required((string) ($values['unit'] ?? ''), 'Choisissez ou créez une unité.');
        $buy = Validator::money($values['buyPrice'] ?? null, 'Saisissez un prix d’achat valide.');
        $sell = Validator::money($values['sellPrice'] ?? null, 'Saisissez un prix de vente valide.');
        $alert = Validator::nonNegative($values['alertQty'] ?? 0, 'La quantité d’alerte ne peut pas être négative.');

        $this->lookups->add($auth, 'material-types', $type, $ip);
        $this->lookups->add($auth, 'material-units', $unit, $ip);

        $this->pdo->prepare(
            'UPDATE materials SET type_id = :type_id, unit_id = :unit_id, name = :name, buy_price = :buy_price, sell_price = :sell_price, alert_qty = :alert_qty
             WHERE id = :id AND company_id = :company_id',
        )->execute([
            'type_id' => $this->lookupId($auth, 'material_types', $type),
            'unit_id' => $this->lookupId($auth, 'material_units', $unit),
            'name' => $name,
            'buy_price' => $buy,
            'sell_price' => $sell,
            'alert_qty' => $alert,
            'id' => $id,
            'company_id' => $auth->companyId,
        ]);
        $this->audit->record($auth, 'material.update', 'configuration', 'matieres', 'material', $id, $name, $ip);
        return $this->one($auth, $id);
    }

    public function delete(AuthContext $auth, string $id, string $ip): void
    {
        $row = $this->one($auth, $id);
        $linked = $this->pdo->prepare(
            'SELECT 1 FROM supply_lines WHERE company_id = :company_id AND material_id = :id LIMIT 1',
        );
        $linked->execute(['company_id' => $auth->companyId, 'id' => $id]);
        if ($linked->fetchColumn()) {
            throw HttpException::conflict('Impossible de supprimer cette matière : des approvisionnements y sont rattachés.');
        }
        foreach (['stock_movements', 'stock_alerts', 'inventory_lines'] as $table) {
            $check = $this->pdo->prepare(
                "SELECT 1 FROM {$table} WHERE company_id = :company_id AND article_kind = 'material' AND article_id = :id LIMIT 1",
            );
            $check->execute(['company_id' => $auth->companyId, 'id' => $id]);
            if ($check->fetchColumn()) {
                throw HttpException::conflict('Impossible de supprimer cette matière : des mouvements ou un inventaire y sont rattachés.');
            }
        }
        $this->pdo->prepare('DELETE FROM materials WHERE id = :id AND company_id = :company_id')
            ->execute(['id' => $id, 'company_id' => $auth->companyId]);
        $this->audit->record($auth, 'material.delete', 'configuration', 'matieres', 'material', $id, (string) $row['name'], $ip);
    }

    private function one(AuthContext $auth, string $id): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT m.*, t.name AS type_name, u.name AS unit_name
             FROM materials m
             INNER JOIN material_types t ON t.id = m.type_id
             INNER JOIN material_units u ON u.id = m.unit_id
             WHERE m.id = :id AND m.company_id = :company_id
             LIMIT 1',
        );
        $stmt->execute(['id' => $id, 'company_id' => $auth->companyId]);
        $row = $stmt->fetch();
        if (!$row) {
            throw HttpException::notFound('Matière introuvable.');
        }
        return RecordMapper::material($row);
    }

    private function mustExist(AuthContext $auth, string $id): void
    {
        $stmt = $this->pdo->prepare('SELECT id FROM materials WHERE id = :id AND company_id = :company_id LIMIT 1');
        $stmt->execute(['id' => $id, 'company_id' => $auth->companyId]);
        if (!$stmt->fetch()) {
            throw HttpException::notFound('Matière introuvable.');
        }
    }

    private function lookupId(AuthContext $auth, string $table, string $name): string
    {
        $stmt = $this->pdo->prepare("SELECT id FROM {$table} WHERE company_id = :company_id AND name = :name LIMIT 1");
        $stmt->execute(['company_id' => $auth->companyId, 'name' => $name]);
        $id = $stmt->fetchColumn();
        if (!$id) {
            throw HttpException::unprocessable('Référentiel introuvable.');
        }
        return (string) $id;
    }
}
