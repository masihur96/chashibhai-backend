import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateProductDto, TradeType } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { QueryProductDto } from './dto/query-product.dto';

export interface FormattedProduct {
  id: string;
  farmerId: string;
  productName: string;
  quantity: number;
  unit: string;
  minimumPrice: number;
  tradeType: TradeType;
  category: string;
  status: string;
  startTime: string;
  endTime: string;
  imageUrl: string | null;
  image_url?: string | null;
  createdAt?: string;
  farmer?: {
    id: string;
    name: string;
    phone?: string | null;
    rating?: number;
    avatarUrl?: string | null;
    district?: string | null;
  };
}

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Helper to format raw database product row into clean camelCase response
   */
  formatProduct(raw: any): FormattedProduct | null {
    if (!raw) return null;
    return {
      id: raw.id,
      farmerId: raw.farmer_id,
      productName: raw.product_name,
      quantity: Number(raw.quantity),
      unit: raw.unit ?? 'KG',
      minimumPrice: Number(raw.minimum_price),
      tradeType: raw.trade_type,
      category: raw.category,
      status: raw.status ?? 'active',
      startTime: raw.start_time,
      endTime: raw.end_time,
      imageUrl: raw.image_url ?? null,
      image_url: raw.image_url ?? null,
      createdAt: raw.created_at,
      farmer: raw.profiles
        ? {
            id: raw.profiles.id,
            name: raw.profiles.name,
            phone: raw.profiles.phone ?? null,
            rating: Number(raw.profiles.rating ?? 0),
            avatarUrl: raw.profiles.avatar_url ?? null,
            district: raw.profiles.district ?? null,
          }
        : undefined,
    };
  }

  // ─── 1. Create Product ───────────────────────────────────────────────────────

  async create(
    farmerId: string,
    dto: CreateProductDto,
    file?: Express.Multer.File,
  ): Promise<FormattedProduct> {
    const client = this.supabaseService.getAdminClient();

    const productName = dto.productName ?? dto.product_name;
    const minimumPrice = dto.minimumPrice ?? dto.minimum_price;
    const tradeType = dto.tradeType ?? dto.trade_type;
    const startTime = dto.startTime ?? dto.start_time;
    const endTime = dto.endTime ?? dto.end_time;
    const imageUrl = dto.imageUrl ?? dto.image_url ?? null;

    if (!productName) {
      throw new BadRequestException('productName is required');
    }
    if (minimumPrice === undefined || minimumPrice === null) {
      throw new BadRequestException('minimumPrice is required');
    }
    if (!tradeType) {
      throw new BadRequestException('tradeType is required');
    }
    if (!startTime || !endTime) {
      throw new BadRequestException('startTime and endTime are required');
    }

    const startDate = new Date(startTime);
    const endDate = new Date(endTime);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      throw new BadRequestException(
        'Invalid date format for startTime or endTime',
      );
    }
    if (endDate <= startDate) {
      throw new BadRequestException('endTime must be after startTime');
    }

    const payload = {
      farmer_id: farmerId,
      product_name: productName.trim(),
      quantity: dto.quantity,
      unit: (dto.unit || 'KG').toUpperCase().trim(),
      minimum_price: minimumPrice,
      trade_type: tradeType,
      category: dto.category.toLowerCase().trim(),
      start_time: startDate.toISOString(),
      end_time: endDate.toISOString(),
      image_url: imageUrl,
      status: 'active',
    };

    let { data, error } = await client
      .from('products')
      .insert(payload)
      .select()
      .single();

    if (error || !data) {
      this.logger.error('Failed to create product in Supabase', error);
      throw new InternalServerErrorException(
        error?.message ?? 'Failed to create product listing',
      );
    }

    // If an image file was provided, upload to Supabase Storage and update product
    if (file) {
      try {
        const uploadedUrl = await this.supabaseService.uploadProductImage(
          data.id,
          file,
        );
        const { data: updated, error: updateError } = await client
          .from('products')
          .update({ image_url: uploadedUrl })
          .eq('id', data.id)
          .select()
          .single();

        if (updateError || !updated) {
          this.logger.error(
            `Failed to update product ${data.id} image_url in database`,
            updateError,
          );
          data.image_url = uploadedUrl;
        } else {
          data = updated;
        }
      } catch (uploadError: any) {
        this.logger.error(
          'Failed to upload product image to Supabase Storage',
          uploadError,
        );
        // Rollback inserted product record if file upload fails
        await client.from('products').delete().eq('id', data.id);
        throw new InternalServerErrorException(
          uploadError.message ?? 'Failed to upload product image',
        );
      }
    }

    return this.formatProduct(data)!;
  }

  // ─── 2. List All Active Products (with Filters & Pagination) ────────────────

  async findAll(query: QueryProductDto) {
    const client = this.supabaseService.getAdminClient();

    let dbQuery = client
      .from('products')
      .select(
        '*, profiles:farmer_id(id, name, phone, rating, avatar_url, district)',
        {
          count: 'exact',
        },
      );

    // Status filter (default to 'active')
    if (query.status && query.status !== 'all') {
      dbQuery = dbQuery.eq('status', query.status);
    } else if (!query.status) {
      dbQuery = dbQuery.eq('status', 'active');
    }

    // Category filter
    if (query.category?.trim()) {
      dbQuery = dbQuery.ilike(
        'category',
        `%${query.category.trim().toLowerCase()}%`,
      );
    }

    // Trade Type filter
    const tradeType = query.tradeType ?? query.trade_type;
    if (tradeType) {
      dbQuery = dbQuery.eq('trade_type', tradeType);
    }

    // Minimum Price filter
    const minPrice = query.minPrice ?? query.min_price;
    if (minPrice !== undefined && !isNaN(minPrice)) {
      dbQuery = dbQuery.gte('minimum_price', minPrice);
    }

    // Maximum Price filter
    const maxPrice = query.maxPrice ?? query.max_price;
    if (maxPrice !== undefined && !isNaN(maxPrice)) {
      dbQuery = dbQuery.lte('minimum_price', maxPrice);
    }

    // Search by product name
    if (query.search?.trim()) {
      dbQuery = dbQuery.ilike('product_name', `%${query.search.trim()}%`);
    }

    // Pagination
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? query.limit : 10;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    dbQuery = dbQuery.order('created_at', { ascending: false }).range(from, to);

    const { data, count, error } = await dbQuery;

    if (error) {
      this.logger.error('Failed to list products from Supabase', error);
      throw new InternalServerErrorException(
        error?.message ?? 'Failed to retrieve products',
      );
    }

    const total = count ?? (data?.length || 0);
    const totalPages = Math.ceil(total / limit);

    return {
      data: (data || []).map((row) => this.formatProduct(row)),
      meta: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  // ─── 3. Get Product Details by ID ──────────────────────────────────────────

  async findOne(id: string): Promise<FormattedProduct> {
    const client = this.supabaseService.getAdminClient();

    const { data, error } = await client
      .from('products')
      .select(
        '*, profiles:farmer_id(id, name, phone, rating, avatar_url, district)',
      )
      .eq('id', id)
      .single();

    if (error || !data) {
      throw new NotFoundException(`Product with ID "${id}" not found`);
    }

    return this.formatProduct(data)!;
  }

  // ─── 4. List Farmer's Own Products ─────────────────────────────────────────

  async findMyProducts(farmerId: string, query: QueryProductDto) {
    const client = this.supabaseService.getAdminClient();

    let dbQuery = client
      .from('products')
      .select('*', { count: 'exact' })
      .eq('farmer_id', farmerId);

    if (query.status && query.status !== 'all') {
      dbQuery = dbQuery.eq('status', query.status);
    }

    if (query.category?.trim()) {
      dbQuery = dbQuery.ilike(
        'category',
        `%${query.category.trim().toLowerCase()}%`,
      );
    }

    if (query.search?.trim()) {
      dbQuery = dbQuery.ilike('product_name', `%${query.search.trim()}%`);
    }

    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? query.limit : 10;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    dbQuery = dbQuery.order('created_at', { ascending: false }).range(from, to);

    const { data, count, error } = await dbQuery;

    if (error) {
      this.logger.error(
        `Failed to list products for farmer ${farmerId}`,
        error,
      );
      throw new InternalServerErrorException(
        'Failed to retrieve your products',
      );
    }

    const total = count ?? (data?.length || 0);
    const totalPages = Math.ceil(total / limit);

    return {
      data: (data || []).map((row) => this.formatProduct(row)),
      meta: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  // ─── 5. Filter by Category ─────────────────────────────────────────────────

  async findByCategory(category: string, query: QueryProductDto) {
    return this.findAll({
      ...query,
      category,
    });
  }

  // ─── 6. Update Product (Owner Only) ────────────────────────────────────────

  async update(
    id: string,
    userId: string,
    dto: UpdateProductDto,
    userRole?: string,
    file?: Express.Multer.File,
  ): Promise<FormattedProduct> {
    const client = this.supabaseService.getAdminClient();

    // 1. Verify existence and ownership
    const { data: existing, error: findError } = await client
      .from('products')
      .select('*')
      .eq('id', id)
      .single();

    if (findError || !existing) {
      throw new NotFoundException(`Product with ID "${id}" not found`);
    }

    const isOwner = existing.farmer_id === userId;
    const isAdmin = userRole?.toUpperCase() === 'ADMIN';
    if (!isOwner && !isAdmin) {
      throw new ForbiddenException(
        'You do not have permission to update this product listing',
      );
    }

    // 2. Validate dates if either is updated
    const startTimeStr = dto.startTime ?? dto.start_time ?? existing.start_time;
    const endTimeStr = dto.endTime ?? dto.end_time ?? existing.end_time;
    if (startTimeStr && endTimeStr) {
      const start = new Date(startTimeStr);
      const end = new Date(endTimeStr);
      if (end <= start) {
        throw new BadRequestException('endTime must be after startTime');
      }
    }

    // 3. Build update payload
    const updatePayload: Record<string, any> = {};

    const productName = dto.productName ?? dto.product_name;
    if (productName !== undefined)
      updatePayload.product_name = productName.trim();

    if (dto.quantity !== undefined) updatePayload.quantity = dto.quantity;
    if (dto.unit !== undefined)
      updatePayload.unit = dto.unit.toUpperCase().trim();

    const minPrice = dto.minimumPrice ?? dto.minimum_price;
    if (minPrice !== undefined) updatePayload.minimum_price = minPrice;

    const tradeType = dto.tradeType ?? dto.trade_type;
    if (tradeType !== undefined) updatePayload.trade_type = tradeType;

    if (dto.category !== undefined)
      updatePayload.category = dto.category.toLowerCase().trim();

    if (dto.status !== undefined) updatePayload.status = dto.status;

    if (dto.startTime ?? dto.start_time) {
      updatePayload.start_time = new Date(
        dto.startTime ?? dto.start_time!,
      ).toISOString();
    }
    if (dto.endTime ?? dto.end_time) {
      updatePayload.end_time = new Date(
        dto.endTime ?? dto.end_time!,
      ).toISOString();
    }

    const imageUrl = dto.imageUrl ?? dto.image_url;
    if (imageUrl !== undefined) updatePayload.image_url = imageUrl;

    // If a new image file is uploaded, upload to Supabase and delete old image
    if (file) {
      const uploadedUrl = await this.supabaseService.uploadProductImage(
        id,
        file,
      );
      updatePayload.image_url = uploadedUrl;
      if (existing.image_url && existing.image_url !== uploadedUrl) {
        await this.supabaseService.deleteProductImage(existing.image_url);
      }
    }

    const { data: updated, error: updateError } = await client
      .from('products')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (updateError || !updated) {
      this.logger.error(`Failed to update product ${id}`, updateError);
      throw new InternalServerErrorException(
        updateError?.message ?? 'Failed to update product listing',
      );
    }

    return this.formatProduct(updated)!;
  }

  // ─── 7. Delete Product (Owner Only) ────────────────────────────────────────

  async remove(id: string, userId: string, userRole?: string) {
    const client = this.supabaseService.getAdminClient();

    // 1. Verify existence and ownership
    const { data: existing, error: findError } = await client
      .from('products')
      .select('*')
      .eq('id', id)
      .single();

    if (findError || !existing) {
      throw new NotFoundException(`Product with ID "${id}" not found`);
    }

    const isOwner = existing.farmer_id === userId;
    const isAdmin = userRole?.toUpperCase() === 'ADMIN';
    if (!isOwner && !isAdmin) {
      throw new ForbiddenException(
        'You do not have permission to delete this product listing',
      );
    }

    // 2. Optionally clean up image from storage
    if (existing.image_url) {
      await this.supabaseService.deleteProductImage(existing.image_url);
    }

    // 3. Delete from DB
    const { error: deleteError } = await client
      .from('products')
      .delete()
      .eq('id', id);

    if (deleteError) {
      this.logger.error(`Failed to delete product ${id}`, deleteError);
      throw new InternalServerErrorException(
        deleteError.message ?? 'Failed to delete product',
      );
    }

    return {
      success: true,
      message: 'Product deleted successfully',
    };
  }

  // ─── 8. Upload Product Image (Owner Only) ───────────────────────────────────

  async uploadImage(
    id: string,
    userId: string,
    file: Express.Multer.File,
    userRole?: string,
  ) {
    const client = this.supabaseService.getAdminClient();

    // 1. Verify existence and ownership
    const { data: existing, error: findError } = await client
      .from('products')
      .select('*')
      .eq('id', id)
      .single();

    if (findError || !existing) {
      throw new NotFoundException(`Product with ID "${id}" not found`);
    }

    const isOwner = existing.farmer_id === userId;
    const isAdmin = userRole?.toUpperCase() === 'ADMIN';
    if (!isOwner && !isAdmin) {
      throw new ForbiddenException(
        'You do not have permission to upload an image for this product',
      );
    }

    // 2. Upload to Supabase Storage 'product-images' bucket
    const imageUrl = await this.supabaseService.uploadProductImage(id, file);

    // 3. Update image_url in DB
    const { data: updated, error: updateError } = await client
      .from('products')
      .update({ image_url: imageUrl })
      .eq('id', id)
      .select()
      .single();

    if (updateError || !updated) {
      this.logger.error(
        `Failed to save image URL for product ${id}`,
        updateError,
      );
      throw new InternalServerErrorException(
        'Failed to save product image URL',
      );
    }

    // 4. Optionally delete previous image if different
    if (existing.image_url && existing.image_url !== imageUrl) {
      await this.supabaseService.deleteProductImage(existing.image_url);
    }

    return {
      imageUrl,
      product: this.formatProduct(updated),
    };
  }

  // ─── 9. Automatic Expiration Cron Job ───────────────────────────────────────

  /**
   * Cron job running every 5 minutes to automatically mark listings as 'expired'
   * once their end_time has passed.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleExpiredProducts(): Promise<number> {
    return this.expireOverdueProducts();
  }

  /**
   * Reusable method to expire products whose end_time is past.
   */
  async expireOverdueProducts(): Promise<number> {
    try {
      const now = new Date().toISOString();
      const client = this.supabaseService.getAdminClient();

      const { data, error } = await client
        .from('products')
        .update({ status: 'expired' })
        .eq('status', 'active')
        .lt('end_time', now)
        .select('id');

      if (error) {
        this.logger.error('Failed to expire overdue products', error);
        return 0;
      }

      const count = data?.length || 0;
      if (count > 0) {
        this.logger.log(`Expired ${count} products with end_time < ${now}`);
      }
      return count;
    } catch (err: any) {
      this.logger.error(`Error in expireOverdueProducts: ${err.message}`);
      return 0;
    }
  }
}
