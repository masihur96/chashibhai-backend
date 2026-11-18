import {
  IsUUID,
  IsNotEmpty,
  IsNumber,
  Min,
  Max,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateReviewDto {
  @ApiProperty({
    description: 'UUID of the user being reviewed (farmer or buyer)',
    example: 'd3b07384-d113-49fb-9400-ee481d6f5822',
  })
  @IsNotEmpty()
  @IsUUID()
  revieweeId!: string;

  @ApiPropertyOptional({
    description: 'Alias for revieweeId (snake_case)',
    example: 'd3b07384-d113-49fb-9400-ee481d6f5822',
  })
  @IsOptional()
  @IsUUID()
  reviewee_id?: string;

  @ApiProperty({
    description: 'Order UUID linked to this review (must have status = delivered)',
    example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
  })
  @IsNotEmpty()
  @IsUUID()
  orderId!: string;

  @ApiPropertyOptional({
    description: 'Alias for orderId (snake_case)',
    example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
  })
  @IsOptional()
  @IsUUID()
  order_id?: string;

  @ApiProperty({
    description: 'Rating score from 1.0 to 5.0',
    example: 4.5,
    minimum: 1,
    maximum: 5,
  })
  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(1, { message: 'Rating must be at least 1.0' })
  @Max(5, { message: 'Rating cannot exceed 5.0' })
  rating!: number;

  @ApiPropertyOptional({
    description: 'Optional review comment / feedback text',
    example: 'Fresh produce, arrived promptly as described. Highly recommended!',
    maxLength: 1000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}
