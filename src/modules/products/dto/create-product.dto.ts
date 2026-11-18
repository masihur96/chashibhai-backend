import {
  IsString,
  IsNotEmpty,
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
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum TradeType {
  AUCTION = 'auction',
  NEGOTIATION = 'negotiation',
  BOTH = 'both',
}

export class CreateProductDto {
  @ApiProperty({
    description: 'Name of the agricultural product',
    example: 'Boro Rice',
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(200)
  productName!: string;

  @ApiPropertyOptional({
    description: 'Alias for productName (snake_case)',
    example: 'Boro Rice',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  product_name?: string;

  @ApiProperty({
    description: 'Available quantity of the product',
    example: 500,
  })
  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  quantity!: number;

  @ApiPropertyOptional({
    description: 'Unit of measurement (e.g. KG, TON, MON)',
    example: 'KG',
    default: 'KG',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  unit?: string = 'KG';

  @ApiProperty({
    description: 'Base / minimum price per unit',
    example: 45.0,
  })
  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minimumPrice!: number;

  @ApiPropertyOptional({
    description: 'Alias for minimumPrice (snake_case)',
    example: 45.0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minimum_price?: number;

  @ApiProperty({
    description: 'Trade mechanism for the listing',
    enum: ['auction', 'negotiation', 'both'],
    example: 'both',
  })
  @IsNotEmpty()
  @IsIn(['auction', 'negotiation', 'both'])
  tradeType!: TradeType;

  @ApiPropertyOptional({
    description: 'Alias for tradeType (snake_case)',
    enum: ['auction', 'negotiation', 'both'],
    example: 'both',
  })
  @IsOptional()
  @IsIn(['auction', 'negotiation', 'both'])
  trade_type?: TradeType;

  @ApiProperty({
    description: 'Product category (e.g. rice, potato, jute, vegetables)',
    example: 'rice',
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  category!: string;

  @ApiProperty({
    description: 'Start time of the listing in ISO 8601 format',
    example: '2026-11-20T08:00:00Z',
  })
  @IsNotEmpty()
  @IsDateString()
  startTime!: string;

  @ApiPropertyOptional({
    description: 'Alias for startTime (snake_case)',
    example: '2026-11-20T08:00:00Z',
  })
  @IsOptional()
  @IsDateString()
  start_time?: string;

  @ApiProperty({
    description: 'End time of the listing in ISO 8601 format',
    example: '2026-11-25T20:00:00Z',
  })
  @IsNotEmpty()
  @IsDateString()
  endTime!: string;

  @ApiPropertyOptional({
    description: 'Alias for endTime (snake_case)',
    example: '2026-11-25T20:00:00Z',
  })
  @IsOptional()
  @IsDateString()
  end_time?: string;

  @ApiPropertyOptional({
    description: 'Public URL to the product image',
    example: 'https://cdn.example.com/products/rice.jpg',
  })
  @IsOptional()
  @IsString()
  @IsUrl()
  imageUrl?: string;

  @ApiPropertyOptional({
    description: 'Alias for imageUrl (snake_case)',
    example: 'https://cdn.example.com/products/rice.jpg',
  })
  @IsOptional()
  @IsString()
  @IsUrl()
  image_url?: string;
}
