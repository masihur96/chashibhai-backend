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
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum TradeType {
  AUCTION = 'auction',
  NEGOTIATION = 'negotiation',
  BOTH = 'both',
}

export class CreateProductDto {
  @ApiPropertyOptional({
    description: 'Name of the agricultural product',
    example: 'Boro Rice',
  })
  @ValidateIf((o: CreateProductDto) => !o.product_name || o.productName !== undefined)
  @IsNotEmpty({ message: 'productName or product_name is required' })
  @IsString()
  @MaxLength(200)
  productName?: string;

  @ApiPropertyOptional({
    description: 'Alias for productName (snake_case)',
    example: 'Boro Rice',
  })
  @ValidateIf((o: CreateProductDto) => !o.productName || o.product_name !== undefined)
  @IsNotEmpty({ message: 'productName or product_name is required' })
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

  @ApiPropertyOptional({
    description: 'Base / minimum price per unit',
    example: 45.0,
  })
  @ValidateIf(
    (o: CreateProductDto) =>
      o.minimum_price === undefined || o.minimumPrice !== undefined,
  )
  @IsNotEmpty({ message: 'minimumPrice or minimum_price is required' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minimumPrice?: number;

  @ApiPropertyOptional({
    description: 'Alias for minimumPrice (snake_case)',
    example: 45.0,
  })
  @ValidateIf(
    (o: CreateProductDto) =>
      o.minimumPrice === undefined || o.minimum_price !== undefined,
  )
  @IsNotEmpty({ message: 'minimumPrice or minimum_price is required' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minimum_price?: number;

  @ApiPropertyOptional({
    description: 'Trade mechanism for the listing',
    enum: ['auction', 'negotiation', 'both'],
    example: 'both',
  })
  @ValidateIf((o: CreateProductDto) => !o.trade_type || o.tradeType !== undefined)
  @IsNotEmpty({ message: 'tradeType or trade_type is required' })
  @IsIn(['auction', 'negotiation', 'both'])
  tradeType?: TradeType;

  @ApiPropertyOptional({
    description: 'Alias for tradeType (snake_case)',
    enum: ['auction', 'negotiation', 'both'],
    example: 'both',
  })
  @ValidateIf((o: CreateProductDto) => !o.tradeType || o.trade_type !== undefined)
  @IsNotEmpty({ message: 'tradeType or trade_type is required' })
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

  @ApiPropertyOptional({
    description: 'Start time of the listing in ISO 8601 format',
    example: '2026-11-20T08:00:00Z',
  })
  @ValidateIf((o: CreateProductDto) => !o.start_time || o.startTime !== undefined)
  @IsNotEmpty({ message: 'startTime or start_time is required' })
  @IsDateString()
  startTime?: string;

  @ApiPropertyOptional({
    description: 'Alias for startTime (snake_case)',
    example: '2026-11-20T08:00:00Z',
  })
  @ValidateIf((o: CreateProductDto) => !o.startTime || o.start_time !== undefined)
  @IsNotEmpty({ message: 'startTime or start_time is required' })
  @IsDateString()
  start_time?: string;

  @ApiPropertyOptional({
    description: 'End time of the listing in ISO 8601 format',
    example: '2026-11-25T20:00:00Z',
  })
  @ValidateIf((o: CreateProductDto) => !o.end_time || o.endTime !== undefined)
  @IsNotEmpty({ message: 'endTime or end_time is required' })
  @IsDateString()
  endTime?: string;

  @ApiPropertyOptional({
    description: 'Alias for endTime (snake_case)',
    example: '2026-11-25T20:00:00Z',
  })
  @ValidateIf((o: CreateProductDto) => !o.endTime || o.end_time !== undefined)
  @IsNotEmpty({ message: 'endTime or end_time is required' })
  @IsDateString()
  end_time?: string;

  @ApiPropertyOptional({
    description: 'Public URL to the product image',
    example: 'https://cdn.example.com/products/rice.jpg',
  })
  @IsOptional()
  @ValidateIf((o: CreateProductDto) => !!o.imageUrl)
  @IsString()
  @IsUrl()
  imageUrl?: string;

  @ApiPropertyOptional({
    description: 'Alias for imageUrl (snake_case)',
    example: 'https://cdn.example.com/products/rice.jpg',
  })
  @IsOptional()
  @ValidateIf((o: CreateProductDto) => !!o.image_url)
  @IsString()
  @IsUrl()
  image_url?: string;

  @ApiPropertyOptional({
    description: 'Product image file (multipart/form-data upload)',
    type: 'string',
    format: 'binary',
  })
  @IsOptional()
  file?: any;

  @ApiPropertyOptional({
    description: 'Alias for file (multipart/form-data upload)',
    type: 'string',
    format: 'binary',
  })
  @IsOptional()
  image?: any;
}
