<?php

declare(strict_types=1);

namespace NanoPrint\Auth;

final class AuthContext
{
    /**
     * @param array<string, array{create:bool,read:bool,update:bool,delete:bool}> $permissions
     */
    public function __construct(
        public readonly string $userId,
        public readonly string $companyId,
        public readonly string $roleId,
        public readonly string $roleName,
        public readonly string $name,
        public readonly string $email,
        public readonly string $status,
        public readonly bool $isCompanyOwner,
        public readonly array $permissions,
    ) {
    }

    public function can(string $module, string $action): bool
    {
        if ($this->isCompanyOwner || $this->roleName === 'Administrateur') {
            return true;
        }
        $row = $this->permissions[$module] ?? ['create' => false, 'read' => false, 'update' => false, 'delete' => false];
        return !empty($row[$action]);
    }

    /** @return array{id:string,name:string,email:string,role:string,initials:string,roleId:string,companyId:string} */
    public function toUser(): array
    {
        $parts = preg_split('/\s+/', trim($this->name)) ?: [];
        $initials = strtoupper(substr($parts[0] ?? 'U', 0, 1) . substr($parts[1] ?? '', 0, 1));
        return [
            'id' => $this->userId,
            'name' => $this->name,
            'email' => $this->email,
            'role' => $this->roleName,
            'initials' => $initials ?: 'NP',
            'roleId' => $this->roleId,
            'companyId' => $this->companyId,
        ];
    }
}
