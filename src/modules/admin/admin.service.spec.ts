import { Test, TestingModule } from '@nestjs/testing';
import { AdminService } from './admin.service';
import { SupabaseService } from '../supabase/supabase.service';
import { PrismaService } from '../../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotFoundException } from '@nestjs/common';

describe('AdminService', () => {
  let service: AdminService;
  let clientMock: any;
  let supabaseMock: any;
  let prismaMock: any;
  let walletServiceMock: any;
  let notificationsServiceMock: any;

  beforeEach(async () => {
    clientMock = {
      from: jest.fn(),
    };

    supabaseMock = {
      getAdminClient: jest.fn().mockReturnValue(clientMock),
    };

    prismaMock = {};

    walletServiceMock = {
      releaseEscrow: jest.fn(),
      refundEscrow: jest.fn(),
    };

    notificationsServiceMock = {
      sendNotification: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        {
          provide: SupabaseService,
          useValue: supabaseMock,
        },
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
        {
          provide: WalletService,
          useValue: walletServiceMock,
        },
        {
          provide: NotificationsService,
          useValue: notificationsServiceMock,
        },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── 1. getDashboard ────────────────────────────────────────────────────────

  describe('getDashboard', () => {
    it('should aggregate system metrics in parallel', async () => {
      clientMock.from.mockImplementation((table: string) => {
        if (table === 'profiles') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                not: jest.fn().mockResolvedValue({ count: 23, error: null }),
                then: (resolve: any) => resolve({ count: 850, error: null }),
              }),
              then: (resolve: any) => resolve({ count: 1240, error: null }),
            }),
          };
        }
        if (table === 'products') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ count: 342, error: null }),
            }),
          };
        }
        if (table === 'orders') {
          return {
            select: jest.fn().mockReturnValue({
              in: jest.fn().mockResolvedValue({ count: 78, error: null }),
            }),
          };
        }
        if (table === 'transactions') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({
                data: [{ amount: 485000 }, { amount: 500000 }],
                error: null,
              }),
            }),
          };
        }
        if (table === 'escrow_locks') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({
                data: [{ amount: 156000 }],
                error: null,
              }),
            }),
          };
        }
        return {};
      });

      const stats = await service.getDashboard();

      expect(stats.totalRevenue).toBe(985000);
      expect(stats.activeEscrow).toBe(156000);
    });
  });

  // ─── 2. getUsers ────────────────────────────────────────────────────────────

  describe('getUsers', () => {
    it('should query users with filters', async () => {
      const mockProfiles = [
        {
          id: 'u-1',
          name: 'Farmer Abdul',
          role: 'farmer',
          is_verified: true,
          nid_verified: true,
          wallet_balance: 500,
        },
      ];

      const chain: any = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockResolvedValue({
          data: mockProfiles,
          count: 1,
          error: null,
        }),
      };
      clientMock.from.mockReturnValue(chain);

      const result = await service.getUsers({ role: 'farmer', page: 1, limit: 10 });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('u-1');
      expect(result.meta.total).toBe(1);
    });
  });

  // ─── 3. verifyUser ──────────────────────────────────────────────────────────

  describe('verifyUser', () => {
    it('should throw NotFoundException if user not found', async () => {
      clientMock.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }),
      });

      await expect(service.verifyUser('missing-user')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should update verification status and notify user', async () => {
      const mockUser = { id: 'u-1', name: 'Abdul', is_verified: true, nid_verified: true };

      clientMock.from.mockImplementation(() => ({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: mockUser, error: null }),
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: mockUser, error: null }),
            }),
          }),
        }),
      }));

      const result = await service.verifyUser('u-1', { isVerified: true });

      expect(result.success).toBe(true);
      expect(notificationsServiceMock.sendNotification).toHaveBeenCalledWith(
        'u-1',
        expect.stringContaining('KYC Verification Approved'),
        expect.any(String),
        'alert',
        expect.any(Object),
      );
    });
  });

  // ─── 4. banUser ─────────────────────────────────────────────────────────────

  describe('banUser', () => {
    it('should ban user, insert into jwt_blacklist, and send notification', async () => {
      const mockUser = { id: 'u-1', name: 'Abdul', is_banned: true };

      clientMock.from.mockImplementation((table: string) => {
        if (table === 'profiles') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: mockUser, error: null }),
            update: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                select: jest.fn().mockReturnValue({
                  single: jest.fn().mockResolvedValue({ data: mockUser, error: null }),
                }),
              }),
            }),
          };
        }
        if (table === 'jwt_blacklist') {
          return {
            insert: jest.fn().mockResolvedValue({ error: null }),
          };
        }
        return {};
      });

      const result = await service.banUser('u-1', { isBanned: true, reason: 'Spam' });

      expect(result.success).toBe(true);
      expect(notificationsServiceMock.sendNotification).toHaveBeenCalledWith(
        'u-1',
        'Account Suspended 🚫',
        expect.any(String),
        'alert',
        expect.any(Object),
      );
    });
  });

  // ─── 5. updateProductStatus ─────────────────────────────────────────────────

  describe('updateProductStatus', () => {
    it('should update product status and notify farmer', async () => {
      const mockUpdated = {
        id: 'p-1',
        product_name: 'Rice',
        farmer_id: 'f-1',
        status: 'cancelled',
      };

      clientMock.from.mockReturnValue({
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: mockUpdated, error: null }),
      });

      const result = await service.updateProductStatus('p-1', { status: 'cancelled' });

      expect(result.success).toBe(true);
      expect(notificationsServiceMock.sendNotification).toHaveBeenCalledWith(
        'f-1',
        'Product Listing Status Updated',
        expect.any(String),
        'alert',
        expect.any(Object),
      );
    });
  });

  // ─── 6. updateOrderStatus ───────────────────────────────────────────────────

  describe('updateOrderStatus', () => {
    it('should override status and release escrow if status is delivered', async () => {
      const mockOrder = {
        id: 'ord-1',
        buyer_id: 'b-1',
        farmer_id: 'f-1',
        status: 'pending',
      };

      clientMock.from.mockImplementation(() => ({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: mockOrder, error: null }),
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: { ...mockOrder, status: 'delivered' },
                error: null,
              }),
            }),
          }),
        }),
      }));

      const result = await service.updateOrderStatus('ord-1', { status: 'delivered' });

      expect(result.success).toBe(true);
      expect(walletServiceMock.releaseEscrow).toHaveBeenCalledWith('ord-1');
      expect(notificationsServiceMock.sendNotification).toHaveBeenCalledTimes(2);
    });
  });

  // ─── 7. getRevenueAnalytics ─────────────────────────────────────────────────

  describe('getRevenueAnalytics', () => {
    it('should group revenue daily by date', async () => {
      const mockTransactions = [
        { amount: 1000, created_at: '2026-11-20T10:00:00Z' },
        { amount: 2000, created_at: '2026-11-20T12:00:00Z' },
        { amount: 1500, created_at: '2026-11-21T09:00:00Z' },
      ];

      const chain: any = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({ data: mockTransactions, error: null }),
      };
      clientMock.from.mockReturnValue(chain);

      const result = await service.getRevenueAnalytics({});

      expect(result.totalRevenue).toBe(4500);
      expect(result.dailyBreakdown).toHaveLength(2);
      expect(result.dailyBreakdown[0].date).toBe('2026-11-20');
      expect(result.dailyBreakdown[0].revenue).toBe(3000);
      expect(result.dailyBreakdown[1].date).toBe('2026-11-21');
      expect(result.dailyBreakdown[1].revenue).toBe(1500);
    });
  });

  // ─── 8. getTopFarmers ───────────────────────────────────────────────────────

  describe('getTopFarmers', () => {
    it('should rank farmers by delivered orders and volume', async () => {
      const mockOrders = [
        {
          farmer_id: 'f-1',
          final_price: 50,
          quantity: 100, // 5000
          farmer: { id: 'f-1', name: 'Farmer 1' },
        },
        {
          farmer_id: 'f-1',
          final_price: 50,
          quantity: 100, // 5000 -> total 10000, 2 orders
          farmer: { id: 'f-1', name: 'Farmer 1' },
        },
        {
          farmer_id: 'f-2',
          final_price: 100,
          quantity: 20, // 2000, 1 order
          farmer: { id: 'f-2', name: 'Farmer 2' },
        },
      ];

      const chain: any = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ data: mockOrders, error: null }),
      };
      clientMock.from.mockReturnValue(chain);

      const result = await service.getTopFarmers({ limit: 10 });

      expect(result).toHaveLength(2);
      expect(result[0].farmerId).toBe('f-1');
      expect(result[0].deliveredOrdersCount).toBe(2);
      expect(result[0].totalSalesVolume).toBe(10000);
    });
  });

  // ─── 9. getTopBuyers ────────────────────────────────────────────────────────

  describe('getTopBuyers', () => {
    it('should rank buyers by spend and order count', async () => {
      const mockOrders = [
        {
          buyer_id: 'b-1',
          final_price: 100,
          quantity: 50, // 5000
          buyer: { id: 'b-1', name: 'Buyer 1' },
        },
        {
          buyer_id: 'b-2',
          final_price: 100,
          quantity: 100, // 10000
          buyer: { id: 'b-2', name: 'Buyer 2' },
        },
      ];

      const chain: any = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ data: mockOrders, error: null }),
      };
      clientMock.from.mockReturnValue(chain);

      const result = await service.getTopBuyers({ limit: 10 });

      expect(result).toHaveLength(2);
      expect(result[0].buyerId).toBe('b-2');
      expect(result[0].totalSpend).toBe(10000);
    });
  });

  // ─── 10. getTransactionReportCsv ───────────────────────────────────────────

  describe('getTransactionReportCsv', () => {
    it('should generate valid CSV report string', async () => {
      const mockTrx = [
        {
          id: 'trx-1',
          user_id: 'u-1',
          order_id: 'ord-1',
          type: 'release',
          amount: 5000,
          note: 'Escrow release, verified',
          created_at: '2026-11-20T10:00:00Z',
          user: { name: 'Abdul, Farmer', phone: '01700000000', role: 'farmer' },
        },
      ];

      const chain: any = {
        select: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({ data: mockTrx, error: null }),
      };
      clientMock.from.mockReturnValue(chain);

      const csv = await service.getTransactionReportCsv();

      expect(csv).toContain('Transaction ID,User ID,User Name,User Phone,User Role');
      expect(csv).toContain('trx-1,u-1,"Abdul, Farmer",01700000000,farmer,ord-1,release,5000,"Escrow release, verified"');
    });
  });
});
