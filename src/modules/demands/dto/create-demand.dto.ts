import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsOptional,
  IsIn,
  IsDateString,
  IsUrl,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum DemandTradeType {
  AUCTION = 'auction',
  NEGOTIATION = 'negotiation',
  BOTH = 'both',
}

export class CreateDemandDto {
  @ApiProperty({
    description: 'Name of the requested product',
    example: 'Potatoes (Diamant)',
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(200)
  productName!: string;

  @ApiPropertyOptional({
    description: 'Alias for productName (snake_case)',
    example: 'Potatoes (Diamant)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  product_name?: string;

  @ApiProperty({
    description: 'Required quantity (e.g. in KG)',
    example: 1000,
  })
  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  quantity!: number;

  @ApiProperty({
    description: 'Calling price buyer is offering per unit',
    example: 28.0,
  })
  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  callingPrice!: number;

  @ApiPropertyOptional({
    description: 'Alias for callingPrice (snake_case)',
    example: 28.0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  calling_price?: number;

  @ApiProperty({
    description: 'Delivery destination / market location',
    example: 'Karwan Bazar, Dhaka',
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(300)
  deliveryLocation!: string;

  @ApiPropertyOptional({
    description: 'Alias for deliveryLocation (snake_case)',
    example: 'Karwan Bazar, Dhaka',
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  delivery_location?: string;

  @ApiProperty({
    description: 'Expiry timestamp in ISO 8601 format',
    example: '2026-11-30T18:00:00Z',
  })
  @IsNotEmpty()
  @IsDateString()
  expiryTime!: string;

  @ApiPropertyOptional({
    description: 'Alias for expiryTime (snake_case)',
    example: '2026-11-30T18:00:00Z',
  })
  @IsOptional()
  @IsDateString()
  expiry_time?: string;

  @ApiProperty({
    description: 'Trade mechanism',
    enum: ['auction', 'negotiation', 'both'],
    example: 'both',
  })
  @IsNotEmpty()
  @IsIn(['auction', 'negotiation', 'both'])
  tradeType!: DemandTradeType;

  @ApiPropertyOptional({
    description: 'Alias for tradeType (snake_case)',
    enum: ['auction', 'negotiation', 'both'],
    example: 'both',
  })
  @IsOptional()
  @IsIn(['auction', 'negotiation', 'both'])
  trade_type?: DemandTradeType;

  @ApiPropertyOptional({
    description: 'Optional image reference URL',
    example: 'https://cdn.example.com/demands/potato.jpg',
  })
  @IsOptional()
  @IsString()
  @IsUrl()
  imageUrl?: string;

  @ApiPropertyOptional({
    description: 'Alias for imageUrl (snake_case)',
    example: 'https://cdn.example.com/demands/potato.jpg',
  })
  @IsOptional()
  @IsString()
  @IsUrl()
  image_url?: string;
}
