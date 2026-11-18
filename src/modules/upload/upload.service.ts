import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class UploadService {
  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Upload multiple image files to Supabase Storage and return their public URLs.
   */
  async uploadFiles(
    files: Express.Multer.File[],
    bucket: string = 'product-images',
    folder: string = 'products',
  ): Promise<string[]> {
    return this.supabaseService.uploadFiles(files, bucket, folder);
  }
}
