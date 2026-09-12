<?php

declare(strict_types=1);

namespace NanoPrint\Config;

final class Env
{
    /** @var array<string, string> */
    private static array $values = [];

    public static function load(string $path): void
    {
        if (!is_file($path)) {
            return;
        }
        $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [];
        foreach ($lines as $line) {
            $line = trim($line);
            if ($line === '' || str_starts_with($line, '#')) {
                continue;
            }
            [$key, $value] = array_pad(explode('=', $line, 2), 2, '');
            $key = trim($key);
            $value = trim($value);
            if ($key !== '') {
                self::$values[$key] = $value;
            }
        }
    }

    public static function get(string $key, string $default = ''): string
    {
        if (array_key_exists($key, self::$values)) {
            return self::$values[$key];
        }
        $fromEnv = getenv($key);
        return $fromEnv === false ? $default : (string) $fromEnv;
    }

    public static function int(string $key, int $default): int
    {
        $value = self::get($key, (string) $default);
        return is_numeric($value) ? (int) $value : $default;
    }
}
