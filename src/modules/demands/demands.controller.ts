import { Controller, UseGuards } from '@nestjs/common';
import { DemandsService } from './demands.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('demands')
export class DemandsController {
  constructor(private readonly demandsService: DemandsService) {}
}
