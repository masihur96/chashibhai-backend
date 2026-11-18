import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Query,
  UseGuards,
  UnauthorizedException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { QueryNotificationDto } from './dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  private extractUser(user: any): { userId: string; role?: string } {
    const userId = user?.supabaseId || user?.sub || user?.id;
    if (!userId) {
      throw new UnauthorizedException('User identifier not found in token');
    }
    return { userId, role: user?.role };
  }

  // ─── 1. GET /unread-count (Must precede /:id) ───────────────────────────────

  @Get('unread-count')
  @ApiOperation({ summary: 'Get total unread notifications count for authenticated user' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Unread notification count.',
    schema: {
      example: {
        success: true,
        count: 4,
      },
    },
  })
  async getUnreadCount(@CurrentUser() user: any) {
    const { userId } = this.extractUser(user);
    const result = await this.notificationsService.getUnreadCount(userId);
    return {
      success: true,
      count: result.count,
    };
  }

  // ─── 2. PATCH /read-all (Must precede /:id/read) ────────────────────────────

  @Patch('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark all notifications as read for authenticated user' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'All notifications marked as read.',
  })
  async markAllAsRead(@CurrentUser() user: any) {
    const { userId } = this.extractUser(user);
    const result = await this.notificationsService.markAllAsRead(userId);
    return result;
  }

  // ─── 3. GET / (List notifications, paginated) ───────────────────────────────

  @Get()
  @ApiOperation({ summary: 'List notifications for authenticated user with filters and pagination' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Paginated user notifications.',
    schema: {
      example: {
        success: true,
        data: [
          {
            id: 'notif-uuid',
            userId: 'user-uuid',
            title: 'Order Delivered 📦',
            message: 'Your order #123 has been confirmed delivered.',
            type: 'order',
            isRead: false,
            metadata: { orderId: 'ord-uuid' },
            createdAt: '2026-11-20T10:00:00Z',
          },
        ],
        meta: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
        },
      },
    },
  })
  async findAll(
    @CurrentUser() user: any,
    @Query() query: QueryNotificationDto,
  ) {
    const { userId } = this.extractUser(user);
    const result = await this.notificationsService.findAll(userId, query);
    return {
      success: true,
      data: result.data,
      meta: result.meta,
    };
  }

  // ─── 4. PATCH /:id/read (Mark single notification as read) ──────────────────

  @Patch(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark a specific notification as read' })
  @ApiParam({ name: 'id', description: 'Notification UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Notification marked as read.',
  })
  async markAsRead(@Param('id') id: string, @CurrentUser() user: any) {
    const { userId } = this.extractUser(user);
    const notification = await this.notificationsService.markAsRead(id, userId);
    return {
      success: true,
      data: notification,
    };
  }

  // ─── 5. DELETE /:id (Delete notification) ───────────────────────────────────

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a notification' })
  @ApiParam({ name: 'id', description: 'Notification UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Notification deleted successfully.',
  })
  async delete(@Param('id') id: string, @CurrentUser() user: any) {
    const { userId } = this.extractUser(user);
    const result = await this.notificationsService.delete(id, userId);
    return result;
  }
}
