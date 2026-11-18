import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';
import { SupabaseService } from '../supabase/supabase.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsGateway } from './notifications.gateway';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let clientMock: any;
  let supabaseMock: any;
  let prismaMock: any;
  let notificationsGatewayMock: any;

  beforeEach(async () => {
    clientMock = {
      from: jest.fn(),
    };

    supabaseMock = {
      getAdminClient: jest.fn().mockReturnValue(clientMock),
    };

    prismaMock = {};

    notificationsGatewayMock = {
      emitNewNotification: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        {
          provide: SupabaseService,
          useValue: supabaseMock,
        },
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
        {
          provide: NotificationsGateway,
          useValue: notificationsGatewayMock,
        },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── 1. send & sendNotification ─────────────────────────────────────────────

  describe('send', () => {
    it('should throw BadRequestException if title or message is missing', async () => {
      await expect(
        service.send('user-1', { title: '', message: 'Test' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should store notification, emit via Socket.IO, and check FCM', async () => {
      const mockInserted = {
        id: 'notif-1',
        user_id: 'user-1',
        title: 'Order Dispatched',
        message: 'Your order is on the way',
        type: 'order',
        is_read: false,
        metadata: { orderId: 'ord-1' },
        created_at: new Date().toISOString(),
      };

      clientMock.from.mockImplementation((table: string) => {
        if (table === 'notifications') {
          return {
            insert: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: mockInserted, error: null }),
          };
        }
        if (table === 'profiles') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: { fcm_token: 'fcm-token-12345' },
              error: null,
            }),
          };
        }
        return {};
      });

      const result = await service.send('user-1', {
        title: 'Order Dispatched',
        message: 'Your order is on the way',
        type: 'order',
        metadata: { orderId: 'ord-1' },
      });

      expect(result.id).toBe('notif-1');
      expect(result.type).toBe('order');
      expect(notificationsGatewayMock.emitNewNotification).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ id: 'notif-1' }),
      );
    });

    it('sendNotification alias should forward call correctly', async () => {
      const mockInserted = {
        id: 'notif-2',
        user_id: 'user-1',
        title: 'Payment Confirmed',
        message: 'Escrow released',
        type: 'payment',
        is_read: false,
        metadata: { amount: 500 },
        created_at: new Date().toISOString(),
      };

      clientMock.from.mockImplementation((table: string) => {
        if (table === 'notifications') {
          return {
            insert: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: mockInserted, error: null }),
          };
        }
        if (table === 'profiles') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
          };
        }
        return {};
      });

      const result = await service.sendNotification(
        'user-1',
        'Payment Confirmed',
        'Escrow released',
        'payment',
        { amount: 500 },
      );

      expect(result.id).toBe('notif-2');
    });
  });

  // ─── 2. findAll ─────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('should return paginated notifications list', async () => {
      const mockRows = [
        {
          id: 'notif-1',
          user_id: 'user-1',
          title: 'Welcome',
          message: 'Hello!',
          type: 'alert',
          is_read: false,
          created_at: '2026-11-20T10:00:00Z',
        },
      ];

      const chain: any = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockResolvedValue({
          data: mockRows,
          count: 1,
          error: null,
        }),
      };
      clientMock.from.mockReturnValue(chain);

      const result = await service.findAll('user-1', { page: 1, limit: 10 });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('notif-1');
      expect(result.meta.total).toBe(1);
    });
  });

  // ─── 3. markAsRead ──────────────────────────────────────────────────────────

  describe('markAsRead', () => {
    it('should throw NotFoundException if notification does not exist', async () => {
      clientMock.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }),
      });

      await expect(service.markAsRead('missing-id', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException if user is not the owner', async () => {
      clientMock.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: 'notif-1', user_id: 'other-user' },
          error: null,
        }),
      });

      await expect(service.markAsRead('notif-1', 'user-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should set is_read = true and return updated notification', async () => {
      const mockNotif = { id: 'notif-1', user_id: 'user-1', is_read: false };
      const mockUpdated = { id: 'notif-1', user_id: 'user-1', is_read: true };

      clientMock.from.mockImplementation(() => ({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValueOnce({ data: mockNotif, error: null }),
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: mockUpdated, error: null }),
            }),
          }),
        }),
      }));

      const result = await service.markAsRead('notif-1', 'user-1');

      expect(result.isRead).toBe(true);
    });
  });

  // ─── 4. markAllAsRead ───────────────────────────────────────────────────────

  describe('markAllAsRead', () => {
    it('should update all unread notifications for user', async () => {
      clientMock.from.mockReturnValue({
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        then: (resolve: any) => resolve({ error: null }),
      });

      const result = await service.markAllAsRead('user-1');

      expect(result.success).toBe(true);
    });
  });

  // ─── 5. delete ──────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('should throw ForbiddenException if notification belongs to another user', async () => {
      clientMock.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: 'notif-1', user_id: 'other-user' },
          error: null,
        }),
      });

      await expect(service.delete('notif-1', 'user-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should delete notification if owner', async () => {
      clientMock.from.mockImplementation(() => ({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: 'notif-1', user_id: 'user-1' },
          error: null,
        }),
        delete: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: null }),
        }),
      }));

      const result = await service.delete('notif-1', 'user-1');

      expect(result.success).toBe(true);
    });
  });

  // ─── 6. getUnreadCount ──────────────────────────────────────────────────────

  describe('getUnreadCount', () => {
    it('should return unread count for user', async () => {
      clientMock.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        then: (resolve: any) => resolve({ count: 7, error: null }),
      });

      const result = await service.getUnreadCount('user-1');

      expect(result.count).toBe(7);
    });
  });
});
