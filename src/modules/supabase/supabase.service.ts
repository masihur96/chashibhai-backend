import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { extname } from 'path';

@Injectable()
export class SupabaseService {
  private readonly logger = new Logger(SupabaseService.name);
  private readonly adminClient: SupabaseClient;

  constructor() {
    const url = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !serviceKey) {
      throw new Error(
        'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be defined',
      );
    }

    // Service-role client — full DB + Auth admin access, never exposed to users
    this.adminClient = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  /**
   * Returns the service-role (admin) Supabase client.
   * Use for server-side operations: auth.admin.*, storage, DB writes.
   */
  getAdminClient(): SupabaseClient {
    return this.adminClient;
  }

  /**
   * Returns a user-scoped Supabase client using the caller's access token.
   * RLS policies will be enforced for this client.
   */
  getUserClient(accessToken: string): SupabaseClient {
    const url = process.env.SUPABASE_URL!;
    const anonKey = process.env.SUPABASE_ANON_KEY!;

    return createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  // ─── Storage helpers ──────────────────────────────────────────────────────────

  /** Upload a user avatar to the 'avatars' bucket; returns the public URL. */
  async uploadAvatar(userId: string, file: Express.Multer.File): Promise<string> {
    try {
      const fileExt = extname(file.originalname);
      const filePath = `public/${userId}${fileExt}`;

      const { error } = await this.adminClient.storage
        .from('avatars')
        .upload(filePath, file.buffer, {
          contentType: file.mimetype,
          upsert: true,
        });

      if (error) throw error;

      const { data } = this.adminClient.storage
        .from('avatars')
        .getPublicUrl(filePath);

      return data.publicUrl;
    } catch (error) {
      this.logger.error('Avatar upload failed', error);
      throw new InternalServerErrorException('Failed to upload avatar');
    }
  }

  /** Delete a user avatar from the 'avatars' bucket. */
  async deleteAvatar(avatarUrl: string): Promise<void> {
    try {
      const fileName = avatarUrl.split('/').pop();
      if (!fileName) return;
      await this.adminClient.storage
        .from('avatars')
        .remove([`public/${fileName}`]);
    } catch (error) {
      this.logger.warn('Error deleting avatar', error);
    }
  }
}
