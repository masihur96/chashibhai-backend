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

export class CreateDemandOfferDto {
  @ApiProperty({
    description: 'Offered price per unit by the farmer',
    example: 27.5,
  })
  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  offerPrice!: number;

  @ApiPropertyOptional({
    description: 'Alias for offerPrice (snake_case)',
    example: 27.5,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  offer_price?: number;

  @ApiPropertyOptional({
    description: 'Optional note or supply details',
    example: 'Can deliver 1000kg grade-A Diamant potatoes by tomorrow.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
