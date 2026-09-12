<?php

declare(strict_types=1);

namespace NanoPrint\Http;

use RuntimeException;

final class HttpException extends RuntimeException
{
    public function __construct(
        public readonly int $status,
        string $message,
        public readonly string $codeKey = 'error',
    ) {
        parent::__construct($message, $status);
    }

    public static function badRequest(string $message, string $code = 'bad_request'): self
    {
        return new self(400, $message, $code);
    }

    public static function unauthorized(string $message = 'Authentification requise.'): self
    {
        return new self(401, $message, 'unauthorized');
    }

    public static function forbidden(string $message = 'Action non autorisée.'): self
    {
        return new self(403, $message, 'forbidden');
    }

    public static function notFound(string $message = 'Ressource introuvable.'): self
    {
        return new self(404, $message, 'not_found');
    }

    public static function conflict(string $message): self
    {
        return new self(409, $message, 'conflict');
    }

    public static function unprocessable(string $message): self
    {
        return new self(422, $message, 'validation');
    }

    public static function tooMany(string $message = 'Trop de tentatives. Réessayez plus tard.'): self
    {
        return new self(429, $message, 'rate_limited');
    }
}
