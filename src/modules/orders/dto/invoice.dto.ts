import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class InvoicePartyDto {
  @ApiProperty({ example: 'b149b5fa-14f7-4180-a612-8178cbe7754f' })
  id!: string;

  @ApiProperty({ example: 'Rafiq Ahmed' })
  name!: string;

  @ApiPropertyOptional({ example: '01712345678' })
  phone?: string | null;

  @ApiPropertyOptional({ example: 'Bogura' })
  district?: string | null;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/avatar.jpg' })
  avatarUrl?: string | null;
}

export class InvoiceItemDto {
  @ApiProperty({ example: 'Boro Rice Premium' })
  description!: string;

  @ApiProperty({ example: 500 })
  quantity!: number;

  @ApiProperty({ example: 45.0 })
  unitPrice!: number;

  @ApiProperty({ example: 22500.0 })
  total!: number;
}

export class InvoiceDto {
  @ApiProperty({ example: 'INV-A1B2C3D4' })
  invoiceNumber!: string;

  @ApiProperty({ example: 'c194b6fa-14f7-4180-a612-8178cbe7754f' })
  orderId!: string;

  @ApiProperty({ example: '2026-11-20T10:00:00Z' })
  date!: string;

  @ApiProperty({ example: 'delivered' })
  status!: string;

  @ApiProperty({ type: InvoicePartyDto })
  buyer!: InvoicePartyDto;

  @ApiProperty({ type: InvoicePartyDto })
  farmer!: InvoicePartyDto;

  @ApiProperty({ type: [InvoiceItemDto] })
  items!: InvoiceItemDto[];

  @ApiProperty({ example: 22500.0 })
  subtotal!: number;

  @ApiProperty({ example: 450.0 })
  commission!: number;

  @ApiProperty({ example: 22500.0 })
  totalAmount!: number;

  @ApiPropertyOptional({ example: 'settled' })
  paymentStatus?: string;
}
