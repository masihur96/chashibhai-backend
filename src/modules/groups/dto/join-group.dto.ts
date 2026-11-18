import {
  IsNumber,
  IsPositive,
  Min,
  IsOptional,
  IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class JoinGroupDto {
  @ApiProperty({
    description: 'Contribution quantity (in KG) to join with',
    example: 150,
    minimum: 1,
  })
  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  @Min(1)
  quantity!: number;

  @ApiPropertyOptional({
    description: 'Alias for quantity (contributionQuantity)',
    example: 150,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  @Min(1)
  contributionQuantity?: number;

  @ApiPropertyOptional({
    description: 'Alias for quantity (snake_case)',
    example: 150,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  @Min(1)
  contribution_quantity?: number;
}
