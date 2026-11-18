import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { UnauthorizedException } from '@nestjs/common';
import { QueryNotificationDto } from './dto';

describe('NotificationsController', () => {
  let controller: NotificationsController;
  let notificationsService: Partial<Record<keyof NotificationsService, jest.Mock>>;

  beforeEach(async () => {
    notificationsService = {
      getUnreadCount: jest.fn(),
      markAllAsRead: jest.fn(),
      findAll: jest.fn(),
      markAsRead: jest.fn(),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [
        {
          provide: NotificationsService,
          useValue: notificationsService,
        },
      ],
    }).compile();

    controller = module.get<NotificationsController>(NotificationsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('GET /unread-count', () => {
    it('should return unread count for user', async () => {
      (notificationsService.getUnreadCount as jest.Mock).mockResolvedValue({
        count: 5,
      });

      const result = await controller.getUnreadCount({ sub: 'user-1' });

      expect(result).toEqual({ success: true, count: 5 });
      expect(notificationsService.getUnreadCount).toHaveBeenCalledWith('user-1');
    });

    it('should throw UnauthorizedException if no user in token', async () => {
      await expect(controller.getUnreadCount({})).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('PATCH /read-all', () => {
    it('should mark all user notifications as read', async () => {
      const mockResult = {
        success: true,
        message: 'All notifications marked as read successfully',
      };
      (notificationsService.markAllAsRead as jest.Mock).mockResolvedValue(
        mockResult,
      );

      const result = await controller.markAllAsRead({ sub: 'user-1' });

      expect(result).toEqual(mockResult);
      expect(notificationsService.markAllAsRead).toHaveBeenCalledWith('user-1');
    });
  });

  describe('GET / (findAll)', () => {
    it('should return paginated user notifications', async () => {
      const query: QueryNotificationDto = { page: 1, limit: 10 };
      const mockResult = {
        data: [{ id: 'notif-1', title: 'Order update', isRead: false }],
        meta: { page: 1, limit: 10, total: 1, totalPages: 1 },
      };
      (notificationsService.findAll as jest.Mock).mockResolvedValue(mockResult);

      const result = await controller.findAll({ sub: 'user-1' }, query);

      expect(result).toEqual({
        success: true,
        data: mockResult.data,
        meta: mockResult.meta,
      });
      expect(notificationsService.findAll).toHaveBeenCalledWith('user-1', query);
    });
  });

  describe('PATCH /:id/read', () => {
    it('should mark a specific notification as read', async () => {
      const mockNotif = { id: 'notif-1', isRead: true };
      (notificationsService.markAsRead as jest.Mock).mockResolvedValue(mockNotif);

      const result = await controller.markAsRead('notif-1', { sub: 'user-1' });

      expect(result).toEqual({
        success: true,
        data: mockNotif,
      });
      expect(notificationsService.markAsRead).toHaveBeenCalledWith('notif-1', 'user-1');
    });
  });

  describe('DELETE /:id', () => {
    it('should delete a notification', async () => {
      const mockResult = {
        success: true,
        message: 'Notification deleted successfully',
      };
      (notificationsService.delete as jest.Mock).mockResolvedValue(mockResult);

      const result = await controller.delete('notif-1', { sub: 'user-1' });

      expect(result).toEqual(mockResult);
      expect(notificationsService.delete).toHaveBeenCalledWith('notif-1', 'user-1');
    });
  });
});
