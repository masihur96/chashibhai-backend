import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  // ভবিষ্যতে এখানে চাইলে কাস্টম লজিক বা এরর হ্যান্ডলিং যোগ করা যাবে
}