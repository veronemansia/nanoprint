<?php

declare(strict_types=1);

namespace NanoPrint\Http;

final class Router
{
    /** @var list<array{method:string,pattern:string,handler:callable,auth:bool,module:?string,action:?string}> */
    private array $routes = [];

    public function add(string $method, string $pattern, callable $handler, bool $auth = true, ?string $module = null, ?string $action = null): void
    {
        $this->routes[] = [
            'method' => strtoupper($method),
            'pattern' => $pattern,
            'handler' => $handler,
            'auth' => $auth,
            'module' => $module,
            'action' => $action,
        ];
    }

    public function match(Request $request): array
    {
        foreach ($this->routes as $route) {
            if ($route['method'] !== $request->method) {
                continue;
            }
            $params = $this->matchPath($route['pattern'], $request->path);
            if ($params === null) {
                continue;
            }
            return [...$route, 'params' => $params];
        }
        throw HttpException::notFound('Endpoint introuvable.');
    }

    /** @return array<string, string>|null */
    private function matchPath(string $pattern, string $path): ?array
    {
        $pattern = '/' . trim($pattern, '/');
        if ($pattern !== '/') {
            $pattern = rtrim($pattern, '/');
        }
        $names = [];
        $regex = preg_replace_callback('/\{([a-zA-Z_][a-zA-Z0-9_-]*)\}/', static function (array $m) use (&$names) {
            $names[] = $m[1];
            return '([^/]+)';
        }, $pattern);
        if (!preg_match('#^' . $regex . '$#', $path, $matches)) {
            return null;
        }
        $params = [];
        foreach ($names as $index => $name) {
            $params[$name] = urldecode($matches[$index + 1]);
        }
        return $params;
    }
}
