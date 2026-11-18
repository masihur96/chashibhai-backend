import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { extname } from 'path';

@Injectable()
export class SupabaseService {
  private readonly logger = new Logger(SupabaseService.name);
  private readonly anonClient: SupabaseClient;
  private readonly adminClient: SupabaseClient;

  constructor() {
    const url = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const anonKey = process.env.SUPABASE_ANON_KEY;

    if (!url || !serviceKey) {
      throw new Error(
        'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be defined',
      );
    }

    // a) anonClient: createClient(url, anonKey) — for auth operations
    this.anonClient = createClient(url, anonKey || serviceKey, {
      auth: { autoRefreshToken: true, persistSession: false },
    });

    // b) adminClient: createClient(url, serviceRoleKey) — for all DB queries
    this.adminClient = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  /**
   * Returns the anonymous / public Supabase client.
   * Used for auth operations (e.g. signInWithPassword, signUp, resetPassword).
   */
  getAnonClient(): SupabaseClient {
    return this.anonClient;
  }

  /**
   * Property getter for anon client.
   */
  get anon(): SupabaseClient {
    return this.anonClient;
  }

  /**
   * Returns the service-role (admin) Supabase client.
   * Used for server-side operations: auth.admin.*, storage, direct DB writes.
   */
  getAdminClient(): SupabaseClient {
    return this.adminClient;
  }

  /**
   * Property getter for admin client.
   */
  get admin(): SupabaseClient {
    return this.adminClient;
  }

  /**
   * Returns a user-scoped Supabase client using the caller's access token.
   * RLS policies will be enforced for this client.
   */
  getUserClient(accessToken: string): SupabaseClient {
    const url = process.env.SUPABASE_URL!;
    const anonKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!;

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

  /** Upload a product image to the 'product-images' bucket; returns the public URL. */
  async uploadProductImage(
    productId: string,
    file: Express.Multer.File,
  ): Promise<string> {
    try {
      const fileExt = extname(file.originalname);
      const filePath = `products/${productId}-${Date.now()}${fileExt}`;

      const { error } = await this.adminClient.storage
        .from('product-images')
        .upload(filePath, file.buffer, {
          contentType: file.mimetype,
          upsert: true,
        });

      if (error) throw error;

      const { data } = this.adminClient.storage
        .from('product-images')
        .getPublicUrl(filePath);

      return data.publicUrl;
    } catch (error) {
      this.logger.error('Product image upload failed', error);
      throw new InternalServerErrorException('Failed to upload product image');
    }
  }

  /** Delete a product image from the 'product-images' bucket. */
  async deleteProductImage(imageUrl: string): Promise<void> {
    try {
      const pathParts = imageUrl.split('product-images/');
      const filePath = pathParts[1] || imageUrl.split('/').pop();
      if (!filePath) return;
      await this.adminClient.storage
        .from('product-images')
        .remove([filePath]);
    } catch (error) {
      this.logger.warn('Error deleting product image', error);
    }
  }

  /** Upload a demand image to the 'demand-images' (or 'product-images') bucket; returns public URL. */
  async uploadDemandImage(
    demandId: string,
    file: Express.Multer.File,
  ): Promise<string> {
    try {
      const fileExt = extname(file.originalname);
      const filePath = `demands/${demandId}-${Date.now()}${fileExt}`;

      let { error } = await this.adminClient.storage
        .from('demand-images')
        .upload(filePath, file.buffer, {
          contentType: file.mimetype,
          upsert: true,
        });

      let bucket = 'demand-images';
      if (error) {
        // Fallback to 'product-images' if 'demand-images' bucket does not exist
        const fb = await this.adminClient.storage
          .from('product-images')
          .upload(filePath, file.buffer, {
            contentType: file.mimetype,
            upsert: true,
          });
        if (!fb.error) {
          bucket = 'product-images';
          error = null;
        }
      }

      if (error) throw error;

      const { data } = this.adminClient.storage
        .from(bucket)
        .getPublicUrl(filePath);

      return data.publicUrl;
    } catch (error) {
      this.logger.error('Demand image upload failed', error);
      throw new InternalServerErrorException('Failed to upload demand image');
    }
  }
}
