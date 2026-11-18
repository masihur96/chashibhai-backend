import {
  Injectable,
  CanActivate,
  ExecutionContext,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';

@Injectable()
export class NegotiationParticipantGuard implements CanActivate {
  constructor(private readonly supabaseService: SupabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const negotiationId = request.params.id;

    if (!negotiationId) {
      return true;
    }

    const user = request.user;
    const userId = user?.supabaseId || user?.sub || user?.id;

    if (!userId) {
      throw new ForbiddenException('User identification missing from token');
    }

    const client = this.supabaseService.getAdminClient();
    const { data: negotiation, error } = await client
      .from('negotiations')
      .select('*')
      .eq('id', negotiationId)
      .single();

    if (error || !negotiation) {
      throw new NotFoundException(
        `Negotiation with ID "${negotiationId}" not found`,
      );
    }

    const isBuyer = negotiation.buyer_id === userId;
    const isFarmer = negotiation.farmer_id === userId;
    const isAdmin = user?.role?.toUpperCase() === 'ADMIN';

    if (!isBuyer && !isFarmer && !isAdmin) {
      throw new ForbiddenException(
        'Access denied: You are not a participant in this negotiation',
      );
    }

    // Attach negotiation to request for downstream handlers
    request.negotiation = negotiation;

    return true;
  }
}
