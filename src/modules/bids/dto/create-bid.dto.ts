import {
  IsUUID,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsOptional,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateBidDto {
  @ApiProperty({
    description: 'UUID of the product being bid on',
    example: 'c194b6fa-14f7-4180-a612-8178cbe7754f',
  })
  @IsNotEmpty()
  @IsUUID()
  productId!: string;

  @ApiPropertyOptional({
    description: 'Alias for productId (snake_case)',
    example: 'c194b6fa-14f7-4180-a612-8178cbe7754f',
  })
  @IsOptional()
  @IsUUID()
  product_id?: string;

  @ApiProperty({
    description: 'Bid amount offered by the buyer',
    example: 55.0,
  })
  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  amount!: number;
}
