import { Test, TestingModule } from '@nestjs/testing';
import { WalletService } from './wallet.service';
import { SupabaseService } from '../supabase/supabase.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';

describe('WalletService', () => {
  let service: WalletService;
  let supabaseMock: any;
  let clientMock: any;
  let prismaMock: any;

  beforeEach(async () => {
    clientMock = {
      from: jest.fn(),
      rpc: jest.fn(),
    };

    supabaseMock = {
      getAdminClient: jest.fn().mockReturnValue(clientMock),
    };

    prismaMock = {};

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletService,
        {
          provide: SupabaseService,
          useValue: supabaseMock,
        },
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
      ],
    }).compile();

    service = module.get<WalletService>(WalletService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── 1. getBalance ──────────────────────────────────────────────────────────

  describe('getBalance', () => {
    it('should return user balance successfully', async () => {
      const mockProfile = {
        id: 'user-1',
        name: 'Rafiq Ahmed',
        wallet_balance: 15400.5,
      };

      const chain: any = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: mockProfile, error: null }),
      };
      clientMock.from.mockReturnValue(chain);

      const result = await service.getBalance('user-1');

      expect(result).toEqual({
        userId: 'user-1',
        name: 'Rafiq Ahmed',
        balance: 15400.5,
      });
      expect(clientMock.from).toHaveBeenCalledWith('profiles');
    });

    it('should throw NotFoundException if profile does not exist', async () => {
      const chain: any = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }),
      };
      clientMock.from.mockReturnValue(chain);

      await expect(service.getBalance('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── 2. deposit ─────────────────────────────────────────────────────────────

  describe('deposit', () => {
    it('should deposit funds using Supabase RPC', async () => {
      clientMock.rpc.mockResolvedValue({
        data: {
          newBalance: 15000.0,
          transactionId: 'trx-123',
        },
        error: null,
      });

      const result = await service.deposit('user-1', {
        amount: 5000,
        paymentMethod: 'bkash',
        referenceId: 'REF123',
        note: 'Deposit test',
      });

      expect(result.success).toBe(true);
      expect(result.amount).toBe(5000);
      expect(result.newBalance).toBe(15000.0);
      expect(result.transactionId).toBe('trx-123');
      expect(clientMock.rpc).toHaveBeenCalledWith('update_wallet_balance', {
        p_user_id: 'user-1',
        p_amount: 5000,
        p_type: 'deposit',
        p_order_id: null,
        p_note: 'Deposit test',
      });
    });

    it('should fall back to direct update if RPC fails', async () => {
      clientMock.rpc.mockRejectedValue(new Error('RPC function missing'));

      const profileChain: any = {
        select: jest.fn(),
        update: jest.fn(),
        eq: jest.fn(),
        single: jest.fn().mockResolvedValue({
          data: { wallet_balance: 10000.0 },
          error: null,
        }),
      };
      profileChain.select.mockReturnValue(profileChain);
      profileChain.update.mockReturnValue(profileChain);
      profileChain.eq.mockReturnValue(profileChain);

      const insertChain: any = {
        insert: jest.fn(),
        select: jest.fn(),
        single: jest.fn().mockResolvedValue({
          data: { id: 'trx-fallback', amount: 2000 },
          error: null,
        }),
      };
      insertChain.insert.mockReturnValue(insertChain);
      insertChain.select.mockReturnValue(insertChain);

      clientMock.from.mockImplementation((table: string) => {
        if (table === 'profiles') {
          return profileChain;
        }
        if (table === 'transactions') {
          return insertChain;
        }
        return {};
      });

      const result = await service.deposit('user-1', {
        amount: 2000,
      });

      expect(result.success).toBe(true);
      expect(result.amount).toBe(2000);
      expect(result.newBalance).toBe(12000.0);
      expect(result.transactionId).toBe('trx-fallback');
    });
  });

  // ─── 3. withdraw ────────────────────────────────────────────────────────────

  describe('withdraw', () => {
    it('should throw BadRequestException if balance is insufficient', async () => {
      const profileChain: any = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { wallet_balance: 500.0 },
          error: null,
        }),
      };
      clientMock.from.mockReturnValue(profileChain);

      await expect(
        service.withdraw('user-1', { amount: 1000 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should withdraw funds successfully when balance is sufficient', async () => {
      const profileChain: any = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { wallet_balance: 5000.0 },
          error: null,
        }),
      };
      clientMock.from.mockReturnValue(profileChain);

      clientMock.rpc.mockResolvedValue({
        data: {
          newBalance: 4000.0,
          transactionId: 'trx-withdraw-1',
        },
        error: null,
      });

      const result = await service.withdraw('user-1', {
        amount: 1000,
        paymentMethod: 'bkash',
        accountNumber: '01700000000',
      });

      expect(result.success).toBe(true);
      expect(result.amount).toBe(1000);
      expect(result.newBalance).toBe(4000.0);
      expect(result.transactionId).toBe('trx-withdraw-1');
    });
  });

  // ─── 4. lockEscrow ──────────────────────────────────────────────────────────

  describe('lockEscrow', () => {
    it('should lock escrow for an order and deduct balance', async () => {
      clientMock.rpc.mockResolvedValue({
        data: { newBalance: 5000 },
        error: null,
      });

      const upsertChain: any = {
        upsert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            id: 'esc-1',
            order_id: 'ord-123',
            buyer_id: 'buyer-1',
            amount: 5000,
            status: 'locked',
          },
          error: null,
        }),
      };
      clientMock.from.mockImplementation((table: string) => {
        if (table === 'escrow_locks') {
          return upsertChain;
        }
        return {};
      });

      // Signature 1: lockEscrow(orderId, buyerId, amount)
      const result = await service.lockEscrow('ord-123', 'buyer-1', 5000);

      expect(result.success).toBe(true);
      expect(result.orderId).toBe('ord-123');
      expect(result.buyerId).toBe('buyer-1');
      expect(result.amount).toBe(5000);
      expect(result.status).toBe('locked');
    });

    it('should support legacy signature lockEscrow(buyerId, amount, orderId)', async () => {
      clientMock.rpc.mockResolvedValue({
        data: { newBalance: 5000 },
        error: null,
      });

      const upsertChain: any = {
        upsert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            id: 'esc-1',
            order_id: 'ord-legacy',
            buyer_id: 'buyer-1',
            amount: 3000,
            status: 'locked',
          },
          error: null,
        }),
      };
      clientMock.from.mockReturnValue(upsertChain);

      const result = await service.lockEscrow('buyer-1', 3000, 'ord-legacy');

      expect(result.success).toBe(true);
      expect(result.orderId).toBe('ord-legacy');
      expect(result.buyerId).toBe('buyer-1');
      expect(result.amount).toBe(3000);
    });
  });

  // ─── 5. releaseEscrow ───────────────────────────────────────────────────────

  describe('releaseEscrow', () => {
    it('should credit farmer net payout after deducting commission', async () => {
      const mockOrder = {
        id: 'ord-100',
        farmer_id: 'farmer-1',
        buyer_id: 'buyer-1',
        final_price: 100,
        quantity: 50,
        commission: 250, // total = 5000, commission = 250, net = 4750
      };

      const mockLock = {
        id: 'esc-100',
        order_id: 'ord-100',
        amount: 5000,
      };

      clientMock.from.mockImplementation((table: string) => {
        if (table === 'escrow_locks') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({ data: mockLock, error: null }),
            update: jest.fn().mockReturnThis(),
          };
        }
        if (table === 'orders') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: mockOrder, error: null }),
          };
        }
        return {};
      });

      clientMock.rpc.mockResolvedValue({ data: {}, error: null });

      const result = await service.releaseEscrow('ord-100');

      expect(result.success).toBe(true);
      expect(result.orderId).toBe('ord-100');
      expect(result.farmerId).toBe('farmer-1');
      expect(result.amount).toBe(5000);
      expect(result.commission).toBe(250);
      expect(result.netPayout).toBe(4750);
      expect(result.status).toBe('released');
    });

    it('should throw NotFoundException if order is not found', async () => {
      clientMock.from.mockImplementation((table: string) => {
        if (table === 'escrow_locks') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
          };
        }
        if (table === 'orders') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }),
          };
        }
        return {};
      });

      await expect(service.releaseEscrow('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── 6. refundEscrow ────────────────────────────────────────────────────────

  describe('refundEscrow', () => {
    it('should refund full escrow amount back to buyer', async () => {
      const mockOrder = {
        id: 'ord-200',
        buyer_id: 'buyer-2',
        final_price: 200,
        quantity: 10,
        commission: 100,
      };

      const mockLock = {
        id: 'esc-200',
        order_id: 'ord-200',
        amount: 2000,
      };

      clientMock.from.mockImplementation((table: string) => {
        if (table === 'escrow_locks') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({ data: mockLock, error: null }),
            update: jest.fn().mockReturnThis(),
          };
        }
        if (table === 'orders') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: mockOrder, error: null }),
          };
        }
        return {};
      });

      clientMock.rpc.mockResolvedValue({ data: {}, error: null });

      const result = await service.refundEscrow('ord-200');

      expect(result.success).toBe(true);
      expect(result.orderId).toBe('ord-200');
      expect(result.buyerId).toBe('buyer-2');
      expect(result.amount).toBe(2000);
      expect(result.status).toBe('refunded');
    });
  });

  // ─── 7. getTransactions ─────────────────────────────────────────────────────

  describe('getTransactions', () => {
    it('should return paginated transaction history for user', async () => {
      const mockRows = [
        {
          id: 'trx-1',
          user_id: 'user-1',
          order_id: 'ord-1',
          type: 'deposit',
          amount: 5000,
          note: 'Top up',
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

      const result = await service.getTransactions('user-1', { page: 1, limit: 10 });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('trx-1');
      expect(result.data[0].amount).toBe(5000);
      expect(result.meta.total).toBe(1);
    });
  });

  // ─── 8. getEscrowLocks ──────────────────────────────────────────────────────

  describe('getEscrowLocks', () => {
    it('should return active escrow locks for buyer', async () => {
      const mockRows = [
        {
          id: 'esc-1',
          order_id: 'ord-1',
          buyer_id: 'buyer-1',
          amount: 5000,
          status: 'locked',
          created_at: '2026-11-20T10:00:00Z',
        },
      ];

      const chain: any = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({
          data: mockRows,
          error: null,
        }),
      };
      clientMock.from.mockReturnValue(chain);

      const result = await service.getEscrowLocks('buyer-1');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('esc-1');
      expect(result[0].amount).toBe(5000);
    });
  });

  // ─── 9. getEscrowByOrderId ──────────────────────────────────────────────────

  describe('getEscrowByOrderId', () => {
    it('should throw ForbiddenException if user is not buyer, farmer, or admin', async () => {
      const mockOrder = {
        id: 'ord-1',
        buyer_id: 'buyer-1',
        farmer_id: 'farmer-1',
        status: 'pending',
      };

      const chain: any = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: mockOrder, error: null }),
      };
      clientMock.from.mockReturnValue(chain);

      await expect(
        service.getEscrowByOrderId('ord-1', 'intruder-id', 'buyer'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should return escrow details if user is a participant', async () => {
      const mockOrder = {
        id: 'ord-1',
        buyer_id: 'buyer-1',
        farmer_id: 'farmer-1',
        status: 'pending',
        final_price: 100,
        quantity: 50,
        commission: 250,
      };

      const mockLock = {
        id: 'esc-1',
        order_id: 'ord-1',
        buyer_id: 'buyer-1',
        amount: 5000,
        status: 'locked',
        created_at: '2026-11-20T10:00:00Z',
      };

      clientMock.from.mockImplementation((table: string) => {
        if (table === 'orders') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: mockOrder, error: null }),
          };
        }
        if (table === 'escrow_locks') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({ data: mockLock, error: null }),
          };
        }
        if (table === 'transactions') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            order: jest.fn().mockResolvedValue({ data: [], error: null }),
          };
        }
        return {};
      });

      const result = await service.getEscrowByOrderId('ord-1', 'buyer-1', 'buyer');

      expect(result.orderId).toBe('ord-1');
      expect(result.buyerId).toBe('buyer-1');
      expect(result.farmerId).toBe('farmer-1');
      expect(result.totalAmount).toBe(5000);
      expect(result.commission).toBe(250);
      expect(result.escrowLock?.amount).toBe(5000);
    });
  });
});
