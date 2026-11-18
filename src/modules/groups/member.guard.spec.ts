import { MemberGuard } from './member.guard';
import {
  ExecutionContext,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';

describe('MemberGuard', () => {
  let guard: MemberGuard;
  let supabaseMock: any;
  let clientMock: any;

  beforeEach(() => {
    clientMock = {
      from: jest.fn(),
    };
    supabaseMock = {
      getAdminClient: jest.fn().mockReturnValue(clientMock),
    };
    guard = new MemberGuard(supabaseMock);
  });

  const createMockContext = (params: any, user: any): ExecutionContext => {
    const request = { params, user };
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  };

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('should allow if no groupId in params', async () => {
    const context = createMockContext({}, { sub: 'user-1' });
    const result = await guard.canActivate(context);
    expect(result).toBe(true);
  });

  it('should throw ForbiddenException if no user in token', async () => {
    const context = createMockContext({ id: 'grp-1' }, null);
    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('should throw NotFoundException if group does not exist', async () => {
    const context = createMockContext({ id: 'grp-1' }, { sub: 'user-1' });

    clientMock.from.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest
        .fn()
        .mockResolvedValue({ data: null, error: { message: 'Not found' } }),
    });

    await expect(guard.canActivate(context)).rejects.toThrow(NotFoundException);
  });

  it('should allow if user is the group creator', async () => {
    const context = createMockContext({ id: 'grp-1' }, { sub: 'creator-1' });

    clientMock.from.mockImplementation((table: string) => {
      if (table === 'buying_groups') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({
            data: { id: 'grp-1', created_by: 'creator-1' },
            error: null,
          }),
        };
      }
      if (table === 'group_members') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
        };
      }
      return {};
    });

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
  });

  it('should allow if user is a group member', async () => {
    const context = createMockContext({ id: 'grp-1' }, { sub: 'member-1' });

    clientMock.from.mockImplementation((table: string) => {
      if (table === 'buying_groups') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({
            data: { id: 'grp-1', created_by: 'creator-1' },
            error: null,
          }),
        };
      }
      if (table === 'group_members') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({
            data: { id: 'mem-1', user_id: 'member-1' },
            error: null,
          }),
        };
      }
      return {};
    });

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
  });

  it('should allow if user is ADMIN', async () => {
    const context = createMockContext(
      { id: 'grp-1' },
      { sub: 'admin-1', role: 'ADMIN' },
    );

    clientMock.from.mockImplementation((table: string) => {
      if (table === 'buying_groups') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({
            data: { id: 'grp-1', created_by: 'creator-1' },
            error: null,
          }),
        };
      }
      if (table === 'group_members') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
        };
      }
      return {};
    });

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
  });

  it('should throw ForbiddenException if user is not creator, member, or admin', async () => {
    const context = createMockContext(
      { id: 'grp-1' },
      { sub: 'stranger-1', role: 'buyer' },
    );

    clientMock.from.mockImplementation((table: string) => {
      if (table === 'buying_groups') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({
            data: { id: 'grp-1', created_by: 'creator-1' },
            error: null,
          }),
        };
      }
      if (table === 'group_members') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
        };
      }
      return {};
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });
});
