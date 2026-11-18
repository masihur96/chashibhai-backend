import {
  IsString,
  IsNumber,
  IsOptional,
  IsIn,
  IsDateString,
  IsUrl,
  IsPositive,
  Min,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { TradeType } from './create-product.dto';

export class UpdateProductDto {
  @ApiPropertyOptional({
    description: 'Name of the agricultural product',
    example: 'Boro Rice Premium',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  productName?: string;

  @ApiPropertyOptional({
    description: 'Alias for productName (snake_case)',
    example: 'Boro Rice Premium',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  product_name?: string;

  @ApiPropertyOptional({
    description: 'Available quantity of the product',
    example: 600,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  quantity?: number;

  @ApiPropertyOptional({
    description: 'Unit of measurement (e.g. KG, TON, MON)',
    example: 'KG',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  unit?: string;

  @ApiPropertyOptional({
    description: 'Base / minimum price per unit',
    example: 48.0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minimumPrice?: number;

  @ApiPropertyOptional({
    description: 'Alias for minimumPrice (snake_case)',
    example: 48.0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minimum_price?: number;

  @ApiPropertyOptional({
    description: 'Trade mechanism for the listing',
    enum: ['auction', 'negotiation', 'both'],
    example: 'both',
  })
  @IsOptional()
  @IsIn(['auction', 'negotiation', 'both'])
  tradeType?: TradeType;

  @ApiPropertyOptional({
    description: 'Alias for tradeType (snake_case)',
    enum: ['auction', 'negotiation', 'both'],
    example: 'both',
  })
  @IsOptional()
  @IsIn(['auction', 'negotiation', 'both'])
  trade_type?: TradeType;

  @ApiPropertyOptional({
    description: 'Product category',
    example: 'rice',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @ApiPropertyOptional({
    description: 'Status of product listing',
    enum: ['active', 'inactive', 'sold', 'expired'],
    example: 'active',
  })
  @IsOptional()
  @IsString()
  @IsIn(['active', 'inactive', 'sold', 'expired'])
  status?: string;

  @ApiPropertyOptional({
    description: 'Start time of listing in ISO 8601 format',
    example: '2026-11-20T08:00:00Z',
  })
  @IsOptional()
  @IsDateString()
  startTime?: string;

  @ApiPropertyOptional({
    description: 'Alias for startTime (snake_case)',
    example: '2026-11-20T08:00:00Z',
  })
  @IsOptional()
  @IsDateString()
  start_time?: string;

  @ApiPropertyOptional({
    description: 'End time of listing in ISO 8601 format',
    example: '2026-11-26T20:00:00Z',
  })
  @IsOptional()
  @IsDateString()
  endTime?: string;

  @ApiPropertyOptional({
    description: 'Alias for endTime (snake_case)',
    example: '2026-11-26T20:00:00Z',
  })
  @IsOptional()
  @IsDateString()
  end_time?: string;

  @ApiPropertyOptional({
    description: 'Public URL to the product image',
    example: 'https://cdn.example.com/products/rice-updated.jpg',
  })
  @IsOptional()
  @IsString()
  @IsUrl()
  imageUrl?: string;

  @ApiPropertyOptional({
    description: 'Alias for imageUrl (snake_case)',
    example: 'https://cdn.example.com/products/rice-updated.jpg',
  })
  @IsOptional()
  @IsString()
  @IsUrl()
  image_url?: string;
}
