import { Body, Controller, Post } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';

@Controller('users')
export class UsersController {
  @Post()
  create(@Body() createUserDto: CreateUserDto) {
    // This will only run if validation passes
    return {
      message: 'Validation passed successfully!',
      data: createUserDto,
    };
  }
}
