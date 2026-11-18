import {
  Controller,
  Post,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiConsumes,
  ApiBody,
  ApiResponse,
} from '@nestjs/swagger';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UploadService } from './upload.service';

@ApiTags('Upload')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Upload one or multiple image files and receive a list of public URLs',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: {
            type: 'string',
            format: 'binary',
          },
          description: 'One or more image files to upload',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Files uploaded successfully. Returns an array of public URLs.',
    schema: {
      example: {
        success: true,
        message: '2 file(s) uploaded successfully',
        urls: [
          'https://xyz.supabase.co/storage/v1/object/public/product-images/products/uuid-1.jpg',
          'https://xyz.supabase.co/storage/v1/object/public/product-images/products/uuid-2.jpg',
        ],
        url: 'https://xyz.supabase.co/storage/v1/object/public/product-images/products/uuid-1.jpg',
        data: {
          urls: [
            'https://xyz.supabase.co/storage/v1/object/public/product-images/products/uuid-1.jpg',
            'https://xyz.supabase.co/storage/v1/object/public/product-images/products/uuid-2.jpg',
          ],
          url: 'https://xyz.supabase.co/storage/v1/object/public/product-images/products/uuid-1.jpg',
        },
      },
    },
  })
  @UseInterceptors(
    AnyFilesInterceptor({
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit per file
      fileFilter: (req, file, cb) => {
        if (!file.mimetype.match(/\/(jpg|jpeg|png|webp|gif|svg\+xml)$/i)) {
          return cb(
            new BadRequestException(
              'Only image files (jpg, jpeg, png, webp, gif, svg) are allowed!',
            ),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  async uploadFiles(@UploadedFiles() files?: Express.Multer.File[]) {
    if (!files || files.length === 0) {
      throw new BadRequestException('At least one file is required');
    }
    const urls = await this.uploadService.uploadFiles(files);
    return {
      success: true,
      message: `${urls.length} file(s) uploaded successfully`,
      urls,
      url: urls[0],
      data: {
        urls,
        url: urls[0],
      },
    };
  }
}
