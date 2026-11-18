import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { QueryUserDto } from './dto/query-user.dto';
import { Status } from '@prisma/client';

export interface UserProfileResponse {
  id: string;
  name: string;
  phone: string | null;
  role: string;
  rating: number;
  ratingCount: number;
  walletBalance: number;
  isVerified: boolean;
  nidVerified: boolean;
  district: string | null;
  avatarUrl: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface PublicProfileResponse {
  id: string;
  name: string;
  role: string;
  rating: number;
  ratingCount: number;
  avatarUrl: string | null;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Helper to format raw Supabase profile row into camelCase API response
   */
  formatProfile(profile: any): UserProfileResponse | null {
    if (!profile) return null;
    return {
      id: profile.id,
      name: profile.name,
      phone: profile.phone ?? null,
      role: profile.role,
      rating: Number(profile.rating ?? 0),
      ratingCount: Number(profile.rating_count ?? 0),
      walletBalance: Number(profile.wallet_balance ?? 0),
      isVerified: Boolean(profile.is_verified),
      nidVerified: Boolean(profile.nid_verified),
      district: profile.district ?? null,
      avatarUrl: profile.avatar_url ?? null,
      createdAt: profile.created_at ?? null,
      updatedAt: profile.updated_at ?? null,
    };
  }

  // ─── CRUD on `profiles` table in Supabase ─────────────────────────────────────

  /**
   * Fetch authenticated user's own profile by userId (from JWT sub)
   */
  async getProfile(userId: string): Promise<UserProfileResponse> {
    const client = this.supabaseService.getAdminClient();

    const { data: profile, error } = await client
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error || !profile) {
      this.logger.warn(`Profile not found in Supabase for user ${userId}: ${error?.message}`);

      // Fallback check in prisma user table if needed
      const prismaUser = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!prismaUser) {
        throw new NotFoundException('User profile not found');
      }

      return {
        id: prismaUser.id,
        name: prismaUser.name,
        phone: prismaUser.phone ?? null,
        role: prismaUser.role.toLowerCase(),
        rating: prismaUser.rating ?? 0,
        ratingCount: 0,
        walletBalance: prismaUser.wallet_balance ?? 0,
        isVerified: prismaUser.is_verified ?? false,
        nidVerified: false,
        district: null,
        avatarUrl: prismaUser.avatar ?? null,
      };
    }

