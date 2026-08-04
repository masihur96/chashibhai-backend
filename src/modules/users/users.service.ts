import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma, User, Status } from '@prisma/client';

@Injectable()
export class UsersService {
  // PrismaService-কে ইনজেক্ট করা হলো ডাটাবেসের সাথে কথা বলার জন্য
  constructor(private prisma: PrismaService) {}

  // ID দিয়ে ইউজার খোঁজা
  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { id },
    });
  }

  // ফোন নাম্বার দিয়ে ইউজার খোঁজা
  async findByPhone(phone: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { phone },
    });
  }

  // ইমেইল দিয়ে ইউজার খোঁজা
  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  // নতুন ইউজার তৈরি করা
  async create(data: Prisma.UserCreateInput): Promise<User> {
    return this.prisma.user.create({
      data,
    });
  }

  // ইউজারের তথ্য আপডেট করা
  async update(id: string, data: Prisma.UserUpdateInput): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data,
    });
  }

  // ইউজার মুছে ফেলা (Delete)
  async delete(id: string): Promise<User> {
    return this.prisma.user.delete({
      where: { id },
    });
  }

  // ১. ইউজার ভেরিফিকেশনের জন্য ডকুমেন্ট সাবমিট করবে
  async submitVerification(userId: string, nidUrl: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        nidUrl: nidUrl,
        status: 'PENDING', // স্ট্যাটাস PENDING হয়ে যাবে
      },
    });
  }

  // ২. অ্যাডমিন ভেরিফিকেশন অ্যাপ্রুভ বা রিজেক্ট করবে
  async updateVerificationStatus(userId: string, status: Status, is_verified: boolean) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        status: status,
        is_verified: is_verified,
      },
    });
  }
}