import { Controller, UseGuards } from '@nestjs/common';
import { NegotiationsService } from './negotiations.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('negotiations')
export class NegotiationsController {
  constructor(private readonly negotiationsService: NegotiationsService) {}
}
