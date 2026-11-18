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

export class WithdrawDto {
  @ApiProperty({
    description: 'Amount to withdraw from wallet (BDT)',
    example: 500.0,
    minimum: 10,
    maximum: 100000,
  })
  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  @Min(10, { message: 'Minimum withdrawal amount is 10 BDT' })
  @Max(100000, { message: 'Maximum withdrawal amount is 100,000 BDT' })
  amount!: number;

  @ApiPropertyOptional({
    description: 'Payout channel (e.g. bkash, nagad, rocket, bank)',
    example: 'bkash',
  })
  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @ApiPropertyOptional({
    description: 'Target account number / phone number',
    example: '01712345678',
  })
  @IsOptional()
  @IsString()
  accountNumber?: string;

  @ApiPropertyOptional({
    description: 'Optional note or remark',
    example: 'Withdrawal to personal bKash',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;
}