    return this.formatProfile(profile)!;
  }

  /**
   * Fetch public profile by user ID (id, name, role, rating, rating_count, avatar_url)
   */
  async getPublicProfile(id: string): Promise<PublicProfileResponse> {
    const client = this.supabaseService.getAdminClient();

    const { data: profile, error } = await client
      .from('profiles')
      .select('id, name, role, rating, rating_count, avatar_url')
      .eq('id', id)
      .single();

    if (error || !profile) {
      // Fallback check in prisma user table
      const prismaUser = await this.prisma.user.findUnique({
        where: { id },
      });

      if (!prismaUser) {
        throw new NotFoundException('User profile not found');
      }

      return {
        id: prismaUser.id,
        name: prismaUser.name,
        role: prismaUser.role.toLowerCase(),
        rating: prismaUser.rating ?? 0,
        ratingCount: 0,
        avatarUrl: prismaUser.avatar ?? null,
      };
    }

    return {
      id: profile.id,
      name: profile.name,
      role: profile.role,
      rating: Number(profile.rating ?? 0),
      ratingCount: Number(profile.rating_count ?? 0),
      avatarUrl: profile.avatar_url ?? null,
    };
  }

  /**
   * Update own profile (name, avatar_url, district)
   * Supports file upload to Supabase Storage 'avatars' or passing avatarUrl in DTO
   */
  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
    file?: Express.Multer.File,
  ): Promise<UserProfileResponse> {
    const client = this.supabaseService.getAdminClient();

    let avatarUrl = dto.avatarUrl ?? dto.avatar_url ?? dto.avatar;

    // If an image file was uploaded, upload to Supabase Storage "avatars" bucket
    if (file) {
      avatarUrl = await this.supabaseService.uploadAvatar(userId, file);
    }

    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (dto.name !== undefined) {
      updatePayload.name = dto.name;
    }
    if (avatarUrl !== undefined) {
      updatePayload.avatar_url = avatarUrl === '' ? null : avatarUrl;
    }
    if (dto.district !== undefined) {
      updatePayload.district = dto.district;
    }

    const { data: updatedProfile, error } = await client
      .from('profiles')
      .update(updatePayload)
      .eq('id', userId)
      .select()
      .single();

    if (error || !updatedProfile) {
      this.logger.error(`Failed to update profile for ${userId}`, error);
      throw new InternalServerErrorException(
        error?.message ?? 'Failed to update profile',
      );
    }

    // Best-effort sync to Prisma user table
    try {
      const prismaUpdate: Record<string, any> = {};
      if (dto.name !== undefined) prismaUpdate.name = dto.name;
      if (avatarUrl !== undefined) {
        prismaUpdate.avatar = avatarUrl === '' ? null : avatarUrl;
      }
      if (Object.keys(prismaUpdate).length > 0) {
        await this.prisma.user.updateMany({
          where: { id: userId },
          data: prismaUpdate,
        });
      }
    } catch (err: any) {
      this.logger.warn(`Could not sync profile update to Prisma user: ${err.message}`);
    }

    return this.formatProfile(updatedProfile)!;
  }

  /**
   * List users by role ('farmer' or 'buyer') with pagination & filters
   * Filters: district, rating_min, is_verified, search (by name)
   */
  async listUsersByRole(role: 'farmer' | 'buyer', query: QueryUserDto) {
    const client = this.supabaseService.getAdminClient();

    let dbQuery = client
      .from('profiles')
      .select('*', { count: 'exact' })
      .ilike('role', role);

    // Filter by district
    if (query.district?.trim()) {
      dbQuery = dbQuery.ilike('district', `%${query.district.trim()}%`);
    }

    // Filter by minimum rating
    const ratingMin = query.rating_min ?? query.ratingMin;
    if (ratingMin !== undefined && !isNaN(ratingMin)) {
      dbQuery = dbQuery.gte('rating', ratingMin);
    }

    // Filter by verification status
    const isVerified = query.is_verified ?? query.isVerified;
    if (isVerified !== undefined) {
      dbQuery = dbQuery.eq('is_verified', isVerified);
    }

    // Search by name
    if (query.search?.trim()) {
      dbQuery = dbQuery.ilike('name', `%${query.search.trim()}%`);
    }

    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? query.limit : 10;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    dbQuery = dbQuery.order('created_at', { ascending: false }).range(from, to);

    const { data, count, error } = await dbQuery;

    if (error) {
      this.logger.error(`Error querying ${role}s from Supabase`, error);
      throw new InternalServerErrorException(`Failed to retrieve ${role}s list`);
    }

    const total = count ?? (data?.length || 0);
    const totalPages = Math.ceil(total / limit);

    return {
      data: (data || []).map((row) => this.formatProfile(row)),
      meta: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  /**
   * Create a new profile in Supabase profiles table
   */
  async createProfile(data: {
    id: string;
    name: string;
    phone?: string;
    role?: string;
    avatar_url?: string;
    district?: string;
  }) {
    const client = this.supabaseService.getAdminClient();
    const { data: created, error } = await client
      .from('profiles')
      .insert({
        ...data,
        role: data.role ? data.role.toLowerCase() : 'buyer',
      })
      .select()
      .single();

    if (error) {
      this.logger.error('Failed to create profile', error);
      throw new InternalServerErrorException('Failed to create profile');
    }

    return this.formatProfile(created);
  }

  /**
   * Delete a profile from Supabase profiles table
   */
  async deleteProfile(id: string) {
    const client = this.supabaseService.getAdminClient();
    const { error } = await client.from('profiles').delete().eq('id', id);

    if (error) {
      this.logger.error(`Failed to delete profile ${id}`, error);
      throw new InternalServerErrorException('Failed to delete profile');
    }

    return { success: true, message: 'Profile deleted successfully' };
  }

  // ─── Prisma & Legacy support methods ──────────────────────────────────────────

  async findById(id: string) {
    try {
      return await this.getProfile(id);
    } catch {
      return null;
    }
  }

  async findByPhone(phone: string) {
    const client = this.supabaseService.getAdminClient();
    const { data } = await client
      .from('profiles')
      .select('*')
      .eq('phone', phone)
      .single();
    if (data) return this.formatProfile(data);

    return this.prisma.user.findUnique({ where: { phone } });
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async update(id: string, data: any) {
    return this.updateProfile(id, data);
  }

  async delete(id: string) {
    await this.deleteProfile(id);
    return this.prisma.user.delete({ where: { id } }).catch(() => null);
  }

  async submitVerification(userId: string, nidUrl: string) {
    const client = this.supabaseService.getAdminClient();
    await client
      .from('profiles')
      .update({
        nid_front_url: nidUrl,
        nid_verified: false,
      })
      .eq('id', userId);

    return this.prisma.user.updateMany({
      where: { id: userId },
      data: {
        nidUrl,
        status: 'PENDING',
      },
    });
  }

  async updateVerificationStatus(
    userId: string,
    status: Status,
    is_verified: boolean,
  ) {
    const client = this.supabaseService.getAdminClient();
    await client
      .from('profiles')
      .update({
        is_verified,
        nid_verified: status === 'APPROVED',
      })
      .eq('id', userId);

    return this.prisma.user.updateMany({
      where: { id: userId },
      data: {
        status,
        is_verified,
      },
    });
  }
}
