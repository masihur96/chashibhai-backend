import {
  IsBoolean,
  IsOptional,
  IsString,
  IsIn,
  IsInt,
  Min,
  Max,
  IsDateString,
  IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class VerifyUserDto {
  @ApiPropertyOptional({
    description: 'Set verification status (true to verify, false to unverify)',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  isVerified?: boolean = true;

  @ApiPropertyOptional({
    description: 'Admin note or reason for verification status',
    example: 'Valid NID provided and matched.',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class BanUserDto {
  @ApiPropertyOptional({
    description: 'Set ban status (true to ban, false to unban)',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  isBanned?: boolean = true;

  @ApiPropertyOptional({
    description: 'Reason for ban or unban',
    example: 'Suspicious activities / terms violation.',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class UpdateProductStatusDto {
  @ApiProperty({
    description: 'New product status',
    enum: ['active', 'sold', 'expired', 'cancelled', 'under_review'],
    example: 'active',
  })
  @IsNotEmpty()
  @IsString()
  @IsIn(['active', 'sold', 'expired', 'cancelled', 'under_review'])
  status!: string;

  @ApiPropertyOptional({
    description: 'Optional admin reason',
    example: 'Content reviewed and approved.',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class UpdateOrderStatusDto {
  @ApiProperty({
    description: 'Override order status',
    enum: ['pending', 'dispatched', 'delivered', 'cancelled'],
    example: 'delivered',
  })
  @IsNotEmpty()
  @IsString()
  @IsIn(['pending', 'dispatched', 'delivered', 'cancelled'])
  status!: string;

  @ApiPropertyOptional({
    description: 'Admin reason for manual override',
    example: 'Manual dispute resolution confirmation.',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class AdminOrderFilterDto {
  @ApiPropertyOptional({
    description: 'Filter by order status',
    enum: ['pending', 'dispatched', 'delivered', 'cancelled', 'all'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['pending', 'dispatched', 'delivered', 'cancelled', 'all'])
  status?: string;

  @ApiPropertyOptional({
    description: 'Filter orders starting from date (ISO string)',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    description: 'Filter orders ending at date (ISO string)',
  })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

export class AdminProductFilterDto {
  @ApiPropertyOptional({
    description: 'Filter by product status',
    enum: ['active', 'sold', 'expired', 'cancelled', 'under_review', 'all'],
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Filter by category' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: 'Search term for product name' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
