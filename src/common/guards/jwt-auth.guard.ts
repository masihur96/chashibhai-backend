import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<T = any>(err: any, user: T, info: any): T {
    if (err || !user) {
      const message =
        info?.name === 'TokenExpiredError'
          ? 'Token has expired. Please refresh your session.'
          : (info?.message ?? 'Unauthorized – valid JWT required');
      throw new UnauthorizedException(message);
    }
    return user;
  }

  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }
}
