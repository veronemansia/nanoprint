<?php

declare(strict_types=1);

namespace NanoPrint\Http;

use NanoPrint\Config\Env;
use NanoPrint\Support\FileLogger;
use Throwable;

final class ExceptionHandler
{
    public static function handle(Throwable $e): never
    {
        if ($e instanceof HttpException) {
            JsonResponse::error($e->status, $e->codeKey, $e->getMessage());
        }

        FileLogger::error('exception', $e->getMessage());
        $message = Env::get('APP_DEBUG', '0') === '1'
            ? $e->getMessage()
            : 'Une erreur interne est survenue.';
        JsonResponse::error(500, 'server_error', $message);
    }
}
