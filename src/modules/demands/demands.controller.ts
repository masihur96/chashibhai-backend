import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
  ApiParam,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { DemandsService } from './demands.service';
import { CreateDemandDto } from './dto/create-demand.dto';
import { UpdateDemandDto } from './dto/update-demand.dto';
import { QueryDemandDto } from './dto/query-demand.dto';
import { CreateDemandOfferDto } from './dto/create-demand-offer.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('Demands')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('demands')
export class DemandsController {
  constructor(private readonly demandsService: DemandsService) {}

  private extractUser(user: any): { userId: string; role?: string } {
    const userId = user?.supabaseId || user?.sub || user?.id;
    if (!userId) {
      throw new UnauthorizedException('User identifier not found in token');
    }
    return { userId, role: user?.role };
  }

  // ─── 1. POST / (Post a Demand, Role: Buyer) ────────────────────────────────

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(RolesGuard)
  @Roles(Role.BUYER, Role.ADMIN)
  @ApiOperation({ summary: 'Post a demand listing (Buyer role only)' })
  @ApiConsumes('application/json', 'multipart/form-data')
  @ApiResponse({
    status: 201,
    description: 'Demand post created successfully.',
  })
  @UseInterceptors(FileInterceptor('file'))
  async create(
    @CurrentUser() user: any,
    @Body() dto: CreateDemandDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const { userId } = this.extractUser(user);
    const demand = await this.demandsService.create(userId, dto, file);
    return {
      success: true,
      data: demand,
    };
  }

  // ─── 2. GET / (Browse All Active Demands, Role: Farmer) ────────────────────

  @Get()
  @UseGuards(RolesGuard)
  @Roles(Role.FARMER, Role.ADMIN)
  @ApiOperation({
    summary:
      'Browse all active demands in marketplace (Farmer role only; filter by search, price, tradeType)',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of active demands.',
  })
  async findAll(@Query() query: QueryDemandDto) {
    const result = await this.demandsService.findAll(query);
    return {
      success: true,
      ...result,
    };
  }

  // ─── 3. GET /my (Buyer's Own Demands, Role: Buyer) ──────────────────────────

  @Get('my')
  @UseGuards(RolesGuard)
  @Roles(Role.BUYER, Role.ADMIN)
  @ApiOperation({ summary: "Get authenticated buyer's own posted demands" })
  @ApiResponse({
    status: 200,
    description: "List of authenticated buyer's demands with offers count.",
  })
  async getMyDemands(
    @CurrentUser() user: any,
    @Query() query: QueryDemandDto,
  ) {
    const { userId } = this.extractUser(user);
    const result = await this.demandsService.findMyDemands(userId, query);
    return {
      success: true,
      ...result,
    };
  }

  // ─── 4. GET /:id (Get Demand Details, Role: Any) ───────────────────────────

  @Get(':id')
  @ApiOperation({ summary: 'Get demand details by demand ID' })
  @ApiParam({ name: 'id', description: 'Demand UUID' })
  @ApiResponse({
    status: 200,
    description: 'Demand details returned successfully.',
  })
  async findOne(@Param('id') id: string) {
    const demand = await this.demandsService.findOne(id);
    return {
      success: true,
      data: demand,
    };
  }

  // ─── 5. PATCH /:id (Update Demand, Role: Buyer / Owner) ────────────────────

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.BUYER, Role.ADMIN)
  @ApiOperation({ summary: 'Update demand post (Owner buyer only)' })
  @ApiParam({ name: 'id', description: 'Demand UUID' })
  @ApiResponse({
    status: 200,
    description: 'Demand updated successfully.',
  })
  async update(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() dto: UpdateDemandDto,
  ) {
    const { userId, role } = this.extractUser(user);
    const updated = await this.demandsService.update(id, userId, dto, role);
    return {
      success: true,
      data: updated,
    };
  }

  // ─── 6. DELETE /:id (Delete Demand, Role: Buyer / Owner) ───────────────────

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.BUYER, Role.ADMIN)
  @ApiOperation({ summary: 'Delete demand post (Owner buyer only)' })
  @ApiParam({ name: 'id', description: 'Demand UUID' })
  @ApiResponse({
    status: 200,
    description: 'Demand deleted successfully.',
  })
  async remove(@Param('id') id: string, @CurrentUser() user: any) {
    const { userId, role } = this.extractUser(user);
    return this.demandsService.remove(id, userId, role);
  }

  // ─── 7. POST /:id/offer (Farmer Makes an Offer, Role: Farmer) ──────────────

  @Post(':id/offer')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(RolesGuard)
  @Roles(Role.FARMER, Role.ADMIN)
  @ApiOperation({
    summary:
      'Farmer submits an offer on an active demand post (with offerPrice and optional note)',
  })
  @ApiParam({ name: 'id', description: 'Demand UUID' })
  @ApiResponse({
    status: 201,
    description: 'Offer submitted successfully.',
  })
  async createOffer(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() dto: CreateDemandOfferDto,
  ) {
    const { userId } = this.extractUser(user);
    const offer = await this.demandsService.createOffer(id, userId, dto);
    return {
      success: true,
      data: offer,
    };
  }

  // ─── 8. GET /:id/offers (List Offers on a Demand, Role: Buyer / Owner) ─────

  @Get(':id/offers')
  @UseGuards(RolesGuard)
  @Roles(Role.BUYER, Role.ADMIN)
  @ApiOperation({
    summary: 'List all offers submitted on a demand post (Demand owner only)',
  })
  @ApiParam({ name: 'id', description: 'Demand UUID' })
  @ApiResponse({
    status: 200,
    description: 'List of offers for this demand.',
  })
  async getOffers(@Param('id') id: string, @CurrentUser() user: any) {
    const { userId, role } = this.extractUser(user);
    const offers = await this.demandsService.getOffers(id, userId, role);
    return {
      success: true,
      data: offers,
    };
  }

  // ─── 9. POST /:id/offers/:offerId/accept (Accept Offer → Create Order) ─────

  @Post(':id/offers/:offerId/accept')
  @UseGuards(RolesGuard)
  @Roles(Role.BUYER, Role.ADMIN)
  @ApiOperation({
    summary:
      'Accept an offer: sets demand.status = "fulfilled", creates order via OrdersService, and notifies farmer',
  })
  @ApiParam({ name: 'id', description: 'Demand UUID' })
  @ApiParam({ name: 'offerId', description: 'Offer UUID' })
  @ApiResponse({
    status: 200,
    description: 'Offer accepted, demand fulfilled, order created.',
  })
  async acceptOffer(
    @Param('id') demandId: string,
    @Param('offerId') offerId: string,
    @CurrentUser() user: any,
  ) {
    const { userId, role } = this.extractUser(user);
    return this.demandsService.acceptOffer(demandId, offerId, userId, role);
  }
}
