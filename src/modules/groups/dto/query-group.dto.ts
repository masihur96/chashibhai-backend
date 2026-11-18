import { IsOptional, IsString, IsInt, Min, Max, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class QueryGroupDto {
  @ApiPropertyOptional({
    description: 'Filter by group status',
    enum: ['open', 'active', 'fulfilled', 'cancelled', 'all'],
    example: 'open',
  })
  @IsOptional()
  @IsString()
  @IsIn(['open', 'active', 'fulfilled', 'cancelled', 'all'])
  status?: string;

  @ApiPropertyOptional({
    description: 'Filter by product category',
    example: 'vegetables',
  })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({
    description: 'Search query for group name or product name',
    example: 'Potato',
  })
  @IsOptional()
  @IsString()
  search?: string;

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
