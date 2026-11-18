import {
  Controller,
  Get,
  Post,
  Patch,
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
import { NegotiationsService } from './negotiations.service';
import { CreateNegotiationDto } from './dto/create-negotiation.dto';
import { CreateOfferDto } from './dto/create-offer.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { NegotiationParticipantGuard } from './guards/negotiation-participant.guard';
import { Role } from '@prisma/client';

@ApiTags('Negotiations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('negotiations')
export class NegotiationsController {
  constructor(private readonly negotiationsService: NegotiationsService) {}

  private extractUser(user: any): { userId: string; role?: string } {
    const userId = user?.supabaseId || user?.sub || user?.id;
    if (!userId) {
      throw new UnauthorizedException('User identifier not found in token');
    }
    return { userId, role: user?.role };
  }

  // ─── 1. POST / (Initiate Negotiation, Role: Buyer or Farmer) ───────────────

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(RolesGuard)
  @Roles(Role.BUYER, Role.FARMER, Role.ADMIN)
  @ApiOperation({
    summary:
      'Initiate a negotiation (Buyer on a product listing OR Farmer on a demand post)',
  })
  @ApiResponse({
    status: 201,
    description: 'Negotiation initiated successfully.',
  })
  async initiate(
    @CurrentUser() user: any,
    @Body() dto: CreateNegotiationDto,
  ) {
    const { userId, role } = this.extractUser(user);
    const result = await this.negotiationsService.initiate(
      userId,
      role || 'buyer',
      dto,
    );
    return {
      success: true,
      data: result,
    };
  }

  // ─── 2. GET /my (List Own Negotiations, Role: Any Authenticated) ───────────

  @Get('my')
  @ApiOperation({
    summary:
      'List all negotiations where authenticated user is either the buyer or the farmer',
  })
  @ApiResponse({
    status: 200,
    description: 'List of negotiations returned successfully.',
  })
  async getMyNegotiations(@CurrentUser() user: any) {
    const { userId } = this.extractUser(user);
    const negotiations =
      await this.negotiationsService.findMyNegotiations(userId);
    return {
      success: true,
      data: negotiations,
    };
  }

  // ─── 3. GET /:id (Get Details + Offers, Participant Only) ─────────────────

  @Get(':id')
  @UseGuards(NegotiationParticipantGuard)
  @ApiOperation({
    summary:
      'Get negotiation details with offer history (Only buyer and farmer participants can access)',
  })
  @ApiParam({ name: 'id', description: 'Negotiation UUID' })
  @ApiResponse({
    status: 200,
    description: 'Negotiation details and offers history.',
  })
  async findOne(@Param('id') id: string, @CurrentUser() user: any) {
    const { userId, role } = this.extractUser(user);
    const negotiation = await this.negotiationsService.findOne(
      id,
      userId,
      role,
    );
    return {
      success: true,
      data: negotiation,
    };
  }

  // ─── 4. POST /:id/offer (Submit Counter-Offer, Participant Only) ────────────

  @Post(':id/offer')
  @UseGuards(NegotiationParticipantGuard)
  @ApiOperation({
    summary:
      'Submit a counter-offer; sets negotiation status to "countered" and notifies other party',
  })
  @ApiParam({ name: 'id', description: 'Negotiation UUID' })
  @ApiResponse({
    status: 201,
    description: 'Counter-offer created successfully.',
  })
  async createOffer(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() dto: CreateOfferDto,
  ) {
    const { userId, role } = this.extractUser(user);
    return this.negotiationsService.createOffer(id, userId, dto, role);
  }

  // ─── 5. PATCH & POST /:id/accept (Accept Offer → Create Order) ────────────

  @Patch(':id/accept')
  @UseGuards(NegotiationParticipantGuard)
  @ApiOperation({
    summary:
      'Accept latest negotiation offer: sets status to "accepted" and automatically creates order',
  })
  @ApiParam({ name: 'id', description: 'Negotiation UUID' })
  @ApiResponse({
    status: 200,
    description: 'Negotiation accepted and order created.',
  })
  async acceptPatch(@Param('id') id: string, @CurrentUser() user: any) {
    const { userId, role } = this.extractUser(user);
    return this.negotiationsService.acceptNegotiation(id, userId, role);
  }

  @Post(':id/accept')
  @UseGuards(NegotiationParticipantGuard)
  @ApiOperation({ summary: 'Alias POST /:id/accept' })
  async acceptPost(@Param('id') id: string, @CurrentUser() user: any) {
    return this.acceptPatch(id, user);
  }

  // ─── 6. PATCH & POST /:id/reject (Reject Negotiation) ──────────────────────

  @Patch(':id/reject')
  @UseGuards(NegotiationParticipantGuard)
  @ApiOperation({
    summary: 'Reject negotiation: sets status to "rejected"',
  })
  @ApiParam({ name: 'id', description: 'Negotiation UUID' })
  @ApiResponse({
    status: 200,
    description: 'Negotiation rejected.',
  })
  async rejectPatch(@Param('id') id: string, @CurrentUser() user: any) {
    const { userId, role } = this.extractUser(user);
    return this.negotiationsService.rejectNegotiation(id, userId, role);
  }

  @Post(':id/reject')
  @UseGuards(NegotiationParticipantGuard)
  @ApiOperation({ summary: 'Alias POST /:id/reject' })
  async rejectPost(@Param('id') id: string, @CurrentUser() user: any) {
    return this.rejectPatch(id, user);
  }
}
