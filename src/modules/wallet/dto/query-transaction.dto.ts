import { IsOptional, IsString, IsInt, Min, Max, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class QueryTransactionDto {
  @ApiPropertyOptional({
    description: 'Filter by transaction type',
    enum: ['deposit', 'escrow', 'release', 'withdrawal', 'refund', 'all'],
    example: 'deposit',
  })
  @IsOptional()
  @IsString()
  @IsIn(['deposit', 'escrow', 'release', 'withdrawal', 'refund', 'all'])
  type?: string;

  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;
}
