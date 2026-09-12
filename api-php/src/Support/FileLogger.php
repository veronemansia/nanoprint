<?php

declare(strict_types=1);

namespace NanoPrint\Support;

final class FileLogger
{
    public static function info(string $action, string $detail = '', array $context = []): void
    {
        self::write('INFO', $action, $detail, $context);
    }

    public static function error(string $action, string $detail = '', array $context = []): void
    {
        self::write('ERROR', $action, $detail, $context);
    }

    private static function write(string $level, string $action, string $detail, array $context): void
    {
        $dir = dirname(__DIR__, 2) . '/storage/logs';
        if (!is_dir($dir)) {
            mkdir($dir, 0775, true);
        }
        $safe = $context;
        unset($safe['password'], $safe['password_hash'], $safe['token']);
        $line = sprintf(
            "[%s] %s %s %s %s\n",
            date('c'),
            $level,
            $action,
            $detail,
            $safe ? json_encode($safe, JSON_UNESCAPED_UNICODE) : '',
        );
        file_put_contents($dir . '/app-' . date('Y-m-d') . '.log', $line, FILE_APPEND | LOCK_EX);
    }
}
