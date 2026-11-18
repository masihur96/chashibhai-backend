import {
  Controller,
  Get,
  Post,
  Delete,
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
import { GroupsService } from './groups.service';
import {
  CreateGroupDto,
  JoinGroupDto,
  CreateMessageDto,
  QueryGroupDto,
  QueryMessageDto,
} from './dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MemberGuard } from './member.guard';
import { Role } from '@prisma/client';

@ApiTags('Group Buy')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('groups')
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  private extractUser(user: any): { userId: string; role?: string } {
    const userId = user?.supabaseId || user?.sub || user?.id;
    if (!userId) {
      throw new UnauthorizedException('User identifier not found in token');
    }
    return { userId, role: user?.role };
  }

  // ─── 1. POST / (Create a buying group, Role: Buyer) ──────────────────────────

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(RolesGuard)
  @Roles(Role.BUYER, Role.ADMIN)
  @ApiOperation({ summary: 'Create a new bulk buying group (Buyer only)' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Buying group created successfully.',
  })
  async create(@CurrentUser() user: any, @Body() dto: CreateGroupDto) {
    const { userId } = this.extractUser(user);
    const group = await this.groupsService.create(userId, dto);
    return {
      success: true,
      data: group,
    };
  }

  // ─── 2. GET / (List open groups, Role: Buyer / Any) ──────────────────────────

  @Get()
  @ApiOperation({
    summary: 'List all open bulk buying groups with filters and pagination',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Paginated list of buying groups.',
  })
  async findAll(@Query() query: QueryGroupDto) {
    const result = await this.groupsService.findAll(query);
    return {
      success: true,
      data: result.data,
      meta: result.meta,
    };
  }

  // ─── 3. GET /my (Groups I'm part of, Role: Buyer) ───────────────────────────

  @Get('my')
  @ApiOperation({
    summary:
      'List all buying groups where authenticated user is a member or creator',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'List of user groups.',
  })
  async findMyGroups(@CurrentUser() user: any) {
    const { userId } = this.extractUser(user);
    const groups = await this.groupsService.findMyGroups(userId);
    return {
      success: true,
      data: groups,
    };
  }

  // ─── 4. GET /:id (Group details + members, Role: Member) ────────────────────

  @Get(':id')
  @UseGuards(MemberGuard)
  @ApiOperation({
    summary: 'Get details of a buying group and its members (Member only)',
  })
  @ApiParam({ name: 'id', description: 'Group UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Group details and members.',
  })
  async findOne(@Param('id') id: string, @CurrentUser() user: any) {
    const { userId } = this.extractUser(user);
    const group = await this.groupsService.findOne(id, userId);
    return {
      success: true,
      data: group,
    };
  }

  // ─── 5. POST /:id/join (Join group with quantity, Role: Buyer) ──────────────

  @Post(':id/join')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles(Role.BUYER, Role.ADMIN)
  @ApiOperation({
    summary:
      'Join an open buying group with a contribution quantity (Buyer only)',
  })
  @ApiParam({ name: 'id', description: 'Group UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Joined group successfully.',
  })
  async join(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() dto: JoinGroupDto,
  ) {
    const { userId } = this.extractUser(user);
    const result = await this.groupsService.join(id, userId, dto);
    return {
      success: true,
      data: result,
    };
  }

  // ─── 6. DELETE /:id/leave (Leave group, Role: Member) ───────────────────────

  @Delete(':id/leave')
  @UseGuards(MemberGuard)
  @ApiOperation({
    summary:
      'Leave a buying group before fulfillment, freeing up contribution quantity',
  })
  @ApiParam({ name: 'id', description: 'Group UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Left group successfully.',
  })
  async leave(@Param('id') id: string, @CurrentUser() user: any) {
    const { userId } = this.extractUser(user);
    const result = await this.groupsService.leave(id, userId);
    return {
      success: true,
      data: result,
    };
  }

  // ─── 7. GET /:id/messages (Group chat history, Role: Member) ────────────────

  @Get(':id/messages')
  @UseGuards(MemberGuard)
  @ApiOperation({
    summary: 'Get chat history for a buying group (Member only)',
  })
  @ApiParam({ name: 'id', description: 'Group UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Paginated group chat messages.',
  })
  async getMessages(@Param('id') id: string, @Query() query: QueryMessageDto) {
    const result = await this.groupsService.getMessages(id, query);
    return {
      success: true,
      data: result.data,
      meta: result.meta,
    };
  }

  // ─── 8. POST /:id/messages (Send message, Role: Member) ─────────────────────

  @Post(':id/messages')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(MemberGuard)
  @ApiOperation({
    summary: 'Send a message to the buying group chat (Member only)',
  })
  @ApiParam({ name: 'id', description: 'Group UUID' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Message sent successfully.',
  })
  async sendMessage(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() dto: CreateMessageDto,
  ) {
    const { userId } = this.extractUser(user);
    const message = await this.groupsService.sendMessage(id, userId, dto);
    return {
      success: true,
      data: message,
    };
  }

  // ─── 9. POST /:id/post-demand (Convert group to demand post, Role: Creator) ─

  @Post(':id/post-demand')
  @HttpCode(HttpStatus.OK)
  @UseGuards(MemberGuard)
  @ApiOperation({
    summary:
      'Convert a buying group to a formal marketplace demand post (Creator only)',
  })
  @ApiParam({ name: 'id', description: 'Group UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Group successfully converted to demand post.',
  })
  async postDemand(@Param('id') id: string, @CurrentUser() user: any) {
    const { userId } = this.extractUser(user);
    const result = await this.groupsService.postDemand(id, userId);
    return {
      success: true,
      data: result,
    };
  }
}
