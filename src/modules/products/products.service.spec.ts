import { Test, TestingModule } from '@nestjs/testing';
import { ProductsService } from './products.service';
import { SupabaseService } from '../supabase/supabase.service';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { TradeType } from './dto/create-product.dto';

describe('ProductsService', () => {
  let service: ProductsService;
  let supabaseMock: any;

  beforeEach(async () => {
    supabaseMock = {
      getAdminClient: jest.fn(),
      uploadProductImage: jest.fn(),
      deleteProductImage: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        {
          provide: SupabaseService,
          useValue: supabaseMock,
        },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should successfully create a product listing', async () => {
      const mockProduct = {
        id: 'prod-123',
        farmer_id: 'farmer-uuid',
        product_name: 'Boro Rice',
        quantity: 500,
        unit: 'KG',
        minimum_price: 45.0,
        trade_type: 'both',
        category: 'rice',
        status: 'active',
        start_time: '2026-11-20T08:00:00.000Z',
        end_time: '2026-11-25T20:00:00.000Z',
        image_url: null,
        created_at: '2026-11-18T10:00:00.000Z',
      };

      supabaseMock.getAdminClient.mockReturnValue({
        from: jest.fn().mockReturnValue({
          insert: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: mockProduct, error: null }),
        }),
      });

      const result = await service.create('farmer-uuid', {
        productName: 'Boro Rice',
        quantity: 500,
        unit: 'KG',
        minimumPrice: 45.0,
        tradeType: TradeType.BOTH,
        category: 'rice',
        startTime: '2026-11-20T08:00:00Z',
        endTime: '2026-11-25T20:00:00Z',
      });

      expect(result).toBeDefined();
      expect(result.id).toBe('prod-123');
      expect(result.farmerId).toBe('farmer-uuid');
      expect(result.productName).toBe('Boro Rice');
      expect(result.quantity).toBe(500);
      expect(result.minimumPrice).toBe(45.0);
      expect(result.tradeType).toBe('both');
    });

    it('should throw BadRequestException if endTime is before startTime', async () => {
      await expect(
        service.create('farmer-uuid', {
          productName: 'Boro Rice',
          quantity: 500,
          unit: 'KG',
          minimumPrice: 45.0,
          tradeType: TradeType.BOTH,
          category: 'rice',
          startTime: '2026-11-25T20:00:00Z',
          endTime: '2026-11-20T08:00:00Z',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findAll', () => {
    it('should return paginated active products with metadata', async () => {
      const mockList = [
        {
          id: 'prod-1',
          farmer_id: 'farmer-1',
          product_name: 'Potato',
          quantity: 200,
          unit: 'KG',
          minimum_price: 25.0,
          trade_type: 'auction',
          category: 'potato',
          status: 'active',
          start_time: '2026-11-20T08:00:00Z',
          end_time: '2026-11-25T20:00:00Z',
        },
      ];

      const chain: any = {};
      chain.select = jest.fn().mockReturnValue(chain);
      chain.eq = jest.fn().mockReturnValue(chain);
      chain.ilike = jest.fn().mockReturnValue(chain);
      chain.gte = jest.fn().mockReturnValue(chain);
      chain.lte = jest.fn().mockReturnValue(chain);
      chain.order = jest.fn().mockReturnValue(chain);
      chain.range = jest.fn().mockResolvedValue({
        data: mockList,
        count: 1,
        error: null,
      });

      supabaseMock.getAdminClient.mockReturnValue({
        from: jest.fn().mockReturnValue(chain),
      });

      const result = await service.findAll({
        page: 1,
        limit: 10,
        category: 'potato',
      });

      expect(result.data.length).toBe(1);
      expect(result.data[0].productName).toBe('Potato');
      expect(result.meta.total).toBe(1);
      expect(result.meta.page).toBe(1);
      expect(result.meta.totalPages).toBe(1);
    });
  });

  describe('findOne', () => {
    it('should return product details when product exists', async () => {
      const mockProduct = {
        id: 'prod-1',
        farmer_id: 'farmer-1',
        product_name: 'Boro Rice',
        quantity: 500,
        minimum_price: 45.0,
        trade_type: 'both',
        category: 'rice',
        status: 'active',
      };

      supabaseMock.getAdminClient.mockReturnValue({
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: mockProduct, error: null }),
        }),
      });

      const result = await service.findOne('prod-1');
      expect(result.id).toBe('prod-1');
      expect(result.productName).toBe('Boro Rice');
    });

    it('should throw NotFoundException if product does not exist', async () => {
      supabaseMock.getAdminClient.mockReturnValue({
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }),
        }),
      });

      await expect(service.findOne('invalid-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update product if caller is owner', async () => {
      const existingProduct = {
        id: 'prod-1',
        farmer_id: 'farmer-owner-uuid',
        product_name: 'Old Name',
        minimum_price: 40.0,
        status: 'active',
        start_time: '2026-11-20T08:00:00Z',
        end_time: '2026-11-25T20:00:00Z',
      };

      const updatedProduct = {
        ...existingProduct,
        product_name: 'New Name',
        minimum_price: 50.0,
      };

      const fromMock = jest.fn();
      fromMock.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: existingProduct, error: null }),
      });
      fromMock.mockReturnValueOnce({
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: updatedProduct, error: null }),
      });

      supabaseMock.getAdminClient.mockReturnValue({ from: fromMock });

      const result = await service.update('prod-1', 'farmer-owner-uuid', {
        productName: 'New Name',
        minimumPrice: 50.0,
      });

      expect(result.productName).toBe('New Name');
      expect(result.minimumPrice).toBe(50.0);
    });

    it('should throw ForbiddenException if caller is not the owner', async () => {
      const existingProduct = {
        id: 'prod-1',
        farmer_id: 'different-farmer-uuid',
      };

      supabaseMock.getAdminClient.mockReturnValue({
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: existingProduct, error: null }),
        }),
      });

      await expect(
        service.update('prod-1', 'intruder-uuid', { productName: 'Hacked' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('remove', () => {
    it('should delete product if caller is owner', async () => {
      const existingProduct = {
        id: 'prod-1',
        farmer_id: 'farmer-owner-uuid',
        image_url: 'https://cdn.example.com/product-images/test.jpg',
      };

      const fromMock = jest.fn();
      fromMock.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: existingProduct, error: null }),
      });
      fromMock.mockReturnValueOnce({
        delete: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ error: null }),
      });

      supabaseMock.getAdminClient.mockReturnValue({ from: fromMock });

      const result = await service.remove('prod-1', 'farmer-owner-uuid');

      expect(result).toEqual({
        success: true,
        message: 'Product deleted successfully',
      });
      expect(supabaseMock.deleteProductImage).toHaveBeenCalledWith(
        'https://cdn.example.com/product-images/test.jpg',
      );
    });

    it('should throw ForbiddenException if caller is not owner on delete', async () => {
      const existingProduct = {
        id: 'prod-1',
        farmer_id: 'owner-uuid',
      };

      supabaseMock.getAdminClient.mockReturnValue({
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: existingProduct, error: null }),
        }),
      });

      await expect(service.remove('prod-1', 'not-owner')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('expireOverdueProducts', () => {
    it('should update active products with past end_time to expired', async () => {
      supabaseMock.getAdminClient.mockReturnValue({
        from: jest.fn().mockReturnValue({
          update: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          lt: jest.fn().mockReturnThis(),
          select: jest.fn().mockResolvedValue({
            data: [{ id: 'prod-1' }, { id: 'prod-2' }],
            error: null,
          }),
        }),
      });

      const expiredCount = await service.expireOverdueProducts();
      expect(expiredCount).toBe(2);
    });
  });
});
