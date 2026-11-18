import { IsString, IsOptional, IsUrl, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProfileDto {
  @ApiPropertyOptional({
    description: 'Full name of the user',
    example: 'Rafiq Ahmed',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({
    description: 'Avatar image URL',
    example: 'https://cdn.example.com/avatar.jpg',
  })
  @IsOptional()
  @IsString()
  @IsUrl()
  avatarUrl?: string;

  @ApiPropertyOptional({
    description: 'Avatar image URL (snake_case alias)',
    example: 'https://cdn.example.com/avatar.jpg',
  })
  @IsOptional()
  @IsString()
  @IsUrl()
  avatar_url?: string;

  @ApiPropertyOptional({
    description: 'Avatar image URL (legacy alias)',
    example: 'https://cdn.example.com/avatar.jpg',
  })
  @IsOptional()
  @IsString()
  @IsUrl()
  avatar?: string;

  @ApiPropertyOptional({
    description: 'District / Region of the user',
    example: 'Bogura',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  district?: string;
}
