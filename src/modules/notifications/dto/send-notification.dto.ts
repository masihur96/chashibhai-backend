import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsIn,
  MaxLength,
  IsObject,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum NotificationType {
  ORDER = 'order',
  PAYMENT = 'payment',
  ALERT = 'alert',
  PROMO = 'promo',
}

export class SendNotificationDto {
  @ApiProperty({
    description: 'Notification title',
    example: 'Order Dispatched 🚚',
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(150)
  title!: string;

  @ApiProperty({
    description: 'Notification message body',
    example: 'Your order #1234 has been dispatched by the farmer.',
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(1000)
  message!: string;

  @ApiPropertyOptional({
    description: 'Notification category type',
    enum: NotificationType,
    default: NotificationType.ALERT,
    example: NotificationType.ORDER,
  })
  @IsOptional()
  @IsString()
  @IsIn(['order', 'payment', 'alert', 'promo'])
  type?: NotificationType = NotificationType.ALERT;

  @ApiPropertyOptional({
    description: 'Arbitrary structured metadata object',
    example: { orderId: 'ord-uuid', trackingUrl: 'https://...' },
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
