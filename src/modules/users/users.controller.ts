import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
  ApiBody,
  ApiParam,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { UsersService } from './users.service';
import { SupabaseService } from '../supabase/supabase.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { QueryUserDto } from './dto/query-user.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly supabaseService: SupabaseService,
  ) {}

  private extractUserId(user: any): string {
    const userId = user?.supabaseId || user?.sub || user?.id;
    if (!userId) {
      throw new UnauthorizedException('User ID not found in session token');
    }
    return userId;
  }

  // ─── 1. GET /me (Get own profile) ──────────────────────────────────────────

  @Get('me')
  @ApiOperation({ summary: 'Get current logged-in user profile' })
  @ApiResponse({
    status: 200,
    description: 'Returns the user profile.',
    schema: {
      example: {
        success: true,
        data: {
          id: 'b149b5fa-14f7-4180-a612-8178cbe7754f',
          name: 'Rafiq Ahmed',
          phone: '01712345678',
          role: 'farmer',
          rating: 4.5,
          ratingCount: 12,
          walletBalance: 1200.0,
          isVerified: true,
          nidVerified: false,
          district: 'Bogura',
          avatarUrl: 'https://cdn.example.com/avatar.jpg',
        },
      },
    },
  })
  async getMe(@CurrentUser() user: any) {
    const userId = this.extractUserId(user);
    const profile = await this.usersService.getProfile(userId);
    return {
      success: true,
      data: profile,
    };
  }

  @Get('profile')
  @ApiOperation({ summary: 'Alias for /me — Get own profile' })
  async getProfileAlias(@CurrentUser() user: any) {
    return this.getMe(user);
  }

  // ─── 2. PATCH /me (Update own profile) ─────────────────────────────────────

  @Patch('me')
  @ApiOperation({
    summary: 'Update own profile (Name, Avatar URL or Avatar File, District)',
  })
  @ApiConsumes('application/json', 'multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', example: 'Rafiq Ahmed' },
        avatarUrl: {
          type: 'string',
          example: 'https://cdn.example.com/avatar.jpg',
        },
        district: { type: 'string', example: 'Bogura' },
        file: {
          type: 'string',
          format: 'binary',
          description: 'Optional avatar image file',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Profile updated successfully.',
    schema: {
      example: {
        success: true,
        data: {
          id: 'b149b5fa-14f7-4180-a612-8178cbe7754f',
          name: 'Rafiq Ahmed',
          phone: '01712345678',
          role: 'farmer',
          rating: 4.5,
          walletBalance: 1200.0,
          isVerified: true,
        },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
      fileFilter: (req, file, cb) => {
        if (!file.mimetype.match(/\/(jpg|jpeg|png|webp)$/)) {
          return cb(
            new BadRequestException(
              'Only image files (jpg, jpeg, png, webp) are allowed!',
            ),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  async updateMe(
    @CurrentUser() user: any,
    @Body() dto: UpdateProfileDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const userId = this.extractUserId(user);
    const updated = await this.usersService.updateProfile(userId, dto, file);
    return {
      success: true,
      data: updated,
    };
  }

  @Patch('profile')
  @ApiOperation({ summary: 'Alias for /me — Update own profile' })
  async updateProfileAlias(
    @CurrentUser() user: any,
    @Body() dto: UpdateProfileDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.updateMe(user, dto, file);
  }

  // ─── 3. GET /farmers (List all farmers, Role: Buyer) ───────────────────────

  @Get('farmers')
  @UseGuards(RolesGuard)
  @Roles(Role.BUYER, Role.ADMIN)
  @ApiOperation({
    summary: 'List all farmers (Buyer role only, paginated with filters)',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of farmers.',
  })
  async getFarmers(@Query() query: QueryUserDto) {
    return this.usersService.listUsersByRole('farmer', query);
  }

  // ─── 4. GET /buyers (List all buyers, Role: Farmer) ─────────────────────────

  @Get('buyers')
  @UseGuards(RolesGuard)
  @Roles(Role.FARMER, Role.ADMIN)
  @ApiOperation({
    summary: 'List all buyers (Farmer role only, paginated with filters)',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of buyers.',
  })
  async getBuyers(@Query() query: QueryUserDto) {
    return this.usersService.listUsersByRole('buyer', query);
  }

  // ─── 5. GET /:id (Get public profile, Role: Any) ───────────────────────────

  @Get(':id')
  @ApiOperation({
    summary:
      'Get public profile by ID (name, role, rating, rating_count, avatar_url)',
  })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({
    status: 200,
    description: 'Public profile details.',
    schema: {
      example: {
        success: true,
        data: {
          id: 'uuid',
          name: 'Rafiq Ahmed',
          role: 'farmer',
          rating: 4.5,
          ratingCount: 10,
          avatarUrl: 'https://cdn.example.com/avatar.jpg',
        },
      },
    },
  })
  async getPublicProfile(@Param('id') id: string) {
    const profile = await this.usersService.getPublicProfile(id);
    return {
      success: true,
      data: profile,
    };
  }

  // ─── Avatar Upload & Delete Endpoints ─────────────────────────────────────

  @Post('avatar')
  @ApiOperation({ summary: 'Upload profile avatar' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (req, file, cb) => {
        if (!file.mimetype.match(/\/(jpg|jpeg|png|webp)$/)) {
          return cb(
            new BadRequestException(
              'Only image files (jpg, jpeg, png, webp) are allowed!',
            ),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  async uploadAvatar(
    @CurrentUser() user: any,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('File is required');
    const userId = this.extractUserId(user);

    const avatarUrl = await this.supabaseService.uploadAvatar(userId, file);
    await this.usersService.updateProfile(userId, { avatarUrl });

    return {
      success: true,
      message: 'Avatar uploaded successfully',
      data: { avatarUrl },
    };
  }

  @Delete('avatar')
  @ApiOperation({ summary: 'Delete profile avatar' })
  async deleteAvatar(@CurrentUser() user: any) {
    const userId = this.extractUserId(user);
    const profile = await this.usersService.getProfile(userId);

    if (profile?.avatarUrl) {
      await this.supabaseService.deleteAvatar(profile.avatarUrl);
      await this.usersService.updateProfile(userId, { avatarUrl: '' });
    }

    return { success: true, message: 'Avatar deleted successfully' };
  }

  // ─── Verification submission & Admin approval ─────────────────────────────

  @Post('verify/submit')
  @ApiOperation({ summary: 'Submit NID for account verification' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async submitVerification(
    @CurrentUser() user: any,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('NID Document is required');
    const userId = this.extractUserId(user);

    const nidUrl = await this.supabaseService.uploadAvatar(
      `nid_${userId}`,
      file,
    );

    await this.usersService.submitVerification(userId, nidUrl);

    return {
      success: true,
      message:
        'Verification request submitted successfully. Please wait for admin approval.',
      data: { nidUrl },
    };
  }

  @Patch('verify/approve/:userId')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Admin Only: Approve or reject user verification' })
  async approveVerification(
    @Param('userId') targetUserId: string,
    @Body('action') action: 'APPROVE' | 'REJECT',
  ) {
    if (action === 'APPROVE') {
      await this.usersService.updateVerificationStatus(
        targetUserId,
        'APPROVED',
        true,
      );
      return { success: true, message: 'User verification approved.' };
    } else {
      await this.usersService.updateVerificationStatus(
        targetUserId,
        'REJECTED',
        false,
      );
      return { success: true, message: 'User verification rejected.' };
    }
  }
}
