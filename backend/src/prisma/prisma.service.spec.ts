import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  let service: PrismaService;
  const previousUrl = process.env.DATABASE_URL;
  beforeAll(() => { process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/test'; });
  afterAll(() => { if (previousUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL=previousUrl; });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService],
    }).compile();

    service = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
