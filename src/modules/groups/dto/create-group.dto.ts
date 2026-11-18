import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsOptional,
  IsDateString,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateGroupDto {
  @ApiProperty({
    description: 'Name of the buying group',
    example: 'Dhaka Potato Bulk Buy',
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiProperty({
    description: 'Name of the product to purchase in bulk',
    example: 'Potatoes (Diamant)',
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(120)
  productName!: string;

  @ApiPropertyOptional({
    description: 'Alias for productName (snake_case)',
    example: 'Potatoes (Diamant)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  product_name?: string;

  @ApiProperty({
    description: 'Product category',
    example: 'vegetables',
  })
  @IsNotEmpty()
  @IsString()
  category!: string;

  @ApiProperty({
    description: 'Target bulk quantity to gather (e.g. KG)',
    example: 1000,
  })
  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  @Min(1)
  targetQuantity!: number;

  @ApiPropertyOptional({
    description: 'Alias for targetQuantity (snake_case)',
    example: 1000,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  @Min(1)
  target_quantity?: number;

  @ApiProperty({
    description: 'Offered price per KG (BDT)',
    example: 25.0,
  })
  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  pricePerKg!: number;

  @ApiPropertyOptional({
    description: 'Alias for pricePerKg (snake_case)',
    example: 25.0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  price_per_kg?: number;

  @ApiProperty({
    description: 'Bulk delivery location',
    example: 'Mirpur-10, Dhaka',
  })
  @IsNotEmpty()
  @IsString()
  deliveryLocation!: string;

  @ApiPropertyOptional({
    description: 'Alias for deliveryLocation (snake_case)',
    example: 'Mirpur-10, Dhaka',
  })
  @IsOptional()
  @IsString()
  delivery_location?: string;

  @ApiProperty({
    description: 'Group expiry date (ISO format)',
    example: '2026-12-01T18:00:00.000Z',
  })
  @IsNotEmpty()
  @IsDateString()
  expiryDate!: string;

  @ApiPropertyOptional({
    description: 'Alias for expiryDate (snake_case)',
    example: '2026-12-01T18:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  expiry_date?: string;

  @ApiPropertyOptional({
    description: "Creator's initial contribution quantity (KG)",
    example: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  initialContribution?: number;

  @ApiPropertyOptional({
    description: 'Alias for initialContribution (snake_case)',
    example: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  initial_contribution?: number;
}
