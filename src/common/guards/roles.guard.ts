import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Controller বা Route-এর ওপর @Roles() দিয়ে কী কী Role দেওয়া হয়েছে, তা বের করে আনা
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // যদি কোনো Role নির্দিষ্ট করা না থাকে, তার মানে এটি সবার জন্য উন্মুক্ত
    if (!requiredRoles) {
      return true;
    }

    // রিকোয়েস্ট থেকে ইউজারের ডেটা নেওয়া (যা JwtAuthGuard আগে থেকেই রেখে দিয়েছে)
    const { user } = context.switchToHttp().getRequest();

    if (!user || !user.role) {
      throw new ForbiddenException('Access denied: Role not found');
    }

    // ইউজারের Role আমাদের বলে দেওয়া Role-গুলোর মধ্যে আছে কিনা তা চেক করা
    const hasRole = requiredRoles.includes(user.role);
    
    if (!hasRole) {
      throw new ForbiddenException('Access denied: You do not have permission for this action');
    }

    return true;
  }
}