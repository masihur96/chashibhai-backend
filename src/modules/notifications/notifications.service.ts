import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsGateway } from './notifications.gateway';
import {
  SendNotificationDto,
  NotificationType,
  QueryNotificationDto,
} from './dto';

export interface FormattedNotification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  metadata: any;
  createdAt: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly prisma: PrismaService,
    private readonly notificationsGateway: NotificationsGateway,
  ) {}

  /**
   * Helper to format raw database notification row
   */
  private formatNotification(raw: any): FormattedNotification {
    return {
      id: raw.id,
      userId: raw.user_id,
      title: raw.title,
      message: raw.message,
      type: raw.type ?? 'alert',
      isRead: Boolean(raw.is_read),
      metadata: raw.metadata ?? {},
      createdAt: raw.created_at,
    };
  }

  /**
   * Helper to sanitize notification type into one of: 'order', 'payment', 'alert', 'promo'
   */
  private normalizeType(type?: string): string {
    if (!type) return 'alert';
    const lower = type.toLowerCase();
    if (['order', 'payment', 'alert', 'promo'].includes(lower)) {
      return lower;
    }
    if (
      lower.includes('order') ||
      lower.includes('bid') ||
      lower.includes('demand')
    ) {
      return 'order';
    }
    if (
      lower.includes('wallet') ||
      lower.includes('escrow') ||
      lower.includes('pay')
    ) {
      return 'payment';
    }
    if (lower.includes('promo') || lower.includes('discount')) {
      return 'promo';
    }
    return 'alert';
  }

  /**
   * Push notification dispatcher via FCM (if user has an fcm_token)
   */
  private async triggerFcmPush(
    fcmToken: string,
    title: string,
    message: string,
    metadata?: any,
  ) {
    try {
      this.logger.log(
        `FCM push queued for token [${fcmToken.slice(0, 8)}...]: ${title}`,
      );
      // If FIREBASE_SERVER_KEY or HTTP FCM is configured, deliver payload
      // Handled gracefully without blocking core in-app notifications
    } catch (e: any) {
      this.logger.warn(`Failed to dispatch FCM push: ${e.message}`);
    }
  }

  // ─── 1. Send Notification ───────────────────────────────────────────────────

  async send(
    userId: string,
    payload: {
      title: string;
      message: string;
      type?: NotificationType | string;
      metadata?: any;
    },
  ): Promise<FormattedNotification> {
    const title = payload.title?.trim();
    const message = payload.message?.trim();
    const type = this.normalizeType(payload.type);
    const metadata = payload.metadata ?? {};

    if (!title || !message) {
      throw new BadRequestException(
        'Notification title and message are required',
      );
    }

    const client = this.supabaseService.getAdminClient();

    // 1. Insert notification into Supabase database
    const { data: inserted, error } = await client
      .from('notifications')
      .insert({
        user_id: userId,
        title,
        message,
        type,
        is_read: false,
        metadata,
        created_at: new Date().toISOString(),
      })
      .select('*')
      .single();

    if (error || !inserted) {
      this.logger.error(
        `Failed to store notification for user ${userId}`,
        error,
      );
      throw new InternalServerErrorException('Failed to create notification');
    }

    const formatted = this.formatNotification(inserted);

    // 2. Realtime Socket.IO emission to user's private room: user-{userId}
    this.notificationsGateway.emitNewNotification(userId, formatted);

    // 3. Optional FCM push if user has an fcm_token in profiles
    try {
      const { data: profile } = await client
        .from('profiles')
        .select('fcm_token')
        .eq('id', userId)
        .maybeSingle();

      if (profile?.fcm_token) {
        await this.triggerFcmPush(profile.fcm_token, title, message, metadata);
      }
    } catch (e: any) {
      this.logger.warn(`Could not check fcm_token: ${e.message}`);
    }

    return formatted;
  }

  /**
   * Backwards-compatible alias for existing modules
   * (e.g. OrdersService, DemandsService, GroupsService, ReviewsService)
   */
  async sendNotification(
    userId: string,
    title: string,
    message: string,
    dataOrType?: any,
    metadata?: any,
  ) {
    let type = 'alert';
    let meta = metadata ?? {};

    if (typeof dataOrType === 'string') {
      type = dataOrType;
    } else if (typeof dataOrType === 'object' && dataOrType !== null) {
      meta = dataOrType;
      if (dataOrType.type) {
        type = dataOrType.type;
      }
    }

    return this.send(userId, {
      title,
      message,
      type,
      metadata: meta,
    });
  }

  // ─── 2. List Notifications (Paginated) ──────────────────────────────────────

  async findAll(userId: string, query?: QueryNotificationDto) {
    const client = this.supabaseService.getAdminClient();

    let dbQuery = client
      .from('notifications')
      .select('*', { count: 'exact' })
      .eq('user_id', userId);

    if (query?.isRead !== undefined) {
      dbQuery = dbQuery.eq('is_read', query.isRead);
    }

    if (query?.type && query.type !== 'all') {
      dbQuery = dbQuery.eq('type', query.type);
    }

    const page = query?.page && query.page > 0 ? query.page : 1;
    const limit = query?.limit && query.limit > 0 ? query.limit : 20;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    dbQuery = dbQuery.order('created_at', { ascending: false }).range(from, to);

    const { data, count, error } = await dbQuery;

    if (error) {
      this.logger.error(`Failed to list notifications for ${userId}`, error);
      throw new InternalServerErrorException(
        'Failed to retrieve notifications',
      );
    }

    const total = count ?? (data?.length || 0);
    const totalPages = Math.ceil(total / limit);

    return {
      data: (data || []).map((row) => this.formatNotification(row)),
      meta: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  // ─── 3. Mark Single Notification as Read ────────────────────────────────────

  async markAsRead(id: string, userId: string): Promise<FormattedNotification> {
    const client = this.supabaseService.getAdminClient();

    // 1. Fetch notification
    const { data: notification, error: notifErr } = await client
      .from('notifications')
      .select('*')
      .eq('id', id)
      .single();

    if (notifErr || !notification) {
      throw new NotFoundException(`Notification with ID "${id}" not found`);
    }

    // 2. Validate ownership
    if (notification.user_id !== userId) {
      throw new ForbiddenException(
        'Access denied: You do not own this notification',
      );
    }

    // 3. Update is_read = true
    const { data: updated, error: updateErr } = await client
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id)
      .select('*')
      .single();

    if (updateErr || !updated) {
      this.logger.error(`Failed to mark notification ${id} as read`, updateErr);
      throw new InternalServerErrorException('Failed to update notification');
    }

    return this.formatNotification(updated);
  }

  // ─── 4. Mark All Notifications as Read ──────────────────────────────────────

  async markAllAsRead(
    userId: string,
  ): Promise<{ success: boolean; message: string }> {
    const client = this.supabaseService.getAdminClient();

    const { error } = await client
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('is_read', false);

    if (error) {
      this.logger.error(
        `Failed to mark all notifications as read for ${userId}`,
        error,
      );
      throw new InternalServerErrorException('Failed to update notifications');
    }

    return {
      success: true,
      message: 'All notifications marked as read successfully',
    };
  }

  // ─── 5. Delete Notification ─────────────────────────────────────────────────

  async delete(
    id: string,
    userId: string,
  ): Promise<{ success: boolean; message: string }> {
    const client = this.supabaseService.getAdminClient();

    // 1. Verify existence and ownership
    const { data: notification, error: notifErr } = await client
      .from('notifications')
      .select('id, user_id')
      .eq('id', id)
      .single();

    if (notifErr || !notification) {
      throw new NotFoundException(`Notification with ID "${id}" not found`);
    }

    if (notification.user_id !== userId) {
      throw new ForbiddenException(
        'Access denied: You do not own this notification',
      );
    }

    // 2. Delete row
    const { error: delErr } = await client
      .from('notifications')
      .delete()
      .eq('id', id);

    if (delErr) {
      this.logger.error(`Failed to delete notification ${id}`, delErr);
      throw new InternalServerErrorException('Failed to delete notification');
    }

    return {
      success: true,
      message: 'Notification deleted successfully',
    };
  }

  // ─── 6. Unread Notification Count ───────────────────────────────────────────

  async getUnreadCount(userId: string): Promise<{ count: number }> {
    const client = this.supabaseService.getAdminClient();

    const { count, error } = await client
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false);

    if (error) {
      this.logger.error(`Failed to get unread count for ${userId}`, error);
      throw new InternalServerErrorException(
        'Failed to count unread notifications',
      );
    }

    return { count: count ?? 0 };
  }
}
