import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client'; // Prisma থেকে Role Enum টি আনছি

export const ROLES_KEY = 'roles';

// এই ডেকোরেটরের মাধ্যমে আমরা বলে দেব কোন কোন Role অ্যালাউড
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);