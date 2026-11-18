import { Test, TestingModule } from '@nestjs/testing';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';
import { BadRequestException } from '@nestjs/common';

describe('UploadController', () => {
  let controller: UploadController;
  let uploadService: Partial<Record<keyof UploadService, jest.Mock>>;

  beforeEach(async () => {
    uploadService = {
      uploadFiles: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UploadController],
      providers: [
        {
          provide: UploadService,
          useValue: uploadService,
        },
      ],
    }).compile();

    controller = module.get<UploadController>(UploadController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('POST /upload', () => {
    it('should upload files and return list of URLs', async () => {
      const mockFiles = [
        {
          originalname: 'rice-1.jpg',
          mimetype: 'image/jpeg',
          buffer: Buffer.from('img-1'),
        } as Express.Multer.File,
        {
          originalname: 'rice-2.png',
          mimetype: 'image/png',
          buffer: Buffer.from('img-2'),
        } as Express.Multer.File,
      ];

      const mockUrls = [
        'https://cdn.example.com/product-images/products/img-1.jpg',
        'https://cdn.example.com/product-images/products/img-2.png',
      ];

      (uploadService.uploadFiles as jest.Mock).mockResolvedValue(mockUrls);

      const result = await controller.uploadFiles(mockFiles);

      expect(result).toEqual({
        success: true,
        message: '2 file(s) uploaded successfully',
        urls: mockUrls,
      });
      expect(uploadService.uploadFiles).toHaveBeenCalledWith(mockFiles);
    });

    it('should throw BadRequestException if no files provided', async () => {
      await expect(controller.uploadFiles([])).rejects.toThrow(
        BadRequestException,
      );
      await expect(controller.uploadFiles(undefined)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
