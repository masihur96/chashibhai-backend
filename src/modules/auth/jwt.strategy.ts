import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private configService: ConfigService) {
    const secret = configService.get<string>('SUPABASE_JWT_SECRET');
    if (!secret) {
      throw new Error('SUPABASE_JWT_SECRET is not defined in environment variables');
    }
    super({
      // রিকোয়েস্টের Header থেকে Bearer Token এক্সট্রাক্ট করবে
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false, // মেয়াদ শেষ হওয়া টোকেন বাতিল করবে
      secretOrKey: secret, // Supabase-এর Secret দিয়ে ভেরিফাই করবে
    });
  }

  // টোকেনটি সঠিক হলে এই ফাংশনটি কল হবে
  async validate(payload: any) {
    // payload-এর ভেতরে Supabase থেকে আসা ইউজারের ডেটা (যেমন sub/id, phone) থাকে
    // এটি রিটার্ন করলে NestJS স্বয়ংক্রিয়ভাবে এটিকে `req.user` এর ভেতরে সেভ করে রাখবে
    return { 
      supabaseId: payload.sub, 
      phone: payload.phone, 
      email: payload.email,
      role: payload.user_metadata?.role // যদি মেটাডেটাতে রোল থাকে
    };
  }
}