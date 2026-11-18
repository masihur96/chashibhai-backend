import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Header,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { AdminService } from './admin.service';
import {
  AdminDashboardResponseDto,
  UserFilterDto,
  AnalyticsQueryDto,
  TopUsersQueryDto,
  VerifyUserDto,
  BanUserDto,
  UpdateProductStatusDto,
  UpdateOrderStatusDto,
  AdminOrderFilterDto,
  AdminProductFilterDto,
} from './dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ─── 1. GET /dashboard (Aggregated stats overview) ──────────────────────────

  @Get('dashboard')
  @ApiOperation({ summary: 'Aggregated stats overview of system' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'System overview metrics.',
    type: AdminDashboardResponseDto,
  })
  async getDashboard() {
    const data = await this.adminService.getDashboard();
    return {
      success: true,
      data,
    };
  }

  // ─── 2. GET /users (List all users with filters) ────────────────────────────

  @Get('users')
  @ApiOperation({
    summary: 'List all users with filters, sorting, and pagination',
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Paginated users list.' })
  async getUsers(@Query() filter: UserFilterDto) {
    const result = await this.adminService.getUsers(filter);
    return {
      success: true,
      data: result.data,
      meta: result.meta,
    };
  }

  // ─── 3. PATCH /users/:id/verify (Verify / unverify user) ────────────────────

  @Patch('users/:id/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify or unverify a user NID identity' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'User verified.' })
  async verifyUser(@Param('id') id: string, @Body() dto: VerifyUserDto) {
    return this.adminService.verifyUser(id, dto);
  }

  // ─── 4. PATCH /users/:id/ban (Ban / unban a user) ───────────────────────────

  @Patch('users/:id/ban')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ban or unban a user and invalidate token' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'User ban status updated.',
  })
  async banUser(@Param('id') id: string, @Body() dto: BanUserDto) {
    return this.adminService.banUser(id, dto);
  }

  // ─── 5. GET /products (All products, any status) ────────────────────────────

  @Get('products')
  @ApiOperation({ summary: 'List all products across all statuses' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Paginated products list.',
  })
  async getProducts(@Query() filter: AdminProductFilterDto) {
    const result = await this.adminService.getProducts(filter);
    return {
      success: true,
      data: result.data,
      meta: result.meta,
    };
  }

  // ─── 6. PATCH /products/:id/status (Change product status) ──────────────────

  @Patch('products/:id/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Admin override of product status' })
  @ApiParam({ name: 'id', description: 'Product UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Product status changed.',
  })
  async updateProductStatus(
    @Param('id') id: string,
    @Body() dto: UpdateProductStatusDto,
  ) {
    return this.adminService.updateProductStatus(id, dto);
  }

  // ─── 7. GET /orders (All orders with filters) ───────────────────────────────

  @Get('orders')
  @ApiOperation({ summary: 'List all orders with status and date filters' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Paginated orders list.' })
  async getOrders(@Query() filter: AdminOrderFilterDto) {
    const result = await this.adminService.getOrders(filter);
    return {
      success: true,
      data: result.data,
      meta: result.meta,
    };
  }

  // ─── 8. PATCH /orders/:id/status (Override order status) ────────────────────

  @Patch('orders/:id/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Override order status with financial side effects',
  })
  @ApiParam({ name: 'id', description: 'Order UUID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Order status updated.' })
  async updateOrderStatus(
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.adminService.updateOrderStatus(id, dto);
  }

  // ─── 9. GET /wallet/escrow (All active escrow locks) ────────────────────────

  @Get('wallet/escrow')
  @ApiOperation({ summary: 'List all active escrow locks currently in system' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Active escrow locks list.',
  })
  async getActiveEscrow() {
    const locks = await this.adminService.getActiveEscrowLocks();
    return {
      success: true,
      data: locks,
    };
  }

  // ─── 10. POST /wallet/escrow/:orderId/release (Force release escrow) ────────

  @Post('wallet/escrow/:orderId/release')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Force release escrow funds to farmer for an order',
  })
  @ApiParam({ name: 'orderId', description: 'Order UUID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Escrow released.' })
  async forceReleaseEscrow(@Param('orderId') orderId: string) {
    const result = await this.adminService.forceReleaseEscrow(orderId);
    return {
      success: true,
      data: result,
    };
  }

  // ─── 11. GET /analytics/revenue (Revenue analytics by date range) ───────────

  @Get('analytics/revenue')
  @ApiOperation({ summary: 'Daily revenue analytics grouped by date' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Revenue analytics.' })
  async getRevenueAnalytics(@Query() query: AnalyticsQueryDto) {
    const analytics = await this.adminService.getRevenueAnalytics(query);
    return {
      success: true,
      data: analytics,
    };
  }

  // ─── 12. GET /analytics/top-farmers (Top farmers by order count) ────────────

  @Get('analytics/top-farmers')
  @ApiOperation({ summary: 'Top farmers ranked by completed order count' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Top farmers list.' })
  async getTopFarmers(@Query() query: TopUsersQueryDto) {
    const farmers = await this.adminService.getTopFarmers(query);
    return {
      success: true,
      data: farmers,
    };
  }

  // ─── 13. GET /analytics/top-buyers (Top buyers by spend) ────────────────────

  @Get('analytics/top-buyers')
  @ApiOperation({ summary: 'Top buyers ranked by total financial spend' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Top buyers list.' })
  async getTopBuyers(@Query() query: TopUsersQueryDto) {
    const buyers = await this.adminService.getTopBuyers(query);
    return {
      success: true,
      data: buyers,
    };
  }

  // ─── 14. GET /reports/transactions (Transaction report CSV export) ──────────

  @Get('reports/transactions')
  @Header('Content-Type', 'text/csv')
  @Header(
    'Content-Disposition',
    'attachment; filename="transactions-report.csv"',
  )
  @ApiOperation({ summary: 'Export complete transaction history as CSV' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'CSV report file output.',
  })
  async exportTransactionsReport(): Promise<string> {
    return this.adminService.getTransactionReportCsv();
  }
}
