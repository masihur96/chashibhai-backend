import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { SupabaseService } from '../supabase/supabase.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { OtpSendDto } from './dto/otp-send.dto';
import { OtpVerifyDto } from './dto/otp-verify.dto';
import { RefreshDto } from './dto/refresh.dto';
import { KycDto } from './dto/kyc.dto';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  // ─── Helpers ────────────────────────────────────────────────────────────────

  /** Normalize a Bangladeshi phone number to E.164 format (+880XXXXXXXXXX) */
  private normalizePhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.startsWith('880')) return `+${digits}`;
    if (digits.startsWith('0')) return `+88${digits}`;
    return `+88${digits}`;
  }

  /** Build a pair of access + refresh tokens from a Supabase user record */
  private buildTokens(supabaseUser: any, role: string) {
    const payload = {
      sub: supabaseUser.id,
      phone: supabaseUser.phone,
      email: supabaseUser.email,
      role,
    };
    const accessToken = this.jwtService.sign(payload, { expiresIn: '15m' });
    const refreshToken = this.jwtService.sign(payload, { expiresIn: '7d' });
    return { accessToken, refreshToken };
  }

  // ─── Register ────────────────────────────────────────────────────────────────

  async register(dto: RegisterDto) {
    const phone = this.normalizePhone(dto.phone);
    const client = this.supabaseService.getAdminClient();

    // 1. Create the Supabase Auth user (phone + password)
    const { data: authData, error: signUpError } =
      await client.auth.admin.createUser({
        phone,
        password: dto.password,
        phone_confirm: false, // OTP verification required separately
        user_metadata: { name: dto.name, role: dto.role },
      });

    if (signUpError) {
      if (signUpError.message.includes('already registered')) {
        throw new BadRequestException('Phone number is already registered');
      }
      this.logger.error('Supabase register error', signUpError);
      throw new InternalServerErrorException('Registration failed');
    }

    const userId = authData.user!.id;

    // 2. Insert extended profile row
    const { error: profileError } = await client
      .from('profiles')
      .insert({
        id: userId,
        name: dto.name,
        phone,
        role: dto.role.toLowerCase(),
      });

    if (profileError) {
      // Rollback: delete the auth user so the data stays consistent
      await client.auth.admin.deleteUser(userId);
      this.logger.error('Profile insert error: ' + JSON.stringify(profileError));
      throw new InternalServerErrorException('Failed to create user profile');
    }

    // Sync to users table for Prisma compatibility
    await client
      .from('users')
      .upsert({
        id: userId,
        name: dto.name,
        phone,
        role: dto.role,
        status: 'PENDING',
      }, { onConflict: 'id' });

    // 3. Issue tokens
    const { accessToken, refreshToken } = this.buildTokens(
      authData.user!,
      dto.role,
    );

    return {
      success: true,
      data: {
        accessToken,
        refreshToken,
        user: {
          id: userId,
          name: dto.name,
          role: dto.role,
          isVerified: false,
        },
      },
    };
  }

  // ─── Login ───────────────────────────────────────────────────────────────────

  async login(dto: LoginDto) {
    const phone = this.normalizePhone(dto.phone);
    const client = this.supabaseService.getAdminClient();

    let authUser: { id: string; phone?: string; email?: string } | null = null;

    // 1. Try Supabase native signInWithPassword
    const { data, error } = await client.auth.signInWithPassword({
      phone,
      password: dto.password,
    });

    if (!error && data?.user) {
      authUser = data.user;
    } else {
      // 2. Fallback: If Phone Provider is disabled in Supabase Cloud or phone unconfirmed,
      // verify the password directly against auth.users using pgcrypto crypt()
      const rawDigits = dto.phone.replace(/\D/g, '');
      const withCountry = rawDigits.startsWith('880') ? rawDigits : `88${rawDigits}`;
      const withPlus = `+${withCountry}`;

      const users = await this.prisma.$queryRaw<
        Array<{ id: string; phone: string | null; email: string | null; is_valid: boolean }>
      >`
        SELECT id, phone, email, (encrypted_password = crypt(${dto.password}, encrypted_password)) as is_valid
        FROM auth.users
        WHERE phone IN (${dto.phone}, ${rawDigits}, ${withCountry}, ${withPlus})
        LIMIT 1;
      `;

      if (!users.length || !users[0].is_valid) {
        throw new UnauthorizedException('Invalid phone number or password');
      }

      authUser = {
        id: users[0].id,
        phone: users[0].phone ?? phone,
        email: users[0].email ?? '',
      };
    }

    // Fetch profile for role information
    const { data: profile, error: profileError } = await client
      .from('profiles')
      .select('id, name, role, is_verified, nid_verified, wallet_balance, avatar_url')
      .eq('id', authUser.id)
      .single();

    if (profileError || !profile) {
      throw new UnauthorizedException('User profile not found');
    }

    const { accessToken, refreshToken } = this.buildTokens(
      authUser,
      profile.role,
    );

    return {
      success: true,
      data: {
        accessToken,
        refreshToken,
        user: {
          id: profile.id,
          name: profile.name,
          role: profile.role,
          isVerified: profile.is_verified,
          nidVerified: profile.nid_verified,
          walletBalance: profile.wallet_balance,
          avatarUrl: profile.avatar_url,
        },
      },
    };
  }

  // ─── OTP ─────────────────────────────────────────────────────────────────────

  async sendOtp(dto: OtpSendDto) {
    const phone = this.normalizePhone(dto.phone);
    const client = this.supabaseService.getAdminClient();

    const { error } = await client.auth.signInWithOtp({ phone });

    if (error) {
      this.logger.error('OTP send error', error);
      throw new BadRequestException(error.message ?? 'Failed to send OTP');
    }

    return { success: true, message: `OTP sent to ${dto.phone}` };
  }

  async verifyOtp(dto: OtpVerifyDto) {
    const phone = this.normalizePhone(dto.phone);
    const client = this.supabaseService.getAdminClient();

    const { data, error } = await client.auth.verifyOtp({
      phone,
      token: dto.otp,
      type: 'sms',
    });

    if (error || !data.user) {
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    // Mark the phone as confirmed in the profile
    await client
      .from('profiles')
      .update({ is_verified: true })
      .eq('id', data.user.id);

    // Fetch profile for role
    const { data: profile } = await client
      .from('profiles')
      .select('role, name, is_verified')
      .eq('id', data.user.id)
      .single();

    const { accessToken, refreshToken } = this.buildTokens(
      data.user,
      profile?.role ?? 'buyer',
    );

    return {
      success: true,
      data: {
        accessToken,
        refreshToken,
        user: {
          id: data.user.id,
          name: profile?.name,
          role: profile?.role,
          isVerified: profile?.is_verified,
        },
      },
    };
  }

  // ─── KYC ─────────────────────────────────────────────────────────────────────

  async submitKyc(
    userId: string,
    dto: KycDto,
    nidFront: Express.Multer.File,
    nidBack: Express.Multer.File,
  ) {
    const client = this.supabaseService.getAdminClient();
    const bucket = 'kyc-docs';
    const timestamp = Date.now();

    // Upload NID front
    const frontPath = `${userId}/nid-front-${timestamp}${this.ext(nidFront)}`;
    const { error: frontError } = await client.storage
      .from(bucket)
      .upload(frontPath, nidFront.buffer, {
        contentType: nidFront.mimetype,
        upsert: true,
      });
    if (frontError) {
      this.logger.error('KYC front upload error', frontError);
      throw new InternalServerErrorException('Failed to upload NID front image');
    }

    // Upload NID back
    const backPath = `${userId}/nid-back-${timestamp}${this.ext(nidBack)}`;
    const { error: backError } = await client.storage
      .from(bucket)
      .upload(backPath, nidBack.buffer, {
        contentType: nidBack.mimetype,
        upsert: true,
      });
    if (backError) {
      this.logger.error('KYC back upload error', backError);
      throw new InternalServerErrorException('Failed to upload NID back image');
    }

    // Build signed/public URLs
    const frontUrl = client.storage.from(bucket).getPublicUrl(frontPath).data
      .publicUrl;
    const backUrl = client.storage.from(bucket).getPublicUrl(backPath).data
      .publicUrl;

    // Persist in profiles table
    const { error: updateError } = await client
      .from('profiles')
      .update({
        nid_number: dto.nidNumber,
        nid_front_url: frontUrl,
        nid_back_url: backUrl,
        nid_verified: false, // admin reviews manually
      })
      .eq('id', userId);

    if (updateError) {
      this.logger.error('KYC profile update error', updateError);
      throw new InternalServerErrorException('Failed to save KYC data');
    }

    return {
      success: true,
      message: 'KYC documents submitted. Verification in progress.',
    };
  }

  // ─── Refresh Token ────────────────────────────────────────────────────────────

  async refresh(dto: RefreshDto) {
    let payload: any;
    try {
      payload = this.jwtService.verify(dto.refreshToken, {
        secret: process.env.SUPABASE_JWT_SECRET,
      });
    } catch {
      throw new UnauthorizedException(
        'Invalid or expired refresh token. Please login again.',
      );
    }

    const newPayload = {
      sub: payload.sub,
      phone: payload.phone,
      email: payload.email,
      role: payload.role,
    };

    return {
      success: true,
      data: {
        accessToken: this.jwtService.sign(newPayload, { expiresIn: '15m' }),
        refreshToken: this.jwtService.sign(newPayload, { expiresIn: '7d' }),
      },
    };
  }

  // ─── Logout ───────────────────────────────────────────────────────────────────

  async logout(accessToken: string) {
    // Supabase admin can revoke sessions; for JWT-only setups this is a no-op
    // but we still call signOut on a user-scoped client if the token is valid.
    const client = this.supabaseService.getUserClient(accessToken);
    await client.auth.signOut();
    return { success: true, message: 'Logged out successfully' };
  }

  // ─── Private util ─────────────────────────────────────────────────────────────

  private ext(file: Express.Multer.File): string {
    const parts = file.originalname.split('.');
    return parts.length > 1 ? `.${parts.pop()}` : '';
  }
}
