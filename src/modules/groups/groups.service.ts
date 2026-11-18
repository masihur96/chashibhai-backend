import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { PrismaService } from '../../prisma/prisma.service';
import { DemandsService } from '../demands/demands.service';
import { DemandTradeType } from '../demands/dto/create-demand.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { GroupsGateway } from './groups.gateway';
import {
  CreateGroupDto,
  JoinGroupDto,
  CreateMessageDto,
  QueryGroupDto,
  QueryMessageDto,
} from './dto';

export interface FormattedBuyingGroup {
  id: string;
  name: string;
  productName: string;
  category: string;
  targetQuantity: number;
  filledQuantity: number;
  remainingQuantity: number;
  progressPercentage: number;
  pricePerKg: number;
  deliveryLocation: string;
  createdBy: string;
  linkedDemandId: string | null;
  expiryDate: string;
  status: string;
  createdAt: string;
  creator?: {
    id: string;
    name: string;
    phone?: string | null;
    avatarUrl?: string | null;
    rating?: number;
  };
  membersCount?: number;
  members?: FormattedGroupMember[];
}

export interface FormattedGroupMember {
  id: string;
  groupId: string;
  userId: string;
  contributionQuantity: number;
  isPaid: boolean;
  joinedAt: string;
  user?: {
    id: string;
    name: string;
    phone?: string | null;
    avatarUrl?: string | null;
    rating?: number;
  };
}

export interface FormattedGroupMessage {
  id: string;
  groupId: string;
  senderId: string;
  message: string;
  createdAt: string;
  sender?: {
    id: string;
    name: string;
    avatarUrl?: string | null;
  };
}

@Injectable()
export class GroupsService {
  private readonly logger = new Logger(GroupsService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly prisma: PrismaService,
    private readonly demandsService: DemandsService,
    private readonly notificationsService: NotificationsService,
    private readonly groupsGateway: GroupsGateway,
  ) {}

  /**
   * Helper to format raw database buying group row
   */
  private formatGroup(raw: any, members?: any[]): FormattedBuyingGroup {
    const target = Number(raw.target_quantity);
    const filled = Number(raw.filled_quantity ?? 0);
    const remaining = Math.max(0, target - filled);
    const progress =
      target > 0 ? Math.min(100, Math.round((filled / target) * 100)) : 0;

    return {
      id: raw.id,
      name: raw.name,
      productName: raw.product_name,
      category: raw.category,
      targetQuantity: target,
      filledQuantity: filled,
      remainingQuantity: remaining,
      progressPercentage: progress,
      pricePerKg: Number(raw.price_per_kg),
      deliveryLocation: raw.delivery_location,
      createdBy: raw.created_by,
      linkedDemandId: raw.linked_demand_id ?? null,
      expiryDate: raw.expiry_date,
      status: raw.status ?? 'open',
      createdAt: raw.created_at,
      creator: raw.profiles
        ? {
            id: raw.profiles.id,
            name: raw.profiles.name,
            phone: raw.profiles.phone ?? null,
            avatarUrl: raw.profiles.avatar_url ?? null,
            rating: Number(raw.profiles.rating ?? 0),
          }
        : undefined,
      membersCount: Array.isArray(members)
        ? members.length
        : Array.isArray(raw.group_members)
          ? raw.group_members.length
          : undefined,
      members: Array.isArray(members)
        ? members.map((m) => this.formatMember(m))
        : Array.isArray(raw.group_members)
          ? raw.group_members.map((m: any) => this.formatMember(m))
          : undefined,
    };
  }

  /**
   * Helper to format raw database group member row
   */
  private formatMember(raw: any): FormattedGroupMember {
    return {
      id: raw.id,
      groupId: raw.group_id,
      userId: raw.user_id,
      contributionQuantity: Number(raw.contribution_quantity),
      isPaid: Boolean(raw.is_paid),
      joinedAt: raw.joined_at,
      user: raw.profiles
        ? {
            id: raw.profiles.id,
            name: raw.profiles.name,
            phone: raw.profiles.phone ?? null,
            avatarUrl: raw.profiles.avatar_url ?? null,
            rating: Number(raw.profiles.rating ?? 0),
          }
        : undefined,
    };
  }

