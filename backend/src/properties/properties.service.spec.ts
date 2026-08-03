import { Test, TestingModule } from '@nestjs/testing';
import { PropertiesService } from './properties.service';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseService } from '../supabase/supabase.service';

describe('PropertiesService - findInBounds', () => {
  let service: PropertiesService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PropertiesService,
        {
          provide: PrismaService,
          useValue: {
            $queryRaw: jest.fn(),
          },
        },
        {
          provide: SupabaseService,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<PropertiesService>(PropertiesService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should call $queryRaw with correct bounding box', async () => {
    const mockRows = [
      {
        id: '1',
        title: 'Test Property',
        price: 1000,
        images: ['img1.jpg'],
        lat: 37.5,
        lng: 127.0,
      },
    ];
    (prisma.$queryRaw as jest.Mock).mockResolvedValue(mockRows);

    const result = await service.findInBounds(37.6, 127.1, 37.4, 126.9);

    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Test Property');
  });
});
