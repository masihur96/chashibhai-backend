import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SupabaseService } from '../supabase/supabase.service';
import { NotFoundException } from '@nestjs/common';

describe('UsersService', () => {
  let service: UsersService;
  let supabaseMock: any;
  let prismaMock: any;

  beforeEach(async () => {
    supabaseMock = {
      getAdminClient: jest.fn(),
      uploadAvatar: jest.fn(),
      deleteAvatar: jest.fn(),
    };

    prismaMock = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: SupabaseService,
          useValue: supabaseMock,
        },
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getProfile', () => {
    it('should return user profile from supabase if found', async () => {
      const mockProfile = {
        id: 'user-uuid-1',
        name: 'Rafiq Ahmed',
        phone: '01712345678',
        role: 'farmer',
        rating: 4.5,
        rating_count: 10,
        wallet_balance: 1200.0,
        is_verified: true,
        nid_verified: false,
        district: 'Bogura',
        avatar_url: 'https://cdn.example.com/avatar.jpg',
      };

      const selectMock = jest.fn().mockReturnThis();
      const eqMock = jest.fn().mockReturnThis();
      const singleMock = jest.fn().mockResolvedValue({ data: mockProfile, error: null });

      supabaseMock.getAdminClient.mockReturnValue({
        from: jest.fn().mockReturnValue({
          select: selectMock,
          eq: eqMock,
          single: singleMock,
        }),
      });

      const result = await service.getProfile('user-uuid-1');

      expect(result).toBeDefined();
      expect(result.id).toBe('user-uuid-1');
      expect(result.name).toBe('Rafiq Ahmed');
      expect(result.walletBalance).toBe(1200.0);
      expect(result.isVerified).toBe(true);
      expect(result.rating).toBe(4.5);
    });

    it('should throw NotFoundException if profile is neither in Supabase nor in Prisma', async () => {
      supabaseMock.getAdminClient.mockReturnValue({
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }),
        }),
      });

      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(service.getProfile('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getPublicProfile', () => {
    it('should return public profile with limited fields', async () => {
      const mockPublicData = {
        id: 'user-uuid-2',
        name: 'Karim Ullah',
        role: 'buyer',
        rating: 4.8,
        rating_count: 15,
        avatar_url: 'https://cdn.example.com/karim.jpg',
      };

      supabaseMock.getAdminClient.mockReturnValue({
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: mockPublicData, error: null }),
        }),
      });

      const result = await service.getPublicProfile('user-uuid-2');

      expect(result).toEqual({
        id: 'user-uuid-2',
        name: 'Karim Ullah',
        role: 'buyer',
        rating: 4.8,
        ratingCount: 15,
        avatarUrl: 'https://cdn.example.com/karim.jpg',
      });
    });
  });

  describe('updateProfile', () => {
    it('should update name and avatarUrl and return updated profile', async () => {
      const updatedProfile = {
        id: 'user-uuid-1',
        name: 'Rafiq Ahmed Updated',
        phone: '01712345678',
        role: 'farmer',
        rating: 4.5,
        wallet_balance: 1200.0,
        is_verified: true,
        avatar_url: 'https://cdn.example.com/new-avatar.jpg',
      };

      supabaseMock.getAdminClient.mockReturnValue({
        from: jest.fn().mockReturnValue({
          update: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: updatedProfile, error: null }),
        }),
      });

      const result = await service.updateProfile('user-uuid-1', {
        name: 'Rafiq Ahmed Updated',
        avatarUrl: 'https://cdn.example.com/new-avatar.jpg',
      });

      expect(result.name).toBe('Rafiq Ahmed Updated');
      expect(result.avatarUrl).toBe('https://cdn.example.com/new-avatar.jpg');
    });
  });

  describe('listUsersByRole', () => {
    it('should query Supabase with filters and return paginated result', async () => {
      const mockFarmers = [
        {
          id: 'farmer-1',
          name: 'Farmer John',
          role: 'farmer',
          district: 'Bogura',
          rating: 4.6,
          is_verified: true,
        },
      ];

      const chain: any = {};
      chain.select = jest.fn().mockReturnValue(chain);
      chain.ilike = jest.fn().mockReturnValue(chain);
      chain.gte = jest.fn().mockReturnValue(chain);
      chain.eq = jest.fn().mockReturnValue(chain);
      chain.order = jest.fn().mockReturnValue(chain);
      chain.range = jest.fn().mockResolvedValue({
        data: mockFarmers,
        count: 1,
        error: null,
      });

      supabaseMock.getAdminClient.mockReturnValue({
        from: jest.fn().mockReturnValue(chain),
      });

      const result = await service.listUsersByRole('farmer', {
        page: 1,
        limit: 10,
        district: 'Bogura',
        rating_min: 4.0,
        is_verified: true,
        search: 'John',
      });

      expect(result.data.length).toBe(1);
      expect(result.data[0].name).toBe('Farmer John');
      expect(result.meta.total).toBe(1);
      expect(result.meta.page).toBe(1);
      expect(result.meta.totalPages).toBe(1);
    });
  });
});
