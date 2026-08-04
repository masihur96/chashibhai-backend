import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { extname } from 'path';
import 'multer';


@Injectable()
export class SupabaseService {
  private supabase: SupabaseClient;

  constructor() {
    // Supabase-এর সাথে কানেকশন তৈরি
    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
  }

  // ফাইল আপলোড করার ফাংশন
  async uploadAvatar(userId: string, file: Express.Multer.File): Promise<string> {
    try {
      // ফাইলের নাম ইউনিক করার জন্য ইউজারের আইডি এবং এক্সটেনশন ব্যবহার করা হচ্ছে
      const fileExt = extname(file.originalname);
      const fileName = `${userId}${fileExt}`;
      const filePath = `public/${fileName}`;

      // Supabase-এ আপলোড করা হচ্ছে
      const { data, error } = await this.supabase.storage
        .from('avatars')
        .upload(filePath, file.buffer, {
          contentType: file.mimetype,
          upsert: true, // একই নামে ফাইল থাকলে রিপ্লেস হয়ে যাবে
        });

      if (error) throw error;

      // আপলোড শেষে পাবলিক URL রিটার্ন করা হচ্ছে
      const { data: publicUrlData } = this.supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      return publicUrlData.publicUrl;
    } catch (error) {
      throw new InternalServerErrorException('Failed to upload image to Supabase');
    }
  }

  // ফাইল ডিলিট করার ফাংশন
  async deleteAvatar(userId: string, avatarUrl: string): Promise<void> {
    try {
      // URL থেকে ফাইলের নাম বের করা হচ্ছে
      const fileName = avatarUrl.split('/').pop();
      if (!fileName) return;

      const filePath = `public/${fileName}`;
      await this.supabase.storage.from('avatars').remove([filePath]);
    } catch (error) {
      console.log('Error deleting avatar from storage', error);
    }
  }
}