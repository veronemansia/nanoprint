<?php

declare(strict_types=1);

namespace NanoPrint\Install;

use NanoPrint\Support\Uuid;
use PDO;

final class SeedClients
{
    public const SECTORS = [
        'Entreprises',
        'Particuliers',
        'Écoles',
        'Restaurants',
        'Hôtels',
        'Associations',
        'Agences de communication',
        'Administrations',
    ];

    public function __construct(private readonly PDO $pdo)
    {
    }

    public function seedForCompany(string $companyId): void
    {
        $count = $this->pdo->prepare('SELECT COUNT(*) FROM clients WHERE company_id = :id');
        $count->execute(['id' => $companyId]);
        if ((int) $count->fetchColumn() > 0) {
            return;
        }

        $this->insertSectors($companyId);

        $clients = [
            ['Baobab Distribution', 'CLI-0241', 'Actif', 'Entreprise', 'Entreprises', 'Baobab Distribution SA', 'SA', '0041287 3B2', 'SN-DKR-2014-B-441', 'Mariam Sow', 'm.sow@baobab-distribution.sn', '+221 77 645 12 08', 'https://www.baobab-distribution.sn', 'Entrepôt quai 4', 'Diamniadio', 'Sénégal', 5, 'Grand compte. BAT toujours validé par Mariam.'],
            ['Studio Kër', 'CLI-0238', 'Actif', 'Entreprise', 'Agences de communication', 'Studio Kër SARL', 'SARL', '0059012 1A1', 'SN-DKR-2019-B-882', 'Lamine Fall', 'lamine@studioker.sn', '+221 76 812 44 19', 'https://studioker.sn', 'Sacré-Cœur 3', 'Dakar', 'Sénégal', 8, 'Agence créative. Preflight RGB systématique. Remise agence −8 %.'],
            ['Horizon Santé', 'CLI-0232', 'Prospect', 'Entreprise', 'Entreprises', 'Horizon Santé SA', 'SA', '0033441 2C1', 'SN-DKR-2016-B-210', 'Dr Aminata Touré', 'a.toure@horizon-sante.sn', '+221 33 824 90 11', '', 'Avenue Cheikh Anta Diop', 'Dakar', 'Sénégal', 0, 'Marché prévention. Acompte 30 % demandé.'],
            ['Aïssatou Ndiaye', 'CLI-0244', 'Actif', 'Particulier', 'Particuliers', '', '', '', '', 'Aïssatou Ndiaye', 'aissatou.ndiaye@gmail.com', '+221 77 512 88 40', '', 'Cité Keur Gorgui, villa 18', 'Dakar', 'Sénégal', 0, 'Cartes de visite personnelles. Paiement comptant.'],
            ['Mamadou Ba', 'CLI-0243', 'Prospect', 'Particulier', 'Particuliers', '', '', '', '', 'Mamadou Ba', '', '+221 78 221 09 17', '', 'Guédiawaye, unit 9', 'Guédiawaye', 'Sénégal', 2, 'Faire-part mariage. Relancer pour le BAT.'],
            ['Teranga Finance', 'CLI-0227', 'Actif', 'Entreprise', 'Entreprises', 'Teranga Finance SA', 'SA', '0028765 4A3', 'SN-DKR-2011-B-055', 'Cheikh Ndiaye', 'c.ndiaye@teranga-finance.sn', '+221 77 501 33 90', 'https://www.teranga-finance.sn', 'Place de l’Indépendance', 'Dakar', 'Sénégal', 3, 'Rapport annuel 80 pages. Relances R2 en août.'],
            ['Mairie de Rufisque', 'CLI-0219', 'Inactif', 'Entreprise', 'Administrations', 'Commune de Rufisque', 'Collectivité', '0011002 9P1', '—', 'Service communication', 'com@mairie-rufisque.sn', '+221 33 836 00 24', '', 'Hôtel de ville', 'Rufisque', 'Sénégal', 0, 'Dernière commande : affiches 2024.'],
            ['Fatou Seck', 'CLI-0215', 'Inactif', 'Particulier', 'Particuliers', '', '', '', '', 'Fatou Seck', 'fatou.seck@orange.sn', '+221 70 844 33 21', '', 'Ouakam, cité Avion', 'Dakar', 'Sénégal', 0, 'Calendrier mural 2024. Pas de suite.'],
        ];

        $ids = [];
        $stmt = $this->pdo->prepare(
            'INSERT INTO clients (
                id, company_id, reference, name, client_type, status, sector,
                legal_name, legal_form, ninea, rccm, contact, email, phone, website,
                address, city, country, discount, notes
             ) VALUES (
                :id, :company_id, :reference, :name, :client_type, :status, :sector,
                :legal_name, :legal_form, :ninea, :rccm, :contact, :email, :phone, :website,
                :address, :city, :country, :discount, :notes
             )',
        );
        foreach ($clients as $item) {
            $id = Uuid::v4();
            $ids[$item[1]] = $id;
            $stmt->execute([
                'id' => $id,
                'company_id' => $companyId,
                'name' => $item[0],
                'reference' => $item[1],
                'status' => $item[2],
                'client_type' => $item[3],
                'sector' => $item[4],
                'legal_name' => $item[5],
                'legal_form' => $item[6],
                'ninea' => $item[7],
                'rccm' => $item[8],
                'contact' => $item[9],
                'email' => $item[10],
                'phone' => $item[11],
                'website' => $item[12],
                'address' => $item[13],
                'city' => $item[14],
                'country' => $item[15],
                'discount' => $item[16],
                'notes' => $item[17],
            ]);
        }