  /**
   * Helper to format raw database message row
   */
  private formatMessage(raw: any): FormattedGroupMessage {
    return {
      id: raw.id,
      groupId: raw.group_id,
      senderId: raw.sender_id,
      message: raw.message,
      createdAt: raw.created_at,
      sender: raw.profiles
        ? {
            id: raw.profiles.id,
            name: raw.profiles.name,
            avatarUrl: raw.profiles.avatar_url ?? null,
          }
        : undefined,
    };
  }

  // ─── 1. Create a Buying Group (Buyer) ────────────────────────────────────────

  async create(
    userId: string,
    dto: CreateGroupDto,
  ): Promise<FormattedBuyingGroup> {
    const client = this.supabaseService.getAdminClient();

    const name = dto.name?.trim();
    const productName = (dto.productName ?? dto.product_name)?.trim();
    const category = dto.category?.trim();
    const targetQuantity = Number(dto.targetQuantity ?? dto.target_quantity);
    const pricePerKg = Number(dto.pricePerKg ?? dto.price_per_kg);
    const deliveryLocation = (
      dto.deliveryLocation ?? dto.delivery_location
    )?.trim();
    const expiryDateStr = dto.expiryDate ?? dto.expiry_date;
    const initialContribution = Number(
      dto.initialContribution ?? dto.initial_contribution ?? 0,
    );

    if (
      !name ||
      !productName ||
      !category ||
      !targetQuantity ||
      !pricePerKg ||
      !deliveryLocation ||
      !expiryDateStr
    ) {
      throw new BadRequestException(
        'All required group fields must be provided',
      );
    }

    const expiryDate = new Date(expiryDateStr);
    if (isNaN(expiryDate.getTime())) {
      throw new BadRequestException('Invalid date format for expiryDate');
    }
    if (expiryDate <= new Date()) {
      throw new BadRequestException('expiryDate must be in the future');
    }
    if (initialContribution > targetQuantity) {
      throw new BadRequestException(
        'Initial contribution cannot exceed target quantity',
      );
    }

    const isFulfilled = initialContribution >= targetQuantity;
    const initialStatus = isFulfilled ? 'fulfilled' : 'open';

    // 1. Insert buying group
    const { data: group, error: groupErr } = await client
      .from('buying_groups')
      .insert({
        name,
        product_name: productName,
        category,
        target_quantity: targetQuantity,
        filled_quantity: initialContribution,
        price_per_kg: pricePerKg,
        delivery_location: deliveryLocation,
        created_by: userId,
        expiry_date: expiryDate.toISOString(),
        status: initialStatus,
        created_at: new Date().toISOString(),
      })
      .select('*, profiles:created_by(id, name, phone, avatar_url, rating)')
      .single();

    if (groupErr || !group) {
      this.logger.error('Failed to create buying group', groupErr);
      throw new InternalServerErrorException('Failed to create buying group');
    }

    // 2. Add creator to group_members
    const { data: member } = await client
      .from('group_members')
      .insert({
        group_id: group.id,
        user_id: userId,
        contribution_quantity: initialContribution,
        is_paid: false,
        joined_at: new Date().toISOString(),
      })
      .select('*, profiles:user_id(id, name, phone, avatar_url, rating)')
      .single();

    // 3. If target reached at creation, create linked demand post
    let linkedDemandId: string | null = null;
    if (isFulfilled) {
      try {
        const demand = await this.demandsService.create(userId, {
          productName,
          quantity: targetQuantity,
          callingPrice: pricePerKg,
          deliveryLocation,
          expiryTime: expiryDate.toISOString(),
          tradeType: DemandTradeType.BOTH,
        });

        linkedDemandId = demand.id;

        await client
          .from('buying_groups')
          .update({ linked_demand_id: demand.id, status: 'fulfilled' })
          .eq('id', group.id);

        group.linked_demand_id = demand.id;
        group.status = 'fulfilled';

        this.groupsGateway.emitGroupFulfilled(group.id, {
          groupId: group.id,
          demandId: demand.id,
          targetQuantity,
          filledQuantity: initialContribution,
        });
      } catch (err: any) {
        this.logger.error(
          'Failed to auto-create demand on group fulfillment',
          err,
        );
      }
    }

    const membersList = member ? [member] : [];
    return this.formatGroup(group, membersList);
  }

