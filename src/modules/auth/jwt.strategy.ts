import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../supabase/supabase.service';

export interface JwtPayload {
  sub: string;    // Supabase user UUID
  phone?: string;
  email?: string;
  role: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly supabaseService: SupabaseService,
  ) {
    const secret = configService.get<string>('SUPABASE_JWT_SECRET');
    if (!secret) {
      throw new Error('SUPABASE_JWT_SECRET is not defined in environment');
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: JwtPayload) {
    if (!payload?.sub) {
      throw new UnauthorizedException('Invalid token payload');
    }

    // Optionally fetch fresh role from profiles in case it was updated
    const client = this.supabaseService.getAdminClient();
    const { data: profile, error } = await client
      .from('profiles')
      .select('role, is_verified, nid_verified')
      .eq('id', payload.sub)
      .single();

    if (error || !profile) {
      this.logger.warn(`Profile not found for sub=${payload.sub}`);
      throw new UnauthorizedException('User profile not found');
    }

    return {
      supabaseId: payload.sub,
      phone: payload.phone,
      email: payload.email,
      role: profile.role,            // always up-to-date from DB
      isVerified: profile.is_verified,
      nidVerified: profile.nid_verified,
    };
  }
}
