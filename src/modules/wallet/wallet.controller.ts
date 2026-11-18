import {
  Controller,
  Get,
  Post,
  Body,
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
import { WalletService } from './wallet.service';
import { DepositDto } from './dto/deposit.dto';
import { WithdrawDto } from './dto/withdraw.dto';
import { QueryTransactionDto } from './dto/query-transaction.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Wallet & Escrow')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  private extractUser(user: any): { userId: string; role?: string } {
    const userId = user?.supabaseId || user?.sub || user?.id;
    if (!userId) {
      throw new UnauthorizedException('User identifier not found in token');
    }
    return { userId, role: user?.role };
  }

  // ─── 1. GET /balance (Get wallet balance) ──────────────────────────────────

  @Get('balance')
  @ApiOperation({ summary: 'Get authenticated user wallet balance' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Current wallet balance retrieved successfully.',
    schema: {
      example: {
        success: true,
        data: {
          userId: 'c56a4180-65aa-42ec-a945-5fd21dec0538',
          name: 'Rafiq Ahmed',
          balance: 15400.0,
        },
      },
    },
  })
  async getBalance(@CurrentUser() user: any) {
    const { userId } = this.extractUser(user);
    const balance = await this.walletService.getBalance(userId);
    return {
      success: true,
      data: balance,
    };
  }

  // ─── 2. POST /deposit (Deposit funds) ──────────────────────────────────────

  @Post('deposit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deposit funds into wallet' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Funds successfully deposited to wallet.',
    schema: {
      example: {
        success: true,
        data: {
          userId: 'c56a4180-65aa-42ec-a945-5fd21dec0538',
          amount: 5000.0,
          newBalance: 20400.0,
          transactionId: 'trx-uuid',
          type: 'deposit',
          message: 'Successfully deposited ৳5000 to wallet.',
        },
      },
    },
  })
  async deposit(@CurrentUser() user: any, @Body() dto: DepositDto) {
    const { userId } = this.extractUser(user);
    const result = await this.walletService.deposit(userId, dto);
    return {
      success: true,
      data: result,
    };
  }

  // ─── 3. POST /withdraw (Request withdrawal) ────────────────────────────────

  @Post('withdraw')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request withdrawal from wallet' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Withdrawal processed and balance deducted.',
    schema: {
      example: {
        success: true,
        data: {
          userId: 'c56a4180-65aa-42ec-a945-5fd21dec0538',
          amount: 2000.0,
          newBalance: 13400.0,
          transactionId: 'trx-uuid',
          type: 'withdrawal',
          message: 'Withdrawal request of ৳2000 submitted successfully.',
        },
      },
    },
  })
  async withdraw(@CurrentUser() user: any, @Body() dto: WithdrawDto) {
    const { userId } = this.extractUser(user);
    const result = await this.walletService.withdraw(userId, dto);
    return {
      success: true,
      data: result,
    };
  }

  // ─── 4. GET /transactions (Transaction history) ────────────────────────────

  @Get('transactions')
  @ApiOperation({ summary: 'Get paginated transaction history' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Paginated transactions list.',
    schema: {
      example: {
        success: true,
        data: [
          {
            id: 'trx-uuid',
            userId: 'user-uuid',
            orderId: 'ord-uuid',
            type: 'escrow',
            amount: 5000.0,
            note: 'Escrow hold for order #ord-uuid',
            createdAt: '2026-11-20T10:00:00Z',
          },
        ],
        meta: {
          page: 1,
          limit: 10,
          total: 1,
          totalPages: 1,
        },
      },
    },
  })
  async getTransactions(
    @CurrentUser() user: any,
    @Query() query: QueryTransactionDto,
  ) {
    const { userId } = this.extractUser(user);
    const result = await this.walletService.getTransactions(userId, query);
    return {
      success: true,
      data: result.data,
      meta: result.meta,
    };
  }

  // ─── 5. GET /escrow (Active escrow locks for buyer) ─────────────────────────

  @Get('escrow')
  @ApiOperation({ summary: 'List active escrow locks for authenticated user' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'List of escrow locks.',
    schema: {
      example: {
        success: true,
        data: [
          {
            id: 'escrow-uuid',
            orderId: 'order-uuid',
            buyerId: 'buyer-uuid',
            amount: 4500.0,
            status: 'locked',
            createdAt: '2026-11-20T10:00:00Z',
          },
        ],
      },
    },
  })
  async getEscrowLocks(@CurrentUser() user: any) {
    const { userId } = this.extractUser(user);
    const locks = await this.walletService.getEscrowLocks(userId);
    return {
      success: true,
      data: locks,
    };
  }

  // ─── 6. GET /escrow/:orderId (Escrow details for specific order) ───────────

  @Get('escrow/:orderId')
  @ApiOperation({
    summary:
      'Get escrow lock details and transaction history for an order (buyer and farmer only)',
  })
  @ApiParam({ name: 'orderId', description: 'Order UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Escrow lock details for the specified order.',
  })
  async getEscrowByOrderId(
    @Param('orderId') orderId: string,
    @CurrentUser() user: any,
  ) {
    const { userId, role } = this.extractUser(user);
    const escrowDetails = await this.walletService.getEscrowByOrderId(
      orderId,
      userId,
      role,
    );
    return {
      success: true,
      data: escrowDetails,
    };
  }
}
