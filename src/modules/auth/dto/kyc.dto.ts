import { IsString, IsNotEmpty, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class KycDto {
  @ApiProperty({ example: '1234567890123', description: '13-digit NID number' })
  @IsString()
  @IsNotEmpty()
  @Length(10, 17, { message: 'NID number must be between 10 and 17 characters' })
  nidNumber!: string;
}
