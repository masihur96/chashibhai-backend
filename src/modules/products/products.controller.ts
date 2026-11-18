import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  BadRequestException,
  UnauthorizedException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
  ApiBody,
  ApiParam,
} from '@nestjs/swagger';
import {
  FileInterceptor,
  AnyFilesInterceptor,
} from '@nestjs/platform-express';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { QueryProductDto } from './dto/query-product.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('Products')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  private extractUser(user: any): { userId: string; role?: string } {
    const userId = user?.supabaseId || user?.sub || user?.id;
    if (!userId) {
      throw new UnauthorizedException('User identifier not found in token');
    }
    return { userId, role: user?.role };
  }

  // ─── 1. POST / (Create product listing, Role: Farmer) ──────────────────────

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(RolesGuard)
  @Roles(Role.FARMER, Role.ADMIN)
  @ApiOperation({ summary: 'Create a new product listing (Farmer role only)' })
  @ApiResponse({
    status: 201,
    description: 'Product listing created successfully.',
    schema: {
      example: {
        success: true,
        data: {
          id: 'uuid',
          farmerId: 'uuid',
          productName: 'Boro Rice',
          quantity: 500,
          unit: 'KG',
          minimumPrice: 45.0,
          tradeType: 'both',
          category: 'rice',
          status: 'active',
          startTime: '2026-11-20T08:00:00Z',
          endTime: '2026-11-25T20:00:00Z',
          imageUrl: 'https://cdn.example.com/products/rice.jpg',
          imageUrls: ['https://cdn.example.com/products/rice.jpg'],
        },
      },
    },
  })
  async create(
    @CurrentUser() user: any,
    @Body() dto: CreateProductDto,
  ) {
    const { userId } = this.extractUser(user);
    const product = await this.productsService.create(userId, dto);
    return {
      success: true,
      data: product,
    };
  }

  // ─── 2. GET / (List all active products, Role: Any) ────────────────────────

  @Get()
  @ApiOperation({
    summary:
      'List all active products with filters (category, tradeType, minPrice, maxPrice, search, pagination)',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of active products.',
  })
  async findAll(@Query() query: QueryProductDto) {
    const result = await this.productsService.findAll(query);
    return {
      success: true,
      ...result,
    };
  }

  // ─── 3. GET /my (Farmer's own products, Role: Farmer) ───────────────────────

  @Get('my')
  @UseGuards(RolesGuard)
  @Roles(Role.FARMER, Role.ADMIN)
  @ApiOperation({ summary: "Get authenticated farmer's own products" })
  @ApiResponse({
    status: 200,
    description: "List of authenticated farmer's own product listings.",
  })
  async getMyProducts(
    @CurrentUser() user: any,
    @Query() query: QueryProductDto,
  ) {
    const { userId } = this.extractUser(user);
    const result = await this.productsService.findMyProducts(userId, query);
    return {
      success: true,
      ...result,
    };
  }

  // ─── 4. GET /category/:category (Filter by category, Role: Any) ────────────

  @Get('category/:category')
  @ApiOperation({ summary: 'Filter products by category name' })
  @ApiParam({ name: 'category', example: 'rice' })
  @ApiResponse({
    status: 200,
    description: 'Products matching the category.',
  })
  async findByCategory(
    @Param('category') category: string,
    @Query() query: QueryProductDto,
  ) {
    const result = await this.productsService.findByCategory(category, query);
    return {
      success: true,
      ...result,
    };
  }

  // ─── 5. GET /:id (Get product details, Role: Any) ──────────────────────────

  @Get(':id')
  @ApiOperation({ summary: 'Get product details by product ID' })
  @ApiParam({ name: 'id', description: 'Product UUID' })
  @ApiResponse({
    status: 200,
    description: 'Product details returned successfully.',
  })
  async findOne(@Param('id') id: string) {
    const product = await this.productsService.findOne(id);
    return {
      success: true,
      data: product,
    };
  }

  // ─── 6. PATCH /:id (Update product, Role: Farmer/Owner) ────────────────────

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.FARMER, Role.ADMIN)
  @ApiOperation({ summary: 'Update product listing (Owner farmer only)' })
  @ApiParam({ name: 'id', description: 'Product UUID' })
  @ApiResponse({
    status: 200,
    description: 'Product updated successfully.',
  })
  async update(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() dto: UpdateProductDto,
  ) {
    const { userId, role } = this.extractUser(user);
    const updated = await this.productsService.update(id, userId, dto, role);
    return {
      success: true,
      data: updated,
    };
  }

  // ─── 7. DELETE /:id (Delete product, Role: Farmer/Owner) ───────────────────

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.FARMER, Role.ADMIN)
  @ApiOperation({ summary: 'Delete product listing (Owner farmer only)' })
  @ApiParam({ name: 'id', description: 'Product UUID' })
  @ApiResponse({
    status: 200,
    description: 'Product deleted successfully.',
  })
  async remove(@Param('id') id: string, @CurrentUser() user: any) {
    const { userId, role } = this.extractUser(user);
    return this.productsService.remove(id, userId, role);
  }

  // ─── 8. POST /:id/image (Upload product image, Role: Farmer/Owner) ─────────

  @Post(':id/image')
  @UseGuards(RolesGuard)
  @Roles(Role.FARMER, Role.ADMIN)
  @ApiOperation({
    summary:
      'Upload product image to Supabase "product-images" bucket (Owner only)',
  })
  @ApiParam({ name: 'id', description: 'Product UUID' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
      fileFilter: (req, file, cb) => {
        if (!file.mimetype.match(/\/(jpg|jpeg|png|webp)$/)) {
          return cb(
            new BadRequestException(
              'Only image files (jpg, jpeg, png, webp) are allowed!',
            ),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  async uploadImage(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Image file is required');
    }
    const { userId, role } = this.extractUser(user);
    const result = await this.productsService.uploadImage(
      id,
      userId,
      file,
      role,
    );
    return {
      success: true,
      message: 'Product image uploaded successfully',
      data: result,
    };
  }

  // ─── 9. GET /:id/image (Get product image URL, Role: Any) ─────────────────

  @Get(':id/image')
  @ApiOperation({ summary: 'Get product image URL by product ID' })
  @ApiParam({ name: 'id', description: 'Product UUID' })
  @ApiResponse({
    status: 200,
    description: 'Product image URL returned successfully.',
  })
  async getImage(@Param('id') id: string) {
    const product = await this.productsService.findOne(id);
    return {
      success: true,
      imageUrl: product.imageUrl,
      image_url: product.imageUrl,
    };
  }

  // ─── 10. POST /upload (Upload product image files, Role: Any Authenticated) ──

  @Post('upload')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Upload product image files to Supabase Storage and get a list of public URLs',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
          description: 'One or more image files to upload',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Files uploaded successfully, returns list of public URLs.',
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
  async uploadImages(@UploadedFiles() files?: Express.Multer.File[]) {
    if (!files || files.length === 0) {
      throw new BadRequestException('At least one file is required');
    }
    const urls = await this.productsService.uploadFiles(files);
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
