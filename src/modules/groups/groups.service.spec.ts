import { Test, TestingModule } from '@nestjs/testing';
import { GroupsService } from './groups.service';
import { SupabaseService } from '../supabase/supabase.service';
import { PrismaService } from '../../prisma/prisma.service';
import { DemandsService } from '../demands/demands.service';
import { NotificationsService } from '../notifications/notifications.service';
import { GroupsGateway } from './groups.gateway';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { CreateGroupDto, JoinGroupDto, CreateMessageDto } from './dto';

describe('GroupsService', () => {
  let service: GroupsService;
  let clientMock: any;
  let supabaseMock: any;
  let prismaMock: any;
  let demandsServiceMock: any;
  let notificationsServiceMock: any;
  let groupsGatewayMock: any;

  beforeEach(async () => {
    clientMock = {
      from: jest.fn(),
      channel: jest.fn().mockReturnValue({
        send: jest.fn().mockResolvedValue({}),
      }),
    };

    supabaseMock = {
      getAdminClient: jest.fn().mockReturnValue(clientMock),
    };

    prismaMock = {};

    demandsServiceMock = {
      create: jest.fn(),
    };

    notificationsServiceMock = {
      sendNotification: jest.fn(),
    };

    groupsGatewayMock = {
      emitMessage: jest.fn(),
      emitMemberJoined: jest.fn(),
      emitMemberLeft: jest.fn(),
      emitGroupFulfilled: jest.fn(),
      emitDemandCreated: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GroupsService,
        {
          provide: SupabaseService,
          useValue: supabaseMock,
        },
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
        {
          provide: DemandsService,
          useValue: demandsServiceMock,
        },
        {
          provide: NotificationsService,
          useValue: notificationsServiceMock,
        },
        {
          provide: GroupsGateway,
          useValue: groupsGatewayMock,
        },
      ],
    }).compile();

    service = module.get<GroupsService>(GroupsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── 1. create ──────────────────────────────────────────────────────────────

  describe('create', () => {
    it('should throw BadRequestException if expiryDate is in the past', async () => {
      const pastDate = new Date(Date.now() - 100000).toISOString();
      const dto: CreateGroupDto = {
        name: 'Expired Group',
        productName: 'Rice',
        category: 'grains',
        targetQuantity: 500,
        pricePerKg: 50,
        deliveryLocation: 'Dhaka',
        expiryDate: pastDate,
      };

      await expect(service.create('user-1', dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException if initialContribution > targetQuantity', async () => {
      const futureDate = new Date(Date.now() + 10000000).toISOString();
      const dto: CreateGroupDto = {
        name: 'Potato Bulk',
        productName: 'Potato',
        category: 'vegetables',
        targetQuantity: 100,
        pricePerKg: 25,
        deliveryLocation: 'Dhaka',
        expiryDate: futureDate,
        initialContribution: 150,
      };

      await expect(service.create('user-1', dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should create group and add creator to group_members', async () => {
      const futureDate = new Date(Date.now() + 10000000).toISOString();
      const dto: CreateGroupDto = {
        name: 'Potato Bulk',
        productName: 'Potato',
        category: 'vegetables',
        targetQuantity: 1000,
        pricePerKg: 25,
        deliveryLocation: 'Dhaka',
        expiryDate: futureDate,
        initialContribution: 200,
      };

      const mockGroup = {
        id: 'grp-1',
        name: 'Potato Bulk',
        product_name: 'Potato',
        category: 'vegetables',
        target_quantity: 1000,
        filled_quantity: 200,
        price_per_kg: 25,
        delivery_location: 'Dhaka',
        created_by: 'user-1',
        expiry_date: futureDate,
        status: 'open',
        created_at: new Date().toISOString(),
      };

      const mockMember = {
        id: 'mem-1',
        group_id: 'grp-1',
        user_id: 'user-1',
        contribution_quantity: 200,
        is_paid: false,
        joined_at: new Date().toISOString(),
      };

      clientMock.from.mockImplementation((table: string) => {
        if (table === 'buying_groups') {
          return {
            insert: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            single: jest
              .fn()
              .mockResolvedValue({ data: mockGroup, error: null }),
          };
        }
        if (table === 'group_members') {
          return {
            insert: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            single: jest
              .fn()
              .mockResolvedValue({ data: mockMember, error: null }),
          };
        }
        return {};
      });

      const result = await service.create('user-1', dto);

      expect(result.id).toBe('grp-1');
      expect(result.targetQuantity).toBe(1000);
      expect(result.filledQuantity).toBe(200);
      expect(result.remainingQuantity).toBe(800);
      expect(result.progressPercentage).toBe(20);
      expect(result.members).toHaveLength(1);
    });
  });

  // ─── 2. findAll ─────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('should return paginated buying groups', async () => {
      const mockGroups = [
        {
          id: 'grp-1',
          name: 'Potato Bulk',
          product_name: 'Potato',
          category: 'vegetables',
          target_quantity: 1000,
          filled_quantity: 200,
          price_per_kg: 25,
          delivery_location: 'Dhaka',
          created_by: 'user-1',
          status: 'open',
        },
      ];

      const chain: any = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockResolvedValue({
          data: mockGroups,
          count: 1,
          error: null,
        }),
      };
      clientMock.from.mockReturnValue(chain);

      const result = await service.findAll({ page: 1, limit: 10 });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('grp-1');
      expect(result.meta.total).toBe(1);
    });
  });

  // ─── 3. findMyGroups ────────────────────────────────────────────────────────

  describe('findMyGroups', () => {
    it('should return groups where user is member or creator', async () => {
      clientMock.from.mockImplementation((table: string) => {
        if (table === 'group_members') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockResolvedValue({
              data: [{ group_id: 'grp-1' }],
              error: null,
            }),
          };
        }
        if (table === 'buying_groups') {
          return {
            select: jest.fn().mockReturnThis(),
            order: jest.fn().mockReturnThis(),
            or: jest.fn().mockResolvedValue({
              data: [
                {
                  id: 'grp-1',
                  name: 'Potato Bulk',
                  target_quantity: 1000,
                  filled_quantity: 200,
                  price_per_kg: 25,
                },
              ],
              error: null,
            }),
          };
        }
        return {};
      });

      const result = await service.findMyGroups('user-1');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('grp-1');
    });
  });

  // ─── 4. findOne ─────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('should throw NotFoundException if group does not exist', async () => {
      const chain: any = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest
          .fn()
          .mockResolvedValue({ data: null, error: { message: 'Not found' } }),
      };
      clientMock.from.mockReturnValue(chain);

      await expect(service.findOne('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return group with its members', async () => {
      const mockGroup = {
        id: 'grp-1',
        name: 'Potato Bulk',
        target_quantity: 1000,
        filled_quantity: 500,
        price_per_kg: 25,
      };

      const mockMembers = [
        {
          id: 'mem-1',
          group_id: 'grp-1',
          user_id: 'user-1',
          contribution_quantity: 500,
          is_paid: false,
        },
      ];

      clientMock.from.mockImplementation((table: string) => {
        if (table === 'buying_groups') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest
              .fn()
              .mockResolvedValue({ data: mockGroup, error: null }),
          };
        }
        if (table === 'group_members') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            order: jest
              .fn()
              .mockResolvedValue({ data: mockMembers, error: null }),
          };
        }
        return {};
      });

      const result = await service.findOne('grp-1', 'user-1');

      expect(result.id).toBe('grp-1');
      expect(result.members).toHaveLength(1);
      expect(result.remainingQuantity).toBe(500);
      expect(result.progressPercentage).toBe(50);
    });
  });

  // ─── 5. join ────────────────────────────────────────────────────────────────

  describe('join', () => {
    it('should throw BadRequestException if group has already expired', async () => {
      const pastDate = new Date(Date.now() - 100000).toISOString();
      const mockGroup = {
        id: 'grp-1',
        status: 'open',
        expiry_date: pastDate,
      };

      const chain: any = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: mockGroup, error: null }),
      };
      clientMock.from.mockReturnValue(chain);

      await expect(
        service.join('grp-1', 'user-2', { quantity: 100 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should join group and trigger fulfillment + demand creation when target reached', async () => {
      const futureDate = new Date(Date.now() + 10000000).toISOString();
      const mockGroup = {
        id: 'grp-1',
        name: 'Potato Bulk',
        product_name: 'Potato',
        category: 'vegetables',
        target_quantity: 1000,
        filled_quantity: 800,
        price_per_kg: 25,
        delivery_location: 'Dhaka',
        created_by: 'creator-1',
        expiry_date: futureDate,
        status: 'active',
        linked_demand_id: null,
      };

      const mockNewMember = {
        id: 'mem-2',
        group_id: 'grp-1',
        user_id: 'user-2',
        contribution_quantity: 200,
        is_paid: false,
        joined_at: new Date().toISOString(),
      };

      demandsServiceMock.create.mockResolvedValue({
        id: 'demand-bulk-1',
        productName: 'Potato',
      });

      clientMock.from.mockImplementation((table: string) => {
        if (table === 'buying_groups') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest
              .fn()
              .mockResolvedValue({ data: mockGroup, error: null }),
            update: jest.fn().mockReturnThis(),
          };
        }
        if (table === 'group_members') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest
              .fn()
              .mockResolvedValue({ data: null, error: null }),
            insert: jest.fn().mockReturnThis(),
            single: jest
              .fn()
              .mockResolvedValue({ data: mockNewMember, error: null }),
          };
        }
        return {};
      });

      const result = await service.join('grp-1', 'user-2', { quantity: 200 });

      expect(result.success).toBe(true);
      expect(result.isFulfilled).toBe(true);
      expect(demandsServiceMock.create).toHaveBeenCalledWith('creator-1', {
        productName: 'Potato',
        quantity: 1000,
        callingPrice: 25,
        deliveryLocation: 'Dhaka',
        expiryTime: futureDate,
        tradeType: 'both',
      });
      expect(groupsGatewayMock.emitGroupFulfilled).toHaveBeenCalledWith(
        'grp-1',
        {
          groupId: 'grp-1',
          demandId: 'demand-bulk-1',
          targetQuantity: 1000,
          filledQuantity: 1000,
        },
      );
    });
  });

  // ─── 6. leave ───────────────────────────────────────────────────────────────

  describe('leave', () => {
    it('should throw BadRequestException if group is already fulfilled', async () => {
      const mockGroup = {
        id: 'grp-1',
        status: 'fulfilled',
      };

      const chain: any = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: mockGroup, error: null }),
      };
      clientMock.from.mockReturnValue(chain);

      await expect(service.leave('grp-1', 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should leave group and reduce filled_quantity', async () => {
      const mockGroup = {
        id: 'grp-1',
        status: 'active',
        filled_quantity: 600,
      };

      const mockMember = {
        id: 'mem-1',
        group_id: 'grp-1',
        user_id: 'user-1',
        contribution_quantity: 200,
      };

      clientMock.from.mockImplementation((table: string) => {
        if (table === 'buying_groups') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest
              .fn()
              .mockResolvedValue({ data: mockGroup, error: null }),
            update: jest.fn().mockReturnThis(),
          };
        }
        if (table === 'group_members') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest
              .fn()
              .mockResolvedValue({ data: mockMember, error: null }),
            delete: jest.fn().mockReturnThis(),
          };
        }
        return {};
      });

      const result = await service.leave('grp-1', 'user-1');

      expect(result.success).toBe(true);
      expect(result.freedQuantity).toBe(200);
      expect(groupsGatewayMock.emitMemberLeft).toHaveBeenCalledWith('grp-1', {
        groupId: 'grp-1',
        userId: 'user-1',
        freedQuantity: 200,
        filledQuantity: 400,
      });
    });
  });

  // ─── 7. getMessages ─────────────────────────────────────────────────────────

  describe('getMessages', () => {
    it('should return group chat messages', async () => {
      const mockMessages = [
        {
          id: 'msg-1',
          group_id: 'grp-1',
          sender_id: 'user-1',
          message: 'Hello!',
          created_at: '2026-11-20T10:00:00Z',
        },
      ];

      const chain: any = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockResolvedValue({
          data: mockMessages,
          count: 1,
          error: null,
        }),
      };
      clientMock.from.mockReturnValue(chain);

      const result = await service.getMessages('grp-1', { page: 1, limit: 50 });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('msg-1');
      expect(result.meta.total).toBe(1);
    });
  });

  // ─── 8. sendMessage ─────────────────────────────────────────────────────────

  describe('sendMessage', () => {
    it('should store message and emit to Socket.IO room', async () => {
      const mockInserted = {
        id: 'msg-100',
        group_id: 'grp-1',
        sender_id: 'user-1',
        message: 'Bulk order incoming!',
        created_at: new Date().toISOString(),
      };

      const chain: any = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest
          .fn()
          .mockResolvedValue({ data: mockInserted, error: null }),
      };
      clientMock.from.mockReturnValue(chain);

      const result = await service.sendMessage('grp-1', 'user-1', {
        message: 'Bulk order incoming!',
      });

      expect(result.id).toBe('msg-100');
      expect(result.message).toBe('Bulk order incoming!');
      expect(groupsGatewayMock.emitMessage).toHaveBeenCalledWith(
        'grp-1',
        expect.objectContaining({
          id: 'msg-100',
          message: 'Bulk order incoming!',
        }),
      );
    });
  });

  // ─── 9. postDemand ──────────────────────────────────────────────────────────

  describe('postDemand', () => {
    it('should throw ForbiddenException if user is not the group creator', async () => {
      const mockGroup = {
        id: 'grp-1',
        created_by: 'creator-1',
      };

      const chain: any = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: mockGroup, error: null }),
      };
      clientMock.from.mockReturnValue(chain);

      await expect(service.postDemand('grp-1', 'intruder-id')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should convert group into demand post by creator', async () => {
      const futureDate = new Date(Date.now() + 10000000).toISOString();
      const mockGroup = {
        id: 'grp-1',
        product_name: 'Potato',
        target_quantity: 1000,
        filled_quantity: 800,
        price_per_kg: 25,
        delivery_location: 'Mirpur, Dhaka',
        created_by: 'creator-1',
        expiry_date: futureDate,
        linked_demand_id: null,
      };

      demandsServiceMock.create.mockResolvedValue({
        id: 'demand-created-1',
        productName: 'Potato',
      });

      clientMock.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: mockGroup, error: null }),
        update: jest.fn().mockReturnThis(),
      });

      const result = await service.postDemand('grp-1', 'creator-1');

      expect(result.success).toBe(true);
      expect(result.demand.id).toBe('demand-created-1');
      expect(demandsServiceMock.create).toHaveBeenCalledWith('creator-1', {
        productName: 'Potato',
        quantity: 800,
        callingPrice: 25,
        deliveryLocation: 'Mirpur, Dhaka',
        expiryTime: futureDate,
        tradeType: 'both',
      });
      expect(groupsGatewayMock.emitDemandCreated).toHaveBeenCalledWith(
        'grp-1',
        {
          groupId: 'grp-1',
          demandId: 'demand-created-1',
        },
      );
    });
  });
});
