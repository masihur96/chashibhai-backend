import { Module } from '@nestjs/common';
import { GroupsService } from './groups.service';
import { GroupsController } from './groups.controller';
import { GroupsGateway } from './groups.gateway';
import { MemberGuard } from './member.guard';
import { PrismaModule } from '../../prisma/prisma.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { DemandsModule } from '../demands/demands.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    PrismaModule,
    SupabaseModule,
    DemandsModule,
    NotificationsModule,
  ],
  controllers: [GroupsController],
  providers: [GroupsService, GroupsGateway, MemberGuard],
  exports: [GroupsService, GroupsGateway],
})
export class GroupsModule {}
