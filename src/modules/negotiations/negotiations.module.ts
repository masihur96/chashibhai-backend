import { Module } from '@nestjs/common';
import { NegotiationsController } from './negotiations.controller';
import { NegotiationsService } from './negotiations.service';
import { NegotiationsGateway } from './negotiations.gateway';
import { NegotiationParticipantGuard } from './guards/negotiation-participant.guard';
import { OrdersModule } from '../orders/orders.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [SupabaseModule, PrismaModule, OrdersModule],
  controllers: [NegotiationsController],
  providers: [
    NegotiationsService,
    NegotiationsGateway,
    NegotiationParticipantGuard,
  ],
  exports: [NegotiationsService, NegotiationsGateway],
})
export class NegotiationsModule {}
