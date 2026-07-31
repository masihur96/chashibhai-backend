import { Injectable } from '@nestjs/common';
import{PinoLogger} from 'nestjs-pino';

@Injectable()
export class UsersService {
    constructor(private readonly logger: PinoLogger) {      
        this.logger.setContext(UsersService.name);
    }

  
    findAllUsers() {
        this.logger.info('Fetching all users');
        // Logic to fetch all users from the database
        return [];
    }

}
