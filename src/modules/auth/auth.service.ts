import { Injectable, BadRequestException,NotFoundException,UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { JwtService } from '@nestjs/jwt';
import { RefreshDto } from './dto/refresh.dto'; 

@Injectable()
export class AuthService {
  // UsersService ইনজেক্ট করা হলো ডাটাবেসে ইউজার সেভ করার জন্য
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}



  async signup(signupDto: SignupDto) {

    // চেক করা হচ্ছে ইউজার আগে থেকেই আছে কিনা
    if (signupDto.phone) {
      const existingUser = await this.usersService.findByPhone(signupDto.phone);
      if (existingUser) throw new BadRequestException('Phone number already exists');
    }

    if (signupDto.email) {
      const existingUser = await this.usersService.findByEmail(signupDto.email);
      if (existingUser) throw new BadRequestException('Email already exists');
    }

    // নতুন ইউজার তৈরি করে ডাটাবেসে সেভ করা
    const newUser = await this.usersService.create({
      name: signupDto.name,
      phone: signupDto.phone,
      email: signupDto.email,
      role: signupDto.role,
    });

    return newUser;
  }
async login(loginDto: LoginDto) {
    if (!loginDto.phone && !loginDto.email) {
      throw new BadRequestException('Please provide either phone or email');
    }

    let user;
    if (loginDto.phone) {
      user = await this.usersService.findByPhone(loginDto.phone);
    } else if (loginDto.email) {
      user = await this.usersService.findByEmail(loginDto.email);
    }

    if (!user) {
      throw new NotFoundException('User not found. Please sign up first.');
    }

    const payload = { sub: user.id, phone: user.phone, email: user.email, role: user.role };
    
    // Access Token তৈরি (মেয়াদ ১৫ মিনিট)
    const accessToken = this.jwtService.sign(payload, { expiresIn: '15m' });
    
    // Refresh Token তৈরি (মেয়াদ ৭ দিন)
    const refreshToken = this.jwtService.sign(payload, { expiresIn: '7d' });

    return {
      user,
      accessToken,
      refreshToken,
    };
  }

  // নতুন ফাংশন: রিফ্রেশ টোকেন চেক করে নতুন টোকেন দেওয়া
  async refresh(refreshDto: RefreshDto) {
    try {
      // ১. টোকেনটি ভেরিফাই করা হচ্ছে
      const payload = this.jwtService.verify(refreshDto.refreshToken, {
        secret: process.env.SUPABASE_JWT_SECRET,
      });

      // ২. নতুন টোকেনের জন্য পে-লোড তৈরি
      const newPayload = { sub: payload.sub, phone: payload.phone, email: payload.email, role: payload.role };
      
      // ৩. নতুন টোকেন জেনারেট
      const newAccessToken = this.jwtService.sign(newPayload, { expiresIn: '15m' });
      const newRefreshToken = this.jwtService.sign(newPayload, { expiresIn: '7d' });

      return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      };
    } catch (error) {
      // টোকেনের মেয়াদ শেষ হয়ে গেলে বা ভুল হলে এই এরর থ্রো করবে
      throw new UnauthorizedException('Invalid or expired refresh token. Please login again.');
    }
  }
}