  // ─── 2. List Open Groups (Buyer) ────────────────────────────────────────────

  async findAll(query?: QueryGroupDto) {
    const client = this.supabaseService.getAdminClient();

    let dbQuery = client
      .from('buying_groups')
      .select(
        '*, profiles:created_by(id, name, avatar_url, rating), group_members(id)',
        { count: 'exact' },
      );

    // Default to 'open' if no status specified
    if (query?.status && query.status !== 'all') {
      dbQuery = dbQuery.eq('status', query.status);
    } else if (!query?.status) {
      dbQuery = dbQuery.in('status', ['open', 'active']);
    }

    if (query?.category) {
      dbQuery = dbQuery.eq('category', query.category);
    }

    if (query?.search) {
      dbQuery = dbQuery.or(
        `name.ilike.%${query.search}%,product_name.ilike.%${query.search}%`,
      );
    }

    const page = query?.page && query.page > 0 ? query.page : 1;
    const limit = query?.limit && query.limit > 0 ? query.limit : 10;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    dbQuery = dbQuery.order('created_at', { ascending: false }).range(from, to);

    const { data, count, error } = await dbQuery;

    if (error) {
      this.logger.error('Failed to list buying groups', error);
      throw new InternalServerErrorException(
        'Failed to retrieve buying groups',
      );
    }

    const total = count ?? (data?.length || 0);
    const totalPages = Math.ceil(total / limit);

    return {
      data: (data || []).map((row) => this.formatGroup(row)),
      meta: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  // ─── 3. Groups I'm Part Of (Buyer) ──────────────────────────────────────────

  async findMyGroups(userId: string) {
    const client = this.supabaseService.getAdminClient();

    // 1. Fetch group IDs where user is a member
    const { data: memberships, error: memErr } = await client
      .from('group_members')
      .select('group_id')
      .eq('user_id', userId);

    if (memErr) {
      this.logger.error('Failed to fetch user group memberships', memErr);
      throw new InternalServerErrorException('Failed to retrieve memberships');
    }

    const groupIds = Array.from(
      new Set((memberships || []).map((m) => m.group_id)),
    );

    let dbQuery = client
      .from('buying_groups')
      .select(
        '*, profiles:created_by(id, name, avatar_url, rating), group_members(id)',
      )
      .order('created_at', { ascending: false });

    if (groupIds.length > 0) {
      dbQuery = dbQuery.or(
        `id.in.(${groupIds.join(',')}),created_by.eq.${userId}`,
      );
    } else {
      dbQuery = dbQuery.eq('created_by', userId);
    }

    const { data, error } = await dbQuery;

    if (error) {
      this.logger.error('Failed to retrieve my groups', error);
      throw new InternalServerErrorException('Failed to retrieve user groups');
    }

    return (data || []).map((row) => this.formatGroup(row));
  }

  // ─── 4. Group Details + Members (Member Only) ───────────────────────────────

  async findOne(
    groupId: string,
    userId?: string,
  ): Promise<FormattedBuyingGroup> {
    const client = this.supabaseService.getAdminClient();

    const { data: group, error: groupErr } = await client
      .from('buying_groups')
      .select('*, profiles:created_by(id, name, phone, avatar_url, rating)')
      .eq('id', groupId)
      .single();

    if (groupErr || !group) {
      throw new NotFoundException(
        `Buying group with ID "${groupId}" not found`,
      );
    }

    const { data: members, error: memErr } = await client
      .from('group_members')
      .select('*, profiles:user_id(id, name, phone, avatar_url, rating)')
      .eq('group_id', groupId)
      .order('joined_at', { ascending: true });

    if (memErr) {
      this.logger.error('Failed to fetch group members', memErr);
    }

    return this.formatGroup(group, members || []);
  }

  // ─── 5. Join Group with Quantity (Buyer) ────────────────────────────────────

  async join(
    groupId: string,
    userId: string,
    dto: JoinGroupDto,
  ): Promise<{
    success: boolean;
    group: FormattedBuyingGroup;
    member: FormattedGroupMember;
    isFulfilled: boolean;
    message: string;
  }> {
    const client = this.supabaseService.getAdminClient();
    const quantity = Number(
      dto.quantity ?? dto.contributionQuantity ?? dto.contribution_quantity,
    );

    if (!quantity || quantity <= 0) {
      throw new BadRequestException(
        'Contribution quantity must be greater than zero',
      );
    }

    // 1. Fetch group
    const { data: group, error: groupErr } = await client
      .from('buying_groups')
      .select('*')
      .eq('id', groupId)
      .single();

    if (groupErr || !group) {
      throw new NotFoundException(
        `Buying group with ID "${groupId}" not found`,
      );
    }

    if (group.status !== 'open' && group.status !== 'active') {
      throw new BadRequestException(
        `Cannot join this group because its status is "${group.status}"`,
      );
    }

    if (new Date(group.expiry_date) <= new Date()) {
      throw new BadRequestException('This buying group has already expired');
    }

    const targetQuantity = Number(group.target_quantity);
    const currentFilled = Number(group.filled_quantity ?? 0);
    const newFilledQuantity = currentFilled + quantity;
    const isFulfilled = newFilledQuantity >= targetQuantity;

    // 2. Insert or update member record
    const { data: existingMember } = await client
      .from('group_members')
      .select('*')
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .maybeSingle();

    let memberRow: any;
    if (existingMember) {
      const updatedContribution =
        Number(existingMember.contribution_quantity) + quantity;
      const { data: updatedMember, error: updateErr } = await client
        .from('group_members')
        .update({ contribution_quantity: updatedContribution })
        .eq('id', existingMember.id)
        .select('*, profiles:user_id(id, name, phone, avatar_url, rating)')
        .single();

      if (updateErr) throw updateErr;
      memberRow = updatedMember;
    } else {
      const { data: newMember, error: insertErr } = await client
        .from('group_members')
        .insert({
          group_id: groupId,
          user_id: userId,
          contribution_quantity: quantity,
          is_paid: false,
          joined_at: new Date().toISOString(),
        })
        .select('*, profiles:user_id(id, name, phone, avatar_url, rating)')
        .single();

      if (insertErr) throw insertErr;
      memberRow = newMember;
    }

    // 3. Update buying_groups filled_quantity and status
    const newStatus = isFulfilled ? 'fulfilled' : 'active';
    let linkedDemandId = group.linked_demand_id ?? null;

    if (isFulfilled && !linkedDemandId) {
      try {
        const demand = await this.demandsService.create(group.created_by, {
          productName: group.product_name,
          quantity: targetQuantity,
          callingPrice: Number(group.price_per_kg),
          deliveryLocation: group.delivery_location,
          expiryTime: new Date(group.expiry_date).toISOString(),
          tradeType: DemandTradeType.BOTH,
        });

        linkedDemandId = demand.id;

        this.groupsGateway.emitGroupFulfilled(groupId, {
          groupId,
          demandId: demand.id,
          targetQuantity,
          filledQuantity: newFilledQuantity,
        });

        // Notify group members
        const { data: allMembers } = await client
          .from('group_members')
          .select('user_id')
          .eq('group_id', groupId);

        if (allMembers) {
          for (const m of allMembers) {
            await this.notificationsService.sendNotification(
              m.user_id,
              'Group Buy Target Reached! 🎉',
              `The group "${group.name}" reached its target of ${targetQuantity} KG. A bulk demand post has been placed!`,
              { groupId, demandId: demand.id, type: 'group_buy' },
            );
          }
        }
      } catch (err: any) {
        this.logger.error(
          'Failed to auto-create demand on join fulfillment',
          err,
        );
      }
    }

    await client
      .from('buying_groups')
      .update({
        filled_quantity: newFilledQuantity,
        status: newStatus,
        linked_demand_id: linkedDemandId,
      })
      .eq('id', groupId);

    // 4. Emit real-time event
    this.groupsGateway.emitMemberJoined(groupId, {
      groupId,
      userId,
      contributionQuantity: quantity,
      filledQuantity: newFilledQuantity,
      targetQuantity,
      isFulfilled,
    });

    const updatedGroupData = {
      ...group,
      filled_quantity: newFilledQuantity,
      status: newStatus,
      linked_demand_id: linkedDemandId,
    };

    return {
      success: true,
      group: this.formatGroup(updatedGroupData),
      member: this.formatMember(memberRow),
      isFulfilled,
      message: isFulfilled
        ? `Joined group! Target of ${targetQuantity} KG reached; demand post created.`
        : `Successfully contributed ${quantity} KG to the buying group.`,
    };
  }

  // ─── 6. Leave Group (Member) ────────────────────────────────────────────────

  async leave(
    groupId: string,
    userId: string,
  ): Promise<{ success: boolean; message: string; freedQuantity: number }> {
    const client = this.supabaseService.getAdminClient();

    // 1. Fetch group
    const { data: group, error: groupErr } = await client
      .from('buying_groups')
      .select('*')
      .eq('id', groupId)
      .single();

    if (groupErr || !group) {
      throw new NotFoundException(
        `Buying group with ID "${groupId}" not found`,
      );
    }

    if (group.status === 'fulfilled') {
      throw new BadRequestException(
        'Cannot leave a group that has already been fulfilled',
      );
    }

    // 2. Fetch member
    const { data: member, error: memErr } = await client
      .from('group_members')
      .select('*')
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .single();

    if (memErr || !member) {
      throw new NotFoundException(
        'You are not a registered member of this buying group',
      );
    }

    const freedQuantity = Number(member.contribution_quantity);
    const currentFilled = Number(group.filled_quantity ?? 0);
    const newFilledQuantity = Math.max(0, currentFilled - freedQuantity);

    // 3. Remove from group_members
    await client.from('group_members').delete().eq('id', member.id);

    // 4. Update buying_groups filled_quantity
    const newStatus =
      newFilledQuantity === 0 && group.status === 'active'
        ? 'open'
        : group.status;

    await client
      .from('buying_groups')
      .update({
        filled_quantity: newFilledQuantity,
        status: newStatus,
      })
      .eq('id', groupId);

    // 5. Emit real-time event
    this.groupsGateway.emitMemberLeft(groupId, {
      groupId,
      userId,
      freedQuantity,
      filledQuantity: newFilledQuantity,
    });

    return {
      success: true,
      message: `Successfully left the group. Freed ${freedQuantity} KG.`,
      freedQuantity,
    };
  }

  // ─── 7. Group Chat History (Member) ─────────────────────────────────────────

  async getMessages(groupId: string, query?: QueryMessageDto) {
    const client = this.supabaseService.getAdminClient();

    const page = query?.page && query.page > 0 ? query.page : 1;
    const limit = query?.limit && query.limit > 0 ? query.limit : 50;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, count, error } = await client
      .from('group_messages')
      .select('*, profiles:sender_id(id, name, avatar_url)', { count: 'exact' })
      .eq('group_id', groupId)
      .order('created_at', { ascending: true })
      .range(from, to);

    if (error) {
      this.logger.error('Failed to get group messages', error);
      throw new InternalServerErrorException(
        'Failed to retrieve chat messages',
      );
    }

    const total = count ?? (data?.length || 0);
    const totalPages = Math.ceil(total / limit);

    return {
      data: (data || []).map((row) => this.formatMessage(row)),
      meta: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  // ─── 8. Send Group Message (Member) ─────────────────────────────────────────

  async sendMessage(
    groupId: string,
    userId: string,
    dto: CreateMessageDto,
  ): Promise<FormattedGroupMessage> {
    const client = this.supabaseService.getAdminClient();
    const message = dto.message?.trim();

    if (!message) {
      throw new BadRequestException('Message cannot be empty');
    }

    // 1. Insert message
    const { data: inserted, error } = await client
      .from('group_messages')
      .insert({
        group_id: groupId,
        sender_id: userId,
        message,
        created_at: new Date().toISOString(),
      })
      .select('*, profiles:sender_id(id, name, avatar_url)')
      .single();

    if (error || !inserted) {
      this.logger.error('Failed to store group message', error);
      throw new InternalServerErrorException('Failed to send message');
    }

    const formatted = this.formatMessage(inserted);

    // 2. Broadcast via Socket.IO
    this.groupsGateway.emitMessage(groupId, {
      id: formatted.id,
      groupId,
      senderId: userId,
      message: formatted.message,
      sender: formatted.sender,
      createdAt: formatted.createdAt,
    });

    // 3. Broadcast via Supabase Realtime channel
    try {
      client
        .channel(`group-${groupId}`)
        .send({
          type: 'broadcast',
          event: 'group:message',
          payload: formatted,
        })
        .catch(() => {});
    } catch (e: any) {
      // Supabase realtime channel optional broadcast
    }

    return formatted;
  }

  // ─── 9. Convert Group to Demand Post (Creator Only) ──────────────────────────

  async postDemand(
    groupId: string,
    userId: string,
  ): Promise<{
    success: boolean;
    demand: any;
    group: FormattedBuyingGroup;
    message: string;
  }> {
    const client = this.supabaseService.getAdminClient();

    // 1. Fetch group
    const { data: group, error: groupErr } = await client
      .from('buying_groups')
      .select('*')
      .eq('id', groupId)
      .single();

    if (groupErr || !group) {
      throw new NotFoundException(
        `Buying group with ID "${groupId}" not found`,
      );
    }

    if (group.created_by !== userId) {
      throw new ForbiddenException(
        'Only the group creator can convert this group into a demand post',
      );
    }

    if (group.linked_demand_id) {
      throw new BadRequestException(
        'This buying group has already been converted to a demand post',
      );
    }

    const filledQuantity = Number(group.filled_quantity ?? 0);
    const targetQuantity = Number(group.target_quantity);
    const postQuantity = filledQuantity > 0 ? filledQuantity : targetQuantity;

    // 2. Create demand post via DemandsService
    const demand = await this.demandsService.create(userId, {
      productName: group.product_name,
      quantity: postQuantity,
      callingPrice: Number(group.price_per_kg),
      deliveryLocation: group.delivery_location,
      expiryTime: new Date(group.expiry_date).toISOString(),
      tradeType: DemandTradeType.BOTH,
    });

    // 3. Update buying_groups
    await client
      .from('buying_groups')
      .update({
        linked_demand_id: demand.id,
        status: 'fulfilled',
      })
      .eq('id', groupId);

    const updatedGroup = {
      ...group,
      linked_demand_id: demand.id,
      status: 'fulfilled',
    };

    // 4. Emit event
    this.groupsGateway.emitDemandCreated(groupId, {
      groupId,
      demandId: demand.id,
    });

    return {
      success: true,
      demand,
      group: this.formatGroup(updatedGroup),
      message: `Group converted to demand post #${demand.id} successfully.`,
    };
  }
}
