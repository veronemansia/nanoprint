<?php

declare(strict_types=1);

namespace NanoPrint\Support;

final class Dates
{
    private const MONTHS = [
        1 => 'janv.', 2 => 'févr.', 3 => 'mars', 4 => 'avr.', 5 => 'mai', 6 => 'juin',
        7 => 'juil.', 8 => 'août', 9 => 'sept.', 10 => 'oct.', 11 => 'nov.', 12 => 'déc.',
    ];

    public static function display(?string $datetime): string
    {
        if (!$datetime) {
            return 'À l’instant';
        }
        $ts = strtotime($datetime);
        if ($ts === false) {
            return 'À l’instant';
        }
        if (time() - $ts < 180) {
            return 'À l’instant';
        }
        $month = self::MONTHS[(int) date('n', $ts)] ?? date('M', $ts);
        return date('d', $ts) . ' ' . $month . ' ' . date('Y', $ts);
    }
}
