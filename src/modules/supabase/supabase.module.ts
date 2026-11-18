import { Module, Global } from '@nestjs/common';
import { SupabaseService } from './supabase.service';

@Global() // যেকোনো মডিউলে import ছাড়াই SupabaseService ব্যবহার করা যাবে
@Module({
  providers: [SupabaseService],
  exports: [SupabaseService],
})
export class SupabaseModule {}
