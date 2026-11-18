import { Test, TestingModule } from '@nestjs/testing';
import { SupabaseService } from './supabase.service';

describe('SupabaseService', () => {
  let service: SupabaseService;

  beforeAll(() => {
    process.env.SUPABASE_URL =
      process.env.SUPABASE_URL || 'https://mock.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY =
      process.env.SUPABASE_SERVICE_ROLE_KEY || 'mock_service_role_key';
    process.env.SUPABASE_ANON_KEY =
      process.env.SUPABASE_ANON_KEY || 'mock_anon_key';
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SupabaseService],
    }).compile();

    service = module.get<SupabaseService>(SupabaseService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should expose both anonClient and adminClient via getters', () => {
    expect(service.getAnonClient()).toBeDefined();
    expect(service.getAdminClient()).toBeDefined();
    expect(service.anon).toBeDefined();
    expect(service.admin).toBeDefined();
  });

  it('should return user client with access token', () => {
    const userClient = service.getUserClient('mock-user-jwt');
    expect(userClient).toBeDefined();
  });
});
