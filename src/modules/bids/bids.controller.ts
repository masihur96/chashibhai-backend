import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { BidsService } from './bids.service';
import { CreateBidDto } from './dto/create-bid.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('Bids (Auction)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('bids')
export class BidsController {
  constructor(private readonly bidsService: BidsService) {}

  private extractBuyerId(user: any): string {
    const userId = user?.supabaseId || user?.sub || user?.id;
    if (!userId) {
      throw new UnauthorizedException('User identifier not found in token');
    }
    return userId;
  }

  // ─── 1. POST / (Place a Bid, Role: Buyer) ──────────────────────────────────

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(RolesGuard)
  @Roles(Role.BUYER, Role.ADMIN)
  @ApiOperation({
    summary:
      'Place a bid on an active auction product (Buyer role only; amount must exceed highest bid)',
  })
  @ApiResponse({
    status: 201,
    description: 'Bid placed successfully.',
    schema: {
      example: {
        success: true,
        data: {
          id: 'b8e97f0a-14f7-4180-a612-8178cbe7754f',
          productId: 'c194b6fa-14f7-4180-a612-8178cbe7754f',
          buyerId: 'b149b5fa-14f7-4180-a612-8178cbe7754f',
          amount: 55.0,
          createdAt: '2026-11-20T10:15:00.000Z',
        },
      },
    },
  })
  async placeBid(
    @CurrentUser() user: any,
    @Body() dto: CreateBidDto,
  ) {
    const buyerId = this.extractBuyerId(user);
    const bid = await this.bidsService.placeBid(buyerId, dto);
    return {
      success: true,
      data: bid,
    };
  }

  // ─── 2. GET /my (Buyer's Own Bids, Role: Buyer) ─────────────────────────────

  @Get('my')
  @UseGuards(RolesGuard)
  @Roles(Role.BUYER, Role.ADMIN)
  @ApiOperation({ summary: "Get authenticated buyer's own placed bids" })
  @ApiResponse({
    status: 200,
    description: "List of buyer's bids with product summary.",
  })
  async getMyBids(@CurrentUser() user: any) {
    const buyerId = this.extractBuyerId(user);
    const bids = await this.bidsService.getMyBids(buyerId);
    return {
      success: true,
      data: bids,
    };
  }

  // ─── 3. GET /product/:productId/winner (Winning Bid, Role: Any) ────────────

  @Get('product/:productId/winner')
  @ApiOperation({
    summary:
      'Get winning bid for a product (Available only after auction endTime)',
  })
  @ApiParam({ name: 'productId', description: 'Product UUID' })
  @ApiResponse({
    status: 200,
    description: 'Winning bid returned after auction completion.',
  })
  async getWinningBid(@Param('productId') productId: string) {
    const result = await this.bidsService.getWinningBid(productId);
    return {
      success: true,
      data: result,
    };
  }

  // ─── 4. GET /product/:productId (All Bids for a Product, Role: Any) ────────

  @Get('product/:productId')
  @ApiOperation({
    summary: 'Get all bids for a product sorted by amount in descending order',
  })
  @ApiParam({ name: 'productId', description: 'Product UUID' })
  @ApiResponse({
    status: 200,
    description: 'List of all bids on this product.',
  })
  async getBidsForProduct(@Param('productId') productId: string) {
    const bids = await this.bidsService.getBidsForProduct(productId);
    return {
      success: true,
      data: bids,
    };
  }
}
