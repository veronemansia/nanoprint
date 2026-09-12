<?php

declare(strict_types=1);

namespace NanoPrint\Support;

final class Modules
{
    public const IDS = [
        'configuration',
        'utilisateurs',
        'clients',
        'devis-commandes',
        'prepress',
        'planification',
        'achats',
        'stocks',
        'machines',
        'livraisons',
        'facturation',
        'ressources-humaines',
        'communication',
        'reporting',
    ];

    public const DEFAULT_ROLES = [
        'Administrateur' => 'full',
        'Commercial' => ['clients', 'devis-commandes', 'facturation', 'communication'],
        'Opérateur' => ['prepress', 'planification', 'machines', 'stocks'],
        'Comptable' => ['facturation', 'reporting', 'clients-read'],
    ];
}