        $contacts = [
            ['CTC-001', 'CLI-0241', 'Mariam Sow', 'Validation BAT', 'm.sow@baobab-distribution.sn', '+221 77 645 12 08', 'Actif'],
            ['CTC-002', 'CLI-0241', 'Sarah Ndiaye', 'Responsable marketing', 's.ndiaye@baobab-distribution.sn', '+221 77 645 12 18', 'Actif'],
            ['CTC-003', 'CLI-0241', 'Paul Sarr', 'Responsable comptabilité', 'compta@baobab-distribution.sn', '+221 33 800 12 40', 'Actif'],
            ['CTC-004', 'CLI-0241', 'Michel Dieng', 'Responsable livraison', 'logistique@baobab-distribution.sn', '+221 77 200 18 44', 'Actif'],
            ['CTC-005', 'CLI-0241', 'Jean Ba', 'Direction', 'j.ba@baobab-distribution.sn', '+221 77 645 12 01', 'Actif'],
            ['CTC-006', 'CLI-0238', 'Lamine Fall', 'Direction', 'lamine@studioker.sn', '+221 76 812 44 19', 'Actif'],
            ['CTC-007', 'CLI-0238', 'Aïcha Kane', 'Responsable comptabilité', 'admin@studioker.sn', '+221 33 821 09 55', 'Actif'],
            ['CTC-008', 'CLI-0232', 'Dr Aminata Touré', 'Validation BAT', 'a.toure@horizon-sante.sn', '+221 33 824 90 11', 'Actif'],
            ['CTC-009', 'CLI-0227', 'Cheikh Ndiaye', 'Responsable comptabilité', 'c.ndiaye@teranga-finance.sn', '+221 77 501 33 90', 'Archivé'],
        ];
        $cstmt = $this->pdo->prepare(
            'INSERT INTO client_contacts (id, company_id, client_id, reference, name, role, email, phone, status)
             VALUES (:id, :company_id, :client_id, :reference, :name, :role, :email, :phone, :status)',
        );
        foreach ($contacts as $item) {
            $clientId = $ids[$item[1]] ?? null;
            if (!$clientId) {
                continue;
            }
            $cstmt->execute([
                'id' => Uuid::v4(),
                'company_id' => $companyId,
                'client_id' => $clientId,
                'reference' => $item[0],
                'name' => $item[2],
                'role' => $item[3],
                'email' => $item[4],
                'phone' => $item[5],
                'status' => $item[6],
            ]);
        }
    }

    public function insertSectors(string $companyId): void
    {
        $existing = $this->pdo->prepare('SELECT COUNT(*) FROM client_sectors WHERE company_id = :id');
        $existing->execute(['id' => $companyId]);
        if ((int) $existing->fetchColumn() > 0) {
            return;
        }
        $stmt = $this->pdo->prepare(
            'INSERT INTO client_sectors (id, company_id, name, sort_order) VALUES (:id, :company_id, :name, :sort_order)',
        );
        foreach (self::SECTORS as $index => $name) {
            $stmt->execute([
                'id' => Uuid::v4(),
                'company_id' => $companyId,
                'name' => $name,
                'sort_order' => $index,
            ]);
        }
    }
}
