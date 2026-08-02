import { Injectable, BadRequestException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { SignupDto } from './dto/signup.dto';

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
}