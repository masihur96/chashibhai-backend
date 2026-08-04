import { Controller, Get, Patch,Post,Delete, Body, UseGuards, NotFoundException,UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard'; 
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiBody } from '@nestjs/swagger';
import { SupabaseService } from '../supabase/supabase.service'; // কনস্ট্রাক্টরে ঢোকাতে হবে

import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Role } from '@prisma/client';

@ApiTags('Users Profile')
@ApiBearerAuth() // Swagger-এ টোকেন দেওয়ার অপশন চালু করবে
@UseGuards(JwtAuthGuard) // এই কন্ট্রোলারের সব API টোকেন ছাড়া ব্লক করে দেবে
@Controller('users/profile')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly supabaseService: SupabaseService
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get current logged-in user profile' })
  @ApiResponse({ status: 200, description: 'Returns the user profile.' })
  async getProfile(@CurrentUser() user: any) {
    // JWT টোকেন থেকে আমরা ইউজারের phone বা email পাবো। সেটি দিয়ে ডাটাবেস থেকে লেটেস্ট ডেটা আনব।
    let dbUser;
    
    if (user.phone) {
      dbUser = await this.usersService.findByPhone(user.phone);
    } else if (user.email) {
      dbUser = await this.usersService.findByEmail(user.email);
    }

    if (!dbUser) {
      throw new NotFoundException('User profile not found in database');
    }

    return dbUser;
  }

  @Patch()
  @ApiOperation({ summary: 'Update user profile (Name, Avatar)' })
  @ApiResponse({ status: 200, description: 'Profile updated successfully.' })
  async updateProfile(
    @CurrentUser() user: any,
    @Body() updateData: UpdateProfileDto,
  ) {
    // প্রথমে ডাটাবেস থেকে ইউজারের আসল ID বের করে আনতে হবে
    let dbUser;
    if (user.phone) {
      dbUser = await this.usersService.findByPhone(user.phone);
    } else if (user.email) {
      dbUser = await this.usersService.findByEmail(user.email);
    }

    if (!dbUser) {
      throw new NotFoundException('User profile not found in database');
    }

    // এবার ইউজারের আইডি দিয়ে ডেটা আপডেট করব
    return this.usersService.update(dbUser.id, updateData);
  }

  @Post('avatar')
  @ApiOperation({ summary: 'Upload profile avatar' })
  @ApiConsumes('multipart/form-data') // Swagger-এ ফাইল আপলোডের অপশন দেখানোর জন্য
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: 2 * 1024 * 1024 }, // সর্বোচ্চ 2MB সাইজ
    fileFilter: (req, file, cb) => {
      if (!file.mimetype.match(/\/(jpg|jpeg|png)$/)) {
        return cb(new BadRequestException('Only image files are allowed!'), false);
      }
      cb(null, true);
    },
  }))
  async uploadAvatar(
    @CurrentUser() user: any,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('File is required');

    // 1. Supabase-এ ছবি আপলোড করে URL নিয়ে আসা
    const avatarUrl = await this.supabaseService.uploadAvatar(user.supabaseId || user.phone || user.id, file);

    // 2. ডাটাবেসে ইউজারের প্রোফাইলে URL টি সেভ করা
    const dbUser = await this.usersService.findByPhone(user.phone) || await this.usersService.findByEmail(user.email);
    const updatedUser = await this.usersService.update(dbUser!.id, { avatar: avatarUrl });

    return { message: 'Avatar uploaded successfully', avatarUrl: updatedUser.avatar };
  }

  @Delete('avatar')
  @ApiOperation({ summary: 'Delete profile avatar' })
  async deleteAvatar(@CurrentUser() user: any) {
    const dbUser = await this.usersService.findByPhone(user.phone) || await this.usersService.findByEmail(user.email);
    
    if (dbUser!.avatar) {
      // 1. Supabase Storage থেকে ডিলিট করা
      await this.supabaseService.deleteAvatar(user.supabaseId || user.phone || user.id, dbUser!.avatar);
      // 2. ডাটাবেস থেকে লিংক মুছে ফেলা
      await this.usersService.update(dbUser!.id, { avatar: null });
    }

    return { message: 'Avatar deleted successfully' };
  }

  @Get('admin-only')
  @UseGuards(JwtAuthGuard, RolesGuard) // প্রথমে টোকেন চেক করবে, তারপর Role চেক করবে
  @Roles(Role.ADMIN) // শুধু ADMIN-রাই এটি ব্যবহার করতে পারবে
  @ApiOperation({ summary: 'Admin Dashboard Data (Testing)' })
  getAdminData() {
    return { message: 'Welcome Admin! You have special access.' };
  }

}