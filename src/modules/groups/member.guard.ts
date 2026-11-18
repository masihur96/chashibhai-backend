import {
  Injectable,
  CanActivate,
  ExecutionContext,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class MemberGuard implements CanActivate {
  constructor(private readonly supabaseService: SupabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const groupId = request.params.id || request.params.groupId;

    if (!groupId) {
      return true;
    }

    const user = request.user;
    const userId = user?.supabaseId || user?.sub || user?.id;

    if (!userId) {
      throw new ForbiddenException('User identification missing from token');
    }

    const client = this.supabaseService.getAdminClient();

    // 1. Fetch group
    const { data: group, error: groupErr } = await client
      .from('buying_groups')
      .select('*')
      .eq('id', groupId)
      .single();

    if (groupErr || !group) {
      throw new NotFoundException(`Buying group with ID "${groupId}" not found`);
    }

    const isCreator = group.created_by === userId;
    const isAdmin = user?.role?.toUpperCase() === 'ADMIN';

    // 2. Fetch membership
    const { data: member } = await client
      .from('group_members')
      .select('*')
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .maybeSingle();

    const isMember = !!member;

    if (!isCreator && !isMember && !isAdmin) {
      throw new ForbiddenException(
        'Access denied: You are not a member of this buying group',
      );
    }

    // Attach group and membership to request for handlers
    request.group = group;
    request.groupMember = member || null;
    request.isGroupCreator = isCreator;

    return true;
  }
}
