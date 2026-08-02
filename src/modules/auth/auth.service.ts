import { Injectable, BadRequestException,NotFoundException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  // UsersService ইনজেক্ট করা হলো ডাটাবেসে ইউজার সেভ করার জন্য
  constructor(private readonly usersService: UsersService) {}

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
    // চেক করা হচ্ছে ইউজার ফোন বা ইমেইল কোনোটি দিয়েছে কিনা
    if (!loginDto.phone && !loginDto.email) {
      throw new BadRequestException('Please provide either phone or email');
    }

    let user;

    // ফোন নাম্বার দিয়ে ডাটাবেসে খোঁজা
    if (loginDto.phone) {
      user = await this.usersService.findByPhone(loginDto.phone);
    } 
    // ইমেইল দিয়ে ডাটাবেসে খোঁজা
    else if (loginDto.email) {
      user = await this.usersService.findByEmail(loginDto.email);
    }

    // ইউজার না পাওয়া গেলে এরর থ্রো করা
    if (!user) {
      throw new NotFoundException('User not found. Please sign up first.');
    }

    // ইউজার পাওয়া গেলে তার সম্পূর্ণ প্রোফাইল রিটার্ন করা
    return user;
  }

}