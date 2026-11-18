import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { SupabaseService } from '../supabase/supabase.service';
import { Role } from '@prisma/client';

describe('UsersController', () => {
  let controller: UsersController;
  let usersService: Partial<Record<keyof UsersService, jest.Mock>>;
  let supabaseService: Partial<Record<keyof SupabaseService, jest.Mock>>;

  beforeEach(async () => {
    usersService = {
      getProfile: jest.fn(),
      getPublicProfile: jest.fn(),
      updateProfile: jest.fn(),
      listUsersByRole: jest.fn(),
    };

    supabaseService = {
      uploadAvatar: jest.fn(),
      deleteAvatar: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: usersService,
        },
        {
          provide: SupabaseService,
          useValue: supabaseService,
        },
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('GET /me', () => {
    it('should return the authenticated user profile', async () => {
      const mockProfile = {
        id: 'user-sub-1',
        name: 'Rafiq Ahmed',
        phone: '01712345678',
        role: 'farmer',
        rating: 4.5,
        ratingCount: 12,
        walletBalance: 1200.0,
        isVerified: true,
        nidVerified: false,
        district: 'Bogura',
        avatarUrl: 'https://cdn.example.com/avatar.jpg',
      };

      (usersService.getProfile as jest.Mock).mockResolvedValue(mockProfile);

      const result = await controller.getMe({ supabaseId: 'user-sub-1' });

      expect(result).toEqual({
        success: true,
        data: mockProfile,
      });
      expect(usersService.getProfile).toHaveBeenCalledWith('user-sub-1');
    });
  });

  describe('PATCH /me', () => {
    it('should update and return own profile', async () => {
      const updatedProfile = {
        id: 'user-sub-1',
        name: 'Rafiq Ahmed',
        phone: '01712345678',
        role: 'farmer',
        rating: 4.5,
        ratingCount: 12,
        walletBalance: 1200.0,
        isVerified: true,
        nidVerified: false,
        district: 'Dhaka',
        avatarUrl: 'https://cdn.example.com/avatar.jpg',
      };

      (usersService.updateProfile as jest.Mock).mockResolvedValue(
        updatedProfile,
      );

      const result = await controller.updateMe(
        { sub: 'user-sub-1' },
        {
          name: 'Rafiq Ahmed',
          avatarUrl: 'https://cdn.example.com/avatar.jpg',
        },
      );

      expect(result).toEqual({
        success: true,
        data: updatedProfile,
      });
      expect(usersService.updateProfile).toHaveBeenCalledWith(
        'user-sub-1',
        {
          name: 'Rafiq Ahmed',
          avatarUrl: 'https://cdn.example.com/avatar.jpg',
        },
        undefined,
      );
    });
  });

  describe('GET /farmers', () => {
    it('should return paginated farmers list', async () => {
      const mockListResult = {
        data: [
          {
            id: 'farmer-1',
            name: 'Farmer John',
            role: 'farmer',
            rating: 4.5,
            isVerified: true,
          },
        ],
        meta: {
          page: 1,
          limit: 10,
          total: 1,
          totalPages: 1,
        },
      };

      (usersService.listUsersByRole as jest.Mock).mockResolvedValue(
        mockListResult,
      );

      const result = await controller.getFarmers({ page: 1, limit: 10 });

      expect(result).toEqual(mockListResult);
      expect(usersService.listUsersByRole).toHaveBeenCalledWith('farmer', {
        page: 1,
        limit: 10,
      });
    });
  });

  describe('GET /buyers', () => {
    it('should return paginated buyers list', async () => {
      const mockListResult = {
        data: [
          {
            id: 'buyer-1',
            name: 'Buyer Karim',
            role: 'buyer',
            rating: 4.8,
            isVerified: true,
          },
        ],
        meta: {
          page: 1,
          limit: 10,
          total: 1,
          totalPages: 1,
        },
      };

      (usersService.listUsersByRole as jest.Mock).mockResolvedValue(
        mockListResult,
      );

      const result = await controller.getBuyers({ page: 1, limit: 10 });

      expect(result).toEqual(mockListResult);
      expect(usersService.listUsersByRole).toHaveBeenCalledWith('buyer', {
        page: 1,
        limit: 10,
      });
    });
  });

  describe('GET /:id', () => {
    it('should return public profile', async () => {
      const mockPublic = {
        id: 'target-uuid',
        name: 'Rafiq Ahmed',
        role: 'farmer',
        rating: 4.5,
        ratingCount: 10,
        avatarUrl: 'https://cdn.example.com/avatar.jpg',
      };

      (usersService.getPublicProfile as jest.Mock).mockResolvedValue(
        mockPublic,
      );

      const result = await controller.getPublicProfile('target-uuid');

      expect(result).toEqual({
        success: true,
        data: mockPublic,
      });
      expect(usersService.getPublicProfile).toHaveBeenCalledWith('target-uuid');
    });
  });
});
