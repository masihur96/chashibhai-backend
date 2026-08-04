import { IsString, IsOptional, IsUrl, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProfileDto {
  @ApiPropertyOptional({ description: 'Full name of the user', example: 'রহিম উদ্দিন' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ description: 'Avatar image URL', example: 'https://example.com/avatar.jpg' })
  @IsOptional()
  @IsString()
  @IsUrl()
  avatar?: string;
}

