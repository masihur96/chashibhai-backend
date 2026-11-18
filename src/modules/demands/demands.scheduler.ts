import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DemandsService } from './demands.service';

@Injectable()
export class DemandsScheduler {
  private readonly logger = new Logger(DemandsScheduler.name);

  constructor(private readonly demandsService: DemandsService) {}

  /**
   * Cron job running every 1 hour to automatically expire demands past their expiry_time
   */
  @Cron(CronExpression.EVERY_HOUR)
  async handleExpiredDemands() {
    this.logger.log('Running scheduled check for expired demands...');
    const expiredCount = await this.demandsService.expireOverdueDemands();
    this.logger.log(`Auto-expired ${expiredCount} overdue demands`);
  }
}
