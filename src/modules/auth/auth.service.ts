import { Injectable, BadRequestException,NotFoundException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { JwtService } from '@nestjs/jwt';

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

    // ইউজারের ডেটা দিয়ে একটি টোকেন তৈরি করা হচ্ছে
    const payload = { 
      sub: user.id, 
      phone: user.phone, 
      email: user.email, 
      role: user.role 
    };
    
    const accessToken = this.jwtService.sign(payload);

    // এখন ইউজার ডেটার সাথে টোকেনটিও রিটার্ন করবে
    return {
      user,
      accessToken,
    };
  }

}