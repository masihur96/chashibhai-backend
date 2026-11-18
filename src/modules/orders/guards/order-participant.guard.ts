import {
  Injectable,
  CanActivate,
  ExecutionContext,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';

@Injectable()
export class OrderParticipantGuard implements CanActivate {
  constructor(private readonly supabaseService: SupabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const orderId = request.params.id;

    if (!orderId) {
      return true;
    }

    const user = request.user;
    const userId = user?.supabaseId || user?.sub || user?.id;

    if (!userId) {
      throw new ForbiddenException('User identification missing from token');
    }

    const client = this.supabaseService.getAdminClient();
    const { data: order, error } = await client
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (error || !order) {
      throw new NotFoundException(`Order with ID "${orderId}" not found`);
    }

    const isBuyer = order.buyer_id === userId;
    const isFarmer = order.farmer_id === userId;
    const isAdmin = user?.role?.toUpperCase() === 'ADMIN';

    if (!isBuyer && !isFarmer && !isAdmin) {
      throw new ForbiddenException(
        'Access denied: You are not a participant in this order',
      );
    }

    // Attach order to request for downstream handlers
    request.order = order;

    return true;
  }
}
