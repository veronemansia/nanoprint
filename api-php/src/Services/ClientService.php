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

final class ClientService
{
    private const STATUSES = ['Actif', 'Prospect', 'Inactif'];
    private const TYPES = ['Particulier', 'Entreprise'];

    public function __construct(
        private readonly PDO $pdo,
        private readonly AuditLogger $audit,
    ) {
    }

    /** @return list<array<string, mixed>> */
    public function list(AuthContext $auth): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT * FROM clients WHERE company_id = :id ORDER BY updated_at DESC, name',
        );
        $stmt->execute(['id' => $auth->companyId]);
        return array_map(RecordMapper::client(...), $stmt->fetchAll());
    }

    public function create(AuthContext $auth, array $values, string $ip): array
    {
        $parsed = $this->validated($values);
        $id = trim((string) ($values['id'] ?? '')) ?: Uuid::v4();
        $reference = trim((string) ($values['reference'] ?? '')) ?: $this->nextReference($auth->companyId);
        $this->insertRow($auth->companyId, $id, $reference, $parsed);
        if ($parsed['sector'] !== '') {
            $this->ensureSector($auth, $parsed['sector'], $ip);
        }
        $this->audit->record($auth, 'client.create', 'clients', 'fiches-clients', 'client', $id, $reference . ' · ' . $parsed['name'], $ip);
        return $this->one($auth, $id);
    }

    public function update(AuthContext $auth, string $id, array $values, string $ip): array
    {
        $row = $this->mustExist($auth, $id);
        $parsed = $this->validated($values, $row);
        $this->pdo->prepare(
            'UPDATE clients SET
                name = :name, client_type = :client_type, status = :status, sector = :sector,
                legal_name = :legal_name, legal_form = :legal_form, ninea = :ninea, rccm = :rccm,
                contact = :contact, email = :email, phone = :phone, website = :website,
                address = :address, city = :city, country = :country, discount = :discount, notes = :notes
             WHERE id = :id AND company_id = :company_id',
        )->execute([
            ...$parsed,
            'id' => $id,
            'company_id' => $auth->companyId,
        ]);
        if ($parsed['sector'] !== '') {
            $this->ensureSector($auth, $parsed['sector'], $ip);
        }
        $this->audit->record($auth, 'client.update', 'clients', 'fiches-clients', 'client', $id, $parsed['name'], $ip);
        return $this->one($auth, $id);
    }

    public function delete(AuthContext $auth, string $id, string $ip): void
    {
        $row = $this->mustExist($auth, $id);
        $linked = $this->pdo->prepare(
            'SELECT 1 FROM quotes WHERE company_id = :company_id AND client_id = :id
             UNION ALL
             SELECT 1 FROM orders WHERE company_id = :company_id2 AND client_id = :id2
             LIMIT 1',
        );
        $linked->execute([
            'company_id' => $auth->companyId,
            'id' => $id,
            'company_id2' => $auth->companyId,
            'id2' => $id,
        ]);
        if ($linked->fetchColumn()) {
            throw HttpException::conflict('Impossible de supprimer ce client : des devis ou commandes y sont rattachés.');
        }
        $this->pdo->prepare('DELETE FROM clients WHERE id = :id AND company_id = :company_id')
            ->execute(['id' => $id, 'company_id' => $auth->companyId]);
        $this->audit->record(
            $auth,
            'client.delete',
            'clients',
            'fiches-clients',
            'client',
            $id,
            (string) $row['reference'] . ' · ' . (string) $row['name'],
            $ip,
        );
    }

    /**
     * @return array{devis: list<array<string, mixed>>, commandes: list<array<string, mixed>>, factures: list<array<string, mixed>>, acomptes: list<array<string, mixed>>}
     */
    public function history(AuthContext $auth, string $id): array
    {
        $this->mustExist($auth, $id);
        $quotes = $this->pdo->prepare(
            'SELECT q.*, c.name AS client_name
             FROM quotes q
             INNER JOIN clients c ON c.id = q.client_id
             WHERE q.company_id = :company_id AND q.client_id = :client_id
             ORDER BY q.updated_at DESC',
        );
        $quotes->execute(['company_id' => $auth->companyId, 'client_id' => $id]);
        $orders = $this->pdo->prepare(
            'SELECT o.*, c.name AS client_name
             FROM orders o
             INNER JOIN clients c ON c.id = o.client_id
             WHERE o.company_id = :company_id AND o.client_id = :client_id
             ORDER BY o.updated_at DESC',
        );
        $orders->execute(['company_id' => $auth->companyId, 'client_id' => $id]);
        $invoices = $this->pdo->prepare(
            'SELECT i.*, o.reference AS order_ref, o.client_id AS client_id, c.name AS client_name
             FROM invoices i
             INNER JOIN orders o ON o.id = i.order_id
             INNER JOIN clients c ON c.id = o.client_id
             WHERE i.company_id = :company_id AND o.client_id = :client_id
             ORDER BY i.issued_at DESC, i.updated_at DESC',
        );
        $invoices->execute(['company_id' => $auth->companyId, 'client_id' => $id]);
        $deposits = $this->pdo->prepare(
            'SELECT d.*, o.reference AS order_ref, o.amount AS order_amount, o.client_id AS client_id, c.name AS client_name
             FROM order_deposits d
             INNER JOIN orders o ON o.id = d.order_id
             INNER JOIN clients c ON c.id = o.client_id
             WHERE d.company_id = :company_id AND o.client_id = :client_id
             ORDER BY d.updated_at DESC',
        );
        $deposits->execute(['company_id' => $auth->companyId, 'client_id' => $id]);
        return [
            'devis' => array_map(RecordMapper::quote(...), $quotes->fetchAll()),
            'commandes' => array_map(RecordMapper::order(...), $orders->fetchAll()),
            'factures' => array_map(RecordMapper::invoice(...), $invoices->fetchAll()),
            'acomptes' => array_map(RecordMapper::deposit(...), $deposits->fetchAll()),
        ];
    }

    /** @param list<string> $ids */
    public function assignSector(AuthContext $auth, array $ids, string $sector, string $ip): array
    {
        $sector = Validator::required($sector, 'Choisissez un secteur d’activité.');
        $this->ensureSector($auth, $sector, $ip);
        $ids = array_values(array_unique(array_filter(array_map(static fn($id) => trim((string) $id), $ids))));
        if (!$ids) {
            throw HttpException::unprocessable('Sélectionnez au moins un particulier ou une entreprise.');
        }
        $stmt = $this->pdo->prepare(
            'UPDATE clients SET sector = :sector WHERE id = :id AND company_id = :company_id',
        );
        $updated = [];
        foreach ($ids as $id) {
            $row = $this->find($auth, $id);
            if (!$row) {
                continue;
            }
            $stmt->execute(['sector' => $sector, 'id' => $id, 'company_id' => $auth->companyId]);
            $updated[] = (string) $row['name'];
        }
        if (!$updated) {
            throw HttpException::unprocessable('Aucun client à affecter.');
        }
        $this->audit->record(
            $auth,
            'client.assign_sector',
            'clients',
            'segmentation',
            'client',
            implode(',', $ids),
            $sector . ' · ' . implode(', ', $updated),
            $ip,
        );
        return $this->list($auth);
    }

    /** @return list<string> */
    public function sectors(AuthContext $auth): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT name FROM client_sectors WHERE company_id = :id ORDER BY sort_order, name',
        );
        $stmt->execute(['id' => $auth->companyId]);
        return array_map(static fn(array $row) => (string) $row['name'], $stmt->fetchAll());
    }

    public function addSector(AuthContext $auth, string $name, string $ip): string
    {
        $name = Validator::required($name, 'Le libellé du secteur est obligatoire.');
        $this->ensureSector($auth, $name, $ip);
        return $name;
    }

    public function renameSector(AuthContext $auth, string $from, string $to, string $ip): string
    {
        $from = Validator::required($from, 'Libellé source manquant.');
        $to = Validator::required($to, 'Le nouveau libellé est obligatoire.');
        $row = $this->findSector($auth, $from);
        $this->assertSectorUnique($auth, $to, (string) $row['id']);
        $this->pdo->prepare(
            'UPDATE client_sectors SET name = :name WHERE id = :id AND company_id = :company_id',
        )->execute(['name' => $to, 'id' => $row['id'], 'company_id' => $auth->companyId]);
        $this->pdo->prepare(
            'UPDATE clients SET sector = :to WHERE company_id = :company_id AND sector = :from',
        )->execute(['to' => $to, 'company_id' => $auth->companyId, 'from' => $from]);
        $this->audit->record($auth, 'client-sectors.rename', 'clients', 'segmentation', 'sector', (string) $row['id'], $from . ' → ' . $to, $ip);
        return $to;
    }

    public function deleteSector(AuthContext $auth, string $name, string $ip): string
    {
        $name = Validator::required($name, 'Libellé manquant.');
        $row = $this->findSector($auth, $name);
        $this->pdo->prepare(
            'UPDATE clients SET sector = :empty WHERE company_id = :company_id AND sector = :name',
        )->execute(['empty' => '', 'company_id' => $auth->companyId, 'name' => $name]);
        $this->pdo->prepare('DELETE FROM client_sectors WHERE id = :id AND company_id = :company_id')
            ->execute(['id' => $row['id'], 'company_id' => $auth->companyId]);
        $this->audit->record($auth, 'client-sectors.delete', 'clients', 'segmentation', 'sector', (string) $row['id'], $name, $ip);
        return $name;
    }

    public function nextReference(string $companyId): string
    {
        $stmt = $this->pdo->prepare(
            'SELECT reference FROM clients WHERE company_id = :id AND reference LIKE :prefix',
        );
        $stmt->execute(['id' => $companyId, 'prefix' => 'CLI-%']);
        $max = 0;
        foreach ($stmt->fetchAll() as $row) {
            if (preg_match('/^CLI-(\d+)$/', (string) $row['reference'], $m)) {
                $max = max($max, (int) $m[1]);
            }
        }
        return 'CLI-' . str_pad((string) ($max + 1), 4, '0', STR_PAD_LEFT);
    }

    /** @param array<string, mixed> $parsed */
    private function insertRow(string $companyId, string $id, string $reference, array $parsed): void
    {
        $this->pdo->prepare(
            'INSERT INTO clients (
                id, company_id, reference, name, client_type, status, sector,
                legal_name, legal_form, ninea, rccm, contact, email, phone, website,
                address, city, country, discount, notes
             ) VALUES (
                :id, :company_id, :reference, :name, :client_type, :status, :sector,
                :legal_name, :legal_form, :ninea, :rccm, :contact, :email, :phone, :website,
                :address, :city, :country, :discount, :notes
             )',
        )->execute([
            'id' => $id,
            'company_id' => $companyId,
            'reference' => $reference,
            ...$parsed,
        ]);
    }

    /** @return array<string, mixed> */
    private function validated(array $values, array $existing = []): array
    {
        $type = trim((string) ($values['clientType'] ?? $existing['client_type'] ?? 'Entreprise'));
        if (!in_array($type, self::TYPES, true)) {
            throw HttpException::unprocessable('Type de client invalide.');
        }
        $nameMessage = $type === 'Particulier' ? 'Le nom complet est obligatoire.' : 'Le nom commercial est obligatoire.';
        $name = Validator::required((string) ($values['name'] ?? ''), $nameMessage);
        $phone = Validator::required((string) ($values['phone'] ?? ''), 'Le téléphone est obligatoire.');
        $address = Validator::required((string) ($values['address'] ?? ''), 'L’adresse est obligatoire.');
        $contact = trim((string) ($values['contact'] ?? ''));
        if ($type === 'Entreprise') {
            $contact = Validator::required($contact, 'Le contact principal est obligatoire.');
        } else {
            $contact = $contact !== '' ? $contact : $name;
        }
        $discount = Validator::nonNegative($values['discount'] ?? 0, 'La remise éventuelle doit être un pourcentage entre 0 et 100.');
        if ($discount > 100) {
            throw HttpException::unprocessable('La remise éventuelle doit être un pourcentage entre 0 et 100.');
        }
        $email = $this->optionalEmail((string) ($values['email'] ?? ''));
        $status = $this->status((string) ($values['status'] ?? ($existing['status'] ?? 'Actif')));
        $isCompany = $type === 'Entreprise';
        return [
            'name' => $name,
            'client_type' => $type,
            'status' => $status,
            'sector' => trim((string) ($values['sector'] ?? ($existing['sector'] ?? ''))),
            'legal_name' => $isCompany ? trim((string) ($values['legalName'] ?? '')) : '',
            'legal_form' => $isCompany ? trim((string) ($values['legalForm'] ?? '')) : '',
            'ninea' => $isCompany ? trim((string) ($values['ninea'] ?? '')) : '',
            'rccm' => $isCompany ? trim((string) ($values['rccm'] ?? '')) : '',
            'contact' => $contact,
            'email' => $email,
            'phone' => $phone,
            'website' => $isCompany ? trim((string) ($values['website'] ?? '')) : '',
            'address' => $address,
            'city' => trim((string) ($values['city'] ?? '')),
            'country' => trim((string) ($values['country'] ?? 'Sénégal')),
            'discount' => $discount,
            'notes' => trim((string) ($values['notes'] ?? '')),
        ];
    }

    private function status(string $status): string
    {
        $status = trim($status);
        if (!in_array($status, self::STATUSES, true)) {
            throw HttpException::unprocessable('Statut client invalide.');
        }
        return $status;
    }

    private function optionalEmail(string $email): string
    {
        $email = trim($email);
        if ($email === '') {
            return '';
        }
        return Validator::email($email, 'Saisissez un e-mail valide, ou laissez le champ vide.');
    }

    private function ensureSector(AuthContext $auth, string $name, string $ip): void
    {
        $existing = $this->sectors($auth);
        if (in_array($name, $existing, true)) {
            return;
        }
        $this->assertSectorUnique($auth, $name, null);
        $id = Uuid::v4();
        $this->pdo->prepare(
            'INSERT INTO client_sectors (id, company_id, name, sort_order) VALUES (:id, :company_id, :name, :sort_order)',
        )->execute([
            'id' => $id,
            'company_id' => $auth->companyId,
            'name' => $name,
            'sort_order' => count($existing),
        ]);
        $this->audit->record($auth, 'client-sectors.create', 'clients', 'segmentation', 'sector', $id, $name, $ip);
    }

    /** @return array<string, mixed> */
    private function findSector(AuthContext $auth, string $name): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT * FROM client_sectors WHERE company_id = :company_id AND name = :name LIMIT 1',
        );
        $stmt->execute(['company_id' => $auth->companyId, 'name' => $name]);
        $row = $stmt->fetch();
        if (!$row) {
            throw HttpException::notFound('Secteur introuvable.');
        }
        return $row;
    }

    private function assertSectorUnique(AuthContext $auth, string $name, ?string $ignoreId): void
    {
        $sql = 'SELECT id FROM client_sectors WHERE company_id = :company_id AND name = :name';
        $params = ['company_id' => $auth->companyId, 'name' => $name];
        if ($ignoreId) {
            $sql .= ' AND id <> :id';
            $params['id'] = $ignoreId;
        }
        $stmt = $this->pdo->prepare($sql . ' LIMIT 1');
        $stmt->execute($params);
        if ($stmt->fetch()) {
            throw HttpException::conflict('Ce secteur existe déjà.');
        }
    }

    /** @return array<string, mixed> */
    private function one(AuthContext $auth, string $id): array
    {
        $row = $this->mustExist($auth, $id);
        return RecordMapper::client($row);
    }

    /** @return array<string, mixed> */
    private function mustExist(AuthContext $auth, string $id): array
    {
        $row = $this->find($auth, $id);
        if (!$row) {
            throw HttpException::notFound('Client introuvable.');
        }
        return $row;
    }

    /** @return array<string, mixed>|null */
    private function find(AuthContext $auth, string $id): ?array
    {
        $stmt = $this->pdo->prepare(
            'SELECT * FROM clients WHERE id = :id AND company_id = :company_id LIMIT 1',
        );
        $stmt->execute(['id' => $id, 'company_id' => $auth->companyId]);
        $row = $stmt->fetch();
        return $row ?: null;
    }
}
