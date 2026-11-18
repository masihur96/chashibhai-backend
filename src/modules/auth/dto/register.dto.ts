import {
  IsString,
  IsNotEmpty,
  IsEnum,
  Matches,
  MinLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';

export class RegisterDto {
  @ApiProperty({ example: 'Rafiq Ahmed' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: '01712345678' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^(?:\+88)?01[3-9]\d{8}$/, {
    message: 'phone must be a valid Bangladeshi mobile number',
  })
  phone!: string;

  @ApiProperty({ example: 'SecurePass@123', minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ enum: Role, example: Role.FARMER })
  @IsEnum(Role)
  role!: Role;
}
