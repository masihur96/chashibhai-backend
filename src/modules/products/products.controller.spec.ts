import { Test, TestingModule } from '@nestjs/testing';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { TradeType } from './dto/create-product.dto';

describe('ProductsController', () => {
  let controller: ProductsController;
  let productsService: Partial<Record<keyof ProductsService, jest.Mock>>;

  beforeEach(async () => {
    productsService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findMyProducts: jest.fn(),
      findByCategory: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      uploadImage: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProductsController],
      providers: [
        {
          provide: ProductsService,
          useValue: productsService,
        },
      ],
    }).compile();

    controller = module.get<ProductsController>(ProductsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('POST /', () => {
    it('should create and return the new product', async () => {
      const mockDto = {
        productName: 'Boro Rice',
        quantity: 500,
        unit: 'KG',
        minimumPrice: 45.0,
        tradeType: TradeType.BOTH,
        category: 'rice',
        startTime: '2026-11-20T08:00:00Z',
        endTime: '2026-11-25T20:00:00Z',
      };

      const mockCreated = {
        id: 'uuid-1',
        farmerId: 'farmer-1',
        ...mockDto,
        status: 'active',
        imageUrl: null,
      };

      (productsService.create as jest.Mock).mockResolvedValue(mockCreated);

      const result = await controller.create({ sub: 'farmer-1' }, mockDto);

      expect(result).toEqual({
        success: true,
        data: mockCreated,
      });
      expect(productsService.create).toHaveBeenCalledWith('farmer-1', mockDto);
    });
  });

  describe('GET /', () => {
    it('should return paginated products', async () => {
      const mockResult = {
        data: [{ id: 'prod-1', productName: 'Boro Rice' }],
        meta: { page: 1, limit: 10, total: 1, totalPages: 1 },
      };

      (productsService.findAll as jest.Mock).mockResolvedValue(mockResult);

      const result = await controller.findAll({ page: 1, limit: 10 });

      expect(result).toEqual({
        success: true,
        ...mockResult,
      });
      expect(productsService.findAll).toHaveBeenCalledWith({ page: 1, limit: 10 });
    });
  });

  describe('GET /my', () => {
    it('should return farmer own products', async () => {
      const mockResult = {
        data: [{ id: 'prod-1', farmerId: 'farmer-1' }],
        meta: { page: 1, limit: 10, total: 1, totalPages: 1 },
      };

      (productsService.findMyProducts as jest.Mock).mockResolvedValue(mockResult);

      const result = await controller.getMyProducts({ sub: 'farmer-1' }, { page: 1, limit: 10 });

      expect(result).toEqual({
        success: true,
        ...mockResult,
      });
      expect(productsService.findMyProducts).toHaveBeenCalledWith('farmer-1', { page: 1, limit: 10 });
    });
  });

  describe('GET /category/:category', () => {
    it('should filter products by category', async () => {
      const mockResult = {
        data: [{ id: 'prod-1', category: 'rice' }],
        meta: { page: 1, limit: 10, total: 1, totalPages: 1 },
      };

      (productsService.findByCategory as jest.Mock).mockResolvedValue(mockResult);

      const result = await controller.findByCategory('rice', { page: 1, limit: 10 });

      expect(result).toEqual({
        success: true,
        ...mockResult,
      });
      expect(productsService.findByCategory).toHaveBeenCalledWith('rice', { page: 1, limit: 10 });
    });
  });

  describe('GET /:id', () => {
    it('should return product details', async () => {
      const mockProduct = { id: 'prod-1', productName: 'Boro Rice' };
      (productsService.findOne as jest.Mock).mockResolvedValue(mockProduct);

      const result = await controller.findOne('prod-1');

      expect(result).toEqual({
        success: true,
        data: mockProduct,
      });
      expect(productsService.findOne).toHaveBeenCalledWith('prod-1');
    });
  });

  describe('PATCH /:id', () => {
    it('should update product', async () => {
      const mockUpdated = { id: 'prod-1', productName: 'Updated Rice' };
      (productsService.update as jest.Mock).mockResolvedValue(mockUpdated);

      const result = await controller.update(
        'prod-1',
        { sub: 'farmer-1', role: 'farmer' },
        { productName: 'Updated Rice' },
      );

      expect(result).toEqual({
        success: true,
        data: mockUpdated,
      });
      expect(productsService.update).toHaveBeenCalledWith(
        'prod-1',
        'farmer-1',
        { productName: 'Updated Rice' },
        'farmer',
      );
    });
  });

  describe('DELETE /:id', () => {
    it('should delete product', async () => {
      const mockDeleteResult = { success: true, message: 'Product deleted successfully' };
      (productsService.remove as jest.Mock).mockResolvedValue(mockDeleteResult);

      const result = await controller.remove('prod-1', { sub: 'farmer-1', role: 'farmer' });

      expect(result).toEqual(mockDeleteResult);
      expect(productsService.remove).toHaveBeenCalledWith('prod-1', 'farmer-1', 'farmer');
    });
  });

  describe('POST /:id/image', () => {
    it('should upload product image', async () => {
      const mockFile = {
        originalname: 'rice.jpg',
        mimetype: 'image/jpeg',
        buffer: Buffer.from('fake-image-bytes'),
      } as Express.Multer.File;

      const mockUploadResult = {
        imageUrl: 'https://cdn.example.com/product-images/rice.jpg',
        product: { id: 'prod-1', imageUrl: 'https://cdn.example.com/product-images/rice.jpg' },
      };

      (productsService.uploadImage as jest.Mock).mockResolvedValue(mockUploadResult);

      const result = await controller.uploadImage(
        'prod-1',
        { sub: 'farmer-1', role: 'farmer' },
        mockFile,
      );

      expect(result).toEqual({
        success: true,
        message: 'Product image uploaded successfully',
        data: mockUploadResult,
      });
      expect(productsService.uploadImage).toHaveBeenCalledWith(
        'prod-1',
        'farmer-1',
        mockFile,
        'farmer',
      );
    });
  });
});
