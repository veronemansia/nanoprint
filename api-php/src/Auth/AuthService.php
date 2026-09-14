<?php

declare(strict_types=1);

namespace NanoPrint\Auth;

use NanoPrint\Http\HttpException;
use NanoPrint\Support\AuditLogger;
use NanoPrint\Support\FileLogger;
use NanoPrint\Support\Validator;
use PDO;

final class AuthService
{
    public function __construct(
        private readonly PDO $pdo,
        private readonly SessionService $sessions,
        private readonly AuditLogger $audit,
    ) {
    }

    /** @return array{user:array,token:string} */
    public function login(string $email, string $password, string $ip, string $userAgent): array
    {
        $email = Validator::email($email);
        if (strlen($password) < 6) {
            throw HttpException::unprocessable('Le mot de passe doit contenir au moins 6 caractères.');
        }

        $this->guardRateLimit($email);

        $stmt = $this->pdo->prepare(
            'SELECT u.*, r.name AS role_name
             FROM users u
             INNER JOIN roles r ON r.id = u.role_id
             WHERE u.email = :email
             LIMIT 1',
        );
        $stmt->execute(['email' => $email]);
        $row = $stmt->fetch();

        $ok = $row && password_verify($password, (string) $row['password_hash']);
        if (!$ok) {
            $this->trackAttempt($email);
            FileLogger::info('auth.login_failed', $email, ['ip' => $ip]);
            if ($row) {
                $this->audit->recordForCompany(
                    (string) $row['company_id'],
                    (string) $row['id'],
                    'auth.login_failed',
                    'utilisateurs',
                    'roles-permissions',
                    'user',
                    (string) $row['id'],
                    $email,
                    $ip,
                    $email,
                );
            }
            throw HttpException::unauthorized('E-mail ou mot de passe incorrect.');
        }

        if (($row['status'] ?? '') === 'Suspendu') {
            $this->audit->recordForCompany(
                (string) $row['company_id'],
                (string) $row['id'],
                'auth.login_blocked',
                'utilisateurs',
                'roles-permissions',
                'user',
                (string) $row['id'],
                $email . ' — compte suspendu',
                $ip,
                $email,
            );
            throw HttpException::forbidden('Ce compte est suspendu.');
        }

        $this->clearAttempts($email);
        $token = $this->sessions->create((string) $row['id'], $ip, $userAgent);
        $this->pdo->prepare('UPDATE users SET last_login_at = NOW() WHERE id = :id')->execute(['id' => $row['id']]);

        $auth = $this->contextFromUserId((string) $row['id']);
        $this->audit->record(
            $auth,
            'auth.login',
            'utilisateurs',
            'roles-permissions',
            'user',
            $auth->userId,
            $auth->name . ' · ' . $auth->email,
            $ip,
        );

        return ['user' => $auth->toUser(), 'token' => $token];
    }

    public function logout(string $token, string $ip): void
    {
        try {
            $userId = $this->sessions->userIdFor($token);
            $auth = $this->contextFromUserId($userId);
            $this->audit->record(
                $auth,
                'auth.logout',
                'utilisateurs',
                'roles-permissions',
                'user',
                $auth->userId,
                $auth->name . ' · ' . $auth->email,
                $ip,
            );
        } catch (HttpException) {
            // already invalid
        }
        $this->sessions->destroy($token);
    }

    public function contextFromUserId(string $userId): AuthContext
    {
        $stmt = $this->pdo->prepare(
            'SELECT u.*, r.name AS role_name
             FROM users u
             INNER JOIN roles r ON r.id = u.role_id
             WHERE u.id = :id
             LIMIT 1',
        );
        $stmt->execute(['id' => $userId]);
        $row = $stmt->fetch();
        if (!$row) {
            throw HttpException::unauthorized();
        }

        $permStmt = $this->pdo->prepare(
            'SELECT module_id, can_create, can_read, can_update, can_delete FROM role_permissions WHERE role_id = :id',
        );
        $permStmt->execute(['id' => $row['role_id']]);
        $permissions = [];
        foreach ($permStmt->fetchAll() as $perm) {
            $permissions[(string) $perm['module_id']] = [
                'create' => (bool) $perm['can_create'],
                'read' => (bool) $perm['can_read'],
                'update' => (bool) $perm['can_update'],
                'delete' => (bool) $perm['can_delete'],
            ];
        }

        return new AuthContext(
            userId: (string) $row['id'],
            companyId: (string) $row['company_id'],
            roleId: (string) $row['role_id'],
            roleName: (string) $row['role_name'],
            name: (string) $row['name'],
            email: (string) ($row['email'] ?? ''),
            status: (string) $row['status'],
            isCompanyOwner: (bool) $row['is_company_owner'],
            permissions: $permissions,
        );
    }

    public function contextFromToken(string $token): AuthContext
    {
        return $this->contextFromUserId($this->sessions->userIdFor($token));
    }

    private function guardRateLimit(string $email): void
    {
        $stmt = $this->pdo->prepare(
            'SELECT COUNT(*) FROM login_attempts WHERE email = :email AND attempted_at > DATE_SUB(NOW(), INTERVAL 15 MINUTE)',
        );
        $stmt->execute(['email' => $email]);
        if ((int) $stmt->fetchColumn() >= 5) {
            throw HttpException::tooMany();
        }
    }

    private function trackAttempt(string $email): void
    {
        $this->pdo->prepare('INSERT INTO login_attempts (email) VALUES (:email)')->execute(['email' => $email]);
    }

    private function clearAttempts(string $email): void
    {
        $this->pdo->prepare('DELETE FROM login_attempts WHERE email = :email')->execute(['email' => $email]);
    }
}
