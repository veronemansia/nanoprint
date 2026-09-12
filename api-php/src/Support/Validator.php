<?php

declare(strict_types=1);

namespace NanoPrint\Support;

use NanoPrint\Http\HttpException;

final class Validator
{
    public static function required(string $value, string $message): string
    {
        $value = trim($value);
        if ($value === '') {
            throw HttpException::unprocessable($message);
        }
        return $value;
    }

    public static function email(string $value, string $message = 'Saisissez une adresse e-mail valide.'): string
    {
        $value = strtolower(trim($value));
        if (!filter_var($value, FILTER_VALIDATE_EMAIL)) {
            throw HttpException::unprocessable($message);
        }
        return $value;
    }

    public static function money(mixed $value, string $message): float
    {
        if (is_string($value)) {
            $value = str_replace(',', '.', $value);
        }
        if (!is_numeric($value) || (float) $value < 0) {
            throw HttpException::unprocessable($message);
        }
        return round((float) $value, 3);
    }

    public static function nonNegative(mixed $value, string $message): float
    {
        return self::money($value, $message);
    }
}
