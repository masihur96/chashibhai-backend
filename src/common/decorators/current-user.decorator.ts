import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    // HTTP রিকোয়েস্টটি বের করে আনা হচ্ছে
    const request = ctx.switchToHttp().getRequest();
    
    // রিকোয়েস্টের ভেতর থাকা user অবজেক্টটি রিটার্ন করা হচ্ছে
    return request.user;
  },
);