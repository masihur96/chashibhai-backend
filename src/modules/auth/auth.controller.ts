import { Controller, Post, Body,HttpCode,HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { LoginDto } from './dto/login.dto';


@ApiTags('Authentication') // Swagger-এ সুন্দরভাবে দেখানোর জন্য
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  @ApiOperation({ summary: 'Create a new Farmer or Buyer account' })
  @ApiResponse({ status: 201, description: 'User successfully created.' })
  @ApiResponse({ status: 400, description: 'Bad Request (e.g., Phone already exists).' })
  async signup(@Body() signupDto: SignupDto) {
    return this.authService.signup(signupDto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK) // লগইনের ক্ষেত্রে ডিফল্ট 201 এর বদলে 200 OK স্ট্যাটাস কোড পাঠানো ভালো
  @ApiOperation({ summary: 'Login and fetch user profile from database' })
  @ApiResponse({ status: 200, description: 'User successfully logged in.' })
  @ApiResponse({ status: 404, description: 'User not found in the database.' })
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }
}