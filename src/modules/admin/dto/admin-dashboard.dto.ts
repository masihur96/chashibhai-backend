import { ApiProperty } from '@nestjs/swagger';

export class AdminDashboardDataDto {
  @ApiProperty({
    description: 'Total registered users in system',
    example: 1240,
  })
  totalUsers!: number;

  @ApiProperty({ description: 'Total farmers count', example: 850 })
  totalFarmers!: number;

  @ApiProperty({ description: 'Total buyers count', example: 390 })
  totalBuyers!: number;

  @ApiProperty({
    description: 'Number of active products currently listed',
    example: 342,
  })
  activeProducts!: number;

  @ApiProperty({
    description: 'Number of active or pending orders',
    example: 78,
  })
  activeOrders!: number;

  @ApiProperty({
    description: 'Total revenue collected in BDT',
    example: 985000.0,
  })
  totalRevenue!: number;

  @ApiProperty({
    description: 'Number of KYC verification requests awaiting review',
    example: 23,
  })
  pendingKyc!: number;

  @ApiProperty({
    description: 'Total amount currently locked in escrow (BDT)',
    example: 156000.0,
  })
  activeEscrow!: number;
}

export class AdminDashboardResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ type: AdminDashboardDataDto })
  data!: AdminDashboardDataDto;
}
