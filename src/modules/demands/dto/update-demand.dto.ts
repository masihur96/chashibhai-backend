import {
  IsString,
  IsNumber,
  IsPositive,
  IsOptional,
  IsIn,
  IsDateString,
  IsUrl,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { DemandTradeType } from './create-demand.dto';

export class UpdateDemandDto {
  @ApiPropertyOptional({
    description: 'Name of the requested product',
    example: 'Potatoes (Diamant)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  productName?: string;

  @ApiPropertyOptional({
    description: 'Alias for productName (snake_case)',
    example: 'Potatoes (Diamant)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  product_name?: string;

  @ApiPropertyOptional({
    description: 'Required quantity',
    example: 1200,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  quantity?: number;

  @ApiPropertyOptional({
    description: 'Calling price buyer is offering per unit',
    example: 30.0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  callingPrice?: number;

  @ApiPropertyOptional({
    description: 'Alias for callingPrice (snake_case)',
    example: 30.0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  calling_price?: number;

  @ApiPropertyOptional({
    description: 'Delivery destination / market location',
    example: 'Karwan Bazar, Dhaka',
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  deliveryLocation?: string;

  @ApiPropertyOptional({
    description: 'Alias for deliveryLocation (snake_case)',
    example: 'Karwan Bazar, Dhaka',
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  delivery_location?: string;

  @ApiPropertyOptional({
    description: 'Expiry timestamp in ISO 8601 format',
    example: '2026-12-05T18:00:00Z',
  })
  @IsOptional()
  @IsDateString()
  expiryTime?: string;

  @ApiPropertyOptional({
    description: 'Alias for expiryTime (snake_case)',
    example: '2026-12-05T18:00:00Z',
  })
  @IsOptional()
  @IsDateString()
  expiry_time?: string;

  @ApiPropertyOptional({
    description: 'Status of demand post',
    enum: ['active', 'expired', 'fulfilled'],
    example: 'active',
  })
  @IsOptional()
  @IsString()
  @IsIn(['active', 'expired', 'fulfilled'])
  status?: string;

  @ApiPropertyOptional({
    description: 'Trade mechanism',
    enum: ['auction', 'negotiation', 'both'],
    example: 'both',
  })
  @IsOptional()
  @IsIn(['auction', 'negotiation', 'both'])
  tradeType?: DemandTradeType;

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
