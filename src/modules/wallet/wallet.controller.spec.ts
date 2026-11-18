import { Test, TestingModule } from '@nestjs/testing';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import { UnauthorizedException } from '@nestjs/common';
import { DepositDto } from './dto/deposit.dto';
import { WithdrawDto } from './dto/withdraw.dto';
import { QueryTransactionDto } from './dto/query-transaction.dto';

describe('WalletController', () => {
  let controller: WalletController;
  let walletService: Partial<Record<keyof WalletService, jest.Mock>>;

  beforeEach(async () => {
    walletService = {
      getBalance: jest.fn(),
      deposit: jest.fn(),
      withdraw: jest.fn(),
      getTransactions: jest.fn(),
      getEscrowLocks: jest.fn(),
      getEscrowByOrderId: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WalletController],
      providers: [
        {
          provide: WalletService,
          useValue: walletService,
        },
      ],
    }).compile();

    controller = module.get<WalletController>(WalletController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('GET /balance', () => {
    it('should return user wallet balance', async () => {
      const mockBalance = {
        userId: 'user-1',
        name: 'Rafiq Ahmed',
        balance: 15400.0,
      };

      (walletService.getBalance as jest.Mock).mockResolvedValue(mockBalance);

      const result = await controller.getBalance({ sub: 'user-1' });

      expect(result).toEqual({
        success: true,
        data: mockBalance,
      });
      expect(walletService.getBalance).toHaveBeenCalledWith('user-1');
    });

    it('should throw UnauthorizedException if no user in token', async () => {
      await expect(controller.getBalance({})).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('POST /deposit', () => {
    it('should deposit funds into user wallet', async () => {
      const dto: DepositDto = {
        amount: 2500,
        paymentMethod: 'bkash',
        referenceId: 'TX123456',
        note: 'Deposit',
      };
      const mockResult = {
        success: true,
        userId: 'user-1',
        amount: 2500,
        newBalance: 17900.0,
        transactionId: 'trx-1',
        type: 'deposit',
        message: 'Successfully deposited ৳2500 to wallet.',
      };

      (walletService.deposit as jest.Mock).mockResolvedValue(mockResult);

      const result = await controller.deposit({ sub: 'user-1' }, dto);

      expect(result).toEqual({
        success: true,
        data: mockResult,
      });
      expect(walletService.deposit).toHaveBeenCalledWith('user-1', dto);
    });
  });

  describe('POST /withdraw', () => {
    it('should withdraw funds from user wallet', async () => {
      const dto: WithdrawDto = {
        amount: 1000,
        paymentMethod: 'bkash',
        accountNumber: '01700000000',
        note: 'Withdraw',
      };
      const mockResult = {
        success: true,
        userId: 'user-1',
        amount: 1000,
        newBalance: 14400.0,
        transactionId: 'trx-2',
        type: 'withdrawal',
        message: 'Withdrawal request of ৳1000 submitted successfully.',
      };

      (walletService.withdraw as jest.Mock).mockResolvedValue(mockResult);

      const result = await controller.withdraw({ sub: 'user-1' }, dto);

      expect(result).toEqual({
        success: true,
        data: mockResult,
      });
      expect(walletService.withdraw).toHaveBeenCalledWith('user-1', dto);
    });
  });

  describe('GET /transactions', () => {
    it('should return paginated transaction history', async () => {
      const query: QueryTransactionDto = { page: 1, limit: 10, type: 'deposit' };
      const mockResult = {
        data: [
          {
            id: 'trx-1',
            userId: 'user-1',
            orderId: null,
            type: 'deposit',
            amount: 2500,
            note: 'Deposit',
            createdAt: '2026-11-20T10:00:00Z',
          },
        ],
        meta: {
          page: 1,
          limit: 10,
          total: 1,
          totalPages: 1,
        },
      };

      (walletService.getTransactions as jest.Mock).mockResolvedValue(mockResult);

      const result = await controller.getTransactions({ sub: 'user-1' }, query);

      expect(result).toEqual({
        success: true,
        data: mockResult.data,
        meta: mockResult.meta,
      });
      expect(walletService.getTransactions).toHaveBeenCalledWith('user-1', query);
    });
  });

  describe('GET /escrow', () => {
    it('should return active escrow locks for buyer', async () => {
      const mockLocks = [
        {
          id: 'esc-1',
          orderId: 'ord-1',
          buyerId: 'user-1',
          amount: 5000,
          status: 'locked',
          createdAt: '2026-11-20T10:00:00Z',
        },
      ];

      (walletService.getEscrowLocks as jest.Mock).mockResolvedValue(mockLocks);

      const result = await controller.getEscrowLocks({ sub: 'user-1' });

      expect(result).toEqual({
        success: true,
        data: mockLocks,
      });
      expect(walletService.getEscrowLocks).toHaveBeenCalledWith('user-1');
    });
  });

  describe('GET /escrow/:orderId', () => {
    it('should return escrow details for a specific order', async () => {
      const mockEscrow = {
        orderId: 'ord-1',
        buyerId: 'user-1',
        farmerId: 'farmer-1',
        orderStatus: 'pending',
        totalAmount: 5000,
        commission: 250,
        escrowLock: {
          id: 'esc-1',
          orderId: 'ord-1',
          buyerId: 'user-1',
          amount: 5000,
          status: 'locked',
          createdAt: '2026-11-20T10:00:00Z',
        },
        transactions: [],
      };

      (walletService.getEscrowByOrderId as jest.Mock).mockResolvedValue(
        mockEscrow,
      );

      const result = await controller.getEscrowByOrderId('ord-1', {
        sub: 'user-1',
        role: 'buyer',
      });

      expect(result).toEqual({
        success: true,
        data: mockEscrow,
      });
      expect(walletService.getEscrowByOrderId).toHaveBeenCalledWith(
        'ord-1',
        'user-1',
        'buyer',
      );
    });
  });
});
