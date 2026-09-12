<?php

declare(strict_types=1);

namespace NanoPrint\Http;

final class Request
{
    /** @var array<string, string> */
    public array $params = [];

    public function __construct(
        public readonly string $method,
        public readonly string $path,
        public readonly array $query,
        public readonly array $headers,
        public readonly array $body,
        public readonly string $ip,
        public readonly string $userAgent,
    ) {
    }

    public static function fromGlobals(): self
    {
        $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
        $uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
        $script = str_replace('\\', '/', $_SERVER['SCRIPT_NAME'] ?? '');
        $base = rtrim(dirname($script), '/');
        if ($base !== '' && $base !== '/' && str_starts_with($uri, $base)) {
            $uri = substr($uri, strlen($base)) ?: '/';
        }
        $path = '/' . trim($uri, '/');
        if ($path !== '/') {
            $path = rtrim($path, '/');
        }

        $headers = [];
        foreach ($_SERVER as $key => $value) {
            if (str_starts_with($key, 'HTTP_')) {
                $name = strtolower(str_replace('_', '-', substr($key, 5)));
                $headers[$name] = (string) $value;
            }
        }
        if (isset($_SERVER['CONTENT_TYPE'])) {
            $headers['content-type'] = (string) $_SERVER['CONTENT_TYPE'];
        }

        $raw = file_get_contents('php://input') ?: '';
        $decoded = [];
        if ($raw !== '') {
            $json = json_decode($raw, true);
            $decoded = is_array($json) ? $json : [];
        }

        return new self(
            $method,
            $path,
            $_GET,
            $headers,
            $decoded,
            (string) ($_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? ''),
            substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 255),
        );
    }

    public function header(string $name): string
    {
        return $this->headers[strtolower($name)] ?? '';
    }

    public function bearer(): string
    {
        $auth = $this->header('authorization');
        if (str_starts_with(strtolower($auth), 'bearer ')) {
            return trim(substr($auth, 7));
        }
        return $this->header('x-session-token');
    }

    public function string(string $key, string $default = ''): string
    {
        $value = $this->body[$key] ?? $this->query[$key] ?? $this->params[$key] ?? $default;
        return is_scalar($value) ? trim((string) $value) : $default;
    }

    public function float(string $key, ?float $default = null): ?float
    {
        $value = $this->body[$key] ?? $this->query[$key] ?? null;
        if ($value === null || $value === '') {
            return $default;
        }
        if (is_string($value)) {
            $value = str_replace(',', '.', $value);
        }
        return is_numeric($value) ? (float) $value : $default;
    }

    public function bool(string $key, ?bool $default = null): ?bool
    {
        if (!array_key_exists($key, $this->body)) {
            return $default;
        }
        return (bool) $this->body[$key];
    }

    public function array(string $key): array
    {
        $value = $this->body[$key] ?? null;
        return is_array($value) ? $value : [];
    }
}
