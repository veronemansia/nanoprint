<?php

declare(strict_types=1);

namespace NanoPrint\Services;

use NanoPrint\Auth\AuthContext;
use NanoPrint\Support\AuditLogger;
use NanoPrint\Support\RecordMapper;
use NanoPrint\Support\Uuid;
use PDO;

final class SettingsService
{
    public function __construct(
        private readonly PDO $pdo,
        private readonly AuditLogger $audit,
    ) {
    }

    public function get(AuthContext $auth): array
    {
        $stmt = $this->pdo->prepare('SELECT * FROM company_settings WHERE company_id = :id LIMIT 1');
        $stmt->execute(['id' => $auth->companyId]);
        $row = $stmt->fetch() ?: [];

        $currencies = $this->pdo->prepare('SELECT * FROM currencies WHERE company_id = :id ORDER BY sort_order, label');
        $currencies->execute(['id' => $auth->companyId]);

        $taxes = $this->pdo->prepare('SELECT * FROM taxes WHERE company_id = :id ORDER BY label');
        $taxes->execute(['id' => $auth->companyId]);

        return [
            'tradeName' => (string) ($row['trade_name'] ?? ''),
            'legalName' => (string) ($row['legal_name'] ?? ''),
            'legalForm' => (string) ($row['legal_form'] ?? ''),
            'ninea' => (string) ($row['ninea'] ?? ''),
            'rccm' => (string) ($row['rccm'] ?? ''),
            'address' => (string) ($row['address'] ?? ''),
            'city' => (string) ($row['city'] ?? ''),
            'country' => (string) ($row['country'] ?? ''),
            'phone' => (string) ($row['phone'] ?? ''),
            'email' => (string) ($row['email'] ?? ''),
            'website' => (string) ($row['website'] ?? ''),
            'iban' => (string) ($row['iban'] ?? ''),
            'bank' => (string) ($row['bank'] ?? ''),
            'logo' => (string) ($row['logo'] ?? ''),
            'workDays' => (string) ($row['work_days'] ?? ''),
            'openingHours' => (string) ($row['opening_hours'] ?? ''),
            'paperUnit' => (string) ($row['paper_unit'] ?? ''),
            'currencies' => array_map(RecordMapper::currency(...), $currencies->fetchAll()),
            'taxes' => array_map(RecordMapper::tax(...), $taxes->fetchAll()),
        ];
    }

    public function update(AuthContext $auth, array $payload, string $ip): array
    {
        $this->pdo->prepare(
            'UPDATE company_settings SET
                trade_name = :trade_name, legal_name = :legal_name, legal_form = :legal_form,
                ninea = :ninea, rccm = :rccm, address = :address, city = :city, country = :country,
                phone = :phone, email = :email, website = :website, iban = :iban, bank = :bank,
                logo = :logo, work_days = :work_days, opening_hours = :opening_hours, paper_unit = :paper_unit
             WHERE company_id = :company_id',
        )->execute([
            'trade_name' => trim((string) ($payload['tradeName'] ?? '')),
            'legal_name' => trim((string) ($payload['legalName'] ?? '')),
            'legal_form' => trim((string) ($payload['legalForm'] ?? '')),
            'ninea' => trim((string) ($payload['ninea'] ?? '')),
            'rccm' => trim((string) ($payload['rccm'] ?? '')),
            'address' => trim((string) ($payload['address'] ?? '')),
            'city' => trim((string) ($payload['city'] ?? '')),
            'country' => trim((string) ($payload['country'] ?? '')),
            'phone' => trim((string) ($payload['phone'] ?? '')),
            'email' => trim((string) ($payload['email'] ?? '')),
            'website' => trim((string) ($payload['website'] ?? '')),
            'iban' => trim((string) ($payload['iban'] ?? '')),
            'bank' => trim((string) ($payload['bank'] ?? '')),
            'logo' => (string) ($payload['logo'] ?? ''),
            'work_days' => trim((string) ($payload['workDays'] ?? '')),
            'opening_hours' => trim((string) ($payload['openingHours'] ?? '')),
            'paper_unit' => trim((string) ($payload['paperUnit'] ?? '')),
            'company_id' => $auth->companyId,
        ]);

        if (isset($payload['currencies']) && is_array($payload['currencies'])) {
            $this->replaceCurrencies($auth->companyId, $payload['currencies']);
        }

        $this->audit->record($auth, 'settings.update', 'configuration', 'parametres-generaux', 'settings', $auth->companyId, 'Paramètres généraux', $ip);
        return $this->get($auth);
    }

    public function resetIdentity(AuthContext $auth, string $ip): array
    {
        $this->pdo->prepare(
            'UPDATE company_settings SET
                trade_name = :trade_name, legal_name = :legal_name, legal_form = :legal_form,
                ninea = :ninea, rccm = :rccm, address = :address, city = :city, country = :country,
                phone = :phone, email = :email, website = :website, iban = :iban, bank = :bank,
                work_days = :work_days, opening_hours = :opening_hours, paper_unit = :paper_unit
             WHERE company_id = :company_id',
        )->execute([
            'trade_name' => 'NanoPrint',
            'legal_name' => 'NanoPrint SARL',
            'legal_form' => 'SARL',
            'ninea' => '0065432 2A2',
            'rccm' => 'SN-DKR-2018-B-1234',
            'address' => 'Zone industrielle Hann Bel-Air',
            'city' => 'Dakar',
            'country' => 'Sénégal',
            'phone' => '+221 33 800 00 00',
            'email' => 'contact@nanoprint.sn',
            'website' => 'https://www.nanoprint.sn',
            'iban' => 'SN08 SN010 01001 0123456789 12',
            'bank' => 'CBAO groupe Attijariwafa',
            'work_days' => 'Lundi – samedi',
            'opening_hours' => '07h30 – 18h30',
            'paper_unit' => 'Rame (500 feuilles) et feuille',
            'company_id' => $auth->companyId,
        ]);
        $this->audit->record($auth, 'settings.reset', 'configuration', 'parametres-generaux', 'settings', $auth->companyId, 'Restauration', $ip);
        return $this->get($auth);
    }

    /** @param list<array<string, mixed>> $items */
    private function replaceCurrencies(string $companyId, array $items): void
    {
        $this->pdo->prepare('DELETE FROM currencies WHERE company_id = :id')->execute(['id' => $companyId]);
        $stmt = $this->pdo->prepare(
            'INSERT INTO currencies (id, company_id, label, symbol, decimals, is_default, sort_order)
             VALUES (:id, :company_id, :label, :symbol, :decimals, :is_default, :sort_order)',
        );
        $hasDefault = false;
        foreach ($items as $index => $item) {
            $isDefault = !empty($item['isDefault']) && !$hasDefault;
            if ($isDefault) {
                $hasDefault = true;
            }
            $stmt->execute([
                'id' => (string) ($item['id'] ?? Uuid::v4()),
                'company_id' => $companyId,
                'label' => trim((string) ($item['label'] ?? 'Devise')),
                'symbol' => trim((string) ($item['symbol'] ?? '')),
                'decimals' => min(4, max(0, (int) ($item['decimals'] ?? 0))),
                'is_default' => $isDefault ? 1 : 0,
                'sort_order' => $index,
            ]);
        }
    }
}
