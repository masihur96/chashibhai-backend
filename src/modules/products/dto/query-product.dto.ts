import {
  IsOptional,
  IsString,
  IsInt,
  Min,
  Max,
  IsNumber,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { TradeType } from './create-product.dto';

export class QueryProductDto {
  @ApiPropertyOptional({ description: 'Page number (starts from 1)', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @ApiPropertyOptional({ description: 'Filter by category', example: 'rice' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({
    description: 'Filter by trade type',
    enum: ['auction', 'negotiation', 'both'],
    example: 'both',
  })
  @IsOptional()
  @IsIn(['auction', 'negotiation', 'both'])
  tradeType?: TradeType;

  @ApiPropertyOptional({
    description: 'Filter by trade type (snake_case alias)',
    enum: ['auction', 'negotiation', 'both'],
    example: 'both',
  })
  @IsOptional()
  @IsIn(['auction', 'negotiation', 'both'])
  trade_type?: TradeType;

  @ApiPropertyOptional({ description: 'Minimum price filter', example: 30.0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minPrice?: number;

  @ApiPropertyOptional({ description: 'Minimum price filter (snake_case alias)', example: 30.0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  min_price?: number;

  @ApiPropertyOptional({ description: 'Maximum price filter', example: 100.0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxPrice?: number;

  @ApiPropertyOptional({ description: 'Maximum price filter (snake_case alias)', example: 100.0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  max_price?: number;

  @ApiPropertyOptional({ description: 'Search term for product name', example: 'Rice' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Filter by product status',
    enum: ['active', 'inactive', 'sold', 'expired', 'all'],
    default: 'active',
  })
  @IsOptional()
  @IsString()
  status?: string = 'active';
}
