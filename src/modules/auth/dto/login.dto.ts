import { IsString, IsNotEmpty, MinLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: '01712345678' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^(?:\+88)?01[3-9]\d{8}$/, {
    message: 'phone must be a valid Bangladeshi mobile number',
  })
  phone!: string;

  @ApiProperty({ example: 'SecurePass@123' })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  password!: string;
}
