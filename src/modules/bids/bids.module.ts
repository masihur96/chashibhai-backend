import { Module } from '@nestjs/common';
import { BidsController } from './bids.controller';
import { BidsService } from './bids.service';
import { BidsGateway } from './bids.gateway';
import { SupabaseModule } from '../supabase/supabase.module';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [SupabaseModule, PrismaModule],
  controllers: [BidsController],
  providers: [BidsService, BidsGateway],
  exports: [BidsService, BidsGateway],
})
export class BidsModule {}
