import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { QueryOrderDto } from './dto/query-order.dto';
import { InvoiceDto } from './dto/invoice.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { OrderParticipantGuard } from './guards/order-participant.guard';
import { Role } from '@prisma/client';

@ApiTags('Orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  private extractUser(user: any): { userId: string; role?: string } {
    const userId = user?.supabaseId || user?.sub || user?.id;
    if (!userId) {
      throw new UnauthorizedException('User identifier not found in token');
    }
    return { userId, role: user?.role };
  }

  // ─── 1. GET /my (List Own Orders, Role: Any) ────────────────────────────────

  @Get('my')
  @ApiOperation({
    summary:
      'List own orders where authenticated user is the buyer or the farmer',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of user orders.',
  })
  async getMyOrders(@CurrentUser() user: any, @Query() query: QueryOrderDto) {
    const { userId } = this.extractUser(user);
    const result = await this.ordersService.findMyOrders(userId, query);
    return {
      success: true,
      ...result,
    };
  }

  // ─── 2. GET /:id/invoice (Generate Invoice Data, Participant Only) ──────────

  @Get(':id/invoice')
  @UseGuards(OrderParticipantGuard)
  @ApiOperation({
    summary:
      'Generate structured invoice data for an order (buyer and farmer only)',
  })
  @ApiParam({ name: 'id', description: 'Order UUID' })
  @ApiResponse({
    status: 200,
    description: 'Structured invoice data.',
    type: InvoiceDto,
  })
  async getInvoice(@Param('id') id: string, @CurrentUser() user: any) {
    const { userId, role } = this.extractUser(user);
    const invoice = await this.ordersService.generateInvoice(id, userId, role);
    return {
      success: true,
      data: invoice,
    };
  }

  // ─── 3. GET /:id (Order Details, Participant Only) ──────────────────────────

  @Get(':id')
  @UseGuards(OrderParticipantGuard)
  @ApiOperation({
    summary: 'Get order details by order ID (participant only)',
  })
  @ApiParam({ name: 'id', description: 'Order UUID' })
  @ApiResponse({
    status: 200,
    description: 'Order details returned successfully.',
  })
  async findOne(@Param('id') id: string, @CurrentUser() user: any) {
    const { userId, role } = this.extractUser(user);
    const order = await this.ordersService.findOne(id, userId, role);
    return {
      success: true,
      data: order,
    };
  }

  // ─── 4. PATCH /:id/dispatch (Mark as Dispatched, Farmer Only) ───────────────

  @Patch(':id/dispatch')
  @UseGuards(RolesGuard, OrderParticipantGuard)
  @Roles(Role.FARMER, Role.ADMIN)
  @ApiOperation({
    summary:
      'Mark order as dispatched; sends push notification to buyer (Farmer only)',
  })
  @ApiParam({ name: 'id', description: 'Order UUID' })
  @ApiResponse({
    status: 200,
    description: 'Order marked as dispatched.',
  })
  async dispatch(@Param('id') id: string, @CurrentUser() user: any) {
    const { userId, role } = this.extractUser(user);
    const order = await this.ordersService.dispatch(id, userId, role);
    return {
      success: true,
      data: order,
    };
  }

  // ─── 5. PATCH /:id/deliver (Confirm Delivery + Release Escrow, Buyer Only) ──

  @Patch(':id/deliver')
  @UseGuards(RolesGuard, OrderParticipantGuard)
  @Roles(Role.BUYER, Role.ADMIN)
  @ApiOperation({
    summary:
      'Confirm delivery: releases escrow to farmer wallet after deducting commission (Buyer only)',
  })
  @ApiParam({ name: 'id', description: 'Order UUID' })
  @ApiResponse({
    status: 200,
    description: 'Delivery confirmed and escrow released.',
  })
  async deliver(@Param('id') id: string, @CurrentUser() user: any) {
    const { userId, role } = this.extractUser(user);
    const order = await this.ordersService.deliver(id, userId, role);
    return {
      success: true,
      data: order,
    };
  }

  // ─── 6. PATCH /:id/cancel (Cancel Order, Participant) ───────────────────────

  @Patch(':id/cancel')
  @UseGuards(OrderParticipantGuard)
  @ApiOperation({
    summary: 'Cancel order: refunds escrow to buyer wallet (Participant only)',
  })
  @ApiParam({ name: 'id', description: 'Order UUID' })
  @ApiResponse({
    status: 200,
    description: 'Order cancelled and escrow refunded.',
  })
  async cancel(@Param('id') id: string, @CurrentUser() user: any) {
    const { userId, role } = this.extractUser(user);
    const order = await this.ordersService.cancel(id, userId, role);
    return {
      success: true,
      data: order,
    };
  }
}
