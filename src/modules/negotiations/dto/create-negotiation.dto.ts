import {
  IsUUID,
  IsOptional,
  IsNumber,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CreateNegotiationDto {
  @ApiPropertyOptional({
    description:
      'Product UUID (if buyer is initiating negotiation on a product)',
    example: 'c194b6fa-14f7-4180-a612-8178cbe7754f',
  })
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional({
    description: 'Alias for productId (snake_case)',
    example: 'c194b6fa-14f7-4180-a612-8178cbe7754f',
  })
  @IsOptional()
  @IsUUID()
  product_id?: string;

  @ApiPropertyOptional({
    description:
      'Demand post UUID (if farmer is initiating negotiation on a demand post)',
    example: 'd294b6fa-14f7-4180-a612-8178cbe7754f',
  })
  @IsOptional()
  @IsUUID()
  demandId?: string;

  @ApiPropertyOptional({
    description: 'Alias for demandId (snake_case)',
    example: 'd294b6fa-14f7-4180-a612-8178cbe7754f',
  })
  @IsOptional()
  @IsUUID()
  demand_id?: string;

  @ApiPropertyOptional({
    description: 'Target farmer ID (optional if derived from product)',
    example: 'b149b5fa-14f7-4180-a612-8178cbe7754f',
  })
  @IsOptional()
  @IsUUID()
  farmerId?: string;

  @ApiPropertyOptional({
    description: 'Target farmer ID (snake_case alias)',
    example: 'b149b5fa-14f7-4180-a612-8178cbe7754f',
  })
  @IsOptional()
  @IsUUID()
  farmer_id?: string;

  @ApiPropertyOptional({
    description: 'Target buyer ID (optional if derived from demand post)',
    example: 'a149b5fa-14f7-4180-a612-8178cbe7754f',
  })
  @IsOptional()
  @IsUUID()
  buyerId?: string;

  @ApiPropertyOptional({
    description: 'Target buyer ID (snake_case alias)',
    example: 'a149b5fa-14f7-4180-a612-8178cbe7754f',
  })
  @IsOptional()
  @IsUUID()
  buyer_id?: string;

  @ApiPropertyOptional({
    description: 'Initial proposed offer amount',
    example: 42.0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  amount?: number;

  @ApiPropertyOptional({
    description: 'Alias for amount',
    example: 42.0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  initialAmount?: number;

  @ApiPropertyOptional({
    description: 'Alias for amount (snake_case)',
    example: 42.0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  initial_amount?: number;

  @ApiPropertyOptional({
    description: 'Optional note accompanying the initial offer',
    example: 'Interested in buying in bulk for 42 taka/kg.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
