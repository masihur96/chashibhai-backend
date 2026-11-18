import {
  IsNumber,
  IsPositive,
  Min,
  Max,
  IsOptional,
  IsString,
  MaxLength,
  IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DepositDto {
  @ApiProperty({
    description: 'Amount to deposit into wallet (BDT)',
    example: 1000.0,
    minimum: 10,
    maximum: 100000,
  })
  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  @Min(10, { message: 'Minimum deposit amount is 10 BDT' })
  @Max(100000, { message: 'Maximum deposit amount is 100,000 BDT' })
  amount!: number;

  @ApiPropertyOptional({
    description: 'Payment gateway / method',
    example: 'bkash',
  })
  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @ApiPropertyOptional({
    description: 'External payment transaction reference ID',
    example: 'TRX987654321',
  })
  @IsOptional()
  @IsString()
  referenceId?: string;

  @ApiPropertyOptional({
    description: 'Optional note or remark',
    example: 'Deposit via bKash',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;
}
