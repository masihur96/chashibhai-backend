import {
  IsNumber,
  IsPositive,
  IsOptional,
  IsString,
  MaxLength,
  IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateOfferDto {
  @ApiProperty({
    description: 'Proposed counter-offer amount per unit or total',
    example: 44.5,
  })
  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  amount!: number;

  @ApiPropertyOptional({
    description: 'Optional note or remark with counter-offer',
    example: 'Best price I can do is 44.50 BDT.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
