import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  Req,
  Headers,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { Request } from 'express';

import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { OtpSendDto } from './dto/otp-send.dto';
import { OtpVerifyDto } from './dto/otp-verify.dto';
import { RefreshDto } from './dto/refresh.dto';
import { KycDto } from './dto/kyc.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ─── POST /auth/register ─────────────────────────────────────────────────────
  @Post('register')
  @ApiOperation({ summary: 'Register with phone + password' })
  @ApiResponse({ status: 201, description: 'User registered successfully' })
  @ApiResponse({
    status: 400,
    description: 'Phone already registered or invalid data',
  })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  // ─── POST /auth/login ─────────────────────────────────────────────────────────
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with phone + password, returns JWT' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  // ─── POST /auth/otp/send ──────────────────────────────────────────────────────
  @Post('otp/send')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send OTP to phone number via Supabase SMS' })
  @ApiResponse({ status: 200, description: 'OTP sent' })
  async sendOtp(@Body() dto: OtpSendDto) {
    return this.authService.sendOtp(dto);
  }

  // ─── POST /auth/otp/verify ────────────────────────────────────────────────────
  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify OTP and get tokens' })
  @ApiResponse({ status: 200, description: 'OTP verified, tokens returned' })
  @ApiResponse({ status: 401, description: 'Invalid or expired OTP' })
  async verifyOtp(@Body() dto: OtpVerifyDto) {
    return this.authService.verifyOtp(dto);
  }

  // ─── POST /auth/kyc/submit ────────────────────────────────────────────────────
  @Post('kyc/submit')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'nidFront', maxCount: 1 },
        { name: 'nidBack', maxCount: 1 },
      ],
      {
        limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB per file
        fileFilter: (_req, file, cb) => {
          if (!file.mimetype.match(/^image\/(jpeg|jpg|png|webp)$/)) {
            cb(new Error('Only JPEG/PNG/WEBP images are allowed'), false);
          } else {
            cb(null, true);
          }
        },
      },
    ),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'NID front, back images plus the NID number',
    schema: {
      type: 'object',
      required: ['nidFront', 'nidBack', 'nidNumber'],
      properties: {
        nidFront: { type: 'string', format: 'binary' },
        nidBack: { type: 'string', format: 'binary' },
        nidNumber: { type: 'string', example: '1234567890123' },
      },
    },
  })
  @ApiOperation({ summary: 'Upload NID documents for KYC verification' })
  @ApiResponse({ status: 200, description: 'KYC submitted' })
  @ApiResponse({ status: 400, description: 'Missing files or invalid data' })
  async submitKyc(
    @CurrentUser() user: { supabaseId: string },
    @UploadedFiles()
    files: {
      nidFront?: Express.Multer.File[];
      nidBack?: Express.Multer.File[];
    },
    @Body() dto: KycDto,
  ) {
    if (!files.nidFront?.[0] || !files.nidBack?.[0]) {
      throw new Error('Both nidFront and nidBack image files are required');
    }
    return this.authService.submitKyc(
      user.supabaseId,
      dto,
      files.nidFront[0],
      files.nidBack[0],
    );
  }

  // ─── POST /auth/refresh ───────────────────────────────────────────────────────
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token using refresh token' })
  @ApiResponse({ status: 200, description: 'New tokens issued' })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  async refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto);
  }

  // ─── POST /auth/logout ────────────────────────────────────────────────────────
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Invalidate the current session' })
  @ApiResponse({ status: 200, description: 'Logged out' })
  async logout(@Headers('authorization') authHeader: string) {
    const token = authHeader?.replace(/^Bearer\s+/i, '') ?? '';
    return this.authService.logout(token);
  }

  // ─── GET /auth/me ─────────────────────────────────────────────────────────────
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the currently authenticated user from token' })
  @ApiResponse({ status: 200, description: 'Current user payload' })
  async me(@CurrentUser() user: any) {
    return { success: true, data: { user } };
  }
}
