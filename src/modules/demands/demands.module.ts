import { Module } from '@nestjs/common';
import { DemandsController } from './demands.controller';
import { DemandsService } from './demands.service';
import { DemandsScheduler } from './demands.scheduler';
import { OrdersModule } from '../orders/orders.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [SupabaseModule, PrismaModule, OrdersModule, NotificationsModule],
  controllers: [DemandsController],
  providers: [DemandsService, DemandsScheduler],
  exports: [DemandsService],
})
export class DemandsModule {}
