import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrderParticipantGuard } from './guards/order-participant.guard';
import { WalletModule } from '../wallet/wallet.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [
    SupabaseModule,
    PrismaModule,
    WalletModule,
    NotificationsModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService, OrderParticipantGuard],
  exports: [OrdersService],
})
export class OrdersModule {}
