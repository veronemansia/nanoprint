<?php

declare(strict_types=1);

namespace NanoPrint\Http;

final class JsonResponse
{
    public static function send(int $status, mixed $payload): never
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        header('X-Content-Type-Options: nosniff');
        echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    public static function ok(mixed $data, int $status = 200): never
    {
        self::send($status, ['data' => $data]);
    }

    public static function error(int $status, string $code, string $message): never
    {
        self::send($status, ['error' => ['code' => $code, 'message' => $message]]);
    }
}
