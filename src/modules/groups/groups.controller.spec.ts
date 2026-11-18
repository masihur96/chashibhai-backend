import { Test, TestingModule } from '@nestjs/testing';
import { GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';
import { MemberGuard } from './member.guard';
import { SupabaseService } from '../supabase/supabase.service';
import { UnauthorizedException } from '@nestjs/common';
import {
  CreateGroupDto,
  JoinGroupDto,
  CreateMessageDto,
  QueryGroupDto,
  QueryMessageDto,
} from './dto';

describe('GroupsController', () => {
  let controller: GroupsController;
  let groupsService: Partial<Record<keyof GroupsService, jest.Mock>>;

  beforeEach(async () => {
    groupsService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findMyGroups: jest.fn(),
      findOne: jest.fn(),
      join: jest.fn(),
      leave: jest.fn(),
      getMessages: jest.fn(),
      sendMessage: jest.fn(),
      postDemand: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [GroupsController],
      providers: [
        {
          provide: GroupsService,
          useValue: groupsService,
        },
        {
          provide: SupabaseService,
          useValue: {
            getAdminClient: jest.fn(),
          },
        },
        {
          provide: MemberGuard,
          useValue: {
            canActivate: jest.fn().mockResolvedValue(true),
          },
        },
      ],
    }).compile();

    controller = module.get<GroupsController>(GroupsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('POST / (create)', () => {
    it('should create a buying group', async () => {
      const dto: CreateGroupDto = {
        name: 'Potato Bulk',
        productName: 'Potato',
        category: 'vegetables',
        targetQuantity: 1000,
        pricePerKg: 25,
        deliveryLocation: 'Mirpur, Dhaka',
        expiryDate: '2026-12-01T18:00:00Z',
      };
      const mockGroup = { id: 'grp-1', ...dto, createdBy: 'user-1' };
      (groupsService.create as jest.Mock).mockResolvedValue(mockGroup);

      const result = await controller.create({ sub: 'user-1' }, dto);

      expect(result).toEqual({ success: true, data: mockGroup });
      expect(groupsService.create).toHaveBeenCalledWith('user-1', dto);
    });

    it('should throw UnauthorizedException if user ID is missing', async () => {
      await expect(
        controller.create({}, {} as CreateGroupDto),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('GET / (findAll)', () => {
    it('should list open buying groups', async () => {
      const query: QueryGroupDto = { page: 1, limit: 10 };
      const mockResult = {
        data: [{ id: 'grp-1', name: 'Potato Bulk' }],
        meta: { page: 1, limit: 10, total: 1, totalPages: 1 },
      };
      (groupsService.findAll as jest.Mock).mockResolvedValue(mockResult);

      const result = await controller.findAll(query);

      expect(result).toEqual({
        success: true,
        data: mockResult.data,
        meta: mockResult.meta,
      });
      expect(groupsService.findAll).toHaveBeenCalledWith(query);
    });
  });

  describe('GET /my (findMyGroups)', () => {
    it('should list user buying groups', async () => {
      const mockGroups = [{ id: 'grp-1', name: 'Potato Bulk' }];
      (groupsService.findMyGroups as jest.Mock).mockResolvedValue(mockGroups);

      const result = await controller.findMyGroups({ sub: 'user-1' });

      expect(result).toEqual({ success: true, data: mockGroups });
      expect(groupsService.findMyGroups).toHaveBeenCalledWith('user-1');
    });
  });

  describe('GET /:id (findOne)', () => {
    it('should return group details and members', async () => {
      const mockGroup = {
        id: 'grp-1',
        name: 'Potato Bulk',
        members: [{ id: 'm-1', userId: 'user-1' }],
      };
      (groupsService.findOne as jest.Mock).mockResolvedValue(mockGroup);

      const result = await controller.findOne('grp-1', { sub: 'user-1' });

      expect(result).toEqual({ success: true, data: mockGroup });
      expect(groupsService.findOne).toHaveBeenCalledWith('grp-1', 'user-1');
    });
  });

  describe('POST /:id/join (join)', () => {
    it('should join group with quantity', async () => {
      const dto: JoinGroupDto = { quantity: 150 };
      const mockJoinRes = {
        success: true,
        isFulfilled: false,
        message: 'Contributed 150 KG',
      };
      (groupsService.join as jest.Mock).mockResolvedValue(mockJoinRes);

      const result = await controller.join('grp-1', { sub: 'user-1' }, dto);

      expect(result).toEqual({ success: true, data: mockJoinRes });
      expect(groupsService.join).toHaveBeenCalledWith('grp-1', 'user-1', dto);
    });
  });

  describe('DELETE /:id/leave (leave)', () => {
    it('should leave group', async () => {
      const mockLeaveRes = {
        success: true,
        message: 'Successfully left',
        freedQuantity: 150,
      };
      (groupsService.leave as jest.Mock).mockResolvedValue(mockLeaveRes);

      const result = await controller.leave('grp-1', { sub: 'user-1' });

      expect(result).toEqual({ success: true, data: mockLeaveRes });
      expect(groupsService.leave).toHaveBeenCalledWith('grp-1', 'user-1');
    });
  });

  describe('GET /:id/messages (getMessages)', () => {
    it('should return chat messages', async () => {
      const query: QueryMessageDto = { page: 1, limit: 50 };
      const mockMessages = {
        data: [{ id: 'msg-1', message: 'Hello' }],
        meta: { page: 1, limit: 50, total: 1, totalPages: 1 },
      };
      (groupsService.getMessages as jest.Mock).mockResolvedValue(mockMessages);

      const result = await controller.getMessages('grp-1', query);

      expect(result).toEqual({
        success: true,
        data: mockMessages.data,
        meta: mockMessages.meta,
      });
      expect(groupsService.getMessages).toHaveBeenCalledWith('grp-1', query);
    });
  });

  describe('POST /:id/messages (sendMessage)', () => {
    it('should send a chat message', async () => {
      const dto: CreateMessageDto = { message: 'Hello everyone' };
      const mockMessage = { id: 'msg-1', message: 'Hello everyone' };
      (groupsService.sendMessage as jest.Mock).mockResolvedValue(mockMessage);

      const result = await controller.sendMessage('grp-1', { sub: 'user-1' }, dto);

      expect(result).toEqual({ success: true, data: mockMessage });
      expect(groupsService.sendMessage).toHaveBeenCalledWith('grp-1', 'user-1', dto);
    });
  });

  describe('POST /:id/post-demand (postDemand)', () => {
    it('should convert group to demand post', async () => {
      const mockDemandRes = {
        success: true,
        demand: { id: 'dem-1' },
        message: 'Converted',
      };
      (groupsService.postDemand as jest.Mock).mockResolvedValue(mockDemandRes);

      const result = await controller.postDemand('grp-1', { sub: 'creator-1' });

      expect(result).toEqual({ success: true, data: mockDemandRes });
      expect(groupsService.postDemand).toHaveBeenCalledWith('grp-1', 'creator-1');
    });
  });
});
