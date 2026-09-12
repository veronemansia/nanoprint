<?php

declare(strict_types=1);

namespace NanoPrint\Auth;

use NanoPrint\Config\Env;
use NanoPrint\Http\HttpException;
use PDO;

final class SessionService
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    public function create(string $userId, string $ip, string $userAgent): string
    {
        $token = bin2hex(random_bytes(32));
        $hours = Env::int('SESSION_HOURS', 12);
        $stmt = $this->pdo->prepare(
            'INSERT INTO sessions (id, user_id, expires_at, ip, user_agent) VALUES (:id, :user_id, DATE_ADD(NOW(), INTERVAL :hours HOUR), :ip, :ua)',
        );
        $stmt->execute([
            'id' => hash('sha256', $token),
            'user_id' => $userId,
            'hours' => $hours,
            'ip' => $ip,
            'ua' => $userAgent,
        ]);
        return $token;
    }

    public function destroy(string $token): void
    {
        if ($token === '') {
            return;
        }
        $stmt = $this->pdo->prepare('DELETE FROM sessions WHERE id = :id');
        $stmt->execute(['id' => hash('sha256', $token)]);
    }

    public function userIdFor(string $token): string
    {
        if ($token === '') {
            throw HttpException::unauthorized();
        }
        $stmt = $this->pdo->prepare(
            'SELECT user_id FROM sessions WHERE id = :id AND expires_at > NOW() LIMIT 1',
        );
        $stmt->execute(['id' => hash('sha256', $token)]);
        $row = $stmt->fetch();
        if (!$row) {
            throw HttpException::unauthorized('Session expirée. Reconnectez-vous.');
        }
        return (string) $row['user_id'];
    }
}
