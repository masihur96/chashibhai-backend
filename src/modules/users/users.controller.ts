import { Controller, Get, Patch, Body, UseGuards, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard'; 
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('Users Profile')
@ApiBearerAuth() // Swagger-এ টোকেন দেওয়ার অপশন চালু করবে
@UseGuards(JwtAuthGuard) // এই কন্ট্রোলারের সব API টোকেন ছাড়া ব্লক করে দেবে
@Controller('users/profile')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

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
}