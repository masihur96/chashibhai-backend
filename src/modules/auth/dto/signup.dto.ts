import { IsString, IsNotEmpty, IsOptional, IsEnum, IsEmail } from 'class-validator';
import { Role } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SignupDto {
  @ApiProperty({ example: 'Masihur Rohman' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ example: '+8801700000000' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ example: 'chashibhai2026@gmail.com' })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiProperty({ enum: Role, example: Role.FARMER })
  @IsEnum(Role)
  role!: Role;
